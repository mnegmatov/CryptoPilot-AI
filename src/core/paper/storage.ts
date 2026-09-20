import fs from "fs";
import path from "path";
import { Redis } from "@upstash/redis";
import { PaperAccount, PaperPosition } from "../types";

export const PAPER_STORAGE_KEY = "cryptopilot:paper:v1";
export const PAPER_LOCK_KEY = "cryptopilot:paper:lock";
const LOCK_TTL_SECONDS = 10;
const LOCK_ACQUIRE_TIMEOUT_MS = 6000;

export interface PersistentPaperAccount extends PaperAccount {
  version: number;
  lastUpdated: number;
  lastProcessedCandles?: Record<string, number>; // symbol -> timestamp of last evaluated closed 4H candle
}

let customRedisClient: Redis | null | undefined = undefined;

export function setCustomRedisClient(client: Redis | null | undefined) {
  customRedisClient = client;
}

/**
 * Returns an Upstash Redis client if environment variables are configured.
 * Compatible with Vercel Upstash Integration (UPSTASH_REDIS_REST_URL) and Vercel KV (KV_REST_API_URL).
 */
export function getRedisClient(): Redis | null {
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

/**
 * Returns current storage backend mode: "redis" or "file"
 */
export function getPaperStoreBackend(): "redis" | "file" {
  if (getRedisClient()) {
    return "redis";
  }

  // In production / Vercel, Redis credentials are strictly required
  if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
    throw new Error(
      "Production Configuration Error: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be configured in Vercel environment variables."
    );
  }

  return "file";
}

const localFilePath = path.join(process.cwd(), "data", "paper_trading_state.json");
let localLockPromise: Promise<void> = Promise.resolve();

function createInitialAccount(): PersistentPaperAccount {
  return {
    balance: 10000,
    initialBalance: 10000,
    equity: 10000,
    unrealizedPnl: 0,
    realizedPnl: 0,
    positions: [],
    tradeHistory: [],
    version: 1,
    lastUpdated: Date.now(),
    lastProcessedCandles: {},
  };
}

/**
 * Local file read with atomic initialization
 */
function loadLocalFileAccount(): PersistentPaperAccount {
  try {
    if (fs.existsSync(localFilePath)) {
      const raw = fs.readFileSync(localFilePath, "utf-8");
      if (raw && raw.trim().length > 0) {
        const parsed = JSON.parse(raw);
        if (
          parsed &&
          typeof parsed.balance === "number" &&
          Array.isArray(parsed.positions) &&
          Array.isArray(parsed.tradeHistory)
        ) {
          if (!parsed.version) parsed.version = 1;
          if (!parsed.lastProcessedCandles) parsed.lastProcessedCandles = {};
          return parsed;
        }
      }
    }
  } catch (e) {
    console.error("Warning: Failed to read local paper trading state, checking fallback:", e);
  }

  const initial = createInitialAccount();
  saveLocalFileAccount(initial);
  return initial;
}

/**
 * Local file atomic write via .tmp and renameSync
 */
function saveLocalFileAccount(account: PersistentPaperAccount): void {
  const dir = path.dirname(localFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tempPath = `${localFilePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(account, null, 2), "utf-8");
  fs.renameSync(tempPath, localFilePath);
}

/**
 * Local in-memory mutex to prevent concurrent file race conditions
 */
async function withLocalMutex<T>(fn: () => Promise<T>): Promise<T> {
  let release: () => void = () => {};
  const currentLock = localLockPromise;
  localLockPromise = new Promise((resolve) => {
    release = resolve;
  });

  await currentLock;
  try {
    return await fn();
  } finally {
    release();
  }
}

/**
 * Distributed lock on Redis using atomic SET key token NX EX
 */
async function acquireRedisLock(redis: Redis, timeoutMs = LOCK_ACQUIRE_TIMEOUT_MS): Promise<string> {
  const lockToken = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const acquired = await redis.set(PAPER_LOCK_KEY, lockToken, {
        nx: true,
        ex: LOCK_TTL_SECONDS,
      });
      if (acquired === "OK") {
        return lockToken;
      }
    } catch (e) {
      console.warn("Redis lock acquire attempt warning:", e);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("Timeout acquiring distributed paper trading lock in Redis");
}

/**
 * Releases distributed lock on Redis safely
 */
async function releaseRedisLock(redis: Redis, lockToken: string): Promise<void> {
  try {
    const currentToken = await redis.get<string>(PAPER_LOCK_KEY);
    if (currentToken === lockToken) {
      await redis.del(PAPER_LOCK_KEY);
    }
  } catch (e) {
    console.error("Warning: Failed to release Redis lock cleanly:", e);
  }
}

/**
 * Reads the authoritative paper trading account.
 * NEVER resets account on missing connection in production.
 */
export async function getPaperAccount(): Promise<PersistentPaperAccount> {
  const redis = getRedisClient();

  if (redis) {
    try {
      const raw = await redis.get<PersistentPaperAccount | string>(PAPER_STORAGE_KEY);
      if (raw) {
        const account: PersistentPaperAccount = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (!account.lastProcessedCandles) account.lastProcessedCandles = {};
        return account;
      }

      // Initialize once if empty in Redis
      const initial = createInitialAccount();
      await redis.set(PAPER_STORAGE_KEY, JSON.stringify(initial));
      return initial;
    } catch (error: any) {
      // Never fall back to a blank $10k account on error: throw explicit error!
      throw new Error(`Upstash Redis error reading paper account: ${error.message}`);
    }
  }

  // Development file fallback
  if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
    throw new Error(
      "Production Configuration Error: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be configured in Vercel."
    );
  }

  return loadLocalFileAccount();
}

/**
 * Executes a state mutation under a distributed lock, ensuring atomicity and zero lost updates.
 */
export async function mutatePaperAccount<T>(
  mutator: (account: PersistentPaperAccount) => Promise<{ result: T; modified: boolean }> | { result: T; modified: boolean }
): Promise<{ result: T; account: PersistentPaperAccount }> {
  const redis = getRedisClient();

  if (redis) {
    const lockToken = await acquireRedisLock(redis);
    try {
      const account = await getPaperAccount();
      const { result, modified } = await mutator(account);

      if (modified) {
        account.version = (account.version || 0) + 1;
        account.lastUpdated = Date.now();
        await redis.set(PAPER_STORAGE_KEY, JSON.stringify(account));
      }

      return { result, account };
    } catch (err: any) {
      throw new Error(`Failed atomic paper account mutation in Redis: ${err.message}`);
    } finally {
      await releaseRedisLock(redis, lockToken);
    }
  }

  // Development file fallback with local mutex
  if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
    throw new Error(
      "Production Configuration Error: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be configured in Vercel."
    );
  }

  return withLocalMutex(async () => {
    const account = loadLocalFileAccount();
    const { result, modified } = await mutator(account);

    if (modified) {
      account.version = (account.version || 0) + 1;
      account.lastUpdated = Date.now();
      saveLocalFileAccount(account);
    }

    return { result, account };
  });
}
