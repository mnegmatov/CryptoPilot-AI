import { describe, it, expect } from "vitest";
import { RawHistoricalCandle, ResearchTrade, ResearchConfig } from "../research/types";
import { calculatePerformanceMetrics } from "../research/analytics/metrics";
import { classifyCandleRegimes, attributePerformanceByRegime } from "../research/analytics/regime";
import { runCostSensitivityMatrix, runParameterNeighborhoodAnalysis } from "../research/analytics/stress";
import { runMonteCarloResampling } from "../research/analytics/monte-carlo";
import { runCausalModelDSimulation } from "../research/simulation/engine";

function generateMockCandleSeries(
  count: number,
  startPrice: number = 20000,
  trendPerBar: number = 10,
  volatility: number = 100
): RawHistoricalCandle[] {
  const candles: RawHistoricalCandle[] = [];
  const baseTs = 1609459200000; // 2021-01-01T00:00:00.000Z
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const open = price;
    const wave = Math.sin(i / 10) * volatility;
    const high = open + Math.abs(wave) + 20;
    const low = open - Math.abs(wave) - 20;
    const close = open + wave * 0.5 + trendPerBar;
    price = close;

    candles.push({
      timestamp: baseTs + i * 4 * 3600 * 1000,
      open,
      high,
      low,
      close,
      volume: 1000,
      closeTime: baseTs + (i + 1) * 4 * 3600 * 1000 - 1,
      quoteVolume: 1000 * close,
      tradesCount: 500,
      takerBuyVolume: 500,
      takerBuyQuoteVolume: 500 * close,
    });
  }

  return candles;
}

function createMockTrade(overrides: Partial<ResearchTrade> = {}): ResearchTrade {
  return {
    id: "test_trade",
    symbol: "BTCUSDT",
    direction: "LONG",
    entryBarIndex: 210,
    entryTimestamp: 1610000000000,
    entryPrice: 30000,
    initialStopLoss: 28500,
    currentStopLoss: 28500,
    exitBarIndex: 215,
    exitTimestamp: 1610072000000,
    exitPrice: 31500,
    exitReason: "TRAILING_STOP",
    units: 0.1,
    pnlGross: 150,
    pnlNet: 140,
    returnPercent: 4.67,
    rMultiple: 1.0,
    highestRReached: 1.5,
    holdingHours: 20,
    feePaid: 6,
    slippagePaid: 4,
    regimeAtEntry: {
      trend: "BULL",
      volatility: "NORMAL",
      adx14: 25,
      ema200DistancePercent: 5.0,
    },
    ...overrides,
  };
}

describe("Phase 3 Analytics: Quantitative Performance Metrics (T012)", () => {
  it("computes accurate win rate, profit factor, expectancy, payoff ratio, and streaks", () => {
    const trades: ResearchTrade[] = [
      createMockTrade({ pnlNet: 100, rMultiple: 1.0, returnPercent: 5 }),
      createMockTrade({ pnlNet: 150, rMultiple: 1.5, returnPercent: 7.5 }),
      createMockTrade({ pnlNet: -50, rMultiple: -0.5, returnPercent: -2.5 }),
      createMockTrade({ pnlNet: 200, rMultiple: 2.0, returnPercent: 10 }),
      createMockTrade({ pnlNet: -50, rMultiple: -0.5, returnPercent: -2.5 }),
      createMockTrade({ pnlNet: -50, rMultiple: -0.5, returnPercent: -2.5 }),
    ];

    const equityCurve = [
      { timestamp: 1610000000000, equity: 10000, drawdownPercent: 0 },
      { timestamp: 1610100000000, equity: 10100, drawdownPercent: 0 },
      { timestamp: 1610200000000, equity: 10250, drawdownPercent: 0 },
      { timestamp: 1610300000000, equity: 10200, drawdownPercent: 0.49 },
      { timestamp: 1610400000000, equity: 10400, drawdownPercent: 0 },
      { timestamp: 1610500000000, equity: 10350, drawdownPercent: 0.48 },
      { timestamp: 1610600000000, equity: 10300, drawdownPercent: 0.96 },
    ];

    const metrics = calculatePerformanceMetrics({
      asset: "BTCUSDT",
      direction: "LONG_ONLY",
      periodName: "IN_SAMPLE",
      startDate: "2021-01-01",
      endDate: "2022-01-01",
      totalBars: 1000,
      initialBalance: 10000,
      trades,
      equityCurve,
    });

    expect(metrics.totalTrades).toBe(6);
    expect(metrics.winningTrades).toBe(3);
    expect(metrics.losingTrades).toBe(3);
    expect(metrics.winRate).toBe(50);

    // Gross profit = 100 + 150 + 200 = 450. Gross loss = 50 + 50 + 50 = 150. PF = 3.0
    expect(metrics.profitFactor).toBeCloseTo(3.0, 1);

    // Net PnL = 300
    expect(metrics.finalEquity).toBe(10300);
    expect(metrics.netPnlPercent).toBe(3.0);

    // Expectancy
    expect(metrics.expectancyDollar).toBe(50); // 300 / 6
    expect(metrics.expectancyR).toBeCloseTo((1 + 1.5 - 0.5 + 2 - 0.5 - 0.5) / 6, 2);

    // Payoff ratio: Avg Win = 450/3 = 150. Avg Loss = 150/3 = 50. Payoff = 3.0
    expect(metrics.payoffRatio).toBe(3.0);

    // Streaks: 2 wins in a row, 2 losses in a row
    expect(metrics.maxConsecutiveWins).toBe(2);
    expect(metrics.maxConsecutiveLosses).toBe(2);

    // Top 5 outlier contribution
    expect(metrics.top5TradesPnlContributionPercent).toBeGreaterThan(0);
  });
});

