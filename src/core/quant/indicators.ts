import { Candle, TechnicalIndicators } from "../types";

/**
 * Calculates Simple Moving Average (SMA)
 */
export function calculateSMA(values: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
      continue;
    }
    const slice = values.slice(i - period + 1, i + 1);
    const sum = slice.reduce((acc, val) => acc + val, 0);
    result.push(sum / period);
  }
  return result;
}

/**
 * Calculates Exponential Moving Average (EMA)
 */
export function calculateEMA(values: number[], period: number): number[] {
  const result: number[] = [];
  const multiplier = 2 / (period + 1);

  let initialSMA = 0;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
      initialSMA += values[i];
      continue;
    }
    if (i === period - 1) {
      initialSMA = (initialSMA + values[i]) / period;
      result.push(initialSMA);
      continue;
    }

    const currentEMA = (values[i] - result[i - 1]) * multiplier + result[i - 1];
    result.push(currentEMA);
  }
  return result;
}

/**
 * Calculates Relative Strength Index (RSI) using Wilder's Smoothing
 */
export function calculateRSI(values: number[], period: number = 14): number[] {
  const result: number[] = [];
  if (values.length <= period) return values.map(() => 50);

  const changes: number[] = [];
  for (let i = 1; i < values.length; i++) {
    changes.push(values[i] - values[i - 1]);
  }

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 0; i < period; i++) {
    if (changes[i] >= 0) {
      avgGain += changes[i];
    } else {
      avgLoss += Math.abs(changes[i]);
    }
  }

  avgGain /= period;
  avgLoss /= period;

  // First RSI value is at index `period`
  for (let i = 0; i < period; i++) {
    result.push(NaN);
  }

  const initialRS = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result.push(100 - 100 / (1 + initialRS));

  for (let i = period; i < changes.length; i++) {
    const change = changes[i];
    const gain = change >= 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      result.push(100);
    } else {
      const rs = avgGain / avgLoss;
      result.push(100 - 100 / (1 + rs));
    }
  }

  return result;
}

/**
 * Calculates Average True Range (ATR)
 */
export function calculateATR(candles: Candle[], period: number = 14): number[] {
  const tr: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      tr.push(candles[i].high - candles[i].low);
      continue;
    }
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;

    const trueRange = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    tr.push(trueRange);
  }

  // Smooth TR with Wilder's method
  const atr: number[] = [];
  let currentATR = 0;

  for (let i = 0; i < tr.length; i++) {
    if (i < period - 1) {
      atr.push(NaN);
      currentATR += tr[i];
      continue;
    }
    if (i === period - 1) {
      currentATR = (currentATR + tr[i]) / period;
      atr.push(currentATR);
      continue;
    }

    currentATR = (currentATR * (period - 1) + tr[i]) / period;
    atr.push(currentATR);
  }

  return atr;
}

/**
 * Calculates MACD (Moving Average Convergence Divergence)
 */
export function calculateMACD(
  values: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): {
  macdLine: number[];
  signalLine: number[];
  histogram: number[];
} {
  const fastEMA = calculateEMA(values, fastPeriod);
  const slowEMA = calculateEMA(values, slowPeriod);

  const macdLine: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (isNaN(fastEMA[i]) || isNaN(slowEMA[i])) {
      macdLine.push(NaN);
    } else {
      macdLine.push(fastEMA[i] - slowEMA[i]);
    }
  }

  // Signal line is EMA of MACD line
  const validMacdValues = macdLine.filter((v) => !isNaN(v));
  const validSignal = calculateEMA(validMacdValues, signalPeriod);

  // Re-align signal line with full length
  const signalLine: number[] = [];
  const offset = values.length - validSignal.length;
  for (let i = 0; i < values.length; i++) {
    if (i < offset) {
      signalLine.push(NaN);
    } else {
      signalLine.push(validSignal[i - offset]);
    }
  }

  const histogram: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (isNaN(macdLine[i]) || isNaN(signalLine[i])) {
      histogram.push(NaN);
    } else {
      histogram.push(macdLine[i] - signalLine[i]);
    }
  }

  return { macdLine, signalLine, histogram };
}

/**
 * Calculates Bollinger Bands (20, 2)
 */
