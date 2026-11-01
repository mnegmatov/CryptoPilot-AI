import { Candle } from "../types";
import { calculateATR, calculateSMA, calculateEMA, calculateADX } from "../quant/indicators";
import { BreakoutPosition, BreakoutSignal } from "./types";

export interface V3StrategyConfig {
  breakoutLookback: number;
  exitLookback: number;
  atrPeriod: number;
  atrMultiplier: number;
  minVolumeRatio: number;
  cooldownCandles: number;
  riskPerTradePercent: number;
  feeRate: number;
  slippageRate: number;
  /** ADX(14) must be >= this threshold for a valid regime */
  adxThreshold: number;
  /** EMA period for directional filter */
  emaPeriod: number;
}

export const V3_CONFIG: V3StrategyConfig = {
  breakoutLookback: 20,
  exitLookback: 10,
  atrPeriod: 14,
  atrMultiplier: 2.2,        // V3 experimental: wider stop than V2's 2.0
  minVolumeRatio: 1.2,
  cooldownCandles: 5,
  riskPerTradePercent: 1.0,
  feeRate: 0.0005,            // 0.05%
  slippageRate: 0.0005,        // 0.05%
  adxThreshold: 25,            // ADX >= 25 → trending market
  emaPeriod: 50,               // EMA(50) directional alignment
};

export interface V3TechnicalLevels {
  hh20: number;
  ll20: number;
  hh10: number;
  ll10: number;
  atr14: number;
  volRatio: number;
  adx14: number;
  ema50: number;
  ema50Prev: number;
  signal: BreakoutSignal | null;
}

/**
 * Evaluates V3 breakout rules on completed 4H candles.
 *
 * Key differences from V2-AD:
 * 1. FIXED Channel Exit: prior10 uses candles BEFORE candle T, NOT including T.
 * 2. ADX(14) Regime Filter: requires ADX >= adxThreshold.
 * 3. EMA(50) Directional Filter: LONG requires close > EMA50 AND EMA50 rising;
 *    SHORT requires close < EMA50 AND EMA50 falling.
 * 4. ATR multiplier 2.2 (experimental).
 */
export function evaluateBreakoutLevelsV3(
  asset: string,
  completedCandles: Candle[],
  hasActivePosition: boolean,
  cooldownRemainingBars: number,
  config: V3StrategyConfig = V3_CONFIG
): V3TechnicalLevels {
  const minRequiredCandles = Math.max(
    config.breakoutLookback + 5,
    config.atrPeriod + 5,
    config.emaPeriod + 5,    // Need enough candles for EMA(50) to be meaningful
    config.atrPeriod * 2 + 5, // Need enough for ADX(14) which needs 2*period
    25
  );
  if (completedCandles.length < minRequiredCandles) {
    throw new Error(
      `Insufficient completed candles for ${asset}: received ${completedCandles.length}, required >= ${minRequiredCandles}`
    );
  }

  const n = completedCandles.length;
  const latestCompleted = completedCandles[n - 1]; // Candle T

  // Prior 20 candles BEFORE candle T: index [n - 1 - 20, n - 1)
  const prior20 = completedCandles.slice(n - 1 - config.breakoutLookback, n - 1);
  const hh20 = Math.max(...prior20.map((c) => c.high));
  const ll20 = Math.min(...prior20.map((c) => c.low));

  // ===== FIXED CHANNEL EXIT =====
  // Prior 10 candles BEFORE candle T (NOT including T): index [n - 1 - exitLookback, n - 1)
  // This is the critical fix: V2-AD used slice(n - exitLookback, n) which included candle T,
  // making close < ll10 impossible because ll10 included T's own low.
  const prior10 = completedCandles.slice(n - 1 - config.exitLookback, n - 1);
  const hh10 = Math.max(...prior10.map((c) => c.high));
  const ll10 = Math.min(...prior10.map((c) => c.low));

  // ATR(14) via Wilder's smoothing
  const atrSeries = calculateATR(completedCandles, config.atrPeriod);
  const atr14 = atrSeries[n - 1] || latestCompleted.close * 0.02;

  // Volume Ratio: T.volume / SMA20(volume of prior 20 candles including T)
  const volumeSlice = completedCandles.slice(n - config.breakoutLookback, n);
  const avgVol = volumeSlice.reduce((sum, c) => sum + c.volume, 0) / volumeSlice.length;
  const volRatio = avgVol > 0 ? latestCompleted.volume / avgVol : 1.0;

  // ===== NEW: ADX(14) Regime Filter =====
  const adxData = calculateADX(completedCandles, config.atrPeriod);
  const adx14 = adxData.adx[n - 1] || 20;

  // ===== NEW: EMA(50) Directional Filter =====
  const closes = completedCandles.map((c) => c.close);
  const emaSeries = calculateEMA(closes, config.emaPeriod);
  const ema50 = emaSeries[n - 1] || latestCompleted.close;
  const ema50Prev = emaSeries[n - 2] || ema50;

  let signal: BreakoutSignal | null = null;

  // Rule: If an active position exists or cooldown is active, IGNORE/DISCARD breakout
  if (!hasActivePosition && cooldownRemainingBars <= 0) {
    const isUp = latestCompleted.high > hh20;
    const isDown = latestCompleted.low < ll20;

    if ((isUp || isDown) && volRatio >= config.minVolumeRatio) {
      let direction: "LONG" | "SHORT" = isUp ? "LONG" : "SHORT";
      let breakoutLevel = isUp ? hh20 : ll20;

      if (isUp && isDown) {
        const mid = (hh20 + ll20) / 2;
        direction = latestCompleted.close >= mid ? "LONG" : "SHORT";
        breakoutLevel = direction === "LONG" ? hh20 : ll20;
      }

      // ===== NEW: Regime Filter =====
      // 1. ADX must be >= threshold (strong trend)
      const adxPass = adx14 >= config.adxThreshold;

      // 2. EMA(50) directional alignment
      //    LONG:  close > EMA50 AND EMA50 is rising (current > previous)
      //    SHORT: close < EMA50 AND EMA50 is falling (current < previous)
      let emaPass = false;
      if (direction === "LONG") {
        emaPass = latestCompleted.close > ema50 && ema50 > ema50Prev;
      } else {
        emaPass = latestCompleted.close < ema50 && ema50 < ema50Prev;
      }

      if (adxPass && emaPass) {
        const stopDist = config.atrMultiplier * atr14;
        const estimatedEntryPrice = latestCompleted.close;
        const stopPrice =
          direction === "LONG"
            ? estimatedEntryPrice - stopDist
            : estimatedEntryPrice + stopDist;

        signal = {
          asset,
          direction,
          breakoutTimestamp: latestCompleted.timestamp,
          breakoutLevel,
          atr: atr14,
          volRatio,
          expectedEntryPrice: estimatedEntryPrice,
          stopPrice,
          status: "ACTIVE",
        };
      }
    }
  }

  return {
    hh20,
    ll20,
    hh10,
    ll10,
    atr14,
    volRatio,
    adx14,
    ema50,
    ema50Prev,
    signal,
  };
}

