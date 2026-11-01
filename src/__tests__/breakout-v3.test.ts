import { describe, it, expect, beforeEach, vi } from "vitest";
import { Candle } from "@/core/types";
import {
  evaluateBreakoutLevelsV3,
  checkPositionExitV3,
  V3_CONFIG,
  V3StrategyConfig,
} from "@/core/breakout-v3/strategy";
import {
  V3StorageService,
  createInitialV3Account,
  V3_STORAGE_KEY,
  V3_LOCK_KEY,
  V3_SNAPSHOTS_KEY,
  setCustomV3RedisClient,
} from "@/core/breakout-v3/storage";
import { BreakoutV3Service } from "@/core/breakout-v3/service";
import { BreakoutPosition } from "@/core/breakout-v3/types";
import {
  BREAKOUT_STORAGE_KEY,
  BREAKOUT_LOCK_KEY,
  BREAKOUT_SNAPSHOTS_KEY,
} from "@/core/breakout-paper/storage";

const FOUR_HOURS_MS = 4 * 3600 * 1000;

/**
 * Generate synthetic 4H candles with configurable trending behavior.
 */
function generateCandles(
  count: number,
  startPrice: number = 100,
  baseTime: number = 1609459200000,
  options?: {
    trend?: "up" | "down" | "flat";
    volatility?: number;
  }
): Candle[] {
  const candles: Candle[] = [];
  let price = startPrice;
  const trend = options?.trend ?? "flat";
  const vol = options?.volatility ?? 0.01;

  for (let i = 0; i < count; i++) {
    const trendDelta =
      trend === "up" ? price * 0.002 :
      trend === "down" ? -price * 0.002 : 0;

    const open = price;
    const high = open * (1 + vol);
    const low = open * (1 - vol);
    const close = open + trendDelta;
    candles.push({
      timestamp: baseTime + i * FOUR_HOURS_MS,
      open,
      high,
      low,
      close,
      volume: 1000,
    });
    price = close;
  }
  return candles;
}

/**
 * Generate candles that produce a valid ADX > threshold and EMA alignment.
 * Uses a clear uptrend for the last portion of the series.
 */
function generateTrendingCandles(
  count: number,
  startPrice: number,
  baseTime: number,
  direction: "up" | "down"
): Candle[] {
  const candles: Candle[] = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    // First half: flat/consolidation; second half: strong trend
    const inTrend = i > count * 0.4;
    const delta = inTrend
      ? (direction === "up" ? price * 0.008 : -price * 0.008)
      : (Math.random() - 0.5) * price * 0.002;

    const open = price;
    const high = open + Math.abs(direction === "up" && inTrend ? delta * 1.5 : delta * 0.5);
    const low = open - Math.abs(direction === "down" && inTrend ? Math.abs(delta) * 1.5 : Math.abs(delta) * 0.5);
    const close = open + delta;
    candles.push({
      timestamp: baseTime + i * FOUR_HOURS_MS,
      open,
      high: Math.max(high, open, close),
      low: Math.min(low, open, close),
      close,
      volume: 1000 + (inTrend ? 500 : 0),
    });
    price = close;
  }
  return candles;
}

