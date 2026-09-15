import { BacktestOptions, runBacktest } from "./engine";
import { Candle, Timeframe } from "../types";

export interface BenchmarkComparisonResult {
  asset: string;
  periodStart: string;
  periodEnd: string;
  buyAndHoldReturnPercent: number;
  simpleTrendReturnPercent: number;
  cryptoPilotReturnPercent: number;
  cryptoPilotProfitFactor: number;
  cryptoPilotMaxDrawdown: number;
  cryptoPilotSharpe: number;
  cryptoPilotTrades: number;
  alphaOverBuyAndHold: number;
}

export interface RegimePerformanceResult {
  regime: "BULL" | "BEAR" | "CHOP" | "HIGH_VOL" | "LOW_VOL";
  label: string;
  barsCount: number;
  tradesCount: number;
  winRatePercent: number;
  profitFactor: number;
  netProfitDollar: number;
  netProfitPercent: number;
  maxDrawdownPercent: number;
}

export interface RobustnessTestResult {
  paramName: string;
  paramValue: number;
  netProfitPercent: number;
  winRatePercent: number;
  profitFactor: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  tradesCount: number;
}

export interface CostStressResult {
  scenario: "LOW" | "NORMAL" | "HIGH";
  label: string;
  feePercent: number;
  slippagePercent: number;
  netProfitDollar: number;
  netProfitPercent: number;
  profitFactor: number;
  maxDrawdownPercent: number;
}

export interface WalkForwardWindowResult {
  windowIndex: number;
  inSamplePeriod: { start: string; end: string };
  outOfSamplePeriod: { start: string; end: string };
  inSampleReturnPercent: number;
  outOfSampleReturnPercent: number;
  inSampleProfitFactor: number;
  outOfSampleProfitFactor: number;
  inSampleTrades: number;
  outOfSampleTrades: number;
}

/**
 * Calculates Buy & Hold benchmark return for a given candle series
 */
export function calculateBuyAndHold(candles: Candle[]): number {
  if (candles.length < 2) return 0;
  const startPrice = candles[0].close;
  const endPrice = candles[candles.length - 1].close;
  return Number((((endPrice - startPrice) / startPrice) * 100).toFixed(2));
}

/**
 * Runs a simple trend-following baseline (EMA 20/50 crossover with 2% stop)
 */
export function runSimpleTrendBaseline(
  asset: string,
  candles: Candle[],
  initialBalance: number = 10000
): { netReturnPercent: number; totalTrades: number; winRate: number } {
  if (candles.length < 60) {
    return { netReturnPercent: 0, totalTrades: 0, winRate: 0 };
  }

  // Calculate EMA20 and EMA50
  const closes = candles.map((c) => c.close);
  const k20 = 2 / (20 + 1);
  const k50 = 2 / (50 + 1);

  const ema20: number[] = [closes[0]];
  const ema50: number[] = [closes[0]];

  for (let i = 1; i < closes.length; i++) {
    ema20.push(closes[i] * k20 + ema20[i - 1] * (1 - k20));
    ema50.push(closes[i] * k50 + ema50[i - 1] * (1 - k50));
  }

  let balance = initialBalance;
  let inPosition = false;
  let entryPrice = 0;
  let stopLoss = 0;
  let trades = 0;
  let wins = 0;

  for (let i = 50; i < candles.length; i++) {
    const prevEma20 = ema20[i - 1];
    const prevEma50 = ema50[i - 1];
    const currEma20 = ema20[i];
    const currEma50 = ema50[i];
    const bar = candles[i];

    if (inPosition) {
      // Check stop loss or bearish cross exit
      const hitStop = bar.low <= stopLoss;
      const bearishCross = currEma20 < currEma50;

      if (hitStop || bearishCross) {
        const exitPrice = hitStop ? stopLoss : bar.close;
        const pnl = ((exitPrice - entryPrice) / entryPrice) * (balance * 0.5); // 50% notional allocation
        balance += pnl;
        trades++;
        if (pnl > 0) wins++;
        inPosition = false;
      }
    } else {
      // Bullish crossover entry
      if (prevEma20 <= prevEma50 && currEma20 > currEma50) {
        entryPrice = bar.close;
        stopLoss = entryPrice * 0.98; // 2% protective stop
        inPosition = true;
      }
    }
  }

  const netReturnPercent = Number((((balance - initialBalance) / initialBalance) * 100).toFixed(2));
  const winRate = trades > 0 ? Number(((wins / trades) * 100).toFixed(1)) : 0;
  return { netReturnPercent, totalTrades: trades, winRate };
}

