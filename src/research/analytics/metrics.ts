import { ResearchTrade, ResearchSummary, ResearchDirection } from "../types";

export interface ExtendedPerformanceMetrics extends ResearchSummary {
  ulcerIndex: number;
  bestTradePercent: number;
  worstTradePercent: number;
  monthlyReturns: { year: number; month: number; returnPercent: number }[];
  yearlyReturns: { year: number; returnPercent: number }[];
}

/**
 * Calculates comprehensive quantitative performance, risk, and attribution metrics
 * for a sequence of completed trades and mark-to-market equity curve.
 */
export function calculatePerformanceMetrics(params: {
  asset: string;
  direction: ResearchDirection;
  periodName: "IN_SAMPLE" | "VALIDATION" | "OOS" | "FULL_MULTI_YEAR";
  startDate: string;
  endDate: string;
  totalBars: number;
  initialBalance: number;
  trades: ResearchTrade[];
  equityCurve: { timestamp: number; equity: number; drawdownPercent: number }[];
  buyAndHoldReturnPercent?: number;
  emaTrendBenchmarkReturnPercent?: number;
}): ExtendedPerformanceMetrics {
  const {
    asset,
    direction,
    periodName,
    startDate,
    endDate,
    totalBars,
    initialBalance,
    trades,
    equityCurve,
    buyAndHoldReturnPercent = 0,
    emaTrendBenchmarkReturnPercent = 0,
  } = params;

  const finalEquity =
    equityCurve.length > 0
      ? equityCurve[equityCurve.length - 1].equity
      : initialBalance + trades.reduce((sum, t) => sum + t.pnlNet, 0);

  const netPnlDollar = finalEquity - initialBalance;
  const netPnlPercent = initialBalance > 0 ? (netPnlDollar / initialBalance) * 100 : 0;

  // Duration in years
  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();
  const durationMs = Math.max(endMs - startMs, (totalBars * 4 * 3600 * 1000));
  const durationYears = Math.max(durationMs / (365.25 * 24 * 3600 * 1000), 1 / 365.25);

  // CAGR calculation
  let cagr = 0;
  if (durationYears > 0) {
    if (finalEquity <= 0) {
      cagr = -100;
    } else {
      cagr = (Math.pow(finalEquity / initialBalance, 1 / durationYears) - 1) * 100;
    }
  }
  const annualizedReturn = cagr;

  // Trade Win/Loss Breakdown
  const totalTrades = trades.length;
  const winningTrades = trades.filter((t) => t.pnlNet > 0);
  const losingTrades = trades.filter((t) => t.pnlNet < 0);
  const winRate = totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0;

  const grossProfit = winningTrades.reduce((sum, t) => sum + t.pnlNet, 0);
  const grossLoss = losingTrades.reduce((sum, t) => sum + Math.abs(t.pnlNet), 0);
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999.99 : 0;

  const expectancyDollar = totalTrades > 0 ? netPnlDollar / totalTrades : 0;
  const totalR = trades.reduce((sum, t) => sum + t.rMultiple, 0);
  const expectancyR = totalTrades > 0 ? totalR / totalTrades : 0;

  const averageWinDollar = winningTrades.length > 0 ? grossProfit / winningTrades.length : 0;
  const averageLossDollar = losingTrades.length > 0 ? grossLoss / losingTrades.length : 0;
  const averageWinR =
    winningTrades.length > 0
      ? winningTrades.reduce((sum, t) => sum + t.rMultiple, 0) / winningTrades.length
      : 0;
  const averageLossR =
    losingTrades.length > 0
      ? losingTrades.reduce((sum, t) => sum + Math.abs(t.rMultiple), 0) / losingTrades.length
      : 0;

  const payoffRatio =
    averageLossDollar > 0 ? averageWinDollar / averageLossDollar : averageWinDollar > 0 ? 999.99 : 0;

  // Trade Return Percentiles & Extrema
  const returnPercents = trades.map((t) => t.returnPercent);
  const rMultiples = trades.map((t) => t.rMultiple);

  const bestTradeR = rMultiples.length > 0 ? Math.max(...rMultiples) : 0;
  const worstTradeR = rMultiples.length > 0 ? Math.min(...rMultiples) : 0;
  const bestTradePercent = returnPercents.length > 0 ? Math.max(...returnPercents) : 0;
  const worstTradePercent = returnPercents.length > 0 ? Math.min(...returnPercents) : 0;

  // Median Trade Return
  let medianTradeReturnPercent = 0;
  if (returnPercents.length > 0) {
    const sortedReturns = [...returnPercents].sort((a, b) => a - b);
    const mid = Math.floor(sortedReturns.length / 2);
    medianTradeReturnPercent =
      sortedReturns.length % 2 !== 0
        ? sortedReturns[mid]
        : (sortedReturns[mid - 1] + sortedReturns[mid]) / 2;
  }

  // Consecutive Streaks
  let curWins = 0;
  let maxConsecutiveWins = 0;
  let curLosses = 0;
  let maxConsecutiveLosses = 0;

  for (const t of trades) {
    if (t.pnlNet > 0) {
      curWins++;
      curLosses = 0;
      if (curWins > maxConsecutiveWins) maxConsecutiveWins = curWins;
    } else if (t.pnlNet < 0) {
      curLosses++;
      curWins = 0;
      if (curLosses > maxConsecutiveLosses) maxConsecutiveLosses = curLosses;
    } else {
      curWins = 0;
      curLosses = 0;
    }
  }

  // Outlier Skewness: Top 5 Trades Contribution to Total PnL
  let top5TradesPnlContributionPercent = 0;
  if (trades.length > 0) {
    const sortedByPnl = [...trades].sort((a, b) => b.pnlNet - a.pnlNet);
    const top5Count = Math.min(5, sortedByPnl.length);
    const top5Pnl = sortedByPnl.slice(0, top5Count).reduce((sum, t) => sum + t.pnlNet, 0);

    if (netPnlDollar > 0) {
      top5TradesPnlContributionPercent = (top5Pnl / netPnlDollar) * 100;
    } else {
      top5TradesPnlContributionPercent = (top5Pnl / initialBalance) * 100;
    }
  }

  // Holding Duration
  const holdingDurations = trades.map((t) => t.holdingHours);
  const averageHoldingHours =
    holdingDurations.length > 0
      ? holdingDurations.reduce((sum, h) => sum + h, 0) / holdingDurations.length
      : 0;

  let medianHoldingHours = 0;
  if (holdingDurations.length > 0) {
    const sortedH = [...holdingDurations].sort((a, b) => a - b);
    const mid = Math.floor(sortedH.length / 2);
    medianHoldingHours =
      sortedH.length % 2 !== 0 ? sortedH[mid] : (sortedH[mid - 1] + sortedH[mid]) / 2;
  }

  // Drawdown Analysis from Equity Curve
  let peak = initialBalance;
  let maxDrawdownPercent = 0;
  let maxDrawdownDollar = 0;
  let maxDrawdownDurationBars = 0;
  let currentDdDurationBars = 0;
  let sumSquaredDrawdowns = 0;

  if (equityCurve.length > 0) {
    for (const pt of equityCurve) {
      if (pt.equity >= peak) {
        peak = pt.equity;
        currentDdDurationBars = 0;
      } else {
        currentDdDurationBars++;
        if (currentDdDurationBars > maxDrawdownDurationBars) {
          maxDrawdownDurationBars = currentDdDurationBars;
        }
        const ddDollar = peak - pt.equity;
        const ddPct = (ddDollar / peak) * 100;
        if (ddDollar > maxDrawdownDollar) maxDrawdownDollar = ddDollar;
        if (ddPct > maxDrawdownPercent) maxDrawdownPercent = ddPct;
        sumSquaredDrawdowns += ddPct * ddPct;
      }
    }
  }
  const ulcerIndex =
    equityCurve.length > 0 ? Math.sqrt(sumSquaredDrawdowns / equityCurve.length) : 0;
  const maxDrawdownDurationDays = maxDrawdownDurationBars / 6; // 6 4H bars = 1 day

  // Annualized Sharpe & Sortino (Resampled Daily Returns)
  const { sharpeRatio, sortinoRatio } = calculateRiskRatios(equityCurve);

  // Calmar Ratio
  const calmarRatio =
    maxDrawdownPercent > 0 ? cagr / maxDrawdownPercent : cagr > 0 ? 999.99 : 0;

  // Monthly & Yearly Returns
  const { monthlyReturns, yearlyReturns } = calculateTemporalReturns(equityCurve);

  return {
    asset,
    direction,
    periodName,
    startDate,
    endDate,
    totalBars,
    initialBalance,
    finalEquity,
    netPnlPercent,
    cagr,
    annualizedReturn,
    totalTrades,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    winRate,
    profitFactor,
    expectancyDollar,
    expectancyR,
    averageWinDollar,
    averageLossDollar,
    averageWinR,
    averageLossR,
    payoffRatio,
    medianTradeReturnPercent,
    bestTradeR,
    worstTradeR,
    bestTradePercent,
    worstTradePercent,
    maxDrawdownPercent,
    maxDrawdownDollar,
    maxDrawdownDurationDays,
    ulcerIndex,
    sharpeRatio,
    sortinoRatio,
    calmarRatio,
    maxConsecutiveLosses,
    maxConsecutiveWins,
    top5TradesPnlContributionPercent,
    averageHoldingHours,
    medianHoldingHours,
    buyAndHoldReturnPercent,
    emaTrendBenchmarkReturnPercent,
    monthlyReturns,
    yearlyReturns,
  };
}

