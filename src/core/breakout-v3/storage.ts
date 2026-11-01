import { Redis } from "@upstash/redis";
import {
  BreakoutAccount,
  BreakoutAccountStats,
  BreakoutSnapshot,
} from "./types";

/**
 * Breakout V3 Storage — fully isolated Redis namespace.
 *
 * CRITICAL ISOLATION:
 * - V3 keys: cryptopilot:paper:breakout-v3:v1, cryptopilot:paper:breakout-v3:lock, cryptopilot:paper:breakout-v3:snapshots:v1
 * - V2 keys: cryptopilot:paper:breakout:v1 (NEVER read or written by V3)
 * - Model D keys: cryptopilot:paper:v1 (NEVER read or written by V3)
 */
export const V3_STORAGE_KEY = "cryptopilot:paper:breakout-v3:v1";
export const V3_LOCK_KEY = "cryptopilot:paper:breakout-v3:lock";
export const V3_SNAPSHOTS_KEY = "cryptopilot:paper:breakout-v3:snapshots:v1";

const LOCK_TTL_SECONDS = 10;
const LOCK_ACQUIRE_TIMEOUT_MS = 6000;

let customRedisClient: Redis | null | undefined = undefined;

export function setCustomV3RedisClient(client: Redis | null | undefined) {
  customRedisClient = client;
}

