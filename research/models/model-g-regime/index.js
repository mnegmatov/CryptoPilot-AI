"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateModelGRegimeSignal = generateModelGRegimeSignal;
var model_e_momentum_1 = require("../model-e-momentum");
var model_f_mean_reversion_1 = require("../model-f-mean-reversion");
function generateModelGRegimeSignal(asset, indicators, structure, context, options) {
    // Model G: Regime-Based Strategy
    // If ADX > 25, use Momentum (Model E)
    // If ADX <= 25, use Mean Reversion (Model F)
    var isTrending = indicators.adx14 > 25;
    var signal;
    if (isTrending) {
        signal = (0, model_e_momentum_1.generateModelEMomentumSignal)(asset, indicators, structure, context, options);
    }
    else {
        signal = (0, model_f_mean_reversion_1.generateModelFMeanReversionSignal)(asset, indicators, structure, context, options);
    }
    // Override ID and version
    return __assign(__assign({}, signal), { id: "sig_model_g_".concat(asset, "_").concat(Date.now()), strategyVersion: "MODEL_G" });
}
