import path from "path";
import fs from "fs";
import { RawHistoricalCandle, ResearchConfig } from "../types";
import { loadDatasetFromCsv } from "../data/loader";
import { splitChronologicalDataset } from "../data/splitter";
import { runCausalModelDSimulation } from "./engine";
import { runBuyAndHoldBenchmark, runEmaTrendBenchmark } from "./benchmarks";
import { calculatePerformanceMetrics, ExtendedPerformanceMetrics } from "../analytics/metrics";
import {
  classifyCandleRegimes,
  attributePerformanceByRegime,
  MarketRegimeAttribution,
} from "../analytics/regime";
import {
  runCostSensitivityMatrix,
  runParameterNeighborhoodAnalysis,
  CostSensitivityMatrixResult,
  ParameterNeighborhoodAnalysisResult,
} from "../analytics/stress";
import { runMonteCarloResampling, MonteCarloResult } from "../analytics/monte-carlo";

export interface PartitionEvaluationResult {
  asset: string;
  partitionName: "IN_SAMPLE" | "VALIDATION" | "OOS" | "FULL_MULTI_YEAR";
  startDate: string;
  endDate: string;
  candleCount: number;

  // Official Baseline: Long-Only
  longOnlyBaseline: {
    metrics: ExtendedPerformanceMetrics;
    regimeAttribution: MarketRegimeAttribution;
    costSensitivity: CostSensitivityMatrixResult;
    parameterNeighborhood: ParameterNeighborhoodAnalysisResult;
    monteCarlo: MonteCarloResult;
  };

  // Secondary Research: Long + Short
  longShortComparison: {
    metrics: ExtendedPerformanceMetrics;
    regimeAttribution: MarketRegimeAttribution;
    monteCarlo: MonteCarloResult;
  };

  // Benchmarks
  benchmarks: {
    buyAndHoldReturnPercent: number;
    buyAndHoldMaxDrawdownPercent: number;
    emaDualTrendReturnPercent: number;
    emaDualTrendMaxDrawdownPercent: number;
    emaDualTrendTradesCount: number;
  };
}

export interface Phase3Telemetry {
  generatedAt: string;
  note: string;
  inSampleResults: Record<string, PartitionEvaluationResult>;
  validationResults: Record<string, PartitionEvaluationResult>;
}

export interface Phase4OosTelemetry {
  generatedAt: string;
  note: string;
  oosResults: Record<string, PartitionEvaluationResult>;
  fullMultiYearResults: Record<string, PartitionEvaluationResult>;
}

/**
 * Runs evaluation for a single partition and asset under strictly frozen Model D parameters.
 */
function evaluatePartition(
  candles: RawHistoricalCandle[],
  symbol: string,
  partitionName: "IN_SAMPLE" | "VALIDATION" | "OOS" | "FULL_MULTI_YEAR",
  startDate: string,
  endDate: string
): PartitionEvaluationResult {
  const baseConfig: ResearchConfig = {
    symbol,
    timeframe: "4h",
    startDate,
    endDate,
    initialBalance: 10000,
    riskPerTradePercent: 1.0,
    direction: "LONG_ONLY",
    takerFeeRate: 0.0005,
    slippageRate: 0.0005,
    atrMultiplier: 2.5,
    trailingWindowBars: 5,
    maxStopLossDistancePercent: 6.0,
    splits: {
      devEnd: "2023-07-01",
      valEnd: "2024-10-01",
    },
  };

  // 1. Benchmarks
  const bh = runBuyAndHoldBenchmark(candles, 10000);
  const emaTrend = runEmaTrendBenchmark(candles, 10000);

  // 2. Classify Candle Regimes
  const candleRegimes = classifyCandleRegimes(candles);

  // 3. Official Baseline: Model D Long-Only
  const longOnlySim = runCausalModelDSimulation(candles, baseConfig);
  const longOnlyMetrics = calculatePerformanceMetrics({
    asset: symbol,
    direction: "LONG_ONLY",
    periodName: partitionName,
    startDate,
    endDate,
    totalBars: candles.length,
    initialBalance: baseConfig.initialBalance,
    trades: longOnlySim.trades,
    equityCurve: longOnlySim.equityCurve,
    buyAndHoldReturnPercent: bh.returnPercent,
    emaTrendBenchmarkReturnPercent: emaTrend.returnPercent,
  });
  const longOnlyRegimes = attributePerformanceByRegime(longOnlySim.trades, candleRegimes);
  const longOnlyCost = runCostSensitivityMatrix(candles, baseConfig, partitionName);
  const longOnlyParamNeighborhood = runParameterNeighborhoodAnalysis(candles, baseConfig, partitionName);
  const longOnlyMonteCarlo = runMonteCarloResampling(longOnlySim.trades, baseConfig.initialBalance, 5000, 42);

  // 4. Secondary Comparison: Model D Long + Short
  const longShortConfig: ResearchConfig = { ...baseConfig, direction: "LONG_SHORT" };
  const longShortSim = runCausalModelDSimulation(candles, longShortConfig);
  const longShortMetrics = calculatePerformanceMetrics({
    asset: symbol,
    direction: "LONG_SHORT",
    periodName: partitionName,
    startDate,
    endDate,
    totalBars: candles.length,
    initialBalance: baseConfig.initialBalance,
    trades: longShortSim.trades,
    equityCurve: longShortSim.equityCurve,
    buyAndHoldReturnPercent: bh.returnPercent,
    emaTrendBenchmarkReturnPercent: emaTrend.returnPercent,
  });
  const longShortRegimes = attributePerformanceByRegime(longShortSim.trades, candleRegimes);
  const longShortMonteCarlo = runMonteCarloResampling(longShortSim.trades, baseConfig.initialBalance, 5000, 42);

  return {
    asset: symbol,
    partitionName,
    startDate,
    endDate,
    candleCount: candles.length,
    longOnlyBaseline: {
      metrics: longOnlyMetrics,
      regimeAttribution: longOnlyRegimes,
      costSensitivity: longOnlyCost,
      parameterNeighborhood: longOnlyParamNeighborhood,
      monteCarlo: longOnlyMonteCarlo,
    },
    longShortComparison: {
      metrics: longShortMetrics,
      regimeAttribution: longShortRegimes,
      monteCarlo: longShortMonteCarlo,
    },
    benchmarks: {
      buyAndHoldReturnPercent: bh.returnPercent,
      buyAndHoldMaxDrawdownPercent: bh.maxDrawdownPercent,
      emaDualTrendReturnPercent: emaTrend.returnPercent,
      emaDualTrendMaxDrawdownPercent: emaTrend.maxDrawdownPercent,
      emaDualTrendTradesCount: emaTrend.tradesCount || 0,
    },
  };
}

