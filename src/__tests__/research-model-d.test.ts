import { describe, expect, it } from "vitest";
import { RawHistoricalCandle, ResearchConfig } from "../research/types";
import { runCausalModelDSimulation } from "../research/simulation/engine";
import { calculateStructuralSwingTrailing } from "../research/simulation/trailing";
import { runBuyAndHoldBenchmark, runEmaTrendBenchmark } from "../research/simulation/benchmarks";
import { calculateEMA, calculateATR } from "@/core/quant/indicators";

describe("Phase 2: Causal Simulation Engine & Lookahead Audit (T008–T011)", () => {
  // Generate deterministic continuous 4H series with a strong bull trend
  const generateTrendCandles = (count: number, basePrice: number = 30000, trendStep: number = 50): RawHistoricalCandle[] => {
    const candles: RawHistoricalCandle[] = [];
    const fourHoursMs = 4 * 3600 * 1000;
    const startTs = 1609459200000; // 2021-01-01

    let currentPrice = basePrice;
    for (let i = 0; i < count; i++) {
      const open = currentPrice;
      // create alternating minor pullbacks and expansion
      const isPullback = i > 210 && i % 15 === 0;
      const low = isPullback ? open - 300 : open - 50;
      const high = isPullback ? open + 100 : open + 200;
      const close = isPullback ? open + 20 : open + trendStep;

      candles.push({
        timestamp: startTs + i * fourHoursMs,
        open,
        high,
        low,
        close,
        volume: 1000,
        closeTime: startTs + (i + 1) * fourHoursMs - 1,
        quoteVolume: 1000 * close,
        tradesCount: 500,
        takerBuyVolume: 600,
        takerBuyQuoteVolume: 600 * close,
      });

      currentPrice = close;
    }
    return candles;
  };

  const baseConfig: ResearchConfig = {
    symbol: "BTCUSDT",
    timeframe: "4h",
    startDate: "2021-01-01",
    endDate: "2026-09-19",
    initialBalance: 10000,
    riskPerTradePercent: 1.0,
    direction: "LONG_ONLY",
    takerFeeRate: 0.0005,
    slippageRate: 0.0005,
    atrMultiplier: 2.5,
    trailingWindowBars: 5,
    maxStopLossDistancePercent: 6.0,
    splits: {
      devEnd: "2023-06-30",
      valEnd: "2024-09-30",
    },
  };

  it("T008: calculates structural swing trailing strictly using closed bars T-5 through T-1", () => {
    const candles = generateTrendCandles(20);
    // Examine trailing level at bar index 10
    // Should use indices 5, 6, 7, 8, 9
    const trailingLong = calculateStructuralSwingTrailing(candles, 10, "LONG", 5);
    expect(trailingLong).not.toBeNull();

    const windowCandles = candles.slice(5, 10);
    const expectedMinLow = Math.min(...windowCandles.map((c) => c.low));
    expect(trailingLong).toBe(expectedMinLow);

    // Verify it NEVER checks bar 10 (current bar)
    const poisonedCandles = [...candles];
    poisonedCandles[10] = { ...poisonedCandles[10], low: 1 }; // Artificial crash on current forming bar

    const trailingWithPoison = calculateStructuralSwingTrailing(poisonedCandles, 10, "LONG", 5);
    expect(trailingWithPoison).toBe(expectedMinLow); // Must be unaffected by bar 10
    expect(trailingWithPoison).not.toBe(1);
  });

  it("T009: verifies point-in-time trade entry occurs strictly at Open(T) with fees deducted", () => {
    const candles = generateTrendCandles(250);
    const result = runCausalModelDSimulation(candles, baseConfig);

    expect(result.direction).toBe("LONG_ONLY");
    expect(result.initialBalance).toBe(10000);

    if (result.trades.length > 0) {
      const firstTrade = result.trades[0];
      const entryBar = candles[firstTrade.entryBarIndex];

      // Entry price must match entryBar.open * (1 + slippageRate)
      const expectedFillPrice = entryBar.open * (1 + baseConfig.slippageRate);
      expect(firstTrade.entryPrice).toBeCloseTo(expectedFillPrice, 1);
      expect(firstTrade.entryTimestamp).toBe(entryBar.timestamp);
      expect(firstTrade.feePaid).toBeGreaterThan(0);
    }
  });

  it("T010: executes Buy & Hold and EMA 20/50 benchmarks over identical historical periods", () => {
    const candles = generateTrendCandles(250);
    const bnh = runBuyAndHoldBenchmark(candles, 10000);
    const emaBench = runEmaTrendBenchmark(candles, 10000);

    expect(bnh.benchmarkType).toBe("BUY_AND_HOLD");
    expect(bnh.equityCurve.length).toBe(candles.length);
    expect(bnh.returnPercent).toBeGreaterThan(0);

    expect(emaBench.benchmarkType).toBe("EMA_20_50_DUAL_TREND");
    expect(emaBench.initialBalance).toBe(10000);
    expect(emaBench.equityCurve.length).toBeGreaterThan(0);
  });

  it("T011 (CRITICAL): Audits and asserts ZERO lookahead leakage", () => {
    const originalCandles = generateTrendCandles(260);

    // Run simulation on clean history
    const cleanResult = runCausalModelDSimulation(originalCandles, baseConfig);

    // Create poisoned history where future bars (from index 240 onward) have extreme spikes
    const poisonedCandles = originalCandles.map((c, idx) => {
      if (idx >= 240) {
        return {
          ...c,
          open: c.open * 10,
          high: c.high * 10,
          low: c.low * 10,
          close: c.close * 10,
        };
      }
      return c;
    });

    const poisonedResult = runCausalModelDSimulation(poisonedCandles, baseConfig);

    // Any trade entered BEFORE index 240 must be 100% IDENTICAL in both runs:
    // same entryBarIndex, same entryPrice, same stopLoss, same units.
    const cleanPre240 = cleanResult.trades.filter((t) => t.entryBarIndex < 240);
    const poisonedPre240 = poisonedResult.trades.filter((t) => t.entryBarIndex < 240);

    expect(cleanPre240.length).toBe(poisonedPre240.length);

    for (let i = 0; i < cleanPre240.length; i++) {
      expect(cleanPre240[i].entryBarIndex).toBe(poisonedPre240[i].entryBarIndex);
      expect(cleanPre240[i].entryPrice).toBe(poisonedPre240[i].entryPrice);
      expect(cleanPre240[i].initialStopLoss).toBe(poisonedPre240[i].initialStopLoss);
      expect(cleanPre240[i].units).toBe(poisonedPre240[i].units);
    }
  });

  it("T011: Confirms indicator causality (truncated array equals full array at identical timestamp)", () => {
    const candles = generateTrendCandles(250);
    const closes = candles.map((c) => c.close);

    const fullEma200 = calculateEMA(closes, 200);
    const fullAtr14 = calculateATR(candles, 14);

    // Truncate at bar 220
    const truncatedCloses = closes.slice(0, 221);
    const truncatedCandles = candles.slice(0, 221);

    const truncEma200 = calculateEMA(truncatedCloses, 200);
    const truncAtr14 = calculateATR(truncatedCandles, 14);

    // The value at index 220 must be EXACTLY identical
    expect(truncEma200[220]).toBeCloseTo(fullEma200[220], 6);
    expect(truncAtr14[220]).toBeCloseTo(fullAtr14[220], 6);
  });
});
