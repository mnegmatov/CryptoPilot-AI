import { Candle, MarketStructure } from "../types";
import { calculateEMA } from "./indicators";

export interface PivotPoint {
  index: number;
  timestamp: number;
  price: number;
  type: "HIGH" | "LOW";
}

/**
 * Finds local swing highs and swing lows across candlestick history
 */
export function identifyPivots(candles: Candle[], lookback: number = 4): PivotPoint[] {
  const pivots: PivotPoint[] = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    const currentHigh = candles[i].high;
    const currentLow = candles[i].low;

    let isHigh = true;
    let isLow = true;

    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (candles[j].high >= currentHigh) isHigh = false;
      if (candles[j].low <= currentLow) isLow = false;
    }

    if (isHigh) {
      pivots.push({
        index: i,
        timestamp: candles[i].timestamp,
        price: currentHigh,
        type: "HIGH",
      });
    }
    if (isLow) {
      pivots.push({
        index: i,
        timestamp: candles[i].timestamp,
        price: currentLow,
        type: "LOW",
      });
    }
  }

  return pivots;
}

/**
 * Detects liquidity sweeps where market wick grabs stops beyond previous swing level
 * but closes back within the structural range with rejection volume.
 */
export function detectLiquiditySweeps(
  candles: Candle[],
  pivots: PivotPoint[]
): MarketStructure["liquiditySweep"] | undefined {
  if (candles.length < 10 || pivots.length < 2) return undefined;

  const lastCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2];
  const recentSlice = candles.slice(-5);

  const swingHighs = pivots.filter((p) => p.type === "HIGH");
  const swingLows = pivots.filter((p) => p.type === "LOW");

  const lastHigh = swingHighs[swingHighs.length - 1];
  const lastLow = swingLows[swingLows.length - 1];

  // Check Bearish Sweep (Liquidity grab above high followed by strong rejection)
  if (lastHigh && lastHigh.index < candles.length - 1) {
    for (const c of recentSlice) {
      if (c.high > lastHigh.price && c.close < lastHigh.price) {
        return {
          type: "BEARISH_SWEEP",
          level: lastHigh.price,
          timestamp: c.timestamp,
        };
      }
    }
  }

  // Check Bullish Sweep (Liquidity grab below low followed by strong reclaim)
  if (lastLow && lastLow.index < candles.length - 1) {
    for (const c of recentSlice) {
      if (c.low < lastLow.price && c.close > lastLow.price) {
        return {
          type: "BULLISH_SWEEP",
          level: lastLow.price,
          timestamp: c.timestamp,
        };
      }
    }
  }

  return undefined;
}

/**
 * Detects failed breakouts (bull traps and bear traps)
 */
export function detectFailedBreakouts(
  candles: Candle[],
  pivots: PivotPoint[]
): MarketStructure["failedBreakout"] | undefined {
  if (candles.length < 8 || pivots.length < 2) return undefined;

  const swingHighs = pivots.filter((p) => p.type === "HIGH");
  const swingLows = pivots.filter((p) => p.type === "LOW");

  const lastHigh = swingHighs[swingHighs.length - 1];
  const lastLow = swingLows[swingLows.length - 1];

  const c1 = candles[candles.length - 2];
  const c0 = candles[candles.length - 1];

  if (lastHigh && c1.close > lastHigh.price && c0.close < lastHigh.price) {
    return {
      type: "BULL_TRAP",
      level: lastHigh.price,
      timestamp: c0.timestamp,
    };
  }

  if (lastLow && c1.close < lastLow.price && c0.close > lastLow.price) {
    return {
      type: "BEAR_TRAP",
      level: lastLow.price,
      timestamp: c0.timestamp,
    };
  }

  return undefined;
}

/**
 * Analyzes market structure: Higher Highs / Lower Lows, Break of Structure, Key S/R, Liquidity Sweeps
 */