describe("Phase 3 Analytics: Market Regime Attribution (T013)", () => {
  it("classifies regimes across historical candles and breaks down performance", () => {
    const candles = generateMockCandleSeries(300, 20000, 50, 200);
    const regimes = classifyCandleRegimes(candles);

    expect(regimes.length).toBe(candles.length);
    for (let i = 200; i < regimes.length; i++) {
      expect(["BULL", "BEAR", "CHOP"]).toContain(regimes[i].trend);
      expect(["HIGH", "NORMAL", "LOW"]).toContain(regimes[i].volatility);
    }

    const trades: ResearchTrade[] = [
      createMockTrade({ pnlNet: 200, regimeAtEntry: { trend: "BULL", volatility: "NORMAL", adx14: 25, ema200DistancePercent: 5 } }),
      createMockTrade({ pnlNet: -50, regimeAtEntry: { trend: "BULL", volatility: "HIGH", adx14: 30, ema200DistancePercent: 8 } }),
      createMockTrade({ pnlNet: -100, regimeAtEntry: { trend: "CHOP", volatility: "LOW", adx14: 15, ema200DistancePercent: 0.5 } }),
    ];

    const attribution = attributePerformanceByRegime(trades);
    expect(attribution.trendBreakdown.bull.totalTrades).toBe(2);
    expect(attribution.trendBreakdown.bull.winningTrades).toBe(1);
    expect(attribution.trendBreakdown.bull.netPnl).toBe(150);
    expect(attribution.trendBreakdown.chop.totalTrades).toBe(1);
    expect(attribution.trendBreakdown.chop.netPnl).toBe(-100);
  });
});

describe("Phase 3 Analytics: Stress Testing & Sensitivity (T014 & T015)", () => {
  const mockConfig: ResearchConfig = {
    symbol: "BTCUSDT",
    timeframe: "4h",
    startDate: "2021-01-01",
    endDate: "2022-01-01",
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

  it("evaluates transaction cost sensitivity across 3 tiers (0.10%, 0.175%, 0.30%)", () => {
    const candles = generateMockCandleSeries(350, 20000, 30, 250);
    const stress = runCostSensitivityMatrix(candles, mockConfig, "IN_SAMPLE");

    expect(stress.tiers.length).toBe(3);
    expect(stress.tiers[0].tierName).toBe("BASELINE");
    expect(stress.tiers[1].tierName).toBe("ADVERSE");
    expect(stress.tiers[2].tierName).toBe("SEVERE");

    // Friction strictly increases: severe round-trip is 0.30% vs baseline 0.10%
    expect(stress.tiers[2].roundTripPercent).toBe(0.3);
    expect(stress.tiers[0].roundTripPercent).toBe(0.1);

    // If trades exist, total fees and slippage must be higher in SEVERE tier
    if (stress.tiers[0].totalTrades > 0) {
      expect(stress.tiers[2].totalFeesPaid).toBeGreaterThan(stress.tiers[0].totalFeesPaid);
    }
  });

  it("evaluates parameter neighborhood stability surface without crashing", () => {
    const candles = generateMockCandleSeries(280, 20000, 20, 150);
    const analysis = runParameterNeighborhoodAnalysis(candles, mockConfig, "IN_SAMPLE");

    expect(analysis.grid.length).toBe(5 * 5 * 4); // 5 ATRs * 5 trailing * 4 risks = 100 combinations
    expect(analysis.baseline).toBeDefined();
    expect(analysis.baseline.atrMultiplier).toBe(2.5);
    expect(analysis.baseline.trailingWindowBars).toBe(5);
    expect(analysis.baseline.riskPerTradePercent).toBe(1.0);
    expect(analysis.surfaceStats.totalRunsCount).toBe(100);
  });
});

describe("Phase 3 Analytics: Monte Carlo Resampling Engine (T018)", () => {
  it("executes 5,000 resampled iterations and computes percentile drawdowns", () => {
    const trades: ResearchTrade[] = [
      createMockTrade({ pnlNet: 250, returnPercent: 2.5 }),
      createMockTrade({ pnlNet: -100, returnPercent: -1.0 }),
      createMockTrade({ pnlNet: 150, returnPercent: 1.5 }),
      createMockTrade({ pnlNet: -100, returnPercent: -1.0 }),
      createMockTrade({ pnlNet: 300, returnPercent: 3.0 }),
      createMockTrade({ pnlNet: -100, returnPercent: -1.0 }),
      createMockTrade({ pnlNet: 400, returnPercent: 4.0 }),
      createMockTrade({ pnlNet: -100, returnPercent: -1.0 }),
    ];

    const result = runMonteCarloResampling(trades, 10000, 5000, 42);

    expect(result.iterations).toBe(5000);
    expect(result.tradeCount).toBe(8);
    expect(result.medianFinalEquity).toBeGreaterThan(10000);
    expect(result.p95MaxDrawdownPercent).toBeGreaterThanOrEqual(result.medianMaxDrawdownPercent);
    expect(result.p99MaxDrawdownPercent).toBeGreaterThanOrEqual(result.p95MaxDrawdownPercent);
  });

  it("handles 0 trades gracefully", () => {
    const result = runMonteCarloResampling([], 10000, 1000);
    expect(result.medianFinalEquity).toBe(10000);
    expect(result.medianMaxDrawdownPercent).toBe(0);
    expect(result.probNegativeReturnPercent).toBe(0);
  });
});