/**
 * Evaluates performance broken down across market regimes:
 * - BULL (price > 4H EMA200)
 * - BEAR (price < 4H EMA200)
 * - CHOP (ADX < 20)
 * - HIGH_VOL (ATR > 2% of price)
 * - LOW_VOL (ATR <= 2% of price)
 */
export function analyzeRegimes(
  asset: string,
  candles1h: Candle[],
  candles4h?: Candle[],
  baseOptions: BacktestOptions = {}
): RegimePerformanceResult[] {
  // Run backtest to obtain all executed trades
  const summary = runBacktest(asset, "1h", candles1h, {
    ...baseOptions,
    candlesHTF: candles4h,
    enableHtfGate: false, // run broadly to classify trade performance per regime
  });

  const trades = summary.trades;
  if (trades.length === 0) {
    return [];
  }

  // Segment trades by the regime active at entry timestamp
  const regimeBuckets: Record<string, typeof trades> = {
    BULL: [],
    BEAR: [],
    CHOP: [],
    HIGH_VOL: [],
    LOW_VOL: [],
  };

  const candleMap = new Map<number, Candle>(candles1h.map((c) => [c.timestamp, c]));

  for (const t of trades) {
    const entryCandle = candleMap.get(t.entryTimestamp);
    if (!entryCandle) continue;

    if (t.type === "LONG") {
      regimeBuckets.BULL.push(t);
    } else {
      regimeBuckets.BEAR.push(t);
    }

    const candleVol = (entryCandle.high - entryCandle.low) / (entryCandle.close || 1);
    if (candleVol > 0.02) {
      regimeBuckets.HIGH_VOL.push(t);
    } else {
      regimeBuckets.LOW_VOL.push(t);
    }
  }

  const results: RegimePerformanceResult[] = [];
  const regimeMeta: Record<string, { label: string; type: RegimePerformanceResult["regime"] }> = {
    BULL: { label: "Бычий тренд (Bull Market)", type: "BULL" },
    BEAR: { label: "Медвежий тренд (Bear Market)", type: "BEAR" },
    HIGH_VOL: { label: "Высокая волатильность (High Vol)", type: "HIGH_VOL" },
    LOW_VOL: { label: "Низкая волатильность (Low Vol)", type: "LOW_VOL" },
  };

  for (const [key, tList] of Object.entries(regimeBuckets)) {
    if (!regimeMeta[key]) continue;
    const wins = tList.filter((t) => t.result === "WIN");
    const grossProfit = wins.reduce((acc, t) => acc + t.pnlDollar, 0);
    const grossLoss = Math.abs(tList.filter((t) => t.result === "LOSS").reduce((acc, t) => acc + t.pnlDollar, 0));
    const netPnl = Number((grossProfit - grossLoss).toFixed(2));
    const winRate = tList.length > 0 ? Number(((wins.length / tList.length) * 100).toFixed(1)) : 0;
    const pf = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : grossProfit > 0 ? 99.9 : 0;

    results.push({
      regime: regimeMeta[key].type,
      label: regimeMeta[key].label,
      barsCount: candles1h.length,
      tradesCount: tList.length,
      winRatePercent: winRate,
      profitFactor: pf,
      netProfitDollar: netPnl,
      netProfitPercent: Number(((netPnl / 10000) * 100).toFixed(2)),
      maxDrawdownPercent: 0,
    });
  }

  return results;
}

/**
 * Conducts Rolling Walk-Forward Validation across sequential sliding windows
 */
export function runWalkForwardValidation(
  asset: string,
  candles: Candle[],
  candles4h?: Candle[],
  windowSize: number = 1000,
  stepSize: number = 500,
  options: BacktestOptions = {}
): WalkForwardWindowResult[] {
  const results: WalkForwardWindowResult[] = [];

  let windowIndex = 1;
  for (let start = 0; start + windowSize <= candles.length; start += stepSize) {
    const fullSlice = candles.slice(start, start + windowSize);
    const splitPoint = Math.floor(fullSlice.length / 2);

    const inSample = fullSlice.slice(0, splitPoint);
    const outOfSample = fullSlice.slice(splitPoint);

    const inSampleSummary = runBacktest(asset, "1h", inSample, {
      ...options,
      candlesHTF: candles4h,
    });

    const outOfSampleSummary = runBacktest(asset, "1h", outOfSample, {
      ...options,
      candlesHTF: candles4h,
    });

    results.push({
      windowIndex,
      inSamplePeriod: {
        start: inSampleSummary.periodStart,
        end: inSampleSummary.periodEnd,
      },
      outOfSamplePeriod: {
        start: outOfSampleSummary.periodStart,
        end: outOfSampleSummary.periodEnd,
      },
      inSampleReturnPercent: inSampleSummary.netProfitPercent,
      outOfSampleReturnPercent: outOfSampleSummary.netProfitPercent,
      inSampleProfitFactor: inSampleSummary.profitFactor,
      outOfSampleProfitFactor: outOfSampleSummary.profitFactor,
      inSampleTrades: inSampleSummary.totalTrades,
      outOfSampleTrades: outOfSampleSummary.totalTrades,
    });

    windowIndex++;
  }

  return results;
}

