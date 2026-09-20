# Contracts & Interfaces: Multi-Year Model D Research & Validation

All research modules interact via strictly typed interfaces located in `src/research/`.

---

## 1. Data Ingestion Contract: `IHistoricalDataLoader`

Responsible for loading authentic multi-year candlestick datasets from Binance archives or local CSV files with cryptographic integrity checks.

```typescript
export interface DataIngestionSummary {
  symbol: string;
  totalBarsLoaded: number;
  startDate: string;
  endDate: string;
  gapsDetected: number;
  anomaliesDetected: number;
  sha256Hash: string;
}

export interface IHistoricalDataLoader {
  /**
   * Downloads or updates authentic Binance historical archive data for the given symbol.
   */
  downloadArchive(symbol: string, startYear: number): Promise<DataIngestionSummary>;

  /**
   * Loads verified candles from the local data/historical/ CSV file.
   * Throws an error if file is missing, corrupt, or fails integrity invariants.
   */
  loadFromCsv(symbol: string): Promise<RawHistoricalCandle[]>;

  /**
   * Performs data integrity audit: checks timestamp continuity, OHLC invariants, zero volume.
   */
  validateDataset(candles: RawHistoricalCandle[]): { isValid: boolean; issues: string[] };
}
```

---

## 2. Research Simulation Contract: `IResearchBacktester`

Encapsulates point-in-time, causal strategy execution with zero lookahead bias.

```typescript
export interface BacktestRunRequest {
  symbol: string;
  candles: RawHistoricalCandle[];
  config: ResearchConfig;
}

export interface BacktestRunResult {
  config: ResearchConfig;
  trades: ResearchTrade[];
  equityCurve: { timestamp: number; equity: number; drawdownPercent: number }[];
  summary: ResearchSummary;
  yearlyReturns: { year: number; returnPercent: number; trades: number; winRate: number }[];
  monthlyReturns: { year: number; month: number; returnPercent: number }[];
  regimePerformance: Record<string, { trades: number; winRate: number; profitFactor: number; pnlNet: number }>;
}

export interface IResearchBacktester {
  /**
   * Executes frozen Model D over the given dataset.
   * Guarantee: Trade decisions at Bar T use strictly Bar T-1 data and execute at Bar T Open.
   */
  run(request: BacktestRunRequest): BacktestRunResult;

  /**
   * Executes Buy & Hold benchmark over the exact same period.
   */
  runBuyAndHold(candles: RawHistoricalCandle[], initialBalance: number): { returnPercent: number; maxDrawdown: number };

  /**
   * Executes EMA 20/50 Dual Trend benchmark over the exact same period.
   */
  runEmaTrendBenchmark(candles: RawHistoricalCandle[], initialBalance: number): { returnPercent: number; maxDrawdown: number };
}
```

---

## 3. Statistical Analysis Contract: `IStressTestEngine`

Performs Monte Carlo permutations and fee/parameter sensitivity analysis.

```typescript
export interface MonteCarloResult {
  iterations: number;
  medianMaxDrawdown: number;
  p95MaxDrawdown: number;
  p99MaxDrawdown: number;
  probLossPercent: number;
  equityPercentiles: { p5: number; p25: number; p50: number; p75: number; p95: number };
}

export interface IStressTestEngine {
  /**
   * Runs Monte Carlo permutation by resampling historical trade returns with replacement.
   */
  runMonteCarlo(trades: ResearchTrade[], iterations?: number): MonteCarloResult;

  /**
   * Tests sensitivity across 3 cost regimes: baseline (0.10%), adverse (0.175%), severe (0.30%).
   */
  runCostStressTest(trades: ResearchTrade[]): Record<string, { netPnl: number; profitFactor: number }>;

  /**
   * Tests parameter neighborhood flatness around Model D ATR stop (2.5) and Trailing window (5).
   */
  runParameterSensitivity(candles: RawHistoricalCandle[], baseConfig: ResearchConfig): Record<string, number>;
}
```

---

## 4. Report Generator Contract: `IResearchReportWriter`

Generates structured Markdown and CSV reports answering the 10 core questions.

```typescript
export interface IResearchReportWriter {
  /**
   * Compiles individual asset and multi-asset consolidation reports to research/reports/.
   */
  generateMarkdownReport(results: Record<string, BacktestRunResult>): string;

  /**
   * Persists results to disk.
   */
  saveReport(filePath: string, content: string): Promise<void>;
}
```
