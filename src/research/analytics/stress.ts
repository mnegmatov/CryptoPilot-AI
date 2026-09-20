import { RawHistoricalCandle, ResearchConfig } from "../types";
import { runCausalModelDSimulation } from "../simulation/engine";
import { calculatePerformanceMetrics } from "./metrics";

export interface CostStressTierResult {
  tierName: "BASELINE" | "ADVERSE" | "SEVERE";
  description: string;
  takerFeeRate: number;
  slippageRate: number;
  roundTripPercent: number;
  netPnlPercent: number;
  finalEquity: number;
  profitFactor: number;
  winRate: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  totalTrades: number;
  totalFeesPaid: number;
  totalSlippagePaid: number;
}

export interface CostSensitivityMatrixResult {
  symbol: string;
  periodName: string;
  tiers: CostStressTierResult[];
  pnlDecayAdversePercent: number;
  pnlDecaySeverePercent: number;
  isViableUnderStress: boolean; // Retains positive net PnL under severe stress
}

export interface ParameterGridPoint {
  atrMultiplier: number;
  trailingWindowBars: number;
  riskPerTradePercent: number;
  isBaseline: boolean;
  netPnlPercent: number;
  finalEquity: number;
  profitFactor: number;
  winRate: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  totalTrades: number;
}

export interface ParameterNeighborhoodAnalysisResult {
  symbol: string;
  periodName: string;
  baseline: ParameterGridPoint;
  grid: ParameterGridPoint[];
  surfaceStats: {
    meanPnlPercent: number;
    minPnlPercent: number;
    maxPnlPercent: number;
    stdDevPnlPercent: number;
    coefficientOfVariation: number; // stdDev / |mean| (lower = flatter/more stable plateau)
    positiveRunsCount: number;
    totalRunsCount: number;
    isRobustPlateau: boolean;       // >70% positive runs and baseline within 1 std dev of mean
  };
}

/**
 * Evaluates Model D performance across 3 distinct transaction cost tiers:
 * 1. Baseline (0.10% round-trip: 0.05% fee + 0.05% slippage per side)
 * 2. Adverse (0.175% round-trip: 0.075% fee + 0.10% slippage per side)
 * 3. Severe Stress (0.30% round-trip: 0.10% fee + 0.20% slippage per side)
 */
export function runCostSensitivityMatrix(
  candles: RawHistoricalCandle[],
  baseConfig: ResearchConfig,
  periodName: "IN_SAMPLE" | "VALIDATION" | "OOS" | "FULL_MULTI_YEAR" = "IN_SAMPLE"
): CostSensitivityMatrixResult {
  const tiersConfig = [
    {
      tierName: "BASELINE" as const,
      description: "0.05% fee + 0.05% slippage per side (0.10% round-trip)",
      takerFeeRate: 0.0005,
      slippageRate: 0.0005,
      roundTripPercent: 0.1,
    },
    {
      tierName: "ADVERSE" as const,
      description: "0.075% fee + 0.10% slippage per side (0.175% round-trip)",
      takerFeeRate: 0.00075,
      slippageRate: 0.001,
      roundTripPercent: 0.175,
    },
    {
      tierName: "SEVERE" as const,
      description: "0.10% fee + 0.20% slippage per side (0.30% round-trip)",
      takerFeeRate: 0.001,
      slippageRate: 0.002,
      roundTripPercent: 0.3,
    },
  ];

  const results: CostStressTierResult[] = [];

  for (const t of tiersConfig) {
    const simConfig: ResearchConfig = {
      ...baseConfig,
      takerFeeRate: t.takerFeeRate,
      slippageRate: t.slippageRate,
    };

    const sim = runCausalModelDSimulation(candles, simConfig);
    const metrics = calculatePerformanceMetrics({
      asset: baseConfig.symbol,
      direction: baseConfig.direction,
      periodName,
      startDate: baseConfig.startDate,
      endDate: baseConfig.endDate,
      totalBars: candles.length,
      initialBalance: baseConfig.initialBalance,
      trades: sim.trades,
      equityCurve: sim.equityCurve,
    });

    const totalFeesPaid = sim.trades.reduce((sum, tr) => sum + tr.feePaid, 0);
    const totalSlippagePaid = sim.trades.reduce((sum, tr) => sum + tr.slippagePaid, 0);

    results.push({
      tierName: t.tierName,
      description: t.description,
      takerFeeRate: t.takerFeeRate,
      slippageRate: t.slippageRate,
      roundTripPercent: t.roundTripPercent,
      netPnlPercent: Number(metrics.netPnlPercent.toFixed(2)),
      finalEquity: Number(metrics.finalEquity.toFixed(2)),
      profitFactor: Number(metrics.profitFactor.toFixed(2)),
      winRate: Number(metrics.winRate.toFixed(1)),
      maxDrawdownPercent: Number(metrics.maxDrawdownPercent.toFixed(2)),
      sharpeRatio: metrics.sharpeRatio,
      totalTrades: metrics.totalTrades,
      totalFeesPaid: Number(totalFeesPaid.toFixed(2)),
      totalSlippagePaid: Number(totalSlippagePaid.toFixed(2)),
    });
  }

  const baselinePnl = results[0].netPnlPercent;
  const adversePnl = results[1].netPnlPercent;
  const severePnl = results[2].netPnlPercent;

  const pnlDecayAdversePercent =
    baselinePnl !== 0 ? Number((((baselinePnl - adversePnl) / Math.abs(baselinePnl)) * 100).toFixed(1)) : 0;
  const pnlDecaySeverePercent =
    baselinePnl !== 0 ? Number((((baselinePnl - severePnl) / Math.abs(baselinePnl)) * 100).toFixed(1)) : 0;

  return {
    symbol: baseConfig.symbol,
    periodName,
    tiers: results,
    pnlDecayAdversePercent,
    pnlDecaySeverePercent,
    isViableUnderStress: severePnl > 0,
  };
}

