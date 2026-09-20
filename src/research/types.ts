/**
 * Independent research types for Multi-Year Model D Research & Validation.
 * Decoupled from production runtime types.
 */

export interface RawHistoricalCandle {
  timestamp: number;     // Open timestamp (ms)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;    // Close timestamp (ms)
  quoteVolume: number;
  tradesCount: number;
  takerBuyVolume: number;
  takerBuyQuoteVolume: number;
}

export type ResearchDirection = "LONG_ONLY" | "LONG_SHORT";

export interface ResearchConfig {
  symbol: string;
  timeframe: "4h";
  startDate: string;                    // e.g. "2021-01-01"
  endDate: string;                      // e.g. "2026-09-19"
  initialBalance: number;               // default: 10,000 USD
  riskPerTradePercent: number;          // baseline: 1.0%
  direction: ResearchDirection;         // Baseline: LONG_ONLY
  
  // Execution Cost Parameters
  takerFeeRate: number;                 // baseline: 0.0005 (0.05%)
  slippageRate: number;                 // baseline: 0.0005 (0.05%)
  
  // Model D Fixed Parameters (Immutable Baseline)
  atrMultiplier: number;                // default: 2.5
  trailingWindowBars: number;           // default: 5
  maxStopLossDistancePercent: number;   // default: 6.0%

  // Chronological Split Boundaries
  splits: {
    devEnd: string;                     // "2023-06-30"
    valEnd: string;                     // "2024-09-30"
  };
}

export interface MarketRegimeClassification {
  trend: "BULL" | "BEAR" | "CHOP";
  volatility: "HIGH" | "NORMAL" | "LOW";
  adx14: number;
  ema200DistancePercent: number;
}

export interface ResearchTrade {
  id: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  entryBarIndex: number;
  entryTimestamp: number;
  entryPrice: number;
  initialStopLoss: number;
  currentStopLoss: number;
  exitBarIndex: number;
  exitTimestamp: number;
  exitPrice: number;
  exitReason: "STOP_LOSS" | "TRAILING_STOP" | "END_OF_DATA";
  units: number;
  pnlGross: number;
  pnlNet: number;
  returnPercent: number;
  rMultiple: number;
  highestRReached: number;
  holdingHours: number;
  feePaid: number;
  slippagePaid: number;
  regimeAtEntry: MarketRegimeClassification;
}

export interface ResearchSummary {
  asset: string;
  direction: ResearchDirection;
  periodName: "IN_SAMPLE" | "VALIDATION" | "OOS" | "FULL_MULTI_YEAR";
  startDate: string;
  endDate: string;
  totalBars: number;
  
  // Capital & Return Metrics
  initialBalance: number;
  finalEquity: number;
  netPnlPercent: number;
  cagr: number;
  annualizedReturn: number;
  
  // Trade Statistics
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  profitFactor: number;
  expectancyDollar: number;
  expectancyR: number;
  averageWinDollar: number;
  averageLossDollar: number;
  averageWinR: number;
  averageLossR: number;
  payoffRatio: number;
  medianTradeReturnPercent: number;
  bestTradeR: number;
  worstTradeR: number;
  
  // Risk & Drawdown
  maxDrawdownPercent: number;
  maxDrawdownDollar: number;
  maxDrawdownDurationDays: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  maxConsecutiveLosses: number;
  maxConsecutiveWins: number;
  
  // Outlier Skewness
  top5TradesPnlContributionPercent: number;
  
  // Duration
  averageHoldingHours: number;
  medianHoldingHours: number;
  
  // Benchmarks
  buyAndHoldReturnPercent: number;
  emaTrendBenchmarkReturnPercent: number;
  
  // Monte Carlo Results (5,000 iterations)
  monteCarlo?: {
    iterations: number;
    medianMaxDrawdown: number;
    p95MaxDrawdown: number;
    p99MaxDrawdown: number;
    probNegativeReturnPercent: number;
  };
}

export interface DatasetManifestEntry {
  file: string;
  symbol: string;
  timeframe: string;
  bars: number;
  sha256: string;
  startDate: string;
  endDate: string;
  firstTimestamp: number;
  lastTimestamp: number;
  source: string;
  verifiedAt: string;
}

export interface DatasetManifest {
  version: string;
  generatedAt: string;
  sourceArchive: string;
  datasets: Record<string, DatasetManifestEntry>;
}

export interface DatasetValidationResult {
  isValid: boolean;
  totalBars: number;
  gapsCount: number;
  duplicateCount: number;
  priceAnomaliesCount: number;
  zeroVolumeCount: number;
  issues: string[];
}
