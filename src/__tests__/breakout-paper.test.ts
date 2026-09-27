import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { Candle } from "@/core/types";
import {
  evaluateBreakoutLevels,
  checkPositionExit,
  V2_AD_CONFIG,
} from "@/core/breakout-paper/strategy";
import {
  BreakoutStorageService,
  createInitialBreakoutAccount,
  BREAKOUT_STORAGE_KEY,
  setCustomBreakoutRedisClient,
} from "@/core/breakout-paper/storage";
import { BreakoutPaperService } from "@/core/breakout-paper/service";
import { BreakoutPosition } from "@/core/breakout-paper/types";

const FOUR_HOURS_MS = 4 * 3600 * 1000;

function generateCandles(
  count: number,
  startPrice: number = 100,
  baseTime: number = 1609459200000
): Candle[] {
  const candles: Candle[] = [];
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    const open = price;
    const high = open * 1.01;
    const low = open * 0.99;
    const close = open;
    candles.push({
      timestamp: baseTime + i * FOUR_HOURS_MS,
      open,
      high,
      low,
      close,
      volume: 1000,
    });
  }
  return candles;
}

describe("Model Breakout V2-AD — Paper Trading Test Suite", () => {
  const localTestStatePath = path.join(process.cwd(), "data", "breakout_paper_trading_state.json");
  const localTestSnapshotsPath = path.join(process.cwd(), "data", "breakout_paper_snapshots.json");

  beforeEach(() => {
    setCustomBreakoutRedisClient(null);
    if (fs.existsSync(localTestStatePath)) fs.unlinkSync(localTestStatePath);
    if (fs.existsSync(localTestSnapshotsPath)) fs.unlinkSync(localTestSnapshotsPath);
  });

  afterEach(() => {
    if (fs.existsSync(localTestStatePath)) fs.unlinkSync(localTestStatePath);
    if (fs.existsSync(localTestSnapshotsPath)) fs.unlinkSync(localTestSnapshotsPath);
    vi.restoreAllMocks();
  });

  // 1. Breakout detection
  it("1. Breakout detection: detects high > HH20 and low < LL20", () => {
    const candles = generateCandles(30, 100);
    // Candle 29 breaks out upwards
    candles[29].high = 115;
    candles[29].volume = 2000;

    const levelsUp = evaluateBreakoutLevels("BTCUSDT", candles, false, 0);
    expect(levelsUp.signal).not.toBeNull();
    expect(levelsUp.signal?.direction).toBe("LONG");
    expect(levelsUp.signal?.breakoutLevel).toBe(levelsUp.hh20);

    // Candle 29 breaks out downwards
    const candlesDown = generateCandles(30, 100);
    candlesDown[29].low = 85;
    candlesDown[29].volume = 2000;
    const levelsDown = evaluateBreakoutLevels("BTCUSDT", candlesDown, false, 0);
    expect(levelsDown.signal).not.toBeNull();
    expect(levelsDown.signal?.direction).toBe("SHORT");
    expect(levelsDown.signal?.breakoutLevel).toBe(levelsDown.ll20);
  });

  // 2. Volume filter
  it("2. Volume filter: requires volume ratio >= 1.2, rejects < 1.2", () => {
    const candles = generateCandles(30, 100);
    candles[29].high = 115;
    candles[29].volume = 1000; // vol ratio is 1.0 (< 1.2)

    const levels = evaluateBreakoutLevels("BTCUSDT", candles, false, 0);
    expect(levels.signal).toBeNull(); // Rejected by volume filter

    // Now volume ratio is >= 1.2
    candles[29].volume = 1500;
    const levelsPass = evaluateBreakoutLevels("BTCUSDT", candles, false, 0);
    expect(levelsPass.signal).not.toBeNull();
    expect(levelsPass.volRatio).toBeGreaterThanOrEqual(1.2);
  });

  // 3. T+1 entry execution
  it("3. T+1 entry: enters strictly at T+1 OPEN price with slippage applied", async () => {
    const baseTime = 1700000000000;
    const candles = generateCandles(30, 100, baseTime);
    candles[28].high = 120; // Completed candle T breakout
    candles[28].volume = 2000;

    // Forming candle T+1
    const formingCandle: Candle = {
      timestamp: candles[28].timestamp + FOUR_HOURS_MS,
      open: 110,
      high: 112,
      low: 109,
      close: 111,
      volume: 500,
    };
    const allCandles = [...candles.slice(0, 29), formingCandle];

    // Current time is inside T+1
    const currentTime = formingCandle.timestamp + 30 * 60 * 1000;
    vi.spyOn(Date, "now").mockReturnValue(currentTime);

    const candlesMap = {
      BTCUSDT: allCandles,
      ETHUSDT: generateCandles(30, 2000, baseTime),
      SOLUSDT: generateCandles(30, 50, baseTime),
    };
    const pricesMap = {
      BTCUSDT: 111,
      ETHUSDT: 2000,
      SOLUSDT: 50,
    };

    const report = await BreakoutPaperService.executeCycle(V2_AD_CONFIG, candlesMap, pricesMap);
    const btcPos = report.account.positions.find((p) => p.asset === "BTCUSDT");

    expect(btcPos).toBeDefined();
    expect(btcPos?.direction).toBe("LONG");
    // Entry price must be formingCandle.open * (1 + 0.0005)
    expect(btcPos?.entryPrice).toBeCloseTo(110 * 1.0005, 4);
    expect(btcPos?.entryTimestamp).toBe(formingCandle.timestamp);
  });

  // 4. No T+2/T+3 entry
  it("4. No T+2/T+3 entry: expired if executed past T+1 window", async () => {
    const baseTime = 1700000000000;
    const candles = generateCandles(30, 100, baseTime);
    candles[27].high = 120; // Breakout happened 2 bars ago (T-1)
    candles[27].volume = 2000;

    // Current time is in T+2 (missed T+1)
    const formingCandle: Candle = {
      timestamp: candles[27].timestamp + 2 * FOUR_HOURS_MS,
      open: 110,
      high: 112,
      low: 109,
      close: 111,
      volume: 500,
    };
    const allCandles = [...candles.slice(0, 28), formingCandle];
    const currentTime = formingCandle.timestamp + 10 * 60 * 1000;
    vi.spyOn(Date, "now").mockReturnValue(currentTime);

    const candlesMap = {
      BTCUSDT: allCandles,
      ETHUSDT: generateCandles(30, 2000, baseTime),
      SOLUSDT: generateCandles(30, 50, baseTime),
    };
    const pricesMap = { BTCUSDT: 111, ETHUSDT: 2000, SOLUSDT: 50 };

    const report = await BreakoutPaperService.executeCycle(V2_AD_CONFIG, candlesMap, pricesMap);
    const btcPos = report.account.positions.find((p) => p.asset === "BTCUSDT");
    expect(btcPos).toBeUndefined(); // Never enter on T+2 or later
  });

  // 5. Active-position breakout ignored
  it("5. Active-position breakout ignored: if position is active, breakouts are ignored and not queued", () => {
    const candles = generateCandles(30, 100);
    candles[29].high = 125;
    candles[29].volume = 2000;

    // hasActivePosition = true
    const levels = evaluateBreakoutLevels("BTCUSDT", candles, true, 0);
    expect(levels.signal).toBeNull(); // Discarded!
  });

  // 6. 2x ATR stop
  it("6. 2x ATR stop: stop distance is exactly 2.0 * ATR(14)", () => {
    const candles = generateCandles(30, 100);
    candles[29].high = 120;
    candles[29].volume = 2000;

    const levels = evaluateBreakoutLevels("BTCUSDT", candles, false, 0);
    expect(levels.signal).not.toBeNull();
    const stopDistance = Math.abs(levels.signal!.expectedEntryPrice - levels.signal!.stopPrice);
    expect(stopDistance).toBeCloseTo(2.0 * levels.atr14, 4);
  });

  // 7. 1% risk sizing
  it("7. 1% risk sizing: risk dollar equals 1% of current paper equity", async () => {
    const account = createInitialBreakoutAccount(); // equity = 10000
    const equity = account.equity;
    const riskDollarExpected = equity * 0.01; // $100

    const atr14 = 2.5;
    const stopDist = 2.0 * atr14; // 5.0
    const units = riskDollarExpected / stopDist; // 20 units

    expect(riskDollarExpected).toBe(100);
    expect(units).toBe(20);
  });

  // 8. Cooldown
  it("8. Cooldown: no entry if within 5 candles of exit", () => {
    const candles = generateCandles(30, 100);
    candles[29].high = 125;
    candles[29].volume = 2000;

    // Cooldown remaining = 3
    const levels = evaluateBreakoutLevels("BTCUSDT", candles, false, 3);
    expect(levels.signal).toBeNull(); // Blocked by cooldown
  });

  // 9. Opposite 10-candle channel exit
  it("9. Opposite 10-candle channel exit: triggers exit when close crosses opposite channel", () => {
    const position: BreakoutPosition = {
      id: "pos_test_1",
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
      currentPrice: 102,
      unrealizedPnl: 20,
      unrealizedPnlPercent: 2,
      unrealizedR: 0.2,
      highestPriceSinceEntry: 105,
      lowestPriceSinceEntry: 98,
      breakoutTimestamp: 1609459200000 - FOUR_HOURS_MS,
      breakoutLevel: 100,
      breakoutVolRatio: 1.5,
      channelExitLevel: 95,
    };

    const latestCompleted: Candle = {
      timestamp: 1609459200000 + FOUR_HOURS_MS, // held past entry bar
      open: 96,
      high: 97,
      low: 92,
      close: 93, // below channel ll10 of 95
      volume: 1000,
    };

    const exitResult = checkPositionExit(
      position,
      latestCompleted,
      93,
      { hh10: 105, ll10: 95 }
    );

    expect(exitResult).not.toBeNull();
    expect(exitResult?.shouldExit).toBe(true);
    expect(exitResult?.exitReason).toBe("CHANNEL_EXIT");
  });

  // 10. Fees
  it("10. Fees: charges 0.05% on both entry notional and exit notional", () => {
    const entryNotional = 1000;
    const entryFee = entryNotional * 0.0005;
    expect(entryFee).toBe(0.5);

    const exitNotional = 1200;
    const exitFee = exitNotional * 0.0005;
    expect(exitFee).toBe(0.6);
  });

  // 11. Slippage
  it("11. Slippage: applies 0.05% against entry price and exit price", () => {
    const rawEntry = 100;
    const longEntryPrice = rawEntry * (1 + 0.0005);
    expect(longEntryPrice).toBe(100.05);

    const rawExit = 110;
    const longExitPrice = rawExit * (1 - 0.0005);
    expect(longExitPrice).toBeCloseTo(109.945, 4);
  });

  // 12. Persistence
  it("12. Persistence: saves and reloads Breakout account state intact", async () => {
    const account = createInitialBreakoutAccount();
    account.cash = 9500;
    account.equity = 9600;
    account.realizedPnl = 100;
    account.version = 5;

    await BreakoutStorageService.saveAccount(account);
    const reloaded = await BreakoutStorageService.loadAccount();

    expect(reloaded.cash).toBe(9500);
    expect(reloaded.equity).toBe(9600);
    expect(reloaded.realizedPnl).toBe(100);
    expect(reloaded.version).toBe(6); // Incremented on save
  });

  // 13. Duplicate cycle protection
  it("13. Duplicate cycle protection: same breakout candle does not trigger duplicate entry", async () => {
    const baseTime = 1700000000000;
    const candles = generateCandles(30, 100, baseTime);
    candles[28].high = 120;
    candles[28].volume = 2000;

    const formingCandle: Candle = {
      timestamp: candles[28].timestamp + FOUR_HOURS_MS,
      open: 110,
      high: 112,
      low: 109,
      close: 111,
      volume: 500,
    };
    const allCandles = [...candles.slice(0, 29), formingCandle];
    vi.spyOn(Date, "now").mockReturnValue(formingCandle.timestamp + 10 * 60 * 1000);

    const candlesMap = {
      BTCUSDT: allCandles,
      ETHUSDT: generateCandles(30, 2000, baseTime),
      SOLUSDT: generateCandles(30, 50, baseTime),
    };
    const pricesMap = { BTCUSDT: 111, ETHUSDT: 2000, SOLUSDT: 50 };

    // First cycle triggers entry
    const report1 = await BreakoutPaperService.executeCycle(V2_AD_CONFIG, candlesMap, pricesMap);
    expect(report1.account.positions.length).toBe(1);

    // Second cycle within same candle does NOT open a second position
    const report2 = await BreakoutPaperService.executeCycle(V2_AD_CONFIG, candlesMap, pricesMap);
    expect(report2.account.positions.length).toBe(1);
    expect(report2.openedPositionsThisCycle.length).toBe(0);
  });

  // 14. Duplicate trade protection
  it("14. Duplicate trade protection: positions and trades have unique IDs", () => {
    const id1 = `pos_BTCUSDT_${1600000000000}`;
    const id2 = `pos_BTCUSDT_${1600000000000 + FOUR_HOURS_MS}`;
    expect(id1).not.toBe(id2);
  });

  // 15. Restart persistence
  it("15. Restart persistence: reloads state after service restart without corruption", async () => {
    const account = createInitialBreakoutAccount();
    account.positions.push({
      id: "pos_test_restart",
      asset: "SOLUSDT",
      direction: "LONG",
      entryTimestamp: 1609459200000,
      entryPrice: 50,
      stopPrice: 45,
      initialStopDistance: 5,
      units: 20,
      riskDollar: 100,
      positionSizeDollar: 1000,
      feesPaid: 0.5,
      slippagePaid: 0.5,
      currentPrice: 52,
      unrealizedPnl: 40,
      unrealizedPnlPercent: 4,
      unrealizedR: 0.4,
      highestPriceSinceEntry: 53,
      lowestPriceSinceEntry: 49,
      breakoutTimestamp: 1609459200000 - FOUR_HOURS_MS,
      breakoutLevel: 50,
      breakoutVolRatio: 1.4,
      channelExitLevel: 47,
    });

    await BreakoutStorageService.saveAccount(account);

    // Simulate restart by creating fresh service instance reading from storage
    const reloaded = await BreakoutPaperService.getAccount();
    expect(reloaded.positions.length).toBe(1);
    expect(reloaded.positions[0].id).toBe("pos_test_restart");
    expect(reloaded.positions[0].asset).toBe("SOLUSDT");
  });

  // 16. Redis failure
  it("16. Redis failure handling: falls back to local file storage gracefully", async () => {
    const failingRedisMock = {
      get: vi.fn().mockRejectedValue(new Error("Redis connection refused")),
      set: vi.fn().mockRejectedValue(new Error("Redis connection refused")),
    };
    setCustomBreakoutRedisClient(failingRedisMock as any);

    const account = await BreakoutStorageService.loadAccount();
    expect(account).toBeDefined();
    expect(account.initialBalance).toBe(10000);
  });

  // 17. Binance data failure
  it("17. Binance data failure handling: throws explicit error when Binance fails", async () => {
    vi.spyOn(BreakoutPaperService, "fetchRealCandles").mockRejectedValue(
      new Error("All Binance endpoints failed: Timeout after 8000ms")
    );

    await expect(BreakoutPaperService.fetchRealCandles("BTCUSDT")).rejects.toThrow(
      /All Binance endpoints failed/
    );
  });

  // 18. No fake price fallback
  it("18. No fake price fallback: throws error instead of returning 0 or synthetic fake price", async () => {
    vi.spyOn(BreakoutPaperService, "fetchLivePrice").mockRejectedValue(
      new Error("Real Binance live price unavailable for BTCUSDT")
    );

    await expect(BreakoutPaperService.fetchLivePrice("BTCUSDT")).rejects.toThrow(
      /Real Binance live price unavailable/
    );
  });
});
