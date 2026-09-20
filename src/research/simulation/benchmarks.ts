import { RawHistoricalCandle } from "../types";
import { calculateEMA } from "../../core/quant/indicators";

export interface BenchmarkResult {
  benchmarkType: "BUY_AND_HOLD" | "EMA_20_50_DUAL_TREND";
  initialBalance: number;
  finalEquity: number;
  returnPercent: number;
  maxDrawdownPercent: number;
  tradesCount?: number;
  equityCurve: { timestamp: number; equity: number }[];
}

/**
 * Executes Buy & Hold Benchmark over exact same historical candle window.
 * - Allocates 100% of balance at Open(0).
 * - Tracks equity continuously at Close(i).
 */
export function runBuyAndHoldBenchmark(
  candles: RawHistoricalCandle[],
  initialBalance: number = 10000,
  takerFeeRate: number = 0.0005,
  slippageRate: number = 0.0005
): BenchmarkResult {
  if (candles.length === 0) {
    return {
      benchmarkType: "BUY_AND_HOLD",
      initialBalance,
      finalEquity: initialBalance,
      returnPercent: 0,
      maxDrawdownPercent: 0,
      equityCurve: [],
    };
  }

  const initialEntryPrice = candles[0].open * (1 + slippageRate);
  const feePaidEntry = initialBalance * takerFeeRate;
  const netCapital = initialBalance - feePaidEntry;
  const units = netCapital / initialEntryPrice;

  let peakEquity = initialBalance;
  let maxDrawdownPercent = 0;
  const equityCurve: { timestamp: number; equity: number }[] = [];

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const rawValue = units * c.close;
    // On the final bar, deduct exit fee and slippage to be completely realistic
    const isLast = i === candles.length - 1;
    const finalExitPrice = isLast ? c.close * (1 - slippageRate) : c.close;
    const exitFee = isLast ? (units * finalExitPrice) * takerFeeRate : 0;
    const currentEquity = units * finalExitPrice - exitFee;

    if (currentEquity > peakEquity) {
      peakEquity = currentEquity;
    }
    const currentDd = ((peakEquity - currentEquity) / peakEquity) * 100;
    if (currentDd > maxDrawdownPercent) {
      maxDrawdownPercent = currentDd;
    }

    equityCurve.push({
      timestamp: c.timestamp,
      equity: currentEquity,
    });
  }

  const finalEquity = equityCurve[equityCurve.length - 1].equity;
  const returnPercent = ((finalEquity - initialBalance) / initialBalance) * 100;

  return {
    benchmarkType: "BUY_AND_HOLD",
    initialBalance,
    finalEquity,
    returnPercent,
    maxDrawdownPercent,
    equityCurve,
  };
}

/**
 * Executes EMA 20/50 Dual Trend Benchmark over exact same historical candle window.
 * - Point-in-time causal: Signal evaluated on Bar T-1 close.
 * - Long when EMA20 > EMA50.
 * - Flat / Cash when EMA20 <= EMA50.
 * - Entry/Exit occurs at Bar T Open with fee and slippage.
 */
export function runEmaTrendBenchmark(
  candles: RawHistoricalCandle[],
  initialBalance: number = 10000,
  takerFeeRate: number = 0.0005,
  slippageRate: number = 0.0005
): BenchmarkResult {
  if (candles.length < 55) {
    return {
      benchmarkType: "EMA_20_50_DUAL_TREND",
      initialBalance,
      finalEquity: initialBalance,
      returnPercent: 0,
      maxDrawdownPercent: 0,
      tradesCount: 0,
      equityCurve: [],
    };
  }

  const closes = candles.map((c) => c.close);
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);

  let cash = initialBalance;
  let units = 0;
  let inPosition = false;
  let peakEquity = initialBalance;
  let maxDrawdownPercent = 0;
  let tradesCount = 0;
  const equityCurve: { timestamp: number; equity: number }[] = [];

  for (let i = 50; i < candles.length; i++) {
    const prevEma20 = ema20[i - 1];
    const prevEma50 = ema50[i - 1];
    const currentBar = candles[i];

    // Signal on bar i - 1
    const wantLong = !isNaN(prevEma20) && !isNaN(prevEma50) && prevEma20 > prevEma50;

    // Execute transitions on currentBar Open
    if (wantLong && !inPosition) {
      // Enter Long
      const fillPrice = currentBar.open * (1 + slippageRate);
      const fee = cash * takerFeeRate;
      const capital = cash - fee;
      units = capital / fillPrice;
      cash = 0;
      inPosition = true;
      tradesCount++;
    } else if (!wantLong && inPosition) {
      // Exit to Cash
      const fillPrice = currentBar.open * (1 - slippageRate);
      const gross = units * fillPrice;
      const fee = gross * takerFeeRate;
      cash = gross - fee;
      units = 0;
      inPosition = false;
    }

    // Equity at bar Close
    const currentEquity = inPosition ? units * currentBar.close : cash;
    if (currentEquity > peakEquity) {
      peakEquity = currentEquity;
    }
    const currentDd = ((peakEquity - currentEquity) / peakEquity) * 100;
    if (currentDd > maxDrawdownPercent) {
      maxDrawdownPercent = currentDd;
    }

    equityCurve.push({
      timestamp: currentBar.timestamp,
      equity: currentEquity,
    });
  }

  // Close open position on the final bar
  if (inPosition && candles.length > 0) {
    const lastBar = candles[candles.length - 1];
    const fillPrice = lastBar.close * (1 - slippageRate);
    const gross = units * fillPrice;
    const fee = gross * takerFeeRate;
    cash = gross - fee;
    units = 0;
  }

  const finalEquity = cash;
  const returnPercent = ((finalEquity - initialBalance) / initialBalance) * 100;

  return {
    benchmarkType: "EMA_20_50_DUAL_TREND",
    initialBalance,
    finalEquity,
    returnPercent,
    maxDrawdownPercent,
    tradesCount,
    equityCurve,
  };
}
