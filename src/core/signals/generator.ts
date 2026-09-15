import {
  Candle,
  MarketContextData,
  MarketStance,
  MarketStructure,
  TakeProfitTarget,
  TechnicalIndicators,
  TradingSignal,
} from "../types";
import { extractTechnicalIndicators } from "../quant/indicators";
import { analyzeMarketStructure } from "../quant/structure";

export interface SignalGeneratorOptions {
  strategyVersion?: "V1" | "V2" | "V3" | "MODEL_D"; // default: "V2"
  adxThreshold?: number; // default: 25 for V2, 20 for V1/V3
  enableShorts?: boolean; // default: true
  enableAdxFilter?: boolean; // default: true
  enableLiquidityConfirmation?: boolean; // default: true
  enableHtfGate?: boolean; // default: true for V2/V3, false for V1
  htfGate?: {
    priceAboveEma200?: boolean;
    trendHTF?: "BULLISH" | "BEARISH" | "RANGING";
    ema200?: number;
    currentHtfPrice?: number;
  };
  regimeRiskThreshold?: number; // default: 25
  normalRiskPercent?: number; // default: 1.5%
  lowAdxRiskPercent?: number; // default: 0.75%
  modelDOptions?: {
    prevBar?: { open: number; high: number; low: number; close: number };
    currentBar?: { open: number; high: number; low: number; close: number };
    recent5ClosedCandles?: Array<{ low: number; high: number }>;
  };
}

export const DEFAULT_SIGNAL_OPTIONS: SignalGeneratorOptions = {
  strategyVersion: "V2",
  adxThreshold: 25,
  enableShorts: true,
  enableAdxFilter: true,
  enableLiquidityConfirmation: true,
  enableHtfGate: true,
  regimeRiskThreshold: 25,
  normalRiskPercent: 1.5,
  lowAdxRiskPercent: 0.75,
};

export function generateTradingSignal(
  asset: string,
  indicators: TechnicalIndicators,
  structure: MarketStructure,
  context: MarketContextData,
  options: SignalGeneratorOptions = DEFAULT_SIGNAL_OPTIONS
): TradingSignal {
  if (options.strategyVersion === "MODEL_D") {
    return generateModelDTradingSignal(asset, indicators, structure, context, options);
  }
  if (options.strategyVersion === "V1") {
    return generateV1TradingSignal(asset, indicators, structure, context, options);
  }
  if (options.strategyVersion === "V3") {
    return generateV3TradingSignal(asset, indicators, structure, context, options);
  }
  return generateV2TradingSignal(asset, indicators, structure, context, options);
}

/**
 * Strategy V2: Regime-First State Machine with asymmetric directional gates,
 * structural pullbacks, and two-phase target structures.
 */
