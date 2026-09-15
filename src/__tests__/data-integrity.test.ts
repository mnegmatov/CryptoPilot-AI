import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchFearAndGreedIndex } from "../core/data/sentiment";
import { fetchBinanceFundingRate } from "../core/data/binance";
import { getMarketContext } from "../core/data/market-feed";
import { generateDeterministicAnalysis } from "../core/ai/analyst";
import { generateTradingSignal } from "../core/signals/generator";
import { MarketContextData, MarketStructure, TechnicalIndicators, TradingSignal } from "../core/types";

describe("Phase 0: Data Integrity Cleanup", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("1 & 2. Fear & Greed Failure Handling", () => {
    it("returns explicit null values instead of fake 50 / Neutral when upstream fails with HTTP 500", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      } as any);

      const result = await fetchFearAndGreedIndex();
      expect(result.score).toBeNull();
      expect(result.sentiment).toBeNull();
      expect(result.score).not.toBe(50);
      expect(result.sentiment).not.toBe("Neutral");
    });

    it("returns explicit null values when network request throws", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Connection reset"));

      const result = await fetchFearAndGreedIndex();
      expect(result.score).toBeNull();
      expect(result.sentiment).toBeNull();
    });

    it("returns authentic score and classification when upstream succeeds", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ value: "78", value_classification: "Extreme Greed", timestamp: "1710000000" }],
        }),
      } as any);

      const result = await fetchFearAndGreedIndex();
      expect(result.score).toBe(78);
      expect(result.sentiment).toBe("Extreme Greed");
    });
  });

  describe("3. Funding Rate Failure Handling", () => {
    it("returns null instead of fabricated 0.0001 when Binance Futures endpoint fails", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      } as any);

      const result = await fetchBinanceFundingRate("BTCUSDT");
      expect(result).toBeNull();
      expect(result).not.toBe(0.0001);
    });

    it("returns null when network throws or times out", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Timeout after 8000ms"));

      const result = await fetchBinanceFundingRate("BTCUSDT");
      expect(result).toBeNull();
    });

    it("returns real funding rate when Binance Futures responds", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ fundingRate: "0.00025000" }],
      } as any);

      const result = await fetchBinanceFundingRate("BTCUSDT");
      expect(result).toBe(0.00025);
    });
  });

  describe("1 & 4. Macro Context Integrity (No Hardcoded BTC Dominance)", () => {
    it("does NOT include hardcoded btcDominance: 57.8 in market context", async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("alternative.me")) {
          return Promise.resolve({
            ok: false,
          } as any);
        }
        return Promise.resolve({
          ok: false,
        } as any);
      });

      const context = await getMarketContext("BTCUSDT");
      expect(context.btcDominance).toBeUndefined();
      expect(context.fundingRate).toBeNull();
      expect(context.fearGreedIndex).toBeNull();
      expect(context.fearGreedSentiment).toBeNull();
      expect(context.marketRegime).toBe("CHOPPY_RANGE");
    });
  });

  describe("5. AI Analyst Grounding on Null Macro Data", () => {
    const mockStructure: MarketStructure = {
      trendHTF: "BULLISH",
      trendLTF: "BULLISH",
      keySupport: 65000,
      keyResistance: 70000,
      swingHigh: 69000,
      swingLow: 64000,
    };

    const mockIndicators: TechnicalIndicators = {
      currentPrice: 66000,
      rsi14: 55,
      rsiState: "NORMAL",
      ema20: 65500,
      ema50: 64500,
      ema200: 62000,
      adx14: 28,
      plusDI: 26,
      minusDI: 14,
      atr14: 1200,
      bollingerBands: { upper: 68000, middle: 66000, lower: 64000, bandwidth: 6.0 },
      volumeRatio20: 1.5,
    };

    it("explicitly notes unavailable status in summary instead of fabricated numbers", () => {
      const signal: TradingSignal = {
        id: "sig_btc_test",
        asset: "BTCUSDT",
        timestamp: Date.now(),
        stance: "BUY",
        type: "LONG",
        currentPrice: 66000,
        entryRange: { min: 65800, max: 66200, ideal: 66000 },
        stopLoss: 64000,
        stopLossPercentage: 3.03,
        takeProfitTargets: [
          { level: 1, price: 68000, percentage: 3.03, rewardRisk: 1.0, description: "TP1" },
          { level: 2, price: 70000, percentage: 6.06, rewardRisk: 2.0, description: "TP2" },
        ],
        riskRewardRatio: 2.0,
        confidenceScore: 82,
        invalidationConditions: ["Break below 64000"],
        technicalSummary: mockIndicators,
        marketStructure: mockStructure,
        marketContext: {
          fearGreedIndex: null,
          fearGreedSentiment: null,
          fundingRate: null,
          marketRegime: "CHOPPY_RANGE",
        },
      };

      const analysis = generateDeterministicAnalysis(signal);
      expect(analysis.marketContextSummary).toContain("Ставка финансирования фьючерсов: данные недоступны");
      expect(analysis.marketContextSummary).toContain("индекс страха и жадности: данные недоступны");
      expect(analysis.marketContextSummary).not.toContain("0.0100%");
      expect(analysis.marketContextSummary).not.toContain("50/100");
    });

    it("describes Model D execution as trailing exit with milestones instead of fixed TP", () => {
      const modelDSignal: TradingSignal = {
        id: "sig_model_d_BTCUSDT_1710000000",
        asset: "BTCUSDT",
        timestamp: Date.now(),
        stance: "BUY",
        type: "LONG",
        currentPrice: 66000,
        entryRange: { min: 65800, max: 66200, ideal: 66000 },
        stopLoss: 63000,
        stopLossPercentage: 4.5,
        takeProfitTargets: [
          {
            level: 1,
            price: 75000,
            percentage: 13.6,
            rewardRisk: 3.0,
            description: "Ориентир +3.0R",
            type: "STRUCTURAL",
            targetReason: "Информационный рубеж: выход строго по Structural Swing Trailing",
          },
          {
            level: 2,
            price: 84000,
            percentage: 27.2,
            rewardRisk: 6.0,
            description: "Ориентир +6.0R",
            type: "R_MULTIPLE",
            targetReason: "Трендовое расширение: позиция удерживается до слома минимума 5 свечей",
          },
        ],
        riskRewardRatio: 3.0,
        confidenceScore: 88,
        invalidationConditions: ["Срабатывание стоп-лосса $63,000"],
        technicalSummary: mockIndicators,
        marketStructure: mockStructure,
        marketContext: {
          fearGreedIndex: null,
          fearGreedSentiment: null,
          fundingRate: null,
          marketRegime: "TRENDING_BULL",
        },
      };

      const analysis = generateDeterministicAnalysis(modelDSignal);
      expect(analysis.executionPlan).toContain("без фиксированных тейк-профитов");
      expect(analysis.executionPlan).toContain("сопровождение по свинговому минимуму 5 свечей");
      expect(analysis.executionPlan).toContain("Milestones +3R/+6R");
    });
  });

  describe("Quantitative Confluence with Null Funding Rate", () => {
    const mockStructure: MarketStructure = {
      trendHTF: "BULLISH",
      trendLTF: "BULLISH",
      keySupport: 65000,
      keyResistance: 70000,
      swingHigh: 69000,
      swingLow: 64000,
    };

    const mockIndicators: TechnicalIndicators = {
      currentPrice: 66000,
      rsi14: 55,
      rsiState: "NORMAL",
      ema20: 65500,
      ema50: 64500,
      ema200: 62000,
      adx14: 28,
      plusDI: 26,
      minusDI: 14,
      atr14: 1200,
      bollingerBands: { upper: 68000, middle: 66000, lower: 64000, bandwidth: 6.0 },
      volumeRatio20: 1.5,
    };

    it("generates valid signals safely when fundingRate and fearGreed are null", () => {
      const nullContext: MarketContextData = {
        fearGreedIndex: null,
        fearGreedSentiment: null,
        fundingRate: null,
        marketRegime: "CHOPPY_RANGE",
      };

      const signal = generateTradingSignal("BTCUSDT", mockIndicators, mockStructure, nullContext);
      expect(signal).toBeDefined();
      expect(signal.confidenceScore).toBeGreaterThan(0);
      expect(signal.marketContext.fundingRate).toBeNull();
      expect(signal.marketContext.fearGreedIndex).toBeNull();
    });
  });
});
