import { TradingSignal, MarketContextData, TechnicalIndicators, MarketStructure } from "../../../src/core/types";

export function generateModelFMeanReversionSignal(
  asset: string,
  indicators: TechnicalIndicators,
  structure: MarketStructure,
  context: MarketContextData,
  options: any
): TradingSignal {
  const currentPrice = indicators.currentPrice;
  const atr = indicators.atr14 || currentPrice * 0.02;
  const invalidationConditions: string[] = [];
  
  // Model F: Mean Reversion in ranging markets
  const isRanging = indicators.adx14 < 25;
  const isOversold = indicators.rsi14 < 35;
  const isOverbought = indicators.rsi14 > 65;
  
  let stance: "WAIT" | "BUY" | "SHORT" = "WAIT";
  let setupType: "LONG" | "SHORT" | "NONE" = "NONE";
  let confidenceScore = 40;
  
  // Touch lower BB and RSI oversold
  if (isRanging && currentPrice <= indicators.bollingerBands.lower && isOversold) {
    stance = "BUY";
    setupType = "LONG";
    confidenceScore = 80;
  } 
  // Touch upper BB and RSI overbought
  else if (isRanging && currentPrice >= indicators.bollingerBands.upper && isOverbought && options.enableShorts) {
    stance = "SHORT";
    setupType = "SHORT";
    confidenceScore = 80;
  }
  
  let idealEntry = currentPrice;
  let stopLoss = currentPrice;
  let stopLossPercentage = 1.5;
  
  // Fixed SL at 1.5x ATR for tighter risk in ranging markets
  if (setupType === "LONG") {
    stopLoss = Number(Math.max(idealEntry - 1.5 * atr, idealEntry * 0.94).toFixed(2));
    const riskAmount = idealEntry - stopLoss;
    stopLossPercentage = Number(((riskAmount / idealEntry) * 100).toFixed(2));
  } else if (setupType === "SHORT") {
    stopLoss = Number(Math.min(idealEntry + 1.5 * atr, idealEntry * 1.06).toFixed(2));
    const riskAmount = stopLoss - idealEntry;
    stopLossPercentage = Number(((riskAmount / idealEntry) * 100).toFixed(2));
  }
  
  // TP is the Mean (EMA20)
  const tp1 = setupType === "LONG" ? Math.max(idealEntry + atr, indicators.ema20) : Math.min(idealEntry - atr, indicators.ema20);
  
  const takeProfitTargets = [
    { level: 1, price: tp1, percentage: Math.abs(tp1 - idealEntry) / idealEntry * 100, rewardRisk: 1.5, description: "Mean Reversion", type: "STRUCTURAL" as const, targetReason: "" },
    { level: 2, price: tp1, percentage: Math.abs(tp1 - idealEntry) / idealEntry * 100, rewardRisk: 1.5, description: "Mean Reversion", type: "STRUCTURAL" as const, targetReason: "" },
    { level: 3, price: tp1, percentage: Math.abs(tp1 - idealEntry) / idealEntry * 100, rewardRisk: 1.5, description: "Mean Reversion", type: "STRUCTURAL" as const, targetReason: "" },
  ];
  
  return {
    id: `sig_model_f_${asset}_${Date.now()}`,
    asset,
    timestamp: Date.now(),
    stance,
    type: setupType,
    currentPrice,
    entryRange: { min: idealEntry - atr * 0.1, max: idealEntry + atr * 0.1, ideal: idealEntry },
    stopLoss,
    stopLossPercentage,
    takeProfitTargets,
    riskRewardRatio: 1.5,
    confidenceScore,
    recommendedRiskPercent: 1.0,
    invalidationConditions,
    technicalSummary: indicators,
    marketStructure: structure,
    marketContext: context,
    strategyVersion: "MODEL_F" as any,
  };
}