function generateV2TradingSignal(
  asset: string,
  indicators: TechnicalIndicators,
  structure: MarketStructure,
  context: MarketContextData,
  options: SignalGeneratorOptions
): TradingSignal {
  const currentPrice = indicators.currentPrice;
  const atr = indicators.atr14;
  const adxThreshold = options.adxThreshold ?? 25;
  const invalidationConditions: string[] = [];

  // 1. Higher-Timeframe Macro Gate (4H EMA200 & Trend Alignment)
  // Zero lookahead: Uses strictly completed 4H bars
  const htfPriceAboveEma200 = options.htfGate?.priceAboveEma200 ?? structure.htfPriceAboveEma200 ?? (currentPrice > indicators.ema200);
  const htfTrend = options.htfGate?.trendHTF ?? structure.trendHTF;

  const isHtfBullish = htfPriceAboveEma200 === true && htfTrend === "BULLISH";
  const isHtfBearish = htfPriceAboveEma200 === false && htfTrend === "BEARISH";

  // 2. Trend Strength & Volatility Gate (ADX & Bollinger Bandwidth)
  const isTrending = indicators.adx14 >= adxThreshold;
  const hasAdequateVolatility = indicators.bollingerBands.bandwidth >= 1.4;

  let stance: MarketStance = "WAIT";
  let setupType: "LONG" | "SHORT" | "NONE" = "NONE";
  let confidenceScore = 30;

  if (!isTrending) {
    invalidationConditions.push(`Рынок в боковике / слабом тренде: ADX(14) ${indicators.adx14} < ${adxThreshold}`);
  }
  if (!hasAdequateVolatility) {
    invalidationConditions.push(`Сжатие диапазона: полосы Боллинджера сужены (${indicators.bollingerBands.bandwidth.toFixed(2)}%)`);
  }

  // Directional evaluation
  if (options.enableHtfGate && !isHtfBullish && !isHtfBearish) {
    stance = "WAIT";
    confidenceScore = 35;
    invalidationConditions.push(`4H Trend Gate: Старший таймфрейм (4H) в несовместимом режиме (Тренд: ${htfTrend}, Цена ${htfPriceAboveEma200 ? ">" : "<"} EMA200)`);
  } else if (isHtfBullish && isTrending && hasAdequateVolatility) {
    // --- LONG EVALUATION (Pullback to EMA20 or Breakout Continuation) ---
    const isEmaBullish = indicators.ema20 > indicators.ema50 && currentPrice > indicators.ema50;
    const isRsiValid = indicators.rsi14 >= 42 && indicators.rsi14 <= 72;
    const isNotOverbought = indicators.rsiState !== "OVERBOUGHT";

    // Setup A: Pullback to EMA20 / key support
    const nearEma20 = Math.abs(currentPrice - indicators.ema20) <= atr * 1.2;
    const pullbackTest = nearEma20 && currentPrice >= indicators.ema50 * 0.98;

    // Setup B: Breakout above key resistance or continuation
    const breakoutTest = (currentPrice >= structure.keyResistance * 0.998 || structure.structureState === "HIGHER_HIGHS") && (indicators.volumeRatio20 >= 1.15 || indicators.macd.trend === "BULLISH");

    if (isEmaBullish && isRsiValid && isNotOverbought && (pullbackTest || breakoutTest)) {
      stance = "BUY";
      setupType = "LONG";
      confidenceScore = pullbackTest ? 85 : 80;
    } else {
      stance = "WAIT";
      confidenceScore = 45;
      if (!isEmaBullish) invalidationConditions.push("1H EMA20/50 не подтверждают восходящий импульс");
      if (!isRsiValid || !isNotOverbought) invalidationConditions.push("RSI указывает на перекупленность или истощение");
    }
  } else if (options.enableShorts && isHtfBearish && isTrending && hasAdequateVolatility) {
    // --- SHORT EVALUATION (Breakdown Continuation or Retest) ---
    const isEmaBearish = indicators.ema20 < indicators.ema50 && currentPrice < indicators.ema50;
    const isRsiValid = indicators.rsi14 <= 58 && indicators.rsi14 >= 28;
    const isNotOversold = indicators.rsiState !== "OVERSOLD";

    // Setup A: Breakdown below support or structural lower lows
    const breakdownTest = (currentPrice <= structure.keySupport * 1.002 || structure.structureState === "LOWER_LOWS") && (indicators.volumeRatio20 >= 1.15 || indicators.macd.trend === "BEARISH");

    // Setup B: Retest/Pullback to EMA20 from below
    const nearEma20Bear = Math.abs(currentPrice - indicators.ema20) <= atr * 1.5;
    const retestTest = nearEma20Bear && currentPrice <= indicators.ema20 * 1.01;

    if (isEmaBearish && isRsiValid && isNotOversold && (breakdownTest || retestTest)) {
      stance = "SHORT";
      setupType = "SHORT";
      confidenceScore = breakdownTest ? 85 : 78;
    } else {
      stance = "WAIT";
      confidenceScore = 45;
      if (!isEmaBearish) invalidationConditions.push("1H EMA20/50 не подтверждают нисходящий импульс");
      if (!isRsiValid || !isNotOversold) invalidationConditions.push("RSI указывает на перепроданность вблизи дна");
    }
  } else {
    stance = "WAIT";
    confidenceScore = 30;
  }

  // 3. Dynamic Execution Levels
  let idealEntry = currentPrice;
  let entryMin = currentPrice;
  let entryMax = currentPrice;
  let stopLoss = currentPrice;
  let takeProfitTargets: TakeProfitTarget[] = [];
  let riskRewardRatio = 2.5;
  let stopLossPercentage = 1.5;

  if (setupType === "LONG") {
    idealEntry = currentPrice;
    entryMin = Number((idealEntry - atr * 0.2).toFixed(2));
    entryMax = Number((idealEntry + atr * 0.15).toFixed(2));

    const rawSL = Math.min(structure.swingLow, structure.keySupport, idealEntry - atr * 1.5);
    const minSL = idealEntry * 0.992; // min 0.8% stop distance
    const maxSL = idealEntry * 0.96;  // max 4.0% stop distance
    stopLoss = Number(Math.min(Math.max(rawSL, maxSL), minSL).toFixed(2));

    const riskAmount = idealEntry - stopLoss;
    stopLossPercentage = Number(((riskAmount / idealEntry) * 100).toFixed(2));

    const tp1Price = Number((idealEntry + riskAmount * 2.0).toFixed(2));
    const tp2Price = Number((idealEntry + riskAmount * 3.5).toFixed(2));
    const tp3Price = Number((idealEntry + riskAmount * 5.0).toFixed(2));

    takeProfitTargets = [
      {
        level: 1,
        price: tp1Price,
        percentage: Number((((tp1Price - idealEntry) / idealEntry) * 100).toFixed(2)),
        rewardRisk: 2.0,
        description: "ТП1: Частичная фиксация 50% и перевод в безубыток (+2.0R)",
        type: "STRUCTURAL",
        targetReason: "Первичное снятие риска с фиксацией прибыли",
      },
      {
        level: 2,
        price: tp2Price,
        percentage: Number((((tp2Price - idealEntry) / idealEntry) * 100).toFixed(2)),
        rewardRisk: 3.5,
        description: "ТП2: Расширение трендового импульса (+3.5R)",
        type: "R_MULTIPLE",
        targetReason: "Основная цель импульсного движения",
      },
      {
        level: 3,
        price: tp3Price,
        percentage: Number((((tp3Price - idealEntry) / idealEntry) * 100).toFixed(2)),
        rewardRisk: 5.0,
        description: "ТП3: Макро-раннер для максимизации асимметрии (+5.0R)",
        type: "LIQUIDITY",
        targetReason: "Вытягивание крупного движения старшего таймфрейма",
      },
    ];

    riskRewardRatio = 2.75;
    invalidationConditions.push(`Закрытие 1H свечи ниже стоп-лосса $${stopLoss.toLocaleString()}`);
    invalidationConditions.push(`Пробой 4H EMA200 вниз на растущем объеме продаж`);
  } else if (setupType === "SHORT") {
    idealEntry = currentPrice;
    entryMin = Number((idealEntry - atr * 0.15).toFixed(2));
    entryMax = Number((idealEntry + atr * 0.2).toFixed(2));

    const rawSL = Math.max(structure.swingHigh, structure.keyResistance, idealEntry + atr * 1.5);
    const minSL = idealEntry * 1.008; // min 0.8% stop distance
    const maxSL = idealEntry * 1.04;  // max 4.0% stop distance
    stopLoss = Number(Math.max(Math.min(rawSL, maxSL), minSL).toFixed(2));

    const riskAmount = stopLoss - idealEntry;
    stopLossPercentage = Number(((riskAmount / idealEntry) * 100).toFixed(2));

    const tp1Price = Number((idealEntry - riskAmount * 2.0).toFixed(2));
    const tp2Price = Number((idealEntry - riskAmount * 3.5).toFixed(2));
    const tp3Price = Number((idealEntry - riskAmount * 5.0).toFixed(2));

    takeProfitTargets = [
      {
        level: 1,
        price: tp1Price,
        percentage: Number((((idealEntry - tp1Price) / idealEntry) * 100).toFixed(2)),
        rewardRisk: 2.0,
        description: "ТП1: Частичная фиксация 50% и перевод в безубыток (+2.0R)",
        type: "STRUCTURAL",
        targetReason: "Первичное снятие риска с фиксацией прибыли",
      },
      {
        level: 2,
        price: tp2Price,
        percentage: Number((((idealEntry - tp2Price) / idealEntry) * 100).toFixed(2)),
        rewardRisk: 3.5,
        description: "ТП2: Расширение нисходящего тренда (+3.5R)",
        type: "R_MULTIPLE",
        targetReason: "Основная цель нисходящего импульса",
      },
      {
        level: 3,
        price: tp3Price,
        percentage: Number((((idealEntry - tp3Price) / idealEntry) * 100).toFixed(2)),
        rewardRisk: 5.0,
        description: "ТП3: Макро-раннер по тренду (+5.0R)",
        type: "LIQUIDITY",
        targetReason: "Пробой макро-поддержки на старшем таймфрейме",
      },
    ];

    riskRewardRatio = 2.75;
    invalidationConditions.push(`Закрытие 1H свечи выше стоп-лосса $${stopLoss.toLocaleString()}`);
    invalidationConditions.push(`Импульсный возврат цены выше 4H EMA200`);
  } else {
    idealEntry = currentPrice;
    entryMin = Number((currentPrice - atr * 0.2).toFixed(2));
    entryMax = Number((currentPrice + atr * 0.2).toFixed(2));
    stopLoss = Number((currentPrice * 0.97).toFixed(2));
    stopLossPercentage = 3.0;
    takeProfitTargets = [
      {
        level: 1,
        price: Number((currentPrice * 1.03).toFixed(2)),
        percentage: 3.0,
        rewardRisk: 1.0,
        description: "Граница диапазона",
        type: "STRUCTURAL",
        targetReason: "Ожидание формирования четкого трендового режима",
      },
    ];
  }

  const normalRisk = options.normalRiskPercent ?? 1.5;
  const lowRisk = options.lowAdxRiskPercent ?? 0.75;
  const regimeThreshold = options.regimeRiskThreshold ?? 25;
  const recommendedRiskPercent = indicators.adx14 >= regimeThreshold ? normalRisk : lowRisk;

  return {
    id: `sig_${asset}_${Date.now()}`,
    asset,
    timestamp: Date.now(),
    stance,
    type: setupType,
    currentPrice,
    entryRange: {
      min: entryMin,
      max: entryMax,
      ideal: idealEntry,
    },
    stopLoss,
    stopLossPercentage,
    takeProfitTargets,
    riskRewardRatio: Math.max(riskRewardRatio, 1.0),
    confidenceScore,
    recommendedRiskPercent,
    invalidationConditions,
    technicalSummary: indicators,
    marketStructure: structure,
    marketContext: context,
  };
}

