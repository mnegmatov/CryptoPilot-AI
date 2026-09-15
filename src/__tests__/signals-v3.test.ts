import { describe, expect, it } from "vitest";
import { generateTradingSignal } from "../core/signals/generator";
import { MarketContextData, MarketStructure, TechnicalIndicators } from "../core/types";

describe("Strategy V3 — Regime-Aware Trend Following", () => {
  const mockBullishIndicators: TechnicalIndicators = {
    asset: "BTCUSDT",
    currentPrice: 65000,
    ema20: 64500,
    ema50: 63800,
    ema200: 61000,
    rsi14: 58,
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
    swingHigh: 65100,
    swingLow: 62500,
    keySupport: 63000,
    keyResistance: 65050,
    structureState: "HIGHER_HIGHS",
    htfPriceAboveEma200: true,
  };

  const mockContext: MarketContextData = {
    fearGreedIndex: 62,
    fearGreedSentiment: "Greed",
    fundingRate: 0.0001,
    btcDominance: 57.5,
    marketRegime: "TRENDING_BULL",
  };

  it("generates BUY signal with wide noise-tolerant stop in aligned 4H bull regime", () => {
    const signal = generateTradingSignal(
      "BTCUSDT",
      mockBullishIndicators,
      mockBullishStructure,
      mockContext,
      { strategyVersion: "V3" }
    );

    expect(signal.stance).toBe("BUY");
    expect(signal.type).toBe("LONG");
    expect(signal.confidenceScore).toBeGreaterThanOrEqual(75);
    // V3 stop loss must be noise tolerant (at least 2.0% away or 2.5 ATR)
    expect(signal.currentPrice - signal.stopLoss).toBeGreaterThanOrEqual(mockBullishIndicators.currentPrice * 0.02);
    // Open-ended milestone targets
    expect(signal.takeProfitTargets[0].rewardRisk).toBe(3.0);
    expect(signal.takeProfitTargets[2].rewardRisk).toBe(10.0);
  });

  it("strictly forbids SHORT in 4H bull regime (stance: WAIT)", () => {
    // Even if LTF looks bearish, if 4H is BULLISH, short is forbidden
    const bearishLtfIndicators: TechnicalIndicators = {
      ...mockBullishIndicators,
      ema20: 63500,
      ema50: 64000, // LTF bearish
    };

    const signal = generateTradingSignal(
      "BTCUSDT",
      bearishLtfIndicators,
      mockBullishStructure, // 4H is still BULLISH
      mockContext,
      { strategyVersion: "V3" }
    );

    expect(signal.stance).toBe("WAIT");
    expect(signal.type).toBe("NONE");
  });

  it("suppresses signals in CHOP regime (ADX < 20)", () => {
    const chopIndicators: TechnicalIndicators = {
      ...mockBullishIndicators,
      adx14: 16.5, // low ADX indicates chop
    };

    const signal = generateTradingSignal(
      "BTCUSDT",
      chopIndicators,
      mockBullishStructure,
      mockContext,
      { strategyVersion: "V3" }
    );

    expect(signal.stance).toBe("WAIT");
    expect(signal.invalidationConditions.some((c) => c.includes("4H Regime Gate"))).toBe(true);
  });
});
