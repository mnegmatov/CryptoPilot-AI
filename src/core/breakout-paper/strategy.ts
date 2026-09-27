import { Candle } from "../types";
import { calculateATR, calculateSMA } from "../quant/indicators";
import { BreakoutPosition, BreakoutSignal } from "./types";

export interface StrategyConfig {
  breakoutLookback: number;
  exitLookback: number;
  atrPeriod: number;
  atrMultiplier: number;
  minVolumeRatio: number;
  cooldownCandles: number;
  riskPerTradePercent: number;
  feeRate: number;
  slippageRate: number;
}

export const V2_AD_CONFIG: StrategyConfig = {
  breakoutLookback: 20,
  exitLookback: 10,
  atrPeriod: 14,
  atrMultiplier: 2.0,
  minVolumeRatio: 1.2,
  cooldownCandles: 5,
  riskPerTradePercent: 1.0,
  feeRate: 0.0005,      // 0.05%
  slippageRate: 0.0005, // 0.05%
};

export interface TechnicalLevels {
  hh20: number;
  ll20: number;
  hh10: number;
  ll10: number;
  atr14: number;
  volRatio: number;
  signal: BreakoutSignal | null;
}

/**
 * Evaluates V2-AD breakout rules strictly on completed 4H candles.
 * If an active position exists on this asset, any breakout is strictly ignored/discarded.
 */
export function evaluateBreakoutLevels(
  asset: string,
  completedCandles: Candle[],
  hasActivePosition: boolean,
  cooldownRemainingBars: number,
  config: StrategyConfig = V2_AD_CONFIG
): TechnicalLevels {
  const minRequiredCandles = Math.max(config.breakoutLookback + 5, config.atrPeriod + 5, 25);
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

  // Prior 10 candles including candle T for channel exit: index [n - 10, n)
  const prior10 = completedCandles.slice(n - config.exitLookback, n);
  const hh10 = Math.max(...prior10.map((c) => c.high));
  const ll10 = Math.min(...prior10.map((c) => c.low));

  // ATR(14)
  const atrSeries = calculateATR(completedCandles, config.atrPeriod);
  const atr14 = atrSeries[n - 1] || latestCompleted.close * 0.02;

  // Volume Ratio: T.volume / SMA20(volume of prior 20 candles including T)
  const volumeSlice = completedCandles.slice(n - config.breakoutLookback, n);
  const avgVol = volumeSlice.reduce((sum, c) => sum + c.volume, 0) / volumeSlice.length;
  const volRatio = avgVol > 0 ? latestCompleted.volume / avgVol : 1.0;

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

      const stopDist = config.atrMultiplier * atr14;
      // Expected entry is at T+1 OPEN (estimated at latestCompleted close if before open, or actual forming open)
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

  return {
    hh20,
    ll20,
    hh10,
    ll10,
    atr14,
    volRatio,
    signal,
  };
}

/**
 * Checks if active position should be exited on the latest completed candle close
 * or intra-candle price action.
 */
export function checkPositionExit(
  position: BreakoutPosition,
  latestCompleted: Candle,
  currentPrice: number,
  channelLevels: { hh10: number; ll10: number },
  config: StrategyConfig = V2_AD_CONFIG
): { shouldExit: boolean; exitPrice: number; exitReason: "STOP_LOSS" | "CHANNEL_EXIT" } | null {
  const isPostEntryCompletedCandle = latestCompleted.timestamp >= position.entryTimestamp;

  // 1. Stop Loss Check: against current market price, or completed candle extremes post-entry
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