/**
 * Strategy V3: Regime-Aware Trend-Following Architecture
 * Continuous Trend Following; zero fixed TP capping; wide 2.5x ATR noise-tolerant stop;
 * 4H macro gate; Donchian 20 breakout trigger; Let winners run.
 */
function generateV3TradingSignal(
  asset: string,
  indicators: TechnicalIndicators,
  structure: MarketStructure,
  context: MarketContextData,
  options: SignalGeneratorOptions
): TradingSignal {
  const currentPrice = indicators.currentPrice;
  const atr = indicators.atr14;
  const invalidationConditions: string[] = [];

  // 1. Regime Engine (4H Macro State)
  const htfPriceAboveEma200 = options.htfGate?.priceAboveEma200 ?? structure.htfPriceAboveEma200 ?? (currentPrice > indicators.ema200);
  const htfTrend = options.htfGate?.trendHTF ?? structure.trendHTF;

  const isHtfBullish = htfPriceAboveEma200 === true && htfTrend === "BULLISH";
  const isHtfBearish = htfPriceAboveEma200 === false && htfTrend === "BEARISH";
  const isChop = (!isHtfBullish && !isHtfBearish) || indicators.adx14 < 20;

  // 2. Direction Gate
  const longAllowed = isHtfBullish && !isChop;
  // Shorts strictly forbidden on altcoins like SOL during non-aligned regimes
  const shortAllowed = (options.enableShorts ?? true) && isHtfBearish && !isChop && (asset !== "SOLUSDT" || indicators.adx14 >= 25);

  let stance: MarketStance = "WAIT";
  let setupType: "LONG" | "SHORT" | "NONE" = "NONE";
  let confidenceScore = 30;

  if (isChop) {
    invalidationConditions.push(`4H Regime Gate: Рынок в режиме боковика / сжатия (ADX: ${indicators.adx14.toFixed(1)}, 4H Тренд: ${htfTrend})`);
  }

  // 3. Trend Entry Engine (1H Donchian 20 / EMA Alignment)
  if (longAllowed) {
    const isEmaAligned = indicators.ema20 > indicators.ema50;
    const isDonchianBreakout = currentPrice >= structure.swingHigh * 0.998 || currentPrice >= structure.keyResistance * 0.998;

    if (isEmaAligned && isDonchianBreakout) {
      stance = "BUY";
      setupType = "LONG";
      confidenceScore = 85;
    } else {
      stance = "WAIT";
      confidenceScore = 45;
      if (!isEmaAligned) invalidationConditions.push("1H EMA20/50 не выстроены в восходящий тренд");
      if (!isDonchianBreakout) invalidationConditions.push("Цена не пробила 20-периодный максимум диапазона");
    }
  } else if (shortAllowed) {
    const isEmaAlignedBear = indicators.ema20 < indicators.ema50;
    const isDonchianBreakdown = currentPrice <= structure.swingLow * 1.002 || currentPrice <= structure.keySupport * 1.002;

    if (isEmaAlignedBear && isDonchianBreakdown) {
      stance = "SHORT";
      setupType = "SHORT";
      confidenceScore = 80;
    } else {
      stance = "WAIT";
      confidenceScore = 45;
      if (!isEmaAlignedBear) invalidationConditions.push("1H EMA20/50 не выстроены в нисходящий тренд");
      if (!isDonchianBreakdown) invalidationConditions.push("Цена не пробила 20-периодный минимум диапазона");
    }
  }

  // 4. Initial Protective Stop (Wide, Noise-Tolerant: 2.5x ATR or Swing)
  let idealEntry = currentPrice;
  let entryMin = currentPrice;
  let entryMax = currentPrice;
  let stopLoss = currentPrice;
  let takeProfitTargets: TakeProfitTarget[] = [];
  let riskRewardRatio = 3.5;
  let stopLossPercentage = 2.5;

  if (setupType === "LONG") {
    idealEntry = currentPrice;
    entryMin = Number((idealEntry - atr * 0.25).toFixed(2));
    entryMax = Number((idealEntry + atr * 0.25).toFixed(2));

    const rawSL = Math.min(structure.swingLow, idealEntry - atr * 2.5);
    const minSL = idealEntry * 0.98; // minimum 2.0% distance to survive wicks
    const maxSL = idealEntry * 0.93; // maximum 7.0% distance
    stopLoss = Number(Math.min(Math.max(rawSL, maxSL), minSL).toFixed(2));

    const riskAmount = idealEntry - stopLoss;
    stopLossPercentage = Number(((riskAmount / idealEntry) * 100).toFixed(2));

    const tp1Price = Number((idealEntry + riskAmount * 3.0).toFixed(2));
    const tp2Price = Number((idealEntry + riskAmount * 6.0).toFixed(2));
    const tp3Price = Number((idealEntry + riskAmount * 10.0).toFixed(2));

    takeProfitTargets = [
      {
        level: 1,
        price: tp1Price,
        percentage: Number((((tp1Price - idealEntry) / idealEntry) * 100).toFixed(2)),
        rewardRisk: 3.0,
        description: "ТП1: Трендовое расширение (+3.0R) — адаптивное сопровождение",
        type: "STRUCTURAL",
        targetReason: "Первая цель трендовой волны",
      },
      {
        level: 2,
        price: tp2Price,
        percentage: Number((((tp2Price - idealEntry) / idealEntry) * 100).toFixed(2)),
        rewardRisk: 6.0,
        description: "ТП2: Макро-импульс (+6.0R) — адаптивное сопровождение",
        type: "R_MULTIPLE",
        targetReason: "Крупный направленный импульс",
      },
      {
        level: 3,
        price: tp3Price,
        percentage: Number((((tp3Price - idealEntry) / idealEntry) * 100).toFixed(2)),
        rewardRisk: 10.0,
        description: "ТП3: Параболический тренд (+10.0R) — удержание до слома тренда",
        type: "LIQUIDITY",
        targetReason: "Редкий экстремальный макро-тренд (Let winners run)",
      },
    ];

    riskRewardRatio = 4.0;
    invalidationConditions.push("Закрытие 1H свечи ниже 1H EMA50 или Chandelier 3.5x ATR");
    invalidationConditions.push("Слом 4H бычьего режима (уход ниже 4H EMA200)");
  } else if (setupType === "SHORT") {
    idealEntry = currentPrice;
    entryMin = Number((idealEntry - atr * 0.25).toFixed(2));
    entryMax = Number((idealEntry + atr * 0.25).toFixed(2));

    const rawSL = Math.max(structure.swingHigh, idealEntry + atr * 2.5);
    const minSL = idealEntry * 1.02; // minimum 2.0% distance
    const maxSL = idealEntry * 1.07; // maximum 7.0% distance
    stopLoss = Number(Math.max(Math.min(rawSL, maxSL), minSL).toFixed(2));

    const riskAmount = stopLoss - idealEntry;
    stopLossPercentage = Number(((riskAmount / idealEntry) * 100).toFixed(2));

    const tp1Price = Number((idealEntry - riskAmount * 3.0).toFixed(2));
    const tp2Price = Number((idealEntry - riskAmount * 6.0).toFixed(2));
    const tp3Price = Number((idealEntry - riskAmount * 10.0).toFixed(2));

    takeProfitTargets = [
      {
        level: 1,
        price: tp1Price,
        percentage: Number((((idealEntry - tp1Price) / idealEntry) * 100).toFixed(2)),
        rewardRisk: 3.0,
        description: "ТП1: Нисходящее расширение (+3.0R) — адаптивное сопровождение",
        type: "STRUCTURAL",
        targetReason: "Первая цель нисходящего импульса",
      },
      {
        level: 2,
        price: tp2Price,
        percentage: Number((((idealEntry - tp2Price) / idealEntry) * 100).toFixed(2)),
        rewardRisk: 6.0,
        description: "ТП2: Медвежий макро-импульс (+6.0R)",
        type: "R_MULTIPLE",
        targetReason: "Ускорение нисходящего тренда",
      },
      {
        level: 3,
        price: tp3Price,
        percentage: Number((((idealEntry - tp3Price) / idealEntry) * 100).toFixed(2)),
        rewardRisk: 10.0,
        description: "ТП3: Капитуляция рынка (+10.0R)",
        type: "LIQUIDITY",
        targetReason: "Макро-пробой ключевой поддержки (Let winners run)",
      },
    ];

    riskRewardRatio = 4.0;
    invalidationConditions.push("Закрытие 1H свечи выше 1H EMA50 или Chandelier 3.5x ATR");
    invalidationConditions.push("Возврат цены выше 4H EMA200");
  } else {
    idealEntry = currentPrice;
    entryMin = Number((currentPrice - atr * 0.25).toFixed(2));
    entryMax = Number((currentPrice + atr * 0.25).toFixed(2));
    stopLoss = Number((currentPrice * 0.96).toFixed(2));
    stopLossPercentage = 4.0;
    takeProfitTargets = [
      {
        level: 1,
        price: Number((currentPrice * 1.04).toFixed(2)),
        percentage: 4.0,
        rewardRisk: 1.0,
        description: "Граница диапазона",
        type: "STRUCTURAL",
        targetReason: "Ожидание формирования направленного трендового режима V3",
      },
    ];
  }

  const recommendedRiskPercent = 1.0; // V3 uses clean fixed 1.0% risk

  return {
    id: `sig_${asset}_${Date.now()}`,
    asset,
    timestamp: Date.now(),
    stance,
    type: setupType,
    currentPrice,
    entryRange: {
      min: entryMin,
      max: entryMax,
      ideal: idealEntry,
    },
    stopLoss,
    stopLossPercentage,
    takeProfitTargets,
    riskRewardRatio: Math.max(riskRewardRatio, 1.0),
    confidenceScore,
    recommendedRiskPercent,
    invalidationConditions,
    technicalSummary: indicators,
    marketStructure: structure,
    marketContext: context,
  };
}