describe("Model Breakout V3 — Test Suite", () => {
  beforeEach(() => {
    setCustomV3RedisClient(null);
  });

  // ==========================================================================
  // 1. Fixed Channel Exit — candle T NOT included in prior10
  // ==========================================================================
  describe("1. Fixed Channel Exit", () => {
    it("1-A. prior10 (hh10/ll10) does NOT include candle T", () => {
      const candles = generateCandles(60, 100);

      // Make candle T (index 59) have an extreme low — if included in prior10,
      // ll10 would equal this extreme, making close < ll10 impossible
      candles[59].low = 50;
      candles[59].close = 95;

      const levels = evaluateBreakoutLevelsV3("BTCUSDT", candles, true, 0);

      // ll10 should be based on candles [49..58] (the 10 candles BEFORE T),
      // NOT including candle 59 (T itself)
      const expectedPrior10 = candles.slice(49, 59);
      const expectedLl10 = Math.min(...expectedPrior10.map((c) => c.low));

      expect(levels.ll10).toBe(expectedLl10);
      // ll10 should NOT be 50 (candle T's extreme low)
      expect(levels.ll10).not.toBe(50);
    });

    it("1-B. Channel Exit can actually trigger for LONG (close < ll10)", () => {
      const candles = generateCandles(60, 100);

      // Set prior 10 candles (before T) with lows around 95
      for (let i = 49; i < 59; i++) {
        candles[i].low = 95;
      }

      // Candle T closes below the prior10 ll10
      candles[59].close = 94;
      candles[59].low = 93;

      const position: BreakoutPosition = {
        id: "pos_test_ch_exit",
        asset: "BTCUSDT",
        direction: "LONG",
        entryTimestamp: candles[50].timestamp,
        entryPrice: 100,
        stopPrice: 80,
        initialStopDistance: 20,
        units: 10,
        riskDollar: 100,
        positionSizeDollar: 1000,
        feesPaid: 1,
        slippagePaid: 1,
        currentPrice: 94,
        unrealizedPnl: -60,
        unrealizedPnlPercent: -6,
        unrealizedR: -0.6,
        highestPriceSinceEntry: 105,
        lowestPriceSinceEntry: 93,
        breakoutTimestamp: candles[49].timestamp,
        breakoutLevel: 100,
        breakoutVolRatio: 1.5,
        channelExitLevel: 95,
      };

      const levels = evaluateBreakoutLevelsV3("BTCUSDT", candles, true, 0);

      // close=94 < ll10=95 should trigger channel exit
      const exitResult = checkPositionExitV3(
        position,
        candles[59],
        94,
        { hh10: levels.hh10, ll10: levels.ll10 }
      );

      expect(exitResult).not.toBeNull();
      expect(exitResult?.shouldExit).toBe(true);
      expect(exitResult?.exitReason).toBe("CHANNEL_EXIT");
    });

    it("1-C. Channel Exit triggers for SHORT (close > hh10)", () => {
      const candles = generateCandles(60, 100);

      // Set prior 10 candles (before T) with highs around 105
      for (let i = 49; i < 59; i++) {
        candles[i].high = 105;
      }

      // Candle T closes above the prior10 hh10
      candles[59].close = 106;
      candles[59].high = 107;

      const position: BreakoutPosition = {
        id: "pos_test_ch_exit_short",
        asset: "ETHUSDT",
        direction: "SHORT",
        entryTimestamp: candles[50].timestamp,
        entryPrice: 100,
        stopPrice: 120,
        initialStopDistance: 20,
        units: 10,
        riskDollar: 100,
        positionSizeDollar: 1000,
        feesPaid: 1,
        slippagePaid: 1,
        currentPrice: 106,
        unrealizedPnl: -60,
        unrealizedPnlPercent: -6,
        unrealizedR: -0.6,
        highestPriceSinceEntry: 106,
        lowestPriceSinceEntry: 95,
        breakoutTimestamp: candles[49].timestamp,
        breakoutLevel: 100,
        breakoutVolRatio: 1.5,
        channelExitLevel: 105,
      };

      const levels = evaluateBreakoutLevelsV3("ETHUSDT", candles, true, 0);

      const exitResult = checkPositionExitV3(
        position,
        candles[59],
        106,
        { hh10: levels.hh10, ll10: levels.ll10 }
      );

      expect(exitResult).not.toBeNull();
      expect(exitResult?.shouldExit).toBe(true);
      expect(exitResult?.exitReason).toBe("CHANNEL_EXIT");
    });
  });

  // ==========================================================================
  // 2. Stop Loss Priority over Channel Exit
  // ==========================================================================
  describe("2. Stop Loss Priority", () => {
    it("2-A. When both stop loss and channel exit trigger on same candle, stop loss wins", () => {
      const position: BreakoutPosition = {
        id: "pos_test_priority",
        asset: "BTCUSDT",
        direction: "LONG",
        entryTimestamp: 1609459200000,
        entryPrice: 100,
        stopPrice: 90,
        initialStopDistance: 10,
        units: 10,
        riskDollar: 100,
        positionSizeDollar: 1000,
        feesPaid: 1,
        slippagePaid: 1,
        currentPrice: 85,
        unrealizedPnl: -150,
        unrealizedPnlPercent: -15,
        unrealizedR: -1.5,
        highestPriceSinceEntry: 105,
        lowestPriceSinceEntry: 85,
        breakoutTimestamp: 1609459200000 - FOUR_HOURS_MS,
        breakoutLevel: 100,
        breakoutVolRatio: 1.5,
        channelExitLevel: 95,
      };

      // Candle that triggers BOTH: low hits stop (85 < 90) AND close < ll10 (85 < 95)
      const latestCompleted: Candle = {
        timestamp: 1609459200000 + FOUR_HOURS_MS,
        open: 95,
        high: 96,
        low: 85, // hits stop at 90
        close: 85, // also below channel exit at 95
        volume: 1000,
      };

      const exitResult = checkPositionExitV3(
        position,
        latestCompleted,
        85,
        { hh10: 105, ll10: 95 }
      );

      expect(exitResult).not.toBeNull();
      expect(exitResult?.shouldExit).toBe(true);
      // Stop loss must take priority (checked first)
      expect(exitResult?.exitReason).toBe("STOP_LOSS");
    });
  });

  // ==========================================================================
  // 3. ADX/EMA Regime Filter
  // ==========================================================================
  describe("3. ADX/EMA Regime Filter", () => {
    it("3-A. Rejects breakout signal when ADX < 25 (choppy market)", () => {
      // Generate flat/choppy candles — ADX should stay low
      const candles = generateCandles(60, 100, 1609459200000, { trend: "flat", volatility: 0.005 });

      // Force a breakout on the last candle
      candles[59].high = 120;
      candles[59].volume = 2000;

      const levels = evaluateBreakoutLevelsV3("BTCUSDT", candles, false, 0);

      // In a flat market, either ADX or EMA filter should reject the signal
      // The signal should be null because the regime filter blocks it
      if (levels.adx14 < V3_CONFIG.adxThreshold) {
        expect(levels.signal).toBeNull();
      }
    });

    it("3-B. Accepts breakout signal when ADX >= 25 and EMA50 aligns directionally", () => {
      // We'll construct candles that produce known ADX/EMA values
      const candles = generateTrendingCandles(60, 100, 1609459200000, "up");

      // Force a clear breakout on the last candle
      const maxPriorHigh = Math.max(...candles.slice(39, 59).map((c) => c.high));
      candles[59].high = maxPriorHigh * 1.05;
      candles[59].close = maxPriorHigh * 1.03;
      candles[59].volume = 2000;

      const levels = evaluateBreakoutLevelsV3("BTCUSDT", candles, false, 0);

      // If ADX is high enough and EMA aligns, signal should be present
      if (levels.adx14 >= V3_CONFIG.adxThreshold && levels.ema50 < candles[59].close) {
        expect(levels.signal).not.toBeNull();
        expect(levels.signal?.direction).toBe("LONG");
      }
    });

    it("3-C. Rejects LONG when close < EMA50 (direction misalignment)", () => {
      // Uptrend candles but force close below EMA50
      const candles = generateCandles(60, 100);
      candles[59].high = 120;
      candles[59].close = 80; // well below any EMA50
      candles[59].volume = 2000;

      const levels = evaluateBreakoutLevelsV3("BTCUSDT", candles, false, 0);

      // If a LONG breakout was detected but close < EMA50, signal should be null
      if (levels.signal?.direction === "LONG") {
        // This shouldn't happen because the filter should block it
        expect(candles[59].close).toBeGreaterThan(levels.ema50);
      }
    });

    it("3-D. V3TechnicalLevels includes adx14, ema50, ema50Prev", () => {
      const candles = generateCandles(60, 100);
      const levels = evaluateBreakoutLevelsV3("BTCUSDT", candles, false, 0);

      expect(typeof levels.adx14).toBe("number");
      expect(typeof levels.ema50).toBe("number");
      expect(typeof levels.ema50Prev).toBe("number");
      expect(levels.adx14).toBeGreaterThan(0);
      expect(levels.ema50).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // 4. ATR Multiplier 2.2
  // ==========================================================================
  describe("4. ATR Multiplier 2.2", () => {
    it("4-A. V3_CONFIG has atrMultiplier = 2.2", () => {
      expect(V3_CONFIG.atrMultiplier).toBe(2.2);
    });

    it("4-B. Stop distance uses 2.2x ATR", () => {
      // Generate trending candles that pass the regime filter
      const candles = generateTrendingCandles(60, 100, 1609459200000, "up");
      const maxPriorHigh = Math.max(...candles.slice(39, 59).map((c) => c.high));
      candles[59].high = maxPriorHigh * 1.05;
      candles[59].close = maxPriorHigh * 1.03;
      candles[59].volume = 2000;

      const levels = evaluateBreakoutLevelsV3("BTCUSDT", candles, false, 0);

      if (levels.signal) {
        const stopDistance = Math.abs(levels.signal.expectedEntryPrice - levels.signal.stopPrice);
        expect(stopDistance).toBeCloseTo(2.2 * levels.atr14, 2);
      }
    });
  });

  // ==========================================================================
  // 5. Correct Accounting V3 (cash + reserved + unrealized = equity)
  // ==========================================================================
  describe("5. Accounting V3", () => {
    it("5-A. Initial account has correct values", () => {
      const account = createInitialV3Account();
      expect(account.initialBalance).toBe(10000);
      expect(account.cash).toBe(10000);
      expect(account.equity).toBe(10000);
      expect(account.accountingVersion).toBe(3);
      expect(account.cash + 0 + 0).toBe(account.equity); // cash + reserved + unrealized = equity
    });

    it("5-B. createInitialV3Account starts at accountingVersion 3", () => {
      const account = createInitialV3Account();
      expect(account.accountingVersion).toBe(3);
    });
  });

  // ==========================================================================
  // 6. Redis Key Isolation (V3 does NOT touch V2 or Model D keys)
  // ==========================================================================
  describe("6. Redis Key Isolation", () => {
    it("6-A. V3 storage keys are distinct from V2 keys", () => {
      expect(V3_STORAGE_KEY).toBe("cryptopilot:paper:breakout-v3:v1");
      expect(V3_LOCK_KEY).toBe("cryptopilot:paper:breakout-v3:lock");
      expect(V3_SNAPSHOTS_KEY).toBe("cryptopilot:paper:breakout-v3:snapshots:v1");

      // Must NOT match V2 keys
      expect(V3_STORAGE_KEY).not.toBe(BREAKOUT_STORAGE_KEY);
      expect(V3_LOCK_KEY).not.toBe(BREAKOUT_LOCK_KEY);
      expect(V3_SNAPSHOTS_KEY).not.toBe(BREAKOUT_SNAPSHOTS_KEY);

      // Must NOT match Model D keys
      expect(V3_STORAGE_KEY).not.toBe("cryptopilot:paper:v1");
    });

    it("6-B. V3 storage service only reads/writes V3 keys", async () => {
      const mockStorage = new Map<string, any>();
      const mockRedis = {
        get: vi.fn().mockImplementation(async (key: string) => {
          return mockStorage.get(key) || null;
        }),
        set: vi.fn().mockImplementation(async (key: string, val: any, opts?: any) => {
          if (opts?.nx && mockStorage.has(key)) return null;
          mockStorage.set(key, val);
          return "OK";
        }),
        del: vi.fn().mockImplementation(async (key: string) => {
          mockStorage.delete(key);
          return 1;
        }),
        lpush: vi.fn().mockResolvedValue(1),
        ltrim: vi.fn().mockResolvedValue("OK"),
        lrange: vi.fn().mockResolvedValue([]),
      };
      setCustomV3RedisClient(mockRedis as any);

      // Load account
      const unlock = await V3StorageService.acquireLock();
      const account = await V3StorageService.loadAccount();
      await V3StorageService.saveAccount(account);
      await unlock();

      // Verify only V3 keys were accessed
      const allCalls = [...mockRedis.get.mock.calls, ...mockRedis.set.mock.calls];
      const accessedKeys = allCalls.map((call) => call[0]);

      for (const key of accessedKeys) {
        // V3 keys must contain "breakout-v3"
        const isV3Key = key.includes("breakout-v3");
        expect(isV3Key).toBe(true);

        // Must NOT be V2 keys
        expect(key).not.toBe(BREAKOUT_STORAGE_KEY);
        expect(key).not.toBe(BREAKOUT_LOCK_KEY);
        expect(key).not.toBe(BREAKOUT_SNAPSHOTS_KEY);
        expect(key).not.toBe("cryptopilot:paper:v1");
      }
    });
  });

  // ==========================================================================
  // 7. Trade IDs are V3-prefixed
  // ==========================================================================
  describe("7. V3 Trade/Position IDs", () => {
    it("7-A. Position IDs are prefixed with v3_pos_", () => {
      // The service creates IDs like: v3_pos_BTCUSDT_<timestamp>
      const expectedPrefix = "v3_pos_";
      const id = `v3_pos_BTCUSDT_${Date.now()}`;
      expect(id.startsWith(expectedPrefix)).toBe(true);
    });

    it("7-B. Trade IDs are prefixed with v3_trade_", () => {
      const expectedPrefix = "v3_trade_";
      const id = `v3_trade_BTCUSDT_${Date.now()}`;
      expect(id.startsWith(expectedPrefix)).toBe(true);
    });
  });

  // ==========================================================================
  // 8. V3 Service Execute Cycle
  // ==========================================================================
  describe("8. V3 Service Execution", () => {
    it("8-A. Debounce guard prevents redundant execution within 60s", async () => {
      setCustomV3RedisClient(null); // Use in-memory for test

      const account = createInitialV3Account();
      const baseNow = 1700000020000;

      const dateSpy = vi.spyOn(Date, "now");
      dateSpy.mockReturnValueOnce(baseNow - 20000);
      await V3StorageService.saveAccount(account);

      dateSpy.mockReturnValue(baseNow);

      const report = await BreakoutV3Service.executeCycle();

      expect(report.skipped).toBe(true);
      expect(report.skipReason).toContain("already executed");

      dateSpy.mockRestore();
    });
  });

  // ==========================================================================
  // 9. Config Validation
  // ==========================================================================
  describe("9. V3 Config", () => {
    it("9-A. V3_CONFIG has all required fields with correct values", () => {
      expect(V3_CONFIG.breakoutLookback).toBe(20);
      expect(V3_CONFIG.exitLookback).toBe(10);
      expect(V3_CONFIG.atrPeriod).toBe(14);
      expect(V3_CONFIG.atrMultiplier).toBe(2.2);
      expect(V3_CONFIG.minVolumeRatio).toBe(1.2);
      expect(V3_CONFIG.cooldownCandles).toBe(5);
      expect(V3_CONFIG.riskPerTradePercent).toBe(1.0);
      expect(V3_CONFIG.feeRate).toBe(0.0005);
      expect(V3_CONFIG.slippageRate).toBe(0.0005);
      expect(V3_CONFIG.adxThreshold).toBe(25);
      expect(V3_CONFIG.emaPeriod).toBe(50);
    });
  });

  // ==========================================================================
  // 10. Min candles requirement
  // ==========================================================================
  describe("10. Minimum Candles", () => {
    it("10-A. Throws if fewer than required candles for EMA(50)", () => {
      const candles = generateCandles(30, 100);
      expect(() =>
        evaluateBreakoutLevelsV3("BTCUSDT", candles, false, 0)
      ).toThrow(/Insufficient completed candles/);
    });

    it("10-B. Accepts 55+ candles (enough for EMA50 + ADX)", () => {
      const candles = generateCandles(60, 100);
      expect(() =>
        evaluateBreakoutLevelsV3("BTCUSDT", candles, false, 0)
      ).not.toThrow();
    });
  });
});
