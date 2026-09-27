import { TradingSignal, MarketContextData, TechnicalIndicators, MarketStructure } from "../../../src/core/types";

export function generateModelEMomentumSignal(
  asset: string,
  indicators: TechnicalIndicators,
  structure: MarketStructure,
  context: MarketContextData,
  options: any
): TradingSignal {
  const currentPrice = indicators.currentPrice;
  const atr = indicators.atr14 || currentPrice * 0.02;
  const invalidationConditions: string[] = [];
  
  // Model E: 20-period breakout (Donchian channel)
  const isTrending = indicators.adx14 > 25;
  const currentBar = options.modelDOptions?.currentBar;
  const prevBar = options.modelDOptions?.prevBar;
  
  let stance: "WAIT" | "BUY" | "SHORT" = "WAIT";
  let setupType: "LONG" | "SHORT" | "NONE" = "NONE";
  let confidenceScore = 40;
  
  // We approximate breakout by checking if close > highest high of last 20 candles
  // For simplicity, we use Bollinger Bands as a proxy for breakout if structure isn't passed.
  // Actually, structure.swingHigh/swingLow can represent recent structure.
  
  const isUpperBreakout = currentPrice > indicators.bollingerBands.upper;
  const isLowerBreakout = currentPrice < indicators.bollingerBands.lower;
  
  if (isTrending && isUpperBreakout) {
    stance = "BUY";
    setupType = "LONG";
    confidenceScore = 80;
  } else if (isTrending && isLowerBreakout && options.enableShorts) {
    stance = "SHORT";
    setupType = "SHORT";
    confidenceScore = 80;
  }
  
  let idealEntry = currentPrice;
  let stopLoss = currentPrice;
  let stopLossPercentage = 2.5;
  
  if (setupType === "LONG") {
    stopLoss = Number(Math.max(idealEntry - 2.5 * atr, idealEntry * 0.94).toFixed(2));
    const riskAmount = idealEntry - stopLoss;
    stopLossPercentage = Number(((riskAmount / idealEntry) * 100).toFixed(2));
  } else if (setupType === "SHORT") {
    stopLoss = Number(Math.min(idealEntry + 2.5 * atr, idealEntry * 1.06).toFixed(2));
    const riskAmount = stopLoss - idealEntry;
    stopLossPercentage = Number(((riskAmount / idealEntry) * 100).toFixed(2));
  }
  
  const takeProfitTargets = [
    { level: 1, price: setupType === "LONG" ? idealEntry + 3 * atr : idealEntry - 3 * atr, percentage: 3, rewardRisk: 1.5, description: "TP1", type: "R_MULTIPLE" as const, targetReason: "" },
    { level: 2, price: setupType === "LONG" ? idealEntry + 6 * atr : idealEntry - 6 * atr, percentage: 6, rewardRisk: 3.0, description: "TP2", type: "R_MULTIPLE" as const, targetReason: "" },
    { level: 3, price: setupType === "LONG" ? idealEntry + 10 * atr : idealEntry - 10 * atr, percentage: 10, rewardRisk: 5.0, description: "TP3", type: "R_MULTIPLE" as const, targetReason: "" },
  ];
  
  return {
    id: `sig_model_e_${asset}_${Date.now()}`,
    asset,
    timestamp: Date.now(),
    stance,
    type: setupType,
    currentPrice,
    entryRange: { min: idealEntry - atr * 0.1, max: idealEntry + atr * 0.1, ideal: idealEntry },
    stopLoss,
    stopLossPercentage,
    takeProfitTargets,
    riskRewardRatio: 3.0,
    confidenceScore,
    recommendedRiskPercent: 1.0,
    invalidationConditions,
    technicalSummary: indicators,
    marketStructure: structure,
    marketContext: context,
    strategyVersion: "MODEL_E" as any,
  };
}