/**
 * Strategy V1: Legacy Confluence Scoring engine (preserved for benchmarking & ablation)
 */
function generateV1TradingSignal(
  asset: string,
  indicators: TechnicalIndicators,
  structure: MarketStructure,
  context: MarketContextData,
  options: SignalGeneratorOptions
): TradingSignal {
  const currentPrice = indicators.currentPrice;
  const atr = indicators.atr14;
  const adxThreshold = options.adxThreshold ?? 20;

  // 1. Market Regime Evaluation
  const isTrending = indicators.adx14 >= adxThreshold;
  const isChoppy =
    !isTrending ||
    indicators.bollingerBands.bandwidth < 1.2 ||
    (structure.trendLTF === "RANGING" && indicators.volumeRatio20 < 0.9);

  let bullConfluence = 0;
  let bearConfluence = 0;
  const bullReasons: string[] = [];
  const bearReasons: string[] = [];
  const invalidationConditions: string[] = [];

  // 2. Trend Confluence (HTF & LTF)
  const isHtfBull = structure.trendHTF === "BULLISH";
  const isLtfBull = structure.trendLTF === "BULLISH";
  const isHtfBear = structure.trendHTF === "BEARISH";
  const isLtfBear = structure.trendLTF === "BEARISH";

  const isAboveEma200 = currentPrice > indicators.ema200;
  const isEmaBullStack = indicators.ema20 > indicators.ema50;
  const isBelowEma200 = currentPrice < indicators.ema200;
  const isEmaBearStack = indicators.ema20 < indicators.ema50;

  // Bullish trend points
  if (isHtfBull && isLtfBull) {
    bullConfluence += 25;
    bullReasons.push("Multi-timeframe trend alignment (HTF & LTF bullish)");
  } else if (isHtfBull || isLtfBull) {
    bullConfluence += 12;
  }
  if (isAboveEma200 && isEmaBullStack) {
    bullConfluence += 15;
    bullReasons.push("Price above 200 EMA with 20/50 EMA bullish stacking");
  }

  // Bearish trend points
  if (isHtfBear && isLtfBear) {
    bearConfluence += 25;
    bearReasons.push("Multi-timeframe trend alignment (HTF & LTF bearish)");
  } else if (isHtfBear || isLtfBear) {
    bearConfluence += 12;
  }
  if (isBelowEma200 && isEmaBearStack) {
    bearConfluence += 15;
    bearReasons.push("Price below 200 EMA with 20/50 EMA bearish stacking");
  }

  // 3. ADX Trend Strength Assessment
  if (options.enableAdxFilter && isTrending) {
    if (indicators.plusDI > indicators.minusDI) {
      bullConfluence += 15;
      bullReasons.push(`Strong bullish trend expansion (ADX: ${indicators.adx14})`);
    } else if (indicators.minusDI > indicators.plusDI) {
      bearConfluence += 15;
      bearReasons.push(`Strong bearish trend expansion (ADX: ${indicators.adx14})`);
    }
  } else if (options.enableAdxFilter && !isTrending) {
    bullConfluence -= 15;
    bearConfluence -= 15;
    invalidationConditions.push(`Low trend strength (ADX ${indicators.adx14} < ${adxThreshold}) indicates choppy range`);
  }

  // 4. Momentum & Oscillator Confluence
  // Bullish momentum
  if (indicators.rsiState === "BULLISH_DIVERGENCE") {
    bullConfluence += 20;
    bullReasons.push("Bullish RSI divergence formed at support");
  } else if (indicators.rsi14 >= 42 && indicators.rsi14 <= 62) {
    bullConfluence += 10;
    bullReasons.push("RSI in optimal expansion zone without overbought exhaustion");
  } else if (indicators.rsiState === "OVERSOLD") {
    bullConfluence += 12;
    bullReasons.push("Oversold bounce potential at support");
  }

  // Bearish momentum
  if (indicators.rsiState === "BEARISH_DIVERGENCE") {
    bearConfluence += 20;
    bearReasons.push("Bearish RSI divergence formed at resistance");
  } else if (indicators.rsi14 >= 38 && indicators.rsi14 <= 58) {
    bearConfluence += 10;
    bearReasons.push("RSI in optimal downward expansion zone");
  } else if (indicators.rsiState === "OVERBOUGHT") {
    bearConfluence += 12;
    bearReasons.push("Overbought exhaustion at structural resistance");
  }

  // MACD momentum
  if (indicators.macd.trend === "BULLISH_CROSS" || (indicators.macd.trend === "BULLISH" && indicators.macd.histogram > 0)) {
    bullConfluence += 12;
    bullReasons.push("MACD positive expansion");
  } else if (indicators.macd.trend === "BEARISH_CROSS" || (indicators.macd.trend === "BEARISH" && indicators.macd.histogram < 0)) {
    bearConfluence += 12;
    bearReasons.push("MACD negative expansion");
  }

  // 5. Volume & Liquidity Sweeps
  if (indicators.volumeRatio20 >= 1.2) {
    bullConfluence += 8;
    bearConfluence += 8;
  }

  if (options.enableLiquidityConfirmation && structure.liquiditySweep) {
    if (structure.liquiditySweep.type === "BULLISH_SWEEP") {
      bullConfluence += 20;
      bullReasons.push(`Bullish liquidity sweep below $${structure.liquiditySweep.level.toLocaleString()} with immediate reclaim`);
    } else if (structure.liquiditySweep.type === "BEARISH_SWEEP") {
      bearConfluence += 20;
      bearReasons.push(`Bearish liquidity sweep above $${structure.liquiditySweep.level.toLocaleString()} with strong rejection`);
    }
  }

  if (structure.failedBreakout) {
    if (structure.failedBreakout.type === "BULL_TRAP") {
      bearConfluence += 18;
      bearReasons.push(`Bull trap: failed breakout above $${structure.failedBreakout.level.toLocaleString()}`);
    } else if (structure.failedBreakout.type === "BEAR_TRAP") {
      bullConfluence += 18;
      bullReasons.push(`Bear trap: failed breakdown below $${structure.failedBreakout.level.toLocaleString()}`);
    }
  }

  // 6. Market Context & Funding Rate
  if (context.fundingRate !== null && context.fundingRate > 0.00035) {
    // High long funding -> longs pay shorts -> favor shorts, penalize longs
    bearConfluence += 12;
    bullConfluence -= 15;
    bearReasons.push("Elevated funding rate creates long squeeze vulnerability");
    invalidationConditions.push("Elevated long funding rate increases carry cost for longs");
  } else if (context.fundingRate !== null && context.fundingRate < -0.00015) {
    // Negative funding -> shorts pay longs -> favor longs, penalize shorts
    bullConfluence += 12;
    bearConfluence -= 15;
    bullReasons.push("Negative funding rate creates short squeeze fuel");
  }

  // 7. Stance Decision
  let stance: MarketStance = "WAIT";
  let setupType: "LONG" | "SHORT" | "NONE" = "NONE";
  let confidenceScore = 10;

  const minConfluence = 65;

  if (isChoppy && options.enableAdxFilter) {
    stance = "WAIT";
    confidenceScore = Math.max(bullConfluence, bearConfluence, 20);
    invalidationConditions.push("Market is in low-volatility chop; awaiting directional breakout");
  } else if (bullConfluence >= minConfluence && bullConfluence > bearConfluence && indicators.rsiState !== "OVERBOUGHT") {
    stance = "BUY";
    setupType = "LONG";
    confidenceScore = Math.min(Math.max(bullConfluence, 10), 96);
  } else if (options.enableShorts && bearConfluence >= minConfluence && bearConfluence > bullConfluence && indicators.rsiState !== "OVERSOLD") {
    stance = "SHORT";
    setupType = "SHORT";
    confidenceScore = Math.min(Math.max(bearConfluence, 10), 96);
  } else if (isHtfBear && isLtfBear && currentPrice < indicators.ema200 && !options.enableShorts) {
    stance = "AVOID";
    confidenceScore = Math.min(Math.max(bearConfluence, 10), 90);
  } else {
    stance = "WAIT";
    confidenceScore = Math.max(bullConfluence, bearConfluence, 25);
  }

  // 7b. Multi-Timeframe Hard Trend Gate (4H EMA200 + 4H Trend direction)
  if (options.enableHtfGate) {
    const htfPriceAboveEma200 = options.htfGate?.priceAboveEma200 ?? structure.htfPriceAboveEma200;
    const htfTrend = options.htfGate?.trendHTF ?? structure.trendHTF;

    // Rules:
    // - If 4H price is above EMA200 and 4H trend is bullish: allow LONG setups.
    // - If 4H price is below EMA200 and 4H trend is bearish: allow SHORT setups.
    // - Do NOT allow counter-trend 1H setups. Non-trending/conflicting conditions convert to WAIT.
    const is4hBullishGate = htfPriceAboveEma200 === true && htfTrend === "BULLISH";
    const is4hBearishGate = htfPriceAboveEma200 === false && htfTrend === "BEARISH";

    if (stance === "BUY" && !is4hBullishGate) {
      stance = "WAIT";
      setupType = "NONE";
      const reason = htfPriceAboveEma200 === false
        ? `Counter-trend LONG setup blocked by 4H Trend Gate: 4H price is below 4H EMA200`
        : `LONG setup blocked by 4H Trend Gate: 4H trend is ${htfTrend} (requires BULLISH above 4H EMA200)`;
      invalidationConditions.push(reason);
    } else if (stance === "SHORT" && !is4hBearishGate) {
      stance = "WAIT";
      setupType = "NONE";
      const reason = htfPriceAboveEma200 === true
        ? `Counter-trend SHORT setup blocked by 4H Trend Gate: 4H price is above 4H EMA200`
        : `SHORT setup blocked by 4H Trend Gate: 4H trend is ${htfTrend} (requires BEARISH below 4H EMA200)`;
      invalidationConditions.push(reason);
    }
  }

  // 8. Dynamic Entry, Stop Loss, and Take Profit Calculations
  let idealEntry = currentPrice;
  let entryMin = currentPrice;
  let entryMax = currentPrice;
  let stopLoss = currentPrice;
  let takeProfitTargets: TakeProfitTarget[] = [];
  let riskRewardRatio = 2.0;
  let stopLossPercentage = 1.5;

  if (setupType === "LONG") {
    // Pullback limit entry between current price and structural support / EMA20
    idealEntry = Number(Math.max(structure.keySupport, currentPrice - atr * 0.35).toFixed(2));
    entryMin = Number((idealEntry - atr * 0.25).toFixed(2));
    entryMax = Number((currentPrice + atr * 0.1).toFixed(2));

    // Adaptive Stop Loss: below swing low / key support + ATR buffer
    const rawSL = Math.min(structure.swingLow, structure.keySupport) - atr * 0.8;
    const boundedSL = Math.max(rawSL, idealEntry * 0.95); // max 5% stop
    stopLoss = Number(Math.min(boundedSL, idealEntry * 0.995).toFixed(2)); // min 0.5% stop

    const riskAmount = idealEntry - stopLoss;
    stopLossPercentage = Number(((riskAmount / idealEntry) * 100).toFixed(2));

    // Dynamic Take Profit Targets
    const tp1Price = Number(
      Math.min(structure.keyResistance, idealEntry + riskAmount * 1.8).toFixed(2)
    );
    const tp2Price = Number((idealEntry + riskAmount * 3.0).toFixed(2));
    const tp3Price = Number(
      Math.max(structure.keyResistance * 1.015, idealEntry + riskAmount * 4.5).toFixed(2)
    );

    takeProfitTargets = [
      {
        level: 1,
        price: tp1Price,
        percentage: Number((((tp1Price - idealEntry) / idealEntry) * 100).toFixed(2)),
        rewardRisk: Number(((tp1Price - idealEntry) / riskAmount).toFixed(1)),
        description: "TP1: Key structural resistance / 1.8R de-risk",
        type: "STRUCTURAL",
        targetReason: "Immediate resistance zone and liquidity cluster",
      },
      {
        level: 2,
        price: tp2Price,
        percentage: Number((((tp2Price - idealEntry) / idealEntry) * 100).toFixed(2)),
        rewardRisk: 3.0,
        description: "TP2: Core trend expansion level",
        type: "R_MULTIPLE",
        targetReason: "Optimal 3.0R trend continuation target",
      },
      {
        level: 3,
        price: tp3Price,
        percentage: Number((((tp3Price - idealEntry) / idealEntry) * 100).toFixed(2)),
        rewardRisk: Number(((tp3Price - idealEntry) / riskAmount).toFixed(1)),
        description: "TP3: Macro liquidity runner",
        type: "LIQUIDITY",
        targetReason: "Higher timeframe liquidity pool expansion",
      },
    ];

    riskRewardRatio = Number(((tp2Price - idealEntry) / riskAmount).toFixed(2));

    invalidationConditions.push(`Decisive 1-hour candle close below Stop Loss at $${stopLoss.toLocaleString()}`);
    invalidationConditions.push(`Loss of 200 EMA ($${indicators.ema200.toFixed(2)}) on heavy distribution volume`);
  } else if (setupType === "SHORT") {
    // Pullback limit entry between current price and structural resistance / EMA20
    idealEntry = Number(Math.min(structure.keyResistance, currentPrice + atr * 0.35).toFixed(2));
    entryMin = Number((currentPrice - atr * 0.1).toFixed(2));
    entryMax = Number((idealEntry + atr * 0.25).toFixed(2));

    // Adaptive Stop Loss: above swing high / key resistance + ATR buffer
    const rawSL = Math.max(structure.swingHigh, structure.keyResistance) + atr * 0.8;
    const boundedSL = Math.min(rawSL, idealEntry * 1.05); // max 5% stop
    stopLoss = Number(Math.max(boundedSL, idealEntry * 1.005).toFixed(2)); // min 0.5% stop

    const riskAmount = stopLoss - idealEntry;
    stopLossPercentage = Number(((riskAmount / idealEntry) * 100).toFixed(2));

    // Dynamic Take Profit Targets for Shorts (downward)
    const tp1Price = Number(
      Math.max(structure.keySupport, idealEntry - riskAmount * 1.8).toFixed(2)
    );
    const tp2Price = Number((idealEntry - riskAmount * 3.0).toFixed(2));
    const tp3Price = Number(
      Math.min(structure.keySupport * 0.985, idealEntry - riskAmount * 4.5).toFixed(2)
    );

    takeProfitTargets = [
      {
        level: 1,
        price: tp1Price,
        percentage: Number((((idealEntry - tp1Price) / idealEntry) * 100).toFixed(2)),
        rewardRisk: Number(((idealEntry - tp1Price) / riskAmount).toFixed(1)),
        description: "TP1: Key structural support / 1.8R de-risk",
        type: "STRUCTURAL",
        targetReason: "Nearest demand pool and horizontal support cluster",
      },
      {
        level: 2,
        price: tp2Price,
        percentage: Number((((idealEntry - tp2Price) / idealEntry) * 100).toFixed(2)),
        rewardRisk: 3.0,
        description: "TP2: Core downward trend expansion",
        type: "R_MULTIPLE",
        targetReason: "Optimal 3.0R downward impulse expansion",
      },
      {
        level: 3,
        price: tp3Price,
        percentage: Number((((idealEntry - tp3Price) / idealEntry) * 100).toFixed(2)),
        rewardRisk: Number(((idealEntry - tp3Price) / riskAmount).toFixed(1)),
        description: "TP3: Macro liquidity sweep target",
        type: "LIQUIDITY",
        targetReason: "Macro liquidity pocket take-out below prior low",
      },
    ];

    riskRewardRatio = Number(((idealEntry - tp2Price) / riskAmount).toFixed(2));

    invalidationConditions.push(`Decisive 1-hour candle close above Stop Loss at $${stopLoss.toLocaleString()}`);
    invalidationConditions.push(`Impulsive reclaim of 200 EMA ($${indicators.ema200.toFixed(2)}) with high volume`);
  } else {
    // Neutral / Wait / Avoid fallback levels
    idealEntry = currentPrice;
    entryMin = Number((currentPrice - atr * 0.2).toFixed(2));
    entryMax = Number((currentPrice + atr * 0.2).toFixed(2));
    stopLoss = Number((currentPrice * 0.97).toFixed(2));
    stopLossPercentage = 3.0;
    takeProfitTargets = [
      {
        level: 1,
        price: Number((currentPrice * 1.03).toFixed(2)),
        percentage: 3.0,
        rewardRisk: 1.0,
        description: "Range boundary resistance",
        type: "STRUCTURAL",
        targetReason: "Upper consolidation boundary",
      },
    ];
  }

  const normalRisk = options.normalRiskPercent ?? 1.5;
  const lowRisk = options.lowAdxRiskPercent ?? 0.75;
  const regimeThreshold = options.regimeRiskThreshold ?? 25;
  const recommendedRiskPercent = indicators.adx14 >= regimeThreshold ? normalRisk : lowRisk;

  return {
    id: `sig_${asset}_${Date.now()}`,
    asset,
    timestamp: Date.now(),
    stance,
    type: setupType,
    currentPrice,
    entryRange: {
      min: entryMin,
      max: entryMax,
      ideal: idealEntry,
    },
    stopLoss,
    stopLossPercentage,
    takeProfitTargets,
    riskRewardRatio: Math.max(riskRewardRatio, 1.0),
    confidenceScore,
    recommendedRiskPercent,
    invalidationConditions,
    technicalSummary: indicators,
    marketStructure: structure,
    marketContext: context,
  };
}