/**
 * Calculates Annualized Sharpe and Sortino ratios based on daily-resampled equity returns.
 * Assumes 0% risk-free rate.
 */
function calculateRiskRatios(
  equityCurve: { timestamp: number; equity: number }[]
): { sharpeRatio: number; sortinoRatio: number } {
  if (equityCurve.length < 2) {
    return { sharpeRatio: 0, sortinoRatio: 0 };
  }

  // Resample equity curve to 1D daily intervals (take last equity of each UTC calendar day)
  const dailyEquityMap = new Map<string, number>();
  for (const pt of equityCurve) {
    const dayKey = new Date(pt.timestamp).toISOString().split("T")[0];
    dailyEquityMap.set(dayKey, pt.equity);
  }

  const dailyEquities = Array.from(dailyEquityMap.values());
  if (dailyEquities.length < 2) {
    return { sharpeRatio: 0, sortinoRatio: 0 };
  }

  const dailyReturns: number[] = [];
  for (let i = 1; i < dailyEquities.length; i++) {
    const prev = dailyEquities[i - 1];
    const curr = dailyEquities[i];
    dailyReturns.push((curr - prev) / (prev || 1));
  }

  const n = dailyReturns.length;
  if (n === 0) return { sharpeRatio: 0, sortinoRatio: 0 };

  const meanReturn = dailyReturns.reduce((sum, r) => sum + r, 0) / n;

  // Standard Deviation
  const variance =
    dailyReturns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / (n > 1 ? n - 1 : 1);
  const stdDev = Math.sqrt(variance);

  // Downside Deviation (semi-variance, only negative returns)
  const downsideVariance =
    dailyReturns.reduce((sum, r) => sum + (r < 0 ? Math.pow(r, 2) : 0), 0) / (n > 1 ? n - 1 : 1);
  const downsideStdDev = Math.sqrt(downsideVariance);

  const annualFactor = Math.sqrt(365.25);
  const sharpeRatio = stdDev > 1e-8 ? (meanReturn / stdDev) * annualFactor : 0;
  const sortinoRatio = downsideStdDev > 1e-8 ? (meanReturn / downsideStdDev) * annualFactor : 0;

  return {
    sharpeRatio: Number(sharpeRatio.toFixed(2)),
    sortinoRatio: Number(sortinoRatio.toFixed(2)),
  };
}