export function calculateBollingerBands(
  values: number[],
  period: number = 20,
  multiplier: number = 2
): {
  upper: number[];
  middle: number[];
  lower: number[];
  bandwidth: number[];
} {
  const middle = calculateSMA(values, period);
  const upper: number[] = [];
  const lower: number[] = [];
  const bandwidth: number[] = [];

  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      upper.push(NaN);
      lower.push(NaN);
      bandwidth.push(NaN);
      continue;
    }

    const slice = values.slice(i - period + 1, i + 1);
    const mean = middle[i];
    const variance =
      slice.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    const up = mean + multiplier * stdDev;
    const low = mean - multiplier * stdDev;
    upper.push(up);
    lower.push(low);
    bandwidth.push(mean === 0 ? 0 : ((up - low) / mean) * 100);
  }

  return { upper, middle, lower, bandwidth };
}

/**
 * Calculates Volume-Weighted Average Price (VWAP)
 */
export function calculateVWAP(candles: Candle[]): number {
  let cumulativeTypicalPriceVolume = 0;
  let cumulativeVolume = 0;

  // Use last 48 bars for intraday VWAP reference
  const window = candles.slice(-48);
  for (const c of window) {
    const typicalPrice = (c.high + c.low + c.close) / 3;
    cumulativeTypicalPriceVolume += typicalPrice * c.volume;
    cumulativeVolume += c.volume;
  }

  return cumulativeVolume === 0
    ? candles[candles.length - 1].close
    : cumulativeTypicalPriceVolume / cumulativeVolume;
}

/**
 * Calculates Average Directional Index (ADX) with +DI and -DI using Wilder's Smoothing
 */
export function calculateADX(
  candles: Candle[],
  period: number = 14
): {
  adx: number[];
  plusDI: number[];
  minusDI: number[];
} {
  const n = candles.length;
  const adx: number[] = new Array(n).fill(NaN);
  const plusDI: number[] = new Array(n).fill(NaN);
  const minusDI: number[] = new Array(n).fill(NaN);

  if (n <= period * 2) {
    return {
      adx: adx.fill(20),
      plusDI: plusDI.fill(25),
      minusDI: minusDI.fill(25),
    };
  }

  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];

  for (let i = 0; i < n; i++) {
    if (i === 0) {
      tr.push(candles[i].high - candles[i].low);
      plusDM.push(0);
      minusDM.push(0);
      continue;
    }

    const high = candles[i].high;
    const low = candles[i].low;
    const prevHigh = candles[i - 1].high;
    const prevLow = candles[i - 1].low;
    const prevClose = candles[i - 1].close;

    const currentTR = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    tr.push(currentTR);

    const upMove = high - prevHigh;
    const downMove = prevLow - low;

    if (upMove > downMove && upMove > 0) {
      plusDM.push(upMove);
    } else {
      plusDM.push(0);
    }

    if (downMove > upMove && downMove > 0) {
      minusDM.push(downMove);
    } else {
      minusDM.push(0);
    }
  }

  let smoothTR = 0;
  let smoothPlusDM = 0;
  let smoothMinusDM = 0;

  for (let i = 0; i < period; i++) {
    smoothTR += tr[i];
    smoothPlusDM += plusDM[i];
    smoothMinusDM += minusDM[i];
  }

  const dxValues: number[] = [];

  for (let i = period; i < n; i++) {
    if (i > period) {
      smoothTR = smoothTR - smoothTR / period + tr[i];
      smoothPlusDM = smoothPlusDM - smoothPlusDM / period + plusDM[i];
      smoothMinusDM = smoothMinusDM - smoothMinusDM / period + minusDM[i];
    }

    const pDI = smoothTR === 0 ? 0 : (smoothPlusDM / smoothTR) * 100;
    const mDI = smoothTR === 0 ? 0 : (smoothMinusDM / smoothTR) * 100;

    plusDI[i] = pDI;
    minusDI[i] = mDI;

    const diSum = pDI + mDI;
    const dx = diSum === 0 ? 0 : (Math.abs(pDI - mDI) / diSum) * 100;
    dxValues.push(dx);

    if (dxValues.length === period) {
      const initialADX = dxValues.reduce((a, b) => a + b, 0) / period;
      adx[i] = initialADX;
    } else if (dxValues.length > period) {
      const prevADX = adx[i - 1];
      adx[i] = (prevADX * (period - 1) + dx) / period;
    }
  }

  return { adx, plusDI, minusDI };
}

