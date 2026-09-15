import { Candle } from "../types";
import { calculateATR, calculateEMA } from "../quant/indicators";
import { globalPaperWallet } from "./wallet";

export interface ModelDTelemetry {
  symbol: string;
  currentPrice: number;
  ema20: number;
  ema50: number;
  ema200: number;
  atr14: number;
  trend4h: "BULLISH" | "BEARISH" | "RANGING";
  isMacroBull: boolean;
  isMacroBear: boolean;
  isTrendBull: boolean;
  isTrendBear: boolean;
  swingTrailingLevelLong: number;
  swingTrailingLevelShort: number;
  lastClosedBarTime: number;
}

/**
 * Computes deterministic 4H Model D indicator telemetry from real 4H candles.
 * Strict zero-lookahead: trailing levels use strictly completed bars before the latest bar.
 */
export function computeModelDTelemetry(symbol: string, candles4h: Candle[]): ModelDTelemetry {
  if (candles4h.length < 50) {
    throw new Error("Insufficient 4H candles for Model D telemetry (minimum 50 required)");
  }

  const closes = candles4h.map((c) => c.close);
  const ema20Arr = calculateEMA(closes, 20);
  const ema50Arr = calculateEMA(closes, 50);
  const ema200Arr = calculateEMA(closes, Math.min(200, closes.length - 1));
  const atrArr = calculateATR(candles4h, 14);

  const lastIdx = closes.length - 1;
  const currentPrice = closes[lastIdx];
  const ema20 = ema20Arr[lastIdx] ?? currentPrice;
  const ema50 = ema50Arr[lastIdx] ?? currentPrice;
  const ema200 = ema200Arr[lastIdx] ?? currentPrice;
  const atr14 = atrArr[lastIdx] ?? (currentPrice * 0.02);

  const isMacroBull = currentPrice > ema200;
  const isMacroBear = currentPrice < ema200;
  const isTrendBull = ema20 > ema50;
  const isTrendBear = ema20 < ema50;

  let trend4h: "BULLISH" | "BEARISH" | "RANGING" = "RANGING";
  if (isMacroBull && isTrendBull) {
    trend4h = "BULLISH";
  } else if (isMacroBear && isTrendBear) {
    trend4h = "BEARISH";
  }

  // Previous 5 completed bars (excluding current bar if still forming)
  const completedBars = candles4h.slice(-6, -1);
  const swingTrailingLevelLong = completedBars.length > 0
    ? Math.min(...completedBars.map((b) => b.low))
    : currentPrice - 2.5 * atr14;

  const swingTrailingLevelShort = completedBars.length > 0
    ? Math.max(...completedBars.map((b) => b.high))
    : currentPrice + 2.5 * atr14;

  return {
    symbol,
    currentPrice,
    ema20: Number(ema20.toFixed(2)),
    ema50: Number(ema50.toFixed(2)),
    ema200: Number(ema200.toFixed(2)),
    atr14: Number(atr14.toFixed(2)),
    trend4h,
    isMacroBull,
    isMacroBear,
    isTrendBull,
    isTrendBear,
    swingTrailingLevelLong: Number(swingTrailingLevelLong.toFixed(2)),
    swingTrailingLevelShort: Number(swingTrailingLevelShort.toFixed(2)),
    lastClosedBarTime: candles4h[candles4h.length - 2]?.timestamp ?? 0,
  };
}

/**
 * Synchronizes structural swing trailing stop updates across open Model D paper positions
 */
export function syncModelDTrailingStops(symbol: string, candles4h: Candle[]) {
  if (candles4h.length < 6) return [];
  // Use strictly completed 4H bars (excluding active forming bar)
  const closedBars = candles4h.slice(-6, -1).map((c) => ({ low: c.low, high: c.high }));
  return globalPaperWallet.updateStructuralTrailingStop(symbol, closedBars);
}