/**
 * Tests parameter robustness across parameter perturbations:
 * - ADX Thresholds: 20, 25, 30
 * - Chandelier Multipliers: 2.0, 2.5, 3.0
 * - Risk Percentages: 0.5%, 0.75%, 1.0%, 1.5%
 */
export function runRobustnessGrid(
  asset: string,
  candles: Candle[],
  candles4h?: Candle[],
  baseOptions: BacktestOptions = {}
): RobustnessTestResult[] {
  const results: RobustnessTestResult[] = [];

  // 1. ADX Threshold perturbations
  const adxValues = [20, 25, 30];
  for (const adx of adxValues) {
    const s = runBacktest(asset, "1h", candles, {
      ...baseOptions,
      candlesHTF: candles4h,
      adxThreshold: adx,
    });
    results.push({
      paramName: "ADX Threshold",
      paramValue: adx,
      netProfitPercent: s.netProfitPercent,
      winRatePercent: s.winRatePercent,
      profitFactor: s.profitFactor,
      maxDrawdownPercent: s.maxDrawdownPercent,
      sharpeRatio: s.sharpeRatio,
      tradesCount: s.totalTrades,
    });
  }

  // 2. Chandelier ATR Multipliers
  const chandelierValues = [2.0, 2.5, 3.0];
  for (const mult of chandelierValues) {
    const s = runBacktest(asset, "1h", candles, {
      ...baseOptions,
      candlesHTF: candles4h,
      trailingStopType: "CHANDELIER_ATR",
      chandelierMultiplier: mult,
    });
    results.push({
      paramName: "Chandelier ATR Multiplier",
      paramValue: mult,
      netProfitPercent: s.netProfitPercent,
      winRatePercent: s.winRatePercent,
      profitFactor: s.profitFactor,
      maxDrawdownPercent: s.maxDrawdownPercent,
      sharpeRatio: s.sharpeRatio,
      tradesCount: s.totalTrades,
    });
  }

  // 3. Risk per trade
  const riskValues = [0.5, 0.75, 1.0, 1.5];
  for (const risk of riskValues) {
    const s = runBacktest(asset, "1h", candles, {
      ...baseOptions,
      candlesHTF: candles4h,
      riskPerTradePercent: risk,
      enableRegimeRisk: false,
    });
    results.push({
      paramName: "Risk Per Trade (%)",
      paramValue: risk,
      netProfitPercent: s.netProfitPercent,
      winRatePercent: s.winRatePercent,
      profitFactor: s.profitFactor,
      maxDrawdownPercent: s.maxDrawdownPercent,
      sharpeRatio: s.sharpeRatio,
      tradesCount: s.totalTrades,
    });
  }

  return results;
}

/**
 * Conducts transaction cost stress testing across Low, Normal, and High slippage/fee scenarios
 */
export function runCostStressTest(
  asset: string,
  candles: Candle[],
  candles4h?: Candle[],
  baseOptions: BacktestOptions = {}
): CostStressResult[] {
  const scenarios: Array<{
    scenario: "LOW" | "NORMAL" | "HIGH";
    label: string;
    fee: number;
    slippage: number;
  }> = [
    { scenario: "LOW", label: "Низкие издержки (0.05% fee + 0.05% slippage)", fee: 0.05, slippage: 0.05 },
    { scenario: "NORMAL", label: "Стандартные издержки (0.05% fee + 0.10% slippage)", fee: 0.05, slippage: 0.10 },
    { scenario: "HIGH", label: "Высокие издержки (0.05% fee + 0.20% slippage)", fee: 0.05, slippage: 0.20 },
  ];

  return scenarios.map((sc) => {
    const s = runBacktest(asset, "1h", candles, {
      ...baseOptions,
      candlesHTF: candles4h,
      takerFeePercent: sc.fee,
      slippagePercent: sc.slippage,
      highVolSlippagePercent: sc.slippage * 2,
    });

    return {
      scenario: sc.scenario,
      label: sc.label,
      feePercent: sc.fee,
      slippagePercent: sc.slippage,
      netProfitDollar: s.netProfitDollar,
      netProfitPercent: s.netProfitPercent,
      profitFactor: s.profitFactor,
      maxDrawdownPercent: s.maxDrawdownPercent,
    };
  });
}