function getV3RedisClient(): Redis | null {
  if (customRedisClient !== undefined) {
    return customRedisClient;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (url && token) {
    return new Redis({ url, token });
  }
  return null;
}

function isProductionEnvironment(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

export function createInitialV3Account(): BreakoutAccount {
  const initialStats: BreakoutAccountStats = {
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    winRate: 0,
    profitFactor: 0,
    expectancy: 0,
    maxDrawdown: 0,
    currentDrawdown: 0,
    peakEquity: 10000,
    largestWin: 0,
    largestLoss: 0,
    longestLosingStreak: 0,
    currentLosingStreak: 0,
  };

  return {
    initialBalance: 10000,
    cash: 10000,
    equity: 10000,
    unrealizedPnl: 0,
    realizedPnl: 0,
    fees: 0,
    slippagePaid: 0,
    positions: [],
    tradeHistory: [],
    version: 1,
    accountingVersion: 3, // V3 starts at accounting v3 — no legacy migrations needed
    lastUpdated: Date.now(),
    lastProcessedCandles: {},
    lastExitTimestamps: {},
    stats: initialStats,
  };
}

export class V3StorageService {
  /**
   * Distributed lock acquisition using NX & EX in Redis.
   * In production, Redis is strictly required.
   */
  static async acquireLock(): Promise<() => Promise<void>> {
    const isProd = isProductionEnvironment();
    const redis = getV3RedisClient();

    if (!redis) {
      if (isProd) {
        throw new Error(
          "Production Configuration Error: Redis credentials must be configured for Breakout V3."
        );
      }
      // In development/test without Redis, use a no-op lock
      return async () => {};
    }

    const lockId = `v3_lock_${Date.now()}_${Math.random()}`;
    const startTime = Date.now();

    while (Date.now() - startTime < LOCK_ACQUIRE_TIMEOUT_MS) {
      try {
        const acquired = await redis.set(V3_LOCK_KEY, lockId, {
          nx: true,
          ex: LOCK_TTL_SECONDS,
        });

        if (acquired === "OK") {
          return async () => {
            try {
              const current = await redis.get(V3_LOCK_KEY);
              if (current === lockId) {
                await redis.del(V3_LOCK_KEY);
              }
            } catch (err) {
              console.error("[V3Storage] Error releasing Redis lock:", err);
            }
          };
        }
      } catch (err: any) {
        if (isProd) {
          throw new Error(`[V3Storage] Redis error acquiring lock: ${err.message}`);
        }
        console.warn("[V3Storage] Redis lock acquire attempt warning:", err);
      }

      await new Promise((r) => setTimeout(r, 150));
    }

    throw new Error("[V3Storage] Lock Acquisition Timeout: Could not acquire lock within 6s.");
  }

  /**
   * Loads current V3 paper account from Redis.
   */
  static async loadAccount(): Promise<BreakoutAccount> {
    const isProd = isProductionEnvironment();
    const redis = getV3RedisClient();

    if (!redis) {
      if (isProd) {
        throw new Error(
          "Production Configuration Error: Redis credentials must be configured for Breakout V3."
        );
      }
      // In test mode, return a fresh account (no file fallback needed for V3)
      return createInitialV3Account();
    }

    try {
      const data = await redis.get<BreakoutAccount | string>(V3_STORAGE_KEY);
      if (!data) {
        const initial = createInitialV3Account();
        await redis.set(V3_STORAGE_KEY, JSON.stringify(initial));
        return initial;
      }
      const account: BreakoutAccount = typeof data === "string" ? JSON.parse(data) : data;
      if (!account.lastProcessedCandles) account.lastProcessedCandles = {};
      if (!account.lastExitTimestamps) account.lastExitTimestamps = {};
      if (!account.stats) account.stats = createInitialV3Account().stats;
      return account;
    } catch (error: any) {
      if (isProd) {
        throw new Error(`[V3Storage] Redis error reading account: ${error.message}`);
      }
      console.error("[V3Storage] Error loading from Redis:", error);
      return createInitialV3Account();
    }
  }

  /**
   * Saves V3 paper account to Redis.
   */
  static async saveAccount(account: BreakoutAccount): Promise<void> {
    const isProd = isProductionEnvironment();
    const redis = getV3RedisClient();

    account.lastUpdated = Date.now();
    account.version += 1;

    if (!redis) {
      if (isProd) {
        throw new Error(
          "Production Configuration Error: Redis credentials must be configured for Breakout V3."
        );
      }
      return; // silently skip in test mode
    }

    try {
      await redis.set(V3_STORAGE_KEY, JSON.stringify(account));
    } catch (error: any) {
      if (isProd) {
        throw new Error(`[V3Storage] Redis error saving account: ${error.message}`);
      }
      console.error("[V3Storage] Error saving to Redis:", error);
      throw error;
    }
  }

  /**
   * Appends a telemetry snapshot to Redis.
   */
  static async saveSnapshot(snapshot: BreakoutSnapshot): Promise<void> {
    const isProd = isProductionEnvironment();
    const redis = getV3RedisClient();

    if (!redis) {
      if (isProd) {
        throw new Error(
          "Production Configuration Error: Redis credentials must be configured for Breakout V3."
        );
      }
      return; // silently skip in test mode
    }

    try {
      await redis.lpush(V3_SNAPSHOTS_KEY, JSON.stringify(snapshot));
      await redis.ltrim(V3_SNAPSHOTS_KEY, 0, 999);
    } catch (error: any) {
      if (isProd) {
        throw new Error(`[V3Storage] Redis error saving snapshot: ${error.message}`);
      }
      console.error("[V3Storage] Error saving snapshot to Redis:", error);
    }
  }

  /**
   * Retrieves snapshots from Redis.
   */
  static async getSnapshots(limit: number = 100): Promise<BreakoutSnapshot[]> {
    const redis = getV3RedisClient();

    if (!redis) {
      return [];
    }

    try {
      const raw = await redis.lrange(V3_SNAPSHOTS_KEY, 0, limit - 1);
      return raw
        .map((item) => (typeof item === "string" ? JSON.parse(item) : item))
        .reverse();
    } catch (error: any) {
      console.error("[V3Storage] Error fetching snapshots from Redis:", error);
      return [];
    }
  }

  /**
   * Resets V3 paper account to initial $10,000 balance.
   */
  static async resetAccount(): Promise<BreakoutAccount> {
    const unlock = await this.acquireLock();
    try {
      const fresh = createInitialV3Account();
      await this.saveAccount(fresh);
      return fresh;
    } finally {
      await unlock();
    }
  }
}