/**
 * Computes all technical indicators for current bar
 */
export function extractTechnicalIndicators(candles: Candle[]): TechnicalIndicators {
  if (candles.length < 50) {
    throw new Error("Insufficient candles to compute indicators (minimum 50 required)");
  }

  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);
  const currentPrice = closes[closes.length - 1];

  const ema20Arr = calculateEMA(closes, 20);
  const ema50Arr = calculateEMA(closes, 50);
  const ema200Arr = calculateEMA(closes, Math.min(200, closes.length - 1));
  const rsiArr = calculateRSI(closes, 14);
  const atrArr = calculateATR(candles, 14);
  const macdData = calculateMACD(closes);
  const bbData = calculateBollingerBands(closes, 20, 2);
  const vwap = calculateVWAP(candles);
  const adxData = calculateADX(candles, 14);

  const lastIdx = closes.length - 1;
  const currentRsi = rsiArr[lastIdx] ?? 50;

  // Detect RSI state & simple divergence
  let rsiState: TechnicalIndicators["rsiState"] = "NEUTRAL";
  if (currentRsi <= 30) rsiState = "OVERSOLD";
  else if (currentRsi >= 70) rsiState = "OVERBOUGHT";
  else if (
    currentPrice < closes[lastIdx - 10] &&
    currentRsi > (rsiArr[lastIdx - 10] ?? 50)
  ) {
    rsiState = "BULLISH_DIVERGENCE";
  } else if (
    currentPrice > closes[lastIdx - 10] &&
    currentRsi < (rsiArr[lastIdx - 10] ?? 50)
  ) {
    rsiState = "BEARISH_DIVERGENCE";
  }

  // MACD trend
  const currHist = macdData.histogram[lastIdx] ?? 0;
  const prevHist = macdData.histogram[lastIdx - 1] ?? 0;
  let macdTrend: TechnicalIndicators["macd"]["trend"] = "BULLISH";
  if (prevHist < 0 && currHist >= 0) macdTrend = "BULLISH_CROSS";
  else if (prevHist > 0 && currHist <= 0) macdTrend = "BEARISH_CROSS";
  else if (currHist < 0) macdTrend = "BEARISH";

  // Volume ratio
  const volSMA = calculateSMA(volumes, 20);
  const currentVol = volumes[lastIdx];
  const avgVol = volSMA[lastIdx] || currentVol;
  const volumeRatio20 = avgVol > 0 ? currentVol / avgVol : 1.0;

  const currentAdx = adxData.adx[lastIdx] || 20;
  const currentPlusDI = adxData.plusDI[lastIdx] || 25;
  const currentMinusDI = adxData.minusDI[lastIdx] || 25;

  return {
    currentPrice,
    ema20: ema20Arr[lastIdx] ?? currentPrice,
    ema50: ema50Arr[lastIdx] ?? currentPrice,
    ema200: ema200Arr[lastIdx] ?? currentPrice,
    rsi14: Number(currentRsi.toFixed(2)),
    rsiState,
    macd: {
      macdLine: Number((macdData.macdLine[lastIdx] ?? 0).toFixed(4)),
      signalLine: Number((macdData.signalLine[lastIdx] ?? 0).toFixed(4)),
      histogram: Number(currHist.toFixed(4)),
      trend: macdTrend,
    },
    adx14: Number(currentAdx.toFixed(2)),
    plusDI: Number(currentPlusDI.toFixed(2)),
    minusDI: Number(currentMinusDI.toFixed(2)),
    atr14: Number((atrArr[lastIdx] ?? (currentPrice * 0.02)).toFixed(4)),
    bollingerBands: {
      upper: Number((bbData.upper[lastIdx] ?? currentPrice * 1.05).toFixed(2)),
      middle: Number((bbData.middle[lastIdx] ?? currentPrice).toFixed(2)),
      lower: Number((bbData.lower[lastIdx] ?? currentPrice * 0.95).toFixed(2)),
      bandwidth: Number((bbData.bandwidth[lastIdx] ?? 5).toFixed(2)),
    },
    volumeRatio20: Number(volumeRatio20.toFixed(2)),
    vwap: Number(vwap.toFixed(2)),
  };
}
