import { ResearchTrade } from "../types";

export interface MonteCarloResult {
  iterations: number;
  tradeCount: number;
  initialBalance: number;
  medianFinalEquity: number;
  p5FinalEquity: number;
  p95FinalEquity: number;
  medianMaxDrawdownPercent: number;
  p95MaxDrawdownPercent: number; // 95% Value-at-Risk Max Drawdown
  p99MaxDrawdownPercent: number; // 99% Value-at-Risk Max Drawdown
  probNegativeReturnPercent: number;
}

/**
 * Pseudo-random number generator (Mulberry32) for reproducible Monte Carlo runs.
 */
function createSeededRandom(seed: number) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Monte Carlo trade sequence resampling engine.
 * Samples trade returns with replacement to simulate alternate sequence paths.
 *
 * @param trades Completed trades from backtest simulation.
 * @param initialBalance Starting account balance.
 * @param iterations Number of resampling paths (default: 5,000).
 * @param seed Optional seed for determinism.
 */
export function runMonteCarloResampling(
  trades: ResearchTrade[],
  initialBalance: number = 10000,
  iterations: number = 5000,
  seed?: number
): MonteCarloResult {
  const n = trades.length;

  if (n === 0) {
    return {
      iterations,
      tradeCount: 0,
      initialBalance,
      medianFinalEquity: initialBalance,
      p5FinalEquity: initialBalance,
      p95FinalEquity: initialBalance,
      medianMaxDrawdownPercent: 0,
      p95MaxDrawdownPercent: 0,
      p99MaxDrawdownPercent: 0,
      probNegativeReturnPercent: 0,
    };
  }

  const random = seed !== undefined ? createSeededRandom(seed) : Math.random;
  const pnlList = trades.map((t) => t.pnlNet);

  const finalEquities: number[] = new Array(iterations);
  const maxDrawdowns: number[] = new Array(iterations);
  let negativeReturnCount = 0;

  for (let iter = 0; iter < iterations; iter++) {
    let equity = initialBalance;
    let peak = initialBalance;
    let maxDd = 0;

    for (let step = 0; step < n; step++) {
      const idx = Math.floor(random() * n);
      const pnl = pnlList[idx];
      equity += pnl;

      if (equity > peak) {
        peak = equity;
      } else {
        const dd = ((peak - equity) / peak) * 100;
        if (dd > maxDd) {
          maxDd = dd;
        }
      }
    }

    finalEquities[iter] = equity;
    maxDrawdowns[iter] = maxDd;

    if (equity < initialBalance) {
      negativeReturnCount++;
    }
  }

  finalEquities.sort((a, b) => a - b);
  maxDrawdowns.sort((a, b) => a - b);

  const idxMedian = Math.floor(iterations * 0.5);
  const idxP5 = Math.floor(iterations * 0.05);
  const idxP95 = Math.floor(iterations * 0.95);
  const idxP99 = Math.floor(iterations * 0.99);

  return {
    iterations,
    tradeCount: n,
    initialBalance,
    medianFinalEquity: Number(finalEquities[idxMedian].toFixed(2)),
    p5FinalEquity: Number(finalEquities[idxP5].toFixed(2)),
    p95FinalEquity: Number(finalEquities[idxP95].toFixed(2)),
    medianMaxDrawdownPercent: Number(maxDrawdowns[idxMedian].toFixed(2)),
    p95MaxDrawdownPercent: Number(maxDrawdowns[idxP95].toFixed(2)),
    p99MaxDrawdownPercent: Number(maxDrawdowns[idxP99].toFixed(2)),
    probNegativeReturnPercent: Number(((negativeReturnCount / iterations) * 100).toFixed(2)),
  };
}
