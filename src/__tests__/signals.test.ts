import { describe, expect, it } from "vitest";
import { calculatePositionSize, evaluateRiskCompliance } from "../core/risk/position-sizer";
import { generateTradingSignal } from "../core/signals/generator";
import { MarketContextData, MarketStructure, TechnicalIndicators } from "../core/types";

describe("Signal Generation & Risk Engine", () => {
  const mockBullishIndicators: TechnicalIndicators = {
    currentPrice: 65000,
    ema20: 64500,
    ema50: 63800,
    ema200: 61000,
    rsi14: 54,
    rsiState: "NEUTRAL",
    macd: {
      macdLine: 450,
      signalLine: 320,
      histogram: 130,
      trend: "BULLISH",
    },
    adx14: 28.5,
    plusDI: 32.0,
    minusDI: 14.2,
    atr14: 1200,
    bollingerBands: {
      upper: 67000,
      middle: 65000,
      lower: 63000,
      bandwidth: 6.15,
    },
    volumeRatio20: 1.45,
    vwap: 64800,
  };

  const mockBullishStructure: MarketStructure = {
    trendHTF: "BULLISH",
    trendLTF: "BULLISH",
    swingHigh: 66500,
    swingLow: 63200,
    keySupport: 63500,
    keyResistance: 68000,
    structureState: "HIGHER_HIGHS",
  };

  const mockContext: MarketContextData = {
    fearGreedIndex: 62,
    fearGreedSentiment: "Greed",
    fundingRate: 0.0001,
    btcDominance: 57.5,
    marketRegime: "TRENDING_BULL",
  };

  it("generates BUY signal with high confidence for aligned bullish market", () => {
    const signal = generateTradingSignal("BTCUSDT", mockBullishIndicators, mockBullishStructure, mockContext);

    expect(signal.stance).toBe("BUY");
    expect(signal.type).toBe("LONG");
    expect(signal.confidenceScore).toBeGreaterThanOrEqual(65);
    expect(signal.currentPrice).toBe(65000);
    expect(signal.stopLoss).toBeLessThan(signal.currentPrice);
    expect(signal.riskRewardRatio).toBeGreaterThanOrEqual(1.8);
    expect(signal.takeProfitTargets.length).toBe(3);
    expect(signal.invalidationConditions.length).toBeGreaterThan(0);
    expect(signal.takeProfitTargets[0].type).toBeDefined();
    expect(signal.takeProfitTargets[0].targetReason).toBeDefined();
  });

  it("generates SHORT signal with high confidence for aligned bearish market", () => {
    const mockBearishIndicators: TechnicalIndicators = {
      ...mockBullishIndicators,
      currentPrice: 62000,
      ema20: 62800,
      ema50: 63500,
      ema200: 65000, // price below 200 EMA
      rsi14: 44,
      rsiState: "BEARISH_DIVERGENCE",
      macd: {
        macdLine: -350,
        signalLine: -200,
        histogram: -150,
        trend: "BEARISH",
      },
      adx14: 26.4,
      plusDI: 15.1,
      minusDI: 31.8,
    };

    const mockBearishStructure: MarketStructure = {
      trendHTF: "BEARISH",
      trendLTF: "BEARISH",
      swingHigh: 63800,
      swingLow: 61500,
      keySupport: 60000,
      keyResistance: 63800,
      structureState: "LOWER_LOWS",
      liquiditySweep: {
        type: "BEARISH_SWEEP",
        level: 63800,
        timestamp: Date.now(),
      },
    };

    const signal = generateTradingSignal("BTCUSDT", mockBearishIndicators, mockBearishStructure, mockContext);

    expect(signal.stance).toBe("SHORT");
    expect(signal.type).toBe("SHORT");
    expect(signal.confidenceScore).toBeGreaterThanOrEqual(65);
    expect(signal.stopLoss).toBeGreaterThan(signal.currentPrice);
    expect(signal.takeProfitTargets[0].price).toBeLessThan(signal.currentPrice);
    expect(signal.takeProfitTargets[1].price).toBeLessThan(signal.takeProfitTargets[0].price);
    expect(signal.riskRewardRatio).toBeGreaterThanOrEqual(1.8);
  });

  it("suppresses signals and flags WAIT when ADX indicates low-volatility chop", () => {
    const mockChopIndicators: TechnicalIndicators = {
      ...mockBullishIndicators,
      adx14: 14.2, // Below 20 threshold
      bollingerBands: {
        upper: 65200,
        middle: 65000,
        lower: 64800,
        bandwidth: 0.6, // compressed
      },
      volumeRatio20: 0.65,
    };

    const signal = generateTradingSignal("BTCUSDT", mockChopIndicators, mockBullishStructure, mockContext, {
      adxThreshold: 20,
      enableAdxFilter: true,
    });

    expect(signal.stance).toBe("WAIT");
  });

  it("calculates symmetrical position sizing for both LONG and SHORT", () => {
    const equity = 10000;
    const riskPct = 1.5; // $150 risk

    // Long test
    const longSizing = calculatePositionSize(equity, riskPct, 65000, 63500);
    expect(longSizing.type).toBe("LONG");
    expect(longSizing.riskDollarAmount).toBe(150);
    expect(longSizing.positionUnits).toBeCloseTo(0.1, 2);

    // Short test
    const shortSizing = calculatePositionSize(equity, riskPct, 62000, 63500);
    expect(shortSizing.type).toBe("SHORT");
    expect(shortSizing.riskDollarAmount).toBe(150);
    expect(shortSizing.positionUnits).toBeCloseTo(0.1, 2);
  });

  it("enforces 4H Hard Trend Gate allowing only trend-aligned setups", () => {
    // 1. Long setup with aligned 4H Bullish Gate (4H price > EMA200 & 4H trend BULLISH) -> ALLOWED
    const bullGateSignal = generateTradingSignal("BTCUSDT", mockBullishIndicators, {
      ...mockBullishStructure,
      trendHTF: "BULLISH",
      htfPriceAboveEma200: true,
      htfEma200: 60000,
    }, mockContext, {
      enableHtfGate: true,
    });
    expect(bullGateSignal.stance).toBe("BUY");
    expect(bullGateSignal.type).toBe("LONG");

    // 2. Long setup with counter-trend 4H gate (4H price below 4H EMA200) -> BLOCKED to WAIT
    const blockedLongSignal = generateTradingSignal("BTCUSDT", mockBullishIndicators, {
      ...mockBullishStructure,
      trendHTF: "BULLISH",
      htfPriceAboveEma200: false, // 4H price below 4H EMA200
      htfEma200: 68000,
    }, mockContext, {
      enableHtfGate: true,
    });
    expect(blockedLongSignal.stance).toBe("WAIT");
    expect(blockedLongSignal.invalidationConditions.some((c) => c.includes("4H Trend Gate"))).toBe(true);

    // 3. Short setup with aligned 4H Bearish Gate (4H price < EMA200 & 4H trend BEARISH) -> ALLOWED
    const mockBearishIndicators: TechnicalIndicators = {
      ...mockBullishIndicators,
      currentPrice: 62000,
      ema20: 62800,
      ema50: 63500,
      ema200: 65000,
      rsi14: 44,
      rsiState: "BEARISH_DIVERGENCE",
      macd: { macdLine: -350, signalLine: -200, histogram: -150, trend: "BEARISH" },
      adx14: 26.4,
      plusDI: 15.1,
      minusDI: 31.8,
    };
    const mockBearishStructure: MarketStructure = {
      trendHTF: "BEARISH",
      trendLTF: "BEARISH",
      swingHigh: 63800,
      swingLow: 61500,
      keySupport: 60000,
      keyResistance: 63800,
      structureState: "LOWER_LOWS",
      htfPriceAboveEma200: false,
      htfEma200: 65000,
    };

    const bearGateSignal = generateTradingSignal("BTCUSDT", mockBearishIndicators, mockBearishStructure, mockContext, {
      enableHtfGate: true,
      enableShorts: true,
    });
    expect(bearGateSignal.stance).toBe("SHORT");
    expect(bearGateSignal.type).toBe("SHORT");

    // 4. Short setup when 4H price > EMA200 -> BLOCKED to WAIT
    const blockedShortSignal = generateTradingSignal("BTCUSDT", mockBearishIndicators, {
      ...mockBearishStructure,
      htfPriceAboveEma200: true, // 4H price above EMA200
    }, mockContext, {
      enableHtfGate: true,
      enableShorts: true,
    });
    expect(blockedShortSignal.stance).toBe("WAIT");
    expect(blockedShortSignal.invalidationConditions.some((c) => c.includes("4H Trend Gate"))).toBe(true);
  });

  it("calculates regime-specific risk recommendations based on ADX", async () => {
    const { getRegimeRiskPercentage } = await import("../core/risk/position-sizer");

    // Trending regime (ADX >= 25) -> 1.5%
    expect(getRegimeRiskPercentage(28.5)).toBe(1.5);
    expect(getRegimeRiskPercentage(25.0)).toBe(1.5);

    // Weak / ranging regime (ADX < 25) -> 0.75%
    expect(getRegimeRiskPercentage(22.0)).toBe(0.75);
    expect(getRegimeRiskPercentage(14.0)).toBe(0.75);

    // Verified on signal object
    const signalTrending = generateTradingSignal("BTCUSDT", { ...mockBullishIndicators, adx14: 29 }, mockBullishStructure, mockContext);
    expect(signalTrending.recommendedRiskPercent).toBe(1.5);

    const signalWeak = generateTradingSignal("BTCUSDT", { ...mockBullishIndicators, adx14: 19 }, mockBullishStructure, mockContext, {
      enableAdxFilter: false, // allow signal generation even with low ADX
    });
    expect(signalWeak.recommendedRiskPercent).toBe(0.75);
  });
});
