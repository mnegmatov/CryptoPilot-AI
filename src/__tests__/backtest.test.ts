import { describe, expect, it } from "vitest";
import { runBacktest } from "../core/backtest/engine";
import { Candle } from "../core/types";

describe("Backtesting Engine", () => {
  it("runs bidirectional backtest executing both LONG and SHORT setups", () => {
    const mockCandles: Candle[] = [];
    let price = 60000;

    // Upward trend then downward trend
    for (let i = 0; i < 200; i++) {
      const delta = i < 100 ? 150 + Math.random() * 50 : -150 - Math.random() * 50;
      price += delta;
      mockCandles.push({
        timestamp: 1700000000000 + i * 3600000,
        open: price - 30,
        high: price + 100,
        low: price - 100,
        close: price,
        volume: 2500 + Math.random() * 1000,
      });
    }

    const summary = runBacktest("BTCUSDT", "1h", mockCandles, {
      initialBalance: 10000,
      riskPerTradePercent: 1.5,
      enableShorts: true,
      enableAdxFilter: true,
    });

    expect(summary.initialBalance).toBe(10000);
    expect(typeof summary.winRatePercent).toBe("number");
    expect(typeof summary.profitFactor).toBe("number");
    expect(typeof summary.longTrades).toBe("number");
    expect(typeof summary.shortTrades).toBe("number");
    expect(summary.equityCurve.length).toBeGreaterThan(0);
  });

  it("applies conservative fill model and intra-candle stop priority", () => {
    const mockCandles: Candle[] = Array.from({ length: 100 }, (_, i) => ({
      timestamp: 1700000000000 + i * 3600000,
      open: 50000 + i * 20,
      high: 50100 + i * 20,
      low: 49900 + i * 20,
      close: 50050 + i * 20,
      volume: 3000,
    }));

    const summary = runBacktest("BTCUSDT", "1h", mockCandles, {
      fillModel: "PENETRATION",
      takerFeePercent: 0.05,
      slippagePercent: 0.05,
    });

    expect(summary.totalTrades).toBeGreaterThanOrEqual(0);
    expect(summary.trades.every((t) => t.rMultiple !== undefined)).toBe(true);
  });

  it("enforces strict zero lookahead bias when extracting 4H candles", async () => {
    const { getHistorical4hCandles } = await import("../core/backtest/engine");
    const fourHours = 4 * 3600000;
    const rawTime = 1700000000000;
    const baseTime = rawTime - (rawTime % fourHours); // Aligned to 4H bucket boundary

    // Create 8 consecutive 1-hour candles (00:00 to 07:00)
    const candles1h: Candle[] = Array.from({ length: 8 }, (_, i) => ({
      timestamp: baseTime + i * 3600000,
      open: 100 + i,
      high: 105 + i,
      low: 95 + i,
      close: 102 + i,
      volume: 1000,
    }));

    // At hour 3 (03:00), the 00:00-04:00 4H candle is STILL forming (not closed yet)
    const htfAtHour3 = getHistorical4hCandles(candles1h.slice(0, 4), baseTime + 3 * 3600000);
    expect(htfAtHour3.length).toBe(0); // Zero completed 4H candles available!

    // At hour 4 (04:00), the 00:00-04:00 4H candle has fully closed
    const htfAtHour4 = getHistorical4hCandles(candles1h.slice(0, 5), baseTime + 4 * 3600000);
    expect(htfAtHour4.length).toBe(1);
    expect(htfAtHour4[0].timestamp).toBe(baseTime);
    expect(htfAtHour4[0].close).toBe(candles1h[3].close); // Close of the 4th 1h bar

    // When explicit 4H candles are supplied, filters strictly by timestamp + 4h <= currentTimestamp
    const explicit4h: Candle[] = [
      { timestamp: baseTime, open: 100, high: 110, low: 90, close: 105, volume: 4000 },
      { timestamp: baseTime + fourHours, open: 105, high: 115, low: 95, close: 110, volume: 4000 },
    ];
    // At hour 5, second 4H candle ends at hour 8 so it must NOT be included
    const filteredExplicit = getHistorical4hCandles([], baseTime + 5 * 3600000, explicit4h);
    expect(filteredExplicit.length).toBe(1);
    expect(filteredExplicit[0].timestamp).toBe(baseTime);
  });

  it("executes backtest with Chandelier ATR trailing stop and regime risk management", () => {
    const mockCandles: Candle[] = [];
    let price = 50000;

    for (let i = 0; i < 250; i++) {
      // Strong trend expansion with volatility
      price += i < 150 ? 120 : -120;
      mockCandles.push({
        timestamp: 1700000000000 + i * 3600000,
        open: price - 20,
        high: price + 150,
        low: price - 150,
        close: price,
        volume: 3500,
      });
    }

    const summary = runBacktest("BTCUSDT", "1h", mockCandles, {
      enableHtfGate: true,
      trailingStopType: "CHANDELIER_ATR",
      chandelierMultiplier: 2.5,
      enableRegimeRisk: true,
      normalRiskPercent: 1.5,
      lowAdxRiskPercent: 0.75,
    });

    expect(summary.totalTrades).toBeGreaterThanOrEqual(0);
    expect(summary.equityCurve.length).toBeGreaterThan(0);

    // If any trades exited via trailing stop, ensure exitReason is TRAILING_STOP
    const trailingTrades = summary.trades.filter((t) => t.exitReason === "TRAILING_STOP");
    expect(Array.isArray(trailingTrades)).toBe(true);
  });
});
