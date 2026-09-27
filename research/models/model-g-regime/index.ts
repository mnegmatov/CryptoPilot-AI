import { TradingSignal, MarketContextData, TechnicalIndicators, MarketStructure } from "../../../src/core/types";
import { generateModelEMomentumSignal } from "../model-e-momentum";
import { generateModelFMeanReversionSignal } from "../model-f-mean-reversion";

export function generateModelGRegimeSignal(
  asset: string,
  indicators: TechnicalIndicators,
  structure: MarketStructure,
  context: MarketContextData,
  options: any
): TradingSignal {
  
  // Model G: Regime-Based Strategy
  // If ADX > 25, use Momentum (Model E)
  // If ADX <= 25, use Mean Reversion (Model F)
  
  const isTrending = indicators.adx14 > 25;
  
  let signal: TradingSignal;
  if (isTrending) {
    signal = generateModelEMomentumSignal(asset, indicators, structure, context, options);
  } else {
    signal = generateModelFMeanReversionSignal(asset, indicators, structure, context, options);
  }
  
  // Override ID and version
  return {
    ...signal,
    id: `sig_model_g_${asset}_${Date.now()}`,
    strategyVersion: "MODEL_G" as any,
  };
}