export function analyzeMarketStructure(
  candles: Candle[],
  candlesHTF?: Candle[]
): MarketStructure {
  const pivots = identifyPivots(candles, 4);
  const currentPrice = candles[candles.length - 1].close;

  const swingHighs = pivots.filter((p) => p.type === "HIGH");
  const swingLows = pivots.filter((p) => p.type === "LOW");

  const lastHigh =
    swingHighs[swingHighs.length - 1]?.price ||
    Math.max(...candles.slice(-20).map((c) => c.high));
  const prevHigh = swingHighs[swingHighs.length - 2]?.price || lastHigh;

  const lastLow =
    swingLows[swingLows.length - 1]?.price ||
    Math.min(...candles.slice(-20).map((c) => c.low));
  const prevLow = swingLows[swingLows.length - 2]?.price || lastLow;

  // Determine Lower Timeframe (LTF) structure
  let trendLTF: MarketStructure["trendLTF"] = "RANGING";
  let structureState: MarketStructure["structureState"] = "CONSOLIDATION";

  if (lastHigh > prevHigh && lastLow > prevLow) {
    trendLTF = "BULLISH";
    structureState = "HIGHER_HIGHS";
  } else if (lastHigh < prevHigh && lastLow < prevLow) {
    trendLTF = "BEARISH";
    structureState = "LOWER_LOWS";
  } else if (currentPrice > lastHigh) {
    trendLTF = "BULLISH";
    structureState = "BREAK_OF_STRUCTURE";
  } else if (currentPrice < lastLow) {
    trendLTF = "BEARISH";
    structureState = "BREAK_OF_STRUCTURE";
  }

  // Determine Higher Timeframe (HTF) structure if available
  let trendHTF: MarketStructure["trendHTF"] = trendLTF;
  let htfEma200: number | undefined = undefined;
  let htfPriceAboveEma200: boolean | undefined = undefined;

  if (candlesHTF && candlesHTF.length >= 10) {
    const htfCloses = candlesHTF.map((c) => c.close);
    const emaPeriod = Math.min(200, htfCloses.length);
    const emaValues = calculateEMA(htfCloses, emaPeriod);
    const latestEma = emaValues[emaValues.length - 1];
    const latestHtfClose = htfCloses[htfCloses.length - 1];

    if (!isNaN(latestEma)) {
      htfEma200 = Number(latestEma.toFixed(2));
      htfPriceAboveEma200 = latestHtfClose > latestEma;
    }

    if (candlesHTF.length >= 30) {
      const htfPivots = identifyPivots(candlesHTF, 4);
      const htfHighs = htfPivots.filter((p) => p.type === "HIGH");
      const htfLows = htfPivots.filter((p) => p.type === "LOW");
      const htfLastHigh =
        htfHighs[htfHighs.length - 1]?.price ||
        candlesHTF[candlesHTF.length - 1].high;
      const htfPrevHigh = htfHighs[htfHighs.length - 2]?.price || htfLastHigh;
      const htfLastLow =
        htfLows[htfLows.length - 1]?.price ||
        candlesHTF[candlesHTF.length - 1].low;
      const htfPrevLow = htfLows[htfLows.length - 2]?.price || htfLastLow;

      if (htfLastHigh >= htfPrevHigh && htfLastLow >= htfPrevLow) {
        trendHTF = "BULLISH";
      } else if (htfLastHigh <= htfPrevHigh && htfLastLow <= htfPrevLow) {
        trendHTF = "BEARISH";
      } else {
        trendHTF = "RANGING";
      }
    }
  }

  // Find nearest horizontal Support & Resistance clusters
  const lowLevels = swingLows.map((p) => p.price).filter((p) => p < currentPrice);
  const highLevels = swingHighs.map((p) => p.price).filter((p) => p > currentPrice);

  const keySupport = lowLevels.length > 0 ? Math.max(...lowLevels) : currentPrice * 0.96;
  const keyResistance = highLevels.length > 0 ? Math.min(...highLevels) : currentPrice * 1.05;

  const liquiditySweep = detectLiquiditySweeps(candles, pivots);
  const failedBreakout = detectFailedBreakouts(candles, pivots);

  return {
    trendHTF,
    trendLTF,
    swingHigh: Number(lastHigh.toFixed(2)),
    swingLow: Number(lastLow.toFixed(2)),
    keySupport: Number(keySupport.toFixed(2)),
    keyResistance: Number(keyResistance.toFixed(2)),
    structureState,
    htfEma200,
    htfPriceAboveEma200,
    liquiditySweep,
    failedBreakout,
  };
}