/**
 * Calculates Monthly and Yearly compound returns from an equity curve.
 */
function calculateTemporalReturns(equityCurve: { timestamp: number; equity: number }[]): {
  monthlyReturns: { year: number; month: number; returnPercent: number }[];
  yearlyReturns: { year: number; returnPercent: number }[];
} {
  if (equityCurve.length < 2) {
    return { monthlyReturns: [], yearlyReturns: [] };
  }

  // Group by Month (YYYY-MM) and Year (YYYY)
  const monthMap = new Map<string, { first: number; last: number; year: number; month: number }>();
  const yearMap = new Map<number, { first: number; last: number }>();

  for (const pt of equityCurve) {
    const d = new Date(pt.timestamp);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const mKey = `${y}-${String(m).padStart(2, "0")}`;

    // Month
    if (!monthMap.has(mKey)) {
      monthMap.set(mKey, { first: pt.equity, last: pt.equity, year: y, month: m });
    } else {
      monthMap.get(mKey)!.last = pt.equity;
    }

    // Year
    if (!yearMap.has(y)) {
      yearMap.set(y, { first: pt.equity, last: pt.equity });
    } else {
      yearMap.get(y)!.last = pt.equity;
    }
  }

  const monthlyReturns = Array.from(monthMap.values()).map((entry) => ({
    year: entry.year,
    month: entry.month,
    returnPercent: Number((((entry.last - entry.first) / (entry.first || 1)) * 100).toFixed(2)),
  }));

  const yearlyReturns = Array.from(yearMap.entries()).map(([year, entry]) => ({
    year,
    returnPercent: Number((((entry.last - entry.first) / (entry.first || 1)) * 100).toFixed(2)),
  }));

  return { monthlyReturns, yearlyReturns };
}
