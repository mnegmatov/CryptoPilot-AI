import fs from "fs";
import path from "path";
import { Redis } from "@upstash/redis";
import { BreakoutAccount, BreakoutAccountStats, BreakoutSnapshot } from "./types";

export const BREAKOUT_STORAGE_KEY = "cryptopilot:paper:breakout:v1";
export const BREAKOUT_LOCK_KEY = "cryptopilot:paper:breakout:lock";
export const BREAKOUT_SNAPSHOTS_KEY = "cryptopilot:paper:breakout:snapshots:v1";

const LOCK_TTL_SECONDS = 10;
const LOCK_ACQUIRE_TIMEOUT_MS = 6000;

let customRedisClient: Redis | null | undefined = undefined;

export function setCustomBreakoutRedisClient(client: Redis | null | undefined) {
  customRedisClient = client;
}

export function isProductionEnvironment(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

export function getBreakoutRedisClient(): Redis | null {
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

export function getBreakoutStoreBackend(): "redis" | "file" {
  if (getBreakoutRedisClient()) {
    return "redis";
  }

  if (isProductionEnvironment()) {
    throw new Error(
      "Production Configuration Error: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be configured in Vercel environment variables."
    );
  }

  return "file";
}

const localStatePath = path.join(process.cwd(), "data", "breakout_paper_trading_state.json");
const localSnapshotsPath = path.join(process.cwd(), "data", "breakout_paper_snapshots.json");
let localLockPromise: Promise<void> = Promise.resolve();

export function createInitialBreakoutAccount(): BreakoutAccount {
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
    accountingVersion: 2,
    lastUpdated: Date.now(),
    lastProcessedCandles: {},
    lastExitTimestamps: {},
    stats: initialStats,
  };
}


function migrateLegacyBreakoutAccount(account: BreakoutAccount): BreakoutAccount {
  if ((account.accountingVersion ?? 1) >= 2) return account;
  const reservedPositionCapital = account.positions.reduce(
    (sum, position) => sum + position.positionSizeDollar,
    0
  );
  account.cash -= reservedPositionCapital;
  account.accountingVersion = 2;
  account.equity = account.cash + reservedPositionCapital + account.unrealizedPnl;
  return account;
}

function loadLocalFileAccount(): BreakoutAccount {
  try {
    if (fs.existsSync(localStatePath)) {
      const raw = fs.readFileSync(localStatePath, "utf-8");
      if (raw && raw.trim().length > 0) {
        const parsed = JSON.parse(raw);
        if (
          parsed &&
          typeof parsed.cash === "number" &&
          Array.isArray(parsed.positions) &&
          Array.isArray(parsed.tradeHistory)
        ) {
          if (!parsed.version) parsed.version = 1;
          migrateLegacyBreakoutAccount(parsed);
          if (!parsed.lastProcessedCandles) parsed.lastProcessedCandles = {};
          if (!parsed.lastExitTimestamps) parsed.lastExitTimestamps = {};
          if (!parsed.stats) parsed.stats = createInitialBreakoutAccount().stats;
          return parsed;
        }
      }
    }
  } catch (e) {
    console.error("Warning: Failed to read local breakout paper state, initializing fresh:", e);
  }

  const initial = createInitialBreakoutAccount();
  saveLocalFileAccount(initial);
  return initial;
}

function saveLocalFileAccount(account: BreakoutAccount): void {
  const dir = path.dirname(localStatePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(localStatePath, JSON.stringify(account, null, 2), "utf-8");
}

function loadLocalSnapshots(): BreakoutSnapshot[] {
  try {
    if (fs.existsSync(localSnapshotsPath)) {
      const raw = fs.readFileSync(localSnapshotsPath, "utf-8");
      if (raw && raw.trim().length > 0) {
        return JSON.parse(raw);
      }
    }
  } catch (e) {
    console.error("Warning: Failed to read local breakout snapshots:", e);
  }
  return [];
}

function saveLocalSnapshot(snapshot: BreakoutSnapshot): void {
  const list = loadLocalSnapshots();
  list.push(snapshot);
  // Keep last 1,000 snapshots
  if (list.length > 1000) {
    list.splice(0, list.length - 1000);
  }
  const dir = path.dirname(localSnapshotsPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(localSnapshotsPath, JSON.stringify(list, null, 2), "utf-8");
}

export class BreakoutStorageService {
  /**
   * Distributed lock acquisition using NX & EX in Redis.
   * In production, Redis lock is strictly required.
   */
  static async acquireLock(): Promise<() => Promise<void>> {
    const isProd = isProductionEnvironment();
    const redis = getBreakoutRedisClient();

    if (!redis) {
      if (isProd) {
        throw new Error(
          "Production Configuration Error: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be configured in Vercel environment variables."
        );
      }

      let unlockNext: () => void = () => {};
      const currentLock = localLockPromise;
      localLockPromise = new Promise<void>((resolve) => {
        unlockNext = resolve;
      });
      await currentLock;
      return async () => {
        unlockNext();
      };
    }

    const lockId = `breakout_lock_${Date.now()}_${Math.random()}`;
    const startTime = Date.now();

    while (Date.now() - startTime < LOCK_ACQUIRE_TIMEOUT_MS) {
      try {
        const acquired = await redis.set(BREAKOUT_LOCK_KEY, lockId, {
          nx: true,
          ex: LOCK_TTL_SECONDS,
        });

        if (acquired === "OK") {
          return async () => {
            try {
              const current = await redis.get(BREAKOUT_LOCK_KEY);
              if (current === lockId) {
                await redis.del(BREAKOUT_LOCK_KEY);
              }
            } catch (err) {
              console.error("Error releasing Breakout Redis lock:", err);
            }
          };
        }
      } catch (err: any) {
        if (isProd) {
          throw new Error(`Upstash Redis error acquiring Breakout lock: ${err.message}`);
        }
        console.warn("Redis lock acquire attempt warning:", err);
      }

      await new Promise((r) => setTimeout(r, 150));
    }

    throw new Error("Lock Acquisition Timeout: Could not acquire Breakout Paper Trading lock within 6s.");
  }

  /**
   * Loads current Breakout paper account.
   * In production, Redis is strictly required; never falls back to blank account on error.
   */
  static async loadAccount(): Promise<BreakoutAccount> {
    const isProd = isProductionEnvironment();
    const redis = getBreakoutRedisClient();

    if (!redis) {
      if (isProd) {
        throw new Error(
          "Production Configuration Error: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be configured in Vercel environment variables."
        );
      }
      return loadLocalFileAccount();
    }

    try {
      const data = await redis.get<BreakoutAccount | string>(BREAKOUT_STORAGE_KEY);
      if (!data) {
        const initial = createInitialBreakoutAccount();
        await redis.set(BREAKOUT_STORAGE_KEY, JSON.stringify(initial));
        return initial;
      }
      const account: BreakoutAccount = typeof data === "string" ? JSON.parse(data) : data;
      if (!account.lastProcessedCandles) account.lastProcessedCandles = {};
      migrateLegacyBreakoutAccount(account);
      if (!account.lastExitTimestamps) account.lastExitTimestamps = {};
      if (!account.stats) account.stats = createInitialBreakoutAccount().stats;
      return account;
    } catch (error: any) {
      if (isProd) {
        throw new Error(`Upstash Redis error reading Breakout paper account: ${error.message}`);
      }
      console.error("Error loading Breakout account from Redis, falling back to local file:", error);
      return loadLocalFileAccount();
    }
  }

  /**
   * Saves Breakout paper account with optimistic concurrency control.
   * In production, Redis is strictly required.
   */
  static async saveAccount(account: BreakoutAccount): Promise<void> {
    const isProd = isProductionEnvironment();
    const redis = getBreakoutRedisClient();

    account.lastUpdated = Date.now();
    account.version += 1;

    if (!redis) {
      if (isProd) {
        throw new Error(
          "Production Configuration Error: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be configured in Vercel environment variables."
        );
      }
      saveLocalFileAccount(account);
      return;
    }

    try {
      await redis.set(BREAKOUT_STORAGE_KEY, JSON.stringify(account));
    } catch (error: any) {
      if (isProd) {
        throw new Error(`Upstash Redis error saving Breakout paper account: ${error.message}`);
      }
      console.error("Error saving Breakout account to Redis, saving local copy:", error);
      saveLocalFileAccount(account);
      throw error;
    }
  }

  /**
   * Appends a telemetry snapshot.
   * In production, Redis is strictly required.
   */
  static async saveSnapshot(snapshot: BreakoutSnapshot): Promise<void> {
    const isProd = isProductionEnvironment();
    const redis = getBreakoutRedisClient();

    if (!redis) {
      if (isProd) {
        throw new Error(
          "Production Configuration Error: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be configured in Vercel environment variables."
        );
      }
      saveLocalSnapshot(snapshot);
      return;
    }

    try {
      // Store in Redis list, cap at 1,000 items
      await redis.lpush(BREAKOUT_SNAPSHOTS_KEY, JSON.stringify(snapshot));
      await redis.ltrim(BREAKOUT_SNAPSHOTS_KEY, 0, 999);
    } catch (error: any) {
      if (isProd) {
        throw new Error(`Upstash Redis error saving Breakout snapshot: ${error.message}`);
      }
      console.error("Error saving Breakout snapshot to Redis, falling back to local file:", error);
      saveLocalSnapshot(snapshot);
    }
  }

  /**
   * Retrieves snapshots.
   * In production, Redis is strictly required.
   */
  static async getSnapshots(limit: number = 100): Promise<BreakoutSnapshot[]> {
    const isProd = isProductionEnvironment();
    const redis = getBreakoutRedisClient();

    if (!redis) {
      if (isProd) {
        throw new Error(
          "Production Configuration Error: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be configured in Vercel environment variables."
        );
      }
      const local = loadLocalSnapshots();
      return local.slice(-limit);
    }

    try {
      const raw = await redis.lrange(BREAKOUT_SNAPSHOTS_KEY, 0, limit - 1);
      return raw.map((item) => (typeof item === "string" ? JSON.parse(item) : item)).reverse();
    } catch (error: any) {
      if (isProd) {
        throw new Error(`Upstash Redis error reading Breakout snapshots: ${error.message}`);
      }
      console.error("Error fetching Breakout snapshots from Redis, reading local:", error);
      return loadLocalSnapshots().slice(-limit);
    }
  }

  /**
   * Resets Breakout paper account to initial $10,000 balance
   */
  static async resetAccount(): Promise<BreakoutAccount> {
    const unlock = await this.acquireLock();
    try {
      const fresh = createInitialBreakoutAccount();
      await this.saveAccount(fresh);
      return fresh;
    } finally {
      await unlock();
    }
  }
}
