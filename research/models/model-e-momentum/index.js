"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateModelEMomentumSignal = generateModelEMomentumSignal;
function generateModelEMomentumSignal(asset, indicators, structure, context, options) {
    var _a, _b;
    var currentPrice = indicators.currentPrice;
    var atr = indicators.atr14 || currentPrice * 0.02;
    var invalidationConditions = [];
    // Model E: 20-period breakout (Donchian channel)
    var isTrending = indicators.adx14 > 25;
    var currentBar = (_a = options.modelDOptions) === null || _a === void 0 ? void 0 : _a.currentBar;
    var prevBar = (_b = options.modelDOptions) === null || _b === void 0 ? void 0 : _b.prevBar;
    var stance = "WAIT";
    var setupType = "NONE";
    var confidenceScore = 40;
    // We approximate breakout by checking if close > highest high of last 20 candles
    // For simplicity, we use Bollinger Bands as a proxy for breakout if structure isn't passed.
    // Actually, structure.swingHigh/swingLow can represent recent structure.
    var isUpperBreakout = currentPrice > indicators.bollingerBands.upper;
    var isLowerBreakout = currentPrice < indicators.bollingerBands.lower;
    if (isTrending && isUpperBreakout) {
        stance = "BUY";
        setupType = "LONG";
        confidenceScore = 80;
    }
    else if (isTrending && isLowerBreakout && options.enableShorts) {
        stance = "SHORT";
        setupType = "SHORT";
        confidenceScore = 80;
    }
    var idealEntry = currentPrice;
    var stopLoss = currentPrice;
    var stopLossPercentage = 2.5;
    if (setupType === "LONG") {
        stopLoss = Number(Math.max(idealEntry - 2.5 * atr, idealEntry * 0.94).toFixed(2));
        var riskAmount = idealEntry - stopLoss;
        stopLossPercentage = Number(((riskAmount / idealEntry) * 100).toFixed(2));
    }
    else if (setupType === "SHORT") {
        stopLoss = Number(Math.min(idealEntry + 2.5 * atr, idealEntry * 1.06).toFixed(2));
        var riskAmount = stopLoss - idealEntry;
        stopLossPercentage = Number(((riskAmount / idealEntry) * 100).toFixed(2));
    }
    var takeProfitTargets = [
        { level: 1, price: setupType === "LONG" ? idealEntry + 3 * atr : idealEntry - 3 * atr, percentage: 3, rewardRisk: 1.5, description: "TP1", type: "R_MULTIPLE", targetReason: "" },
        { level: 2, price: setupType === "LONG" ? idealEntry + 6 * atr : idealEntry - 6 * atr, percentage: 6, rewardRisk: 3.0, description: "TP2", type: "R_MULTIPLE", targetReason: "" },
        { level: 3, price: setupType === "LONG" ? idealEntry + 10 * atr : idealEntry - 10 * atr, percentage: 10, rewardRisk: 5.0, description: "TP3", type: "R_MULTIPLE", targetReason: "" },
    ];
    return {
        id: "sig_model_e_".concat(asset, "_").concat(Date.now()),
        asset: asset,
        timestamp: Date.now(),
        stance: stance,
        type: setupType,
        currentPrice: currentPrice,
        entryRange: { min: idealEntry - atr * 0.1, max: idealEntry + atr * 0.1, ideal: idealEntry },
        stopLoss: stopLoss,
        stopLossPercentage: stopLossPercentage,
        takeProfitTargets: takeProfitTargets,
        riskRewardRatio: 3.0,
        confidenceScore: confidenceScore,
        recommendedRiskPercent: 1.0,
        invalidationConditions: invalidationConditions,
        technicalSummary: indicators,
        marketStructure: structure,
        marketContext: context,
        strategyVersion: "MODEL_E",
    };
}
