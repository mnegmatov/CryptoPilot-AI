"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateModelFMeanReversionSignal = generateModelFMeanReversionSignal;
function generateModelFMeanReversionSignal(asset, indicators, structure, context, options) {
    var currentPrice = indicators.currentPrice;
    var atr = indicators.atr14 || currentPrice * 0.02;
    var invalidationConditions = [];
    // Model F: Mean Reversion in ranging markets
    var isRanging = indicators.adx14 < 25;
    var isOversold = indicators.rsi14 < 35;
    var isOverbought = indicators.rsi14 > 65;
    var stance = "WAIT";
    var setupType = "NONE";
    var confidenceScore = 40;
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
    var idealEntry = currentPrice;
    var stopLoss = currentPrice;
    var stopLossPercentage = 1.5;
    // Fixed SL at 1.5x ATR for tighter risk in ranging markets
    if (setupType === "LONG") {
        stopLoss = Number(Math.max(idealEntry - 1.5 * atr, idealEntry * 0.94).toFixed(2));
        var riskAmount = idealEntry - stopLoss;
        stopLossPercentage = Number(((riskAmount / idealEntry) * 100).toFixed(2));
    }
    else if (setupType === "SHORT") {
        stopLoss = Number(Math.min(idealEntry + 1.5 * atr, idealEntry * 1.06).toFixed(2));
        var riskAmount = stopLoss - idealEntry;
        stopLossPercentage = Number(((riskAmount / idealEntry) * 100).toFixed(2));
    }
    // TP is the Mean (EMA20)
    var tp1 = setupType === "LONG" ? Math.max(idealEntry + atr, indicators.ema20) : Math.min(idealEntry - atr, indicators.ema20);
    var takeProfitTargets = [
        { level: 1, price: tp1, percentage: Math.abs(tp1 - idealEntry) / idealEntry * 100, rewardRisk: 1.5, description: "Mean Reversion", type: "STRUCTURAL", targetReason: "" },
        { level: 2, price: tp1, percentage: Math.abs(tp1 - idealEntry) / idealEntry * 100, rewardRisk: 1.5, description: "Mean Reversion", type: "STRUCTURAL", targetReason: "" },
        { level: 3, price: tp1, percentage: Math.abs(tp1 - idealEntry) / idealEntry * 100, rewardRisk: 1.5, description: "Mean Reversion", type: "STRUCTURAL", targetReason: "" },
    ];
    return {
        id: "sig_model_f_".concat(asset, "_").concat(Date.now()),
        asset: asset,
        timestamp: Date.now(),
        stance: stance,
        type: setupType,
        currentPrice: currentPrice,
        entryRange: { min: idealEntry - atr * 0.1, max: idealEntry + atr * 0.1, ideal: idealEntry },
        stopLoss: stopLoss,
        stopLossPercentage: stopLossPercentage,
        takeProfitTargets: takeProfitTargets,
        riskRewardRatio: 1.5,
        confidenceScore: confidenceScore,
        recommendedRiskPercent: 1.0,
        invalidationConditions: invalidationConditions,
        technicalSummary: indicators,
        marketStructure: structure,
        marketContext: context,
        strategyVersion: "MODEL_F",
    };
}
