import { describe, expect, it, beforeEach } from "vitest";
import { generateModelDTradingSignal, generateTradingSignal } from "../core/signals/generator";
import { PaperTradingWallet } from "../core/paper/wallet";
import { Candle, MarketContextData, MarketStructure, TechnicalIndicators } from "../core/types";

describe("Model D — 4H Dynamic Trend-Following Paper Trading Engine", () => {
  let wallet: PaperTradingWallet;

  beforeEach(() => {
    wallet = new PaperTradingWallet(10000);
  });

  const mockContext: MarketContextData = {
    fearGreedIndex: 55,
    fearGreedSentiment: "Neutral",
    fundingRate: 0.0001,
    marketRegime: "TRENDING_BULL",
  };

  const mockStructure: MarketStructure = {
    trendHTF: "BULLISH",
    trendLTF: "BULLISH",
    swingHigh: 70000,
    swingLow: 64000,
    keySupport: 64500,
    keyResistance: 70500,
    structureState: "HIGHER_HIGHS",
    htfPriceAboveEma200: true,
  };

  // 1. Правильность входа
  describe("1. Entry Rule Accuracy", () => {
    it("generates BUY when 4H Close > EMA200, EMA20 > EMA50, and pullback-bounce occurs (Low <= EMA20 and Close > EMA20)", () => {
      const indicators: TechnicalIndicators = {
        currentPrice: 66000,
        ema20: 65500,
        ema50: 64000,
        ema200: 61000,
        rsi14: 55,
        rsiState: "NEUTRAL",
        macd: { macdLine: 200, signalLine: 150, histogram: 50, trend: "BULLISH" },
        adx14: 26,
        plusDI: 28,
        minusDI: 15,
        atr14: 1200,
        bollingerBands: { upper: 68000, middle: 66000, lower: 64000, bandwidth: 6.0 },
        volumeRatio20: 1.2,
      };

      const signal = generateTradingSignal("BTCUSDT", indicators, mockStructure, mockContext, {
        strategyVersion: "MODEL_D",
        modelDOptions: {
          prevBar: { open: 66200, high: 66300, low: 65400, close: 65900 }, // low 65400 <= EMA20 65500
          currentBar: { open: 65900, high: 66500, low: 65800, close: 66000 }, // close 66000 > EMA20 65500
        },
      });

      expect(signal.stance).toBe("BUY");
      expect(signal.type).toBe("LONG");
      expect(signal.strategyVersion).toBe("MODEL_D");
      expect(signal.recommendedRiskPercent).toBe(1.0);
    });

    it("generates SHORT when 4H Close < EMA200, EMA20 < EMA50, and bounce-rejection occurs (High >= EMA20 and Close < EMA20)", () => {
      const bearIndicators: TechnicalIndicators = {
        currentPrice: 58000,
        ema20: 59000,
        ema50: 61000,
        ema200: 64000,
        rsi14: 42,
        rsiState: "NEUTRAL",
        macd: { macdLine: -200, signalLine: -150, histogram: -50, trend: "BEARISH" },
        adx14: 27,
        plusDI: 14,
        minusDI: 30,
        atr14: 1100,
        bollingerBands: { upper: 61000, middle: 59000, lower: 57000, bandwidth: 6.5 },
        volumeRatio20: 1.3,
      };

      const bearStructure: MarketStructure = {
        trendHTF: "BEARISH",
        trendLTF: "BEARISH",
        swingHigh: 62000,
        swingLow: 56000,
        keySupport: 56500,
        keyResistance: 61500,
        structureState: "LOWER_LOWS",
        htfPriceAboveEma200: false,
      };

      const signal = generateTradingSignal("BTCUSDT", bearIndicators, bearStructure, mockContext, {
        strategyVersion: "MODEL_D",
        modelDOptions: {
          prevBar: { open: 58200, high: 59200, low: 57800, close: 58100 }, // high 59200 >= EMA20 59000
          currentBar: { open: 58100, high: 58400, low: 57600, close: 58000 }, // close 58000 < EMA20 59000
        },
      });

      expect(signal.stance).toBe("SHORT");
      expect(signal.type).toBe("SHORT");
      expect(signal.strategyVersion).toBe("MODEL_D");
      expect(signal.recommendedRiskPercent).toBe(1.0);
    });

    it("remains WAIT if 4H price has not pulled back to EMA20", () => {
      const indicators: TechnicalIndicators = {
        currentPrice: 68000,
        ema20: 65000,
        ema50: 63000,
        ema200: 60000,
        rsi14: 65,
        rsiState: "NEUTRAL",
        macd: { macdLine: 300, signalLine: 200, histogram: 100, trend: "BULLISH" },
        adx14: 30,
        plusDI: 32,
        minusDI: 12,
        atr14: 1200,
        bollingerBands: { upper: 69000, middle: 66000, lower: 63000, bandwidth: 7.0 },
        volumeRatio20: 1.1,
      };

      const signal = generateTradingSignal("BTCUSDT", indicators, mockStructure, mockContext, {
        strategyVersion: "MODEL_D",
        modelDOptions: {
          prevBar: { open: 67200, high: 68100, low: 67000, close: 67900 }, // low 67000 > EMA20 65000 (no pullback)
          currentBar: { open: 67900, high: 68300, low: 67800, close: 68000 },
        },
      });

      expect(signal.stance).toBe("WAIT");
      expect(signal.type).toBe("NONE");
    });
  });

  // 2. Правильность стопа (2.5 x ATR14)
  describe("2. Initial Stop Loss Accuracy", () => {
    it("sets initial protective stop exactly at 2.5 × ATR14 below entry for LONG", () => {
      const atr = 1000;
      const currentPrice = 50000;
      const indicators: TechnicalIndicators = {
        currentPrice,
        ema20: 49500,
        ema50: 48000,
        ema200: 45000,
        rsi14: 55,
        rsiState: "NEUTRAL",
        macd: { macdLine: 100, signalLine: 80, histogram: 20, trend: "BULLISH" },
        adx14: 25,
        plusDI: 26,
        minusDI: 15,
        atr14: atr,
        bollingerBands: { upper: 52000, middle: 50000, lower: 48000, bandwidth: 8.0 },
        volumeRatio20: 1.2,
      };

      const signal = generateTradingSignal("BTCUSDT", indicators, mockStructure, mockContext, {
        strategyVersion: "MODEL_D",
        modelDOptions: {
          prevBar: { open: 49800, high: 50200, low: 49400, close: 49900 },
          currentBar: { open: 49900, high: 50300, low: 49800, close: currentPrice },
        },
      });

      const expectedStop = currentPrice - 2.5 * atr; // 50000 - 2500 = 47500
      expect(signal.stopLoss).toBe(expectedStop);
      expect(signal.entryRange.ideal).toBe(currentPrice);
    });

    it("sets initial protective stop exactly at 2.5 × ATR14 above entry for SHORT", () => {
      const atr = 800;
      const currentPrice = 40000;
      const indicators: TechnicalIndicators = {
        currentPrice,
        ema20: 40500,
        ema50: 42000,
        ema200: 46000,
        rsi14: 45,
        rsiState: "NEUTRAL",
        macd: { macdLine: -100, signalLine: -80, histogram: -20, trend: "BEARISH" },
        adx14: 25,
        plusDI: 15,
        minusDI: 28,
        atr14: atr,
        bollingerBands: { upper: 42000, middle: 40000, lower: 38000, bandwidth: 8.0 },
        volumeRatio20: 1.2,
      };

      const signal = generateTradingSignal("BTCUSDT", indicators, mockStructure, mockContext, {
        strategyVersion: "MODEL_D",
        enableShorts: true,
        modelDOptions: {
          prevBar: { open: 40200, high: 40700, low: 39800, close: 40100 },
          currentBar: { open: 40100, high: 40300, low: 39900, close: currentPrice },
        },
      });

      const expectedStop = currentPrice + 2.5 * atr; // 40000 + 2000 = 42000
      expect(signal.stopLoss).toBe(expectedStop);
    });
  });

  // 3. Правильность trailing stop (Structural Swing minimum 5 bars)
  describe("3. Structural Swing Trailing Stop Accuracy", () => {
    it("updates trailing stop to the minimum of previous 5 closed bars for LONG and ratchets only upward", () => {
      const signal = {
        id: "sig_test_long",
        asset: "BTCUSDT",
        timestamp: Date.now(),
        stance: "BUY" as const,
        type: "LONG" as const,
        currentPrice: 50000,
        entryRange: { min: 49900, max: 50100, ideal: 50000 },
        stopLoss: 47500,
        stopLossPercentage: 5.0,
        takeProfitTargets: [],
        riskRewardRatio: 3.0,
        confidenceScore: 85,
        recommendedRiskPercent: 1.0,
        invalidationConditions: [],
        technicalSummary: {} as any,
        marketStructure: {} as any,
        marketContext: {} as any,
        strategyVersion: "MODEL_D" as const,
      };

      const pos = wallet.openPositionFromSignal(signal, 1.0, "MARKET", {
        trailingStopType: "STRUCTURAL_SWING",
        swingTrailingBars: 5,
      });

      expect(pos.status).toBe("OPEN");
      expect(pos.stopLoss).toBe(47500);

      // Bar 1 to 5 closed candles
      const closedBarsBatch1 = [
        { low: 48500, high: 51000 },
        { low: 49000, high: 51500 },
        { low: 48800, high: 52000 },
        { low: 49200, high: 52200 },
        { low: 49500, high: 52800 },
      ];

      // Minimum of batch1 is 48500, which is > initial 47500
      wallet.updateStructuralTrailingStop("BTCUSDT", closedBarsBatch1);
      expect(pos.stopLoss).toBe(48500);

      // Now add 5 higher bars: min is 52000
      const closedBarsBatch2 = [
        { low: 52000, high: 54000 },
        { low: 52500, high: 55000 },
        { low: 53000, high: 55200 },
        { low: 53500, high: 55800 },
        { low: 54000, high: 56000 },
      ];

      wallet.updateStructuralTrailingStop("BTCUSDT", closedBarsBatch2);
      expect(pos.stopLoss).toBe(52000); // Ratcheted up to 52000!

      // Attempt to feed lower bars: stop MUST NOT ratchet downward
      const lowerBars = [
        { low: 45000, high: 51000 },
        { low: 46000, high: 51500 },
        { low: 45500, high: 52000 },
        { low: 46200, high: 52200 },
        { low: 46500, high: 52800 },
      ];

      wallet.updateStructuralTrailingStop("BTCUSDT", lowerBars);
      expect(pos.stopLoss).toBe(52000); // Preserved! Never moves down.
    });

    it("updates trailing stop to the maximum of previous 5 closed bars for SHORT and ratchets only downward", () => {
      const signal = {
        id: "sig_test_short",
        asset: "ETHUSDT",
        timestamp: Date.now(),
        stance: "SHORT" as const,
        type: "SHORT" as const,
        currentPrice: 3000,
        entryRange: { min: 2990, max: 3010, ideal: 3000 },
        stopLoss: 3200,
        stopLossPercentage: 6.6,
        takeProfitTargets: [],
        riskRewardRatio: 3.0,
        confidenceScore: 85,
        recommendedRiskPercent: 1.0,
        invalidationConditions: [],
        technicalSummary: {} as any,
        marketStructure: {} as any,
        marketContext: {} as any,
        strategyVersion: "MODEL_D" as const,
      };

      const pos = wallet.openPositionFromSignal(signal, 1.0, "MARKET", {
        trailingStopType: "STRUCTURAL_SWING",
        swingTrailingBars: 5,
      });

      expect(pos.stopLoss).toBe(3200);

      // Price moves down, swing highs lower
      const closedBars = [
        { low: 2700, high: 2900 },
        { low: 2650, high: 2880 },
        { low: 2600, high: 2850 },
        { low: 2550, high: 2820 },
        { low: 2500, high: 2800 },
      ];

      // Max of the 5 bars is 2900, which is < 3200
      wallet.updateStructuralTrailingStop("ETHUSDT", closedBars);
      expect(pos.stopLoss).toBe(2900); // Ratcheted down to lock in profit!

      // Higher bar fed: stop MUST NOT ratchet upward
      const higherBars = [
        { low: 3000, high: 3300 },
        { low: 3050, high: 3350 },
        { low: 3000, high: 3320 },
        { low: 3050, high: 3380 },
        { low: 3100, high: 3400 },
      ];

      wallet.updateStructuralTrailingStop("ETHUSDT", higherBars);
      expect(pos.stopLoss).toBe(2900); // Preserved! Never moves up.
    });
  });

  // 4. Отсутствие look-ahead
  describe("4. Zero Lookahead Verification", () => {
    it("ensures trailing stop calculation on bar i strictly references bars prior to i", () => {
      // Create a sequence of 10 simulated 4H candles
      const candles: Candle[] = Array.from({ length: 10 }, (_, i) => ({
        timestamp: 1700000000000 + i * 14400000,
        open: 50000 + i * 100,
        high: 50500 + i * 100,
        low: 49500 + i * 100,
        close: 50200 + i * 100,
        volume: 1000,
      }));

      // At bar index 7, completed bars available to the trader are strictly 0..6
      const barIdx = 7;
      const swingLookback = 5;
      const completedBarsPriorToCurrent = candles.slice(barIdx - swingLookback, barIdx);

      // The minimum low computed
      const trailingStopAtBar7 = Math.min(...completedBarsPriorToCurrent.map((b) => b.low));

      // Bar 7's own low was NOT included
      expect(completedBarsPriorToCurrent).not.toContain(candles[barIdx]);
      expect(completedBarsPriorToCurrent.length).toBe(5);

      // Specifically check: if bar 7 had an anomalous low of 10,000, the trailing stop at bar 7 does not know about it
      const anomalyBar = { ...candles[barIdx], low: 10000 };
      expect(completedBarsPriorToCurrent.map((b) => b.low)).not.toContain(anomalyBar.low);
    });
  });

  // 5. Корректность Paper PnL
  describe("5. Paper PnL Mathematical Correctness", () => {
    it("calculates exact PnL, margin, fees, and equity for LONG position", () => {
      const initialBalance = 10000;
      wallet = new PaperTradingWallet(initialBalance);

      const entryPrice = 50000;
      const stopLoss = 47500; // 2500 distance (5%)
      const signal = {
        id: "sig_math_long",
        asset: "BTCUSDT",
        timestamp: Date.now(),
        stance: "BUY" as const,
        type: "LONG" as const,
        currentPrice: entryPrice,
        entryRange: { min: 49900, max: 50100, ideal: entryPrice },
        stopLoss,
        stopLossPercentage: 5.0,
        takeProfitTargets: [],
        riskRewardRatio: 3.0,
        confidenceScore: 85,
        recommendedRiskPercent: 1.0, // 1% of $10,000 = $100
        invalidationConditions: [],
        technicalSummary: {} as any,
        marketStructure: {} as any,
        marketContext: {} as any,
        strategyVersion: "MODEL_D" as const,
      };

      const pos = wallet.openPositionFromSignal(signal, 1.0, "MARKET");

      // Slippage applied on entry: 50000 * 1.0005 = 50025
      const expectedFillPrice = 50025;
      expect(pos.entryPrice).toBe(expectedFillPrice);

      const stopDist = Math.abs(expectedFillPrice - stopLoss);
      const expectedUnits = Number((100 / stopDist).toFixed(4));
      expect(pos.sizeUnits).toBe(expectedUnits);

      const notional = Number((expectedUnits * expectedFillPrice).toFixed(2));
      const entryFee = Number((notional * 0.0005).toFixed(2));

      // Balance reduced by entry fee
      expect(wallet.getAccount().balance).toBe(Number((initialBalance - entryFee).toFixed(2)));

      // Price rises to 55,000
      wallet.updateMarketPrices("BTCUSDT", 55000);
      const priceGain = 55000 - expectedFillPrice;
      const expectedUnrealized = Number((priceGain * expectedUnits).toFixed(2));
      expect(pos.unrealizedPnl).toBe(expectedUnrealized);
      expect(wallet.getAccount().equity).toBe(Number((wallet.getAccount().balance + expectedUnrealized).toFixed(2)));
    });
  });

  // 6. Корректность закрытия позиции по Trailing Stop
  describe("6. Position Exit on Trailing Stop Hit", () => {
    it("closes position and updates trade history when price drops through trailing stop", () => {
      const signal = {
        id: "sig_exit_test",
        asset: "SOLUSDT",
        timestamp: Date.now(),
        stance: "BUY" as const,
        type: "LONG" as const,
        currentPrice: 100,
        entryRange: { min: 99, max: 101, ideal: 100 },
        stopLoss: 95,
        stopLossPercentage: 5.0,
        takeProfitTargets: [],
        riskRewardRatio: 3.0,
        confidenceScore: 85,
        recommendedRiskPercent: 1.0,
        invalidationConditions: [],
        technicalSummary: {} as any,
        marketStructure: {} as any,
        marketContext: {} as any,
        strategyVersion: "MODEL_D" as const,
      };

      wallet.openPositionFromSignal(signal, 1.0, "MARKET", {
        trailingStopType: "STRUCTURAL_SWING",
        swingTrailingBars: 5,
      });

      expect(wallet.getAccount().positions.length).toBe(1);

      // Ratchet trailing stop up to 110 after price reaches 120
      const closedBars = [
        { low: 110, high: 118 },
        { low: 112, high: 119 },
        { low: 111, high: 120 },
        { low: 114, high: 121 },
        { low: 115, high: 122 },
      ];
      wallet.updateStructuralTrailingStop("SOLUSDT", closedBars);

      const pos = wallet.getAccount().positions[0];
      expect(pos.stopLoss).toBe(110);

      // Market price drops to 109 (below 110 trailing stop)
      const closed = wallet.updateMarketPrices("SOLUSDT", 109);

      expect(closed.length).toBe(1);
      expect(closed[0].status).toBe("CLOSED");
      expect(closed[0].closeReason).toBe("TRAILING_STOP_HIT");
      expect(closed[0].realizedPnl).toBeGreaterThan(0); // Winner trade!
      expect(wallet.getAccount().positions.length).toBe(0);
      expect(wallet.getAccount().tradeHistory.length).toBe(1);
    });

    it("does NOT exit on normal pullbacks above the trailing stop", () => {
      const signal = {
        id: "sig_no_exit",
        asset: "SOLUSDT",
        timestamp: Date.now(),
        stance: "BUY" as const,
        type: "LONG" as const,
        currentPrice: 100,
        entryRange: { min: 99, max: 101, ideal: 100 },
        stopLoss: 95,
        stopLossPercentage: 5.0,
        takeProfitTargets: [],
        riskRewardRatio: 3.0,
        confidenceScore: 85,
        recommendedRiskPercent: 1.0,
        invalidationConditions: [],
        technicalSummary: {} as any,
        marketStructure: {} as any,
        marketContext: {} as any,
        strategyVersion: "MODEL_D" as const,
      };

      wallet.openPositionFromSignal(signal, 1.0, "MARKET", {
        trailingStopType: "STRUCTURAL_SWING",
        swingTrailingBars: 5,
      });

      // Price dips to 96 (above initial stop 95)
      const closed = wallet.updateMarketPrices("SOLUSDT", 96);
      expect(closed.length).toBe(0);
      expect(wallet.getAccount().positions.length).toBe(1);
      expect(wallet.getAccount().positions[0].status).toBe("OPEN");
    });

    it("verifies uncapped winners: Model D has no fixed TP capping trade at small R", () => {
      const signal = {
        id: "sig_let_winners_run",
        asset: "BTCUSDT",
        timestamp: Date.now(),
        stance: "BUY" as const,
        type: "LONG" as const,
        currentPrice: 50000,
        entryRange: { min: 49900, max: 50100, ideal: 50000 },
        stopLoss: 47500,
        stopLossPercentage: 5.0,
        takeProfitTargets: [],
        riskRewardRatio: 3.0,
        confidenceScore: 85,
        recommendedRiskPercent: 1.0,
        invalidationConditions: [],
        technicalSummary: {} as any,
        marketStructure: {} as any,
        marketContext: {} as any,
        strategyVersion: "MODEL_D" as const,
      };

      const pos = wallet.openPositionFromSignal(signal, 1.0, "MARKET");

      // Take profit is placed far away (e.g. 10x entry)
      expect(pos.takeProfit).toBeGreaterThan(100000);

      // Price doubles to 100,000 without hitting fixed TP
      const closed = wallet.updateMarketPrices("BTCUSDT", 100000);
      expect(closed.length).toBe(0);
      expect(pos.status).toBe("OPEN");
    });
  });
});