/**
 * Checks if active position should be exited.
 * Uses the FIXED channel exit levels (prior10 excludes candle T).
 *
 * Stop Loss has priority: if both stop and channel exit trigger on the same candle,
 * the stop loss is taken (checked first).
 */
export function checkPositionExitV3(
  position: BreakoutPosition,
  latestCompleted: Candle,
  currentPrice: number,
  channelLevels: { hh10: number; ll10: number },
  config: V3StrategyConfig = V3_CONFIG
): { shouldExit: boolean; exitPrice: number; exitReason: "STOP_LOSS" | "CHANNEL_EXIT" } | null {
  const isPostEntryCompletedCandle = latestCompleted.timestamp >= position.entryTimestamp;

  // 1. Stop Loss Check (PRIORITY): against current market price, or completed candle extremes post-entry
  if (position.direction === "LONG") {
    const isStopHit =
      currentPrice <= position.stopPrice ||
      (isPostEntryCompletedCandle && latestCompleted.low <= position.stopPrice);

    if (isStopHit) {
      const exitBase = Math.min(position.stopPrice, currentPrice);
      return {
        shouldExit: true,
        exitPrice: exitBase * (1 - config.slippageRate),
        exitReason: "STOP_LOSS",
      };
    }
  } else {
    const isStopHit =
      currentPrice >= position.stopPrice ||
      (isPostEntryCompletedCandle && latestCompleted.high >= position.stopPrice);

    if (isStopHit) {
      const exitBase = Math.max(position.stopPrice, currentPrice);
      return {
        shouldExit: true,
        exitPrice: exitBase * (1 + config.slippageRate),
        exitReason: "STOP_LOSS",
      };
    }
  }

  // 2. Channel Exit: opposite 10-candle channel evaluated on completed candle close
  // Only valid if held past entry bar
  if (latestCompleted.timestamp > position.entryTimestamp) {
    if (position.direction === "LONG" && latestCompleted.close < channelLevels.ll10) {
      return {
        shouldExit: true,
        exitPrice: latestCompleted.close * (1 - config.slippageRate),
        exitReason: "CHANNEL_EXIT",
      };
    } else if (position.direction === "SHORT" && latestCompleted.close > channelLevels.hh10) {
      return {
        shouldExit: true,
        exitPrice: latestCompleted.close * (1 + config.slippageRate),
        exitReason: "CHANNEL_EXIT",
      };
    }
  }

  return null;
}