/**
 * Strategy Model D: 4H Dynamic Trend-Following Architecture
 * Macro Gate: 4H Close > EMA200 AND EMA20 > EMA50 (Bullish)
 * Entry: Pullback to EMA20 and bounce (prevBar.low <= EMA20 AND currentBar.close > EMA20)
 * Short Mirror: Close < EMA200 AND EMA20 < EMA50 AND prevBar.high >= EMA20 AND currentBar.close < EMA20
 * Initial Protective Stop: 2.5 x ATR14
 * Structural Swing Trailing: minimum of previous 5 closed 4H candles (Long) / maximum of previous 5 (Short)
 * No fixed Take Profit (Let winners run)
 */
export function generateModelDTradingSignal(
  asset: string,
  indicators: TechnicalIndicators,
  structure: MarketStructure,
  context: MarketContextData,
  options: SignalGeneratorOptions = DEFAULT_SIGNAL_OPTIONS
): TradingSignal {
  const currentPrice = indicators.currentPrice;
  const atr = indicators.atr14 || currentPrice * 0.02;
  const invalidationConditions: string[] = [];

  // Macro Trend Gate (4H EMA200 + EMA20/50 alignment)
  const isMacroBull = currentPrice > indicators.ema200;
  const isMacroBear = currentPrice < indicators.ema200;
  const isTrendBull = indicators.ema20 > indicators.ema50;
  const isTrendBear = indicators.ema20 < indicators.ema50;

  // Bar checks (uses prevBar if passed in options, else currentBar or structure)
  const prevLow = options.modelDOptions?.prevBar?.low ?? options.modelDOptions?.currentBar?.low ?? structure.swingLow;
  const prevHigh = options.modelDOptions?.prevBar?.high ?? options.modelDOptions?.currentBar?.high ?? structure.swingHigh;

  const pullbackBounceLong = isMacroBull && isTrendBull && prevLow <= indicators.ema20 && currentPrice > indicators.ema20;
  const pullbackBounceShort = (options.enableShorts ?? true) && isMacroBear && isTrendBear && prevHigh >= indicators.ema20 && currentPrice < indicators.ema20;

  let stance: MarketStance = "WAIT";
  let setupType: "LONG" | "SHORT" | "NONE" = "NONE";
  let confidenceScore = 35;

  if (pullbackBounceLong) {
    stance = "BUY";
    setupType = "LONG";
    confidenceScore = 88;
  } else if (pullbackBounceShort) {
    stance = "SHORT";
    setupType = "SHORT";
    confidenceScore = 85;
  } else {
    stance = "WAIT";
    confidenceScore = 40;
    if (!isMacroBull && !isMacroBear) invalidationConditions.push("4H цена не определилась относительно 4H EMA200");
    if (!isTrendBull && !isTrendBear) invalidationConditions.push("4H EMA20 и EMA50 не показывают направленного тренда");
    if (isMacroBull && isTrendBull && prevLow > indicators.ema20) {
      invalidationConditions.push(`Ожидание отката цены к 4H EMA20 ($${indicators.ema20.toFixed(2)})`);
    }
    if (isMacroBear && isTrendBear && prevHigh < indicators.ema20) {
      invalidationConditions.push(`Ожидание отката цены вверх к 4H EMA20 ($${indicators.ema20.toFixed(2)})`);
    }
  }

  // Initial Stop: 2.5 x ATR14
  let idealEntry = currentPrice;
  let entryMin = currentPrice;
  let entryMax = currentPrice;
  let stopLoss = currentPrice;
  let stopLossPercentage = 2.5;

  // Trailing stop calculation if recent 5 bars are provided
  const recentBars = options.modelDOptions?.recent5ClosedCandles ?? [];

  if (setupType === "LONG") {
    idealEntry = currentPrice;
    entryMin = Number((idealEntry - atr * 0.2).toFixed(2));
    entryMax = Number((idealEntry + atr * 0.1).toFixed(2));

    const rawSL = idealEntry - 2.5 * atr;
    const maxSL = idealEntry * 0.94; // max 6% stop distance
    stopLoss = Number(Math.max(rawSL, maxSL).toFixed(2));

    const riskAmount = idealEntry - stopLoss;
    stopLossPercentage = Number(((riskAmount / idealEntry) * 100).toFixed(2));
    invalidationConditions.push(`Срабатывание стоп-лосса $${stopLoss.toLocaleString()} (2.5×ATR14)`);
    invalidationConditions.push("Выход по структурному трейлингу (минимум последних 5 закрытых 4H свечей)");
  } else if (setupType === "SHORT") {
    idealEntry = currentPrice;
    entryMin = Number((idealEntry - atr * 0.1).toFixed(2));
    entryMax = Number((idealEntry + atr * 0.2).toFixed(2));

    const rawSL = idealEntry + 2.5 * atr;
    const maxSL = idealEntry * 1.06; // max 6% stop distance
    stopLoss = Number(Math.min(rawSL, maxSL).toFixed(2));

    const riskAmount = stopLoss - idealEntry;
    stopLossPercentage = Number(((riskAmount / idealEntry) * 100).toFixed(2));
    invalidationConditions.push(`Срабатывание стоп-лосса $${stopLoss.toLocaleString()} (2.5×ATR14)`);
    invalidationConditions.push("Выход по структурному трейлингу (максимум последних 5 закрытых 4H свечей)");
  } else {
    stopLoss = Number((currentPrice * 0.96).toFixed(2));
  }

  // Model D has NO fixed Take Profit (Let Winners Run)
  // Informational milestone targets for UI telemetry only
  const riskAmount = Math.abs(idealEntry - stopLoss) || (currentPrice * 0.02);
  const takeProfitTargets: TakeProfitTarget[] = setupType === "LONG" ? [
    {
      level: 1,
      price: Number((idealEntry + riskAmount * 3.0).toFixed(2)),
      percentage: Number((((riskAmount * 3.0) / idealEntry) * 100).toFixed(2)),
      rewardRisk: 3.0,
      description: "Ориентир +3.0R (сопровождение по 5-свечному свингу)",
      type: "STRUCTURAL",
      targetReason: "Информационный рубеж: выход строго по Structural Swing Trailing",
    },
    {
      level: 2,
      price: Number((idealEntry + riskAmount * 6.0).toFixed(2)),
      percentage: Number((((riskAmount * 6.0) / idealEntry) * 100).toFixed(2)),
      rewardRisk: 6.0,
      description: "Ориентир +6.0R (макро-раннер)",
      type: "R_MULTIPLE",
      targetReason: "Трендовое расширение: позиция удерживается до слома минимума 5 свечей",
    },
  ] : setupType === "SHORT" ? [
    {
      level: 1,
      price: Number((idealEntry - riskAmount * 3.0).toFixed(2)),
      percentage: Number((((riskAmount * 3.0) / idealEntry) * 100).toFixed(2)),
      rewardRisk: 3.0,
      description: "Ориентир +3.0R (сопровождение по 5-свечному свингу)",
      type: "STRUCTURAL",
      targetReason: "Информационный рубеж: выход строго по Structural Swing Trailing",
    },
    {
      level: 2,
      price: Number((idealEntry - riskAmount * 6.0).toFixed(2)),
      percentage: Number((((riskAmount * 6.0) / idealEntry) * 100).toFixed(2)),
      rewardRisk: 6.0,
      description: "Ориентир +6.0R (макро-шорт)",
      type: "R_MULTIPLE",
      targetReason: "Трендовое расширение: позиция удерживается до слома максимума 5 свечей",
    },
  ] : [
    {
      level: 1,
      price: Number((currentPrice * 1.05).toFixed(2)),
      percentage: 5.0,
      rewardRisk: 1.5,
      description: "Ожидание формирования 4H отката и отскока Model D",
      type: "STRUCTURAL",
      targetReason: "Model D 4H Dynamic Trend-Following",
    }
  ];

  return {
    id: `sig_model_d_${asset}_${Date.now()}`,
    asset,
    timestamp: Date.now(),
    stance,
    type: setupType,
    currentPrice,
    entryRange: {
      min: entryMin,
      max: entryMax,
      ideal: idealEntry,
    },
    stopLoss,
    stopLossPercentage,
    takeProfitTargets,
    riskRewardRatio: 3.0,
    confidenceScore,
    recommendedRiskPercent: 1.0, // Fixed 1.0% per trade as validated in 6-year audit
    invalidationConditions,
    technicalSummary: indicators,
    marketStructure: structure,
    marketContext: context,
    strategyVersion: "MODEL_D",
  };
}

/**
 * End-to-end generator for Model D signals directly from 4H candles.
 * Fully deterministic, zero lookahead.
 */
export function generateModelDSignalFrom4hCandles(
  asset: string,
  candles4h: Candle[],
  context?: MarketContextData
): TradingSignal {
  if (candles4h.length < 50) {
    throw new Error("Model D requires at least 50 4H candles");
  }

  const indicators = extractTechnicalIndicators(candles4h);
  const structure = analyzeMarketStructure(candles4h);

  const defaultContext: MarketContextData = context || {
    fearGreedIndex: null,
    fearGreedSentiment: null,
    fundingRate: null,
    marketRegime: indicators.currentPrice > indicators.ema200 ? "TRENDING_BULL" : "TRENDING_BEAR",
  };

  const n = candles4h.length;
  const currentBar = candles4h[n - 1];
  const prevBar = candles4h[n - 2];
  const recent5 = candles4h.slice(-6, -1).map((b) => ({ low: b.low, high: b.high }));

  return generateModelDTradingSignal(asset, indicators, structure, defaultContext, {
    strategyVersion: "MODEL_D",
    enableShorts: true,
    modelDOptions: {
      currentBar,
      prevBar,
      recent5ClosedCandles: recent5,
    },
  });
}