/**
 * Evaluates parameter neighborhood stability (sensitivity analysis, NOT optimization).
 * Tests adjacent parameter bands around official Model D parameters:
 * - atrMultiplier in [2.0, 2.25, 2.5, 2.75, 3.0]
 * - trailingWindowBars in [3, 4, 5, 6, 7]
 * - riskPerTradePercent in [0.5, 0.75, 1.0, 1.5]
 */
export function runParameterNeighborhoodAnalysis(
  candles: RawHistoricalCandle[],
  baseConfig: ResearchConfig,
  periodName: "IN_SAMPLE" | "VALIDATION" | "OOS" | "FULL_MULTI_YEAR" = "IN_SAMPLE"
): ParameterNeighborhoodAnalysisResult {
  const atrGrid = [2.0, 2.25, 2.5, 2.75, 3.0];
  const trailingGrid = [3, 4, 5, 6, 7];
  const riskGrid = [0.5, 0.75, 1.0, 1.5];

  const gridResults: ParameterGridPoint[] = [];
  let baselinePoint: ParameterGridPoint | null = null;

  for (const atr of atrGrid) {
    for (const tw of trailingGrid) {
      for (const risk of riskGrid) {
        const isBaseline = atr === 2.5 && tw === 5 && risk === 1.0;

        const simConfig: ResearchConfig = {
          ...baseConfig,
          atrMultiplier: atr,
          trailingWindowBars: tw,
          riskPerTradePercent: risk,
        };

        const sim = runCausalModelDSimulation(candles, simConfig);
        const metrics = calculatePerformanceMetrics({
          asset: baseConfig.symbol,
          direction: baseConfig.direction,
          periodName,
          startDate: baseConfig.startDate,
          endDate: baseConfig.endDate,
          totalBars: candles.length,
          initialBalance: baseConfig.initialBalance,
          trades: sim.trades,
          equityCurve: sim.equityCurve,
        });

        const point: ParameterGridPoint = {
          atrMultiplier: atr,
          trailingWindowBars: tw,
          riskPerTradePercent: risk,
          isBaseline,
          netPnlPercent: Number(metrics.netPnlPercent.toFixed(2)),
          finalEquity: Number(metrics.finalEquity.toFixed(2)),
          profitFactor: Number(metrics.profitFactor.toFixed(2)),
          winRate: Number(metrics.winRate.toFixed(1)),
          maxDrawdownPercent: Number(metrics.maxDrawdownPercent.toFixed(2)),
          sharpeRatio: metrics.sharpeRatio,
          totalTrades: metrics.totalTrades,
        };

        gridResults.push(point);
        if (isBaseline) {
          baselinePoint = point;
        }
      }
    }
  }

  if (!baselinePoint) {
    baselinePoint = gridResults[0];
  }

  // Statistical surface analysis
  const pnls = gridResults.map((p) => p.netPnlPercent);
  const n = pnls.length;
  const meanPnl = pnls.reduce((a, b) => a + b, 0) / n;
  const variance = pnls.reduce((sum, p) => sum + Math.pow(p - meanPnl, 2), 0) / (n - 1);
  const stdDev = Math.sqrt(variance);
  const cv = Math.abs(meanPnl) > 1e-6 ? stdDev / Math.abs(meanPnl) : 999;
  const positiveCount = pnls.filter((p) => p > 0).length;

  // Plateau check: baseline is within 1 standard deviation of mean, and majority of surface is profitable
  const isRobustPlateau =
    positiveCount / n >= 0.7 && Math.abs(baselinePoint.netPnlPercent - meanPnl) <= stdDev;

  return {
    symbol: baseConfig.symbol,
    periodName,
    baseline: baselinePoint,
    grid: gridResults,
    surfaceStats: {
      meanPnlPercent: Number(meanPnl.toFixed(2)),
      minPnlPercent: Number(Math.min(...pnls).toFixed(2)),
      maxPnlPercent: Number(Math.max(...pnls).toFixed(2)),
      stdDevPnlPercent: Number(stdDev.toFixed(2)),
      coefficientOfVariation: Number(cv.toFixed(2)),
      positiveRunsCount: positiveCount,
      totalRunsCount: n,
      isRobustPlateau,
    },
  };
}