/**
 * Executes Phase 3 evaluations strictly across In-Sample (Dev) and Validation partitions.
 * Final OOS holdout remains completely sealed and untouched.
 */
export function runDevAndValidationEvaluations(): Phase3Telemetry {
  const dataDir = path.resolve(process.cwd(), "data/historical");
  const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

  const inSampleResults: Record<string, PartitionEvaluationResult> = {};
  const validationResults: Record<string, PartitionEvaluationResult> = {};

  for (const symbol of symbols) {
    const csvPath = path.join(dataDir, `${symbol}_4h_2021_present.csv`);
    if (!fs.existsSync(csvPath)) {
      throw new Error(`Historical data file not found: ${csvPath}. Run ingestion first.`);
    }

    const { candles: allCandles } = loadDatasetFromCsv(csvPath);
    const splits = splitChronologicalDataset(allCandles);

    // Evaluate In-Sample (Dev)
    inSampleResults[symbol] = evaluatePartition(
      splits.inSample,
      symbol,
      "IN_SAMPLE",
      splits.boundaries.devStart,
      splits.boundaries.devEnd
    );

    // Evaluate Validation
    validationResults[symbol] = evaluatePartition(
      splits.validation,
      symbol,
      "VALIDATION",
      splits.boundaries.valStart,
      splits.boundaries.valEnd
    );
  }

  const telemetry: Phase3Telemetry = {
    generatedAt: new Date().toISOString(),
    note: "Strict In-Sample (Dev) and Validation evaluation under frozen Model D parameters. Final OOS holdout remains sealed.",
    inSampleResults,
    validationResults,
  };

  const outPath = path.resolve(process.cwd(), "data/research_dev_val_telemetry.json");
  fs.writeFileSync(outPath, JSON.stringify(telemetry, null, 2), "utf8");

  return telemetry;
}

/**
 * Phase 4: Unseals and executes the Final Out-of-Sample (OOS: 2024-10-01 to Present)
 * and Full Multi-Year stress evaluations under frozen Model D parameters.
 */
export function runFinalOosEvaluations(): Phase4OosTelemetry {
  const dataDir = path.resolve(process.cwd(), "data/historical");
  const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

  const oosResults: Record<string, PartitionEvaluationResult> = {};
  const fullMultiYearResults: Record<string, PartitionEvaluationResult> = {};

  for (const symbol of symbols) {
    const csvPath = path.join(dataDir, `${symbol}_4h_2021_present.csv`);
    if (!fs.existsSync(csvPath)) {
      throw new Error(`Historical data file not found: ${csvPath}. Run ingestion first.`);
    }

    const { candles: allCandles } = loadDatasetFromCsv(csvPath);
    const splits = splitChronologicalDataset(allCandles);

    // 1. Evaluate Unsealed Final OOS Holdout (2024-10-01 to Present)
    oosResults[symbol] = evaluatePartition(
      splits.oosHoldout,
      symbol,
      "OOS",
      splits.boundaries.oosStart,
      splits.boundaries.oosEnd
    );

    // 2. Evaluate Full Multi-Year Series (2021 to Present)
    const fullStart = new Date(allCandles[0].timestamp).toISOString().split("T")[0];
    const fullEnd = new Date(allCandles[allCandles.length - 1].timestamp).toISOString().split("T")[0];
    fullMultiYearResults[symbol] = evaluatePartition(
      allCandles,
      symbol,
      "FULL_MULTI_YEAR",
      fullStart,
      fullEnd
    );
  }

  const telemetry: Phase4OosTelemetry = {
    generatedAt: new Date().toISOString(),
    note: "Unsealed Final Out-of-Sample (OOS) and Full Multi-Year evaluation under strictly frozen Model D parameters. Zero parameter optimization.",
    oosResults,
    fullMultiYearResults,
  };

  const outPath = path.resolve(process.cwd(), "data/research_final_oos_telemetry.json");
  fs.writeFileSync(outPath, JSON.stringify(telemetry, null, 2), "utf8");

  return telemetry;
}
