# Data Model: Multi-Year Model D Research & Validation

## 1. Entities & Type Definitions

All research types reside in `src/research/types.ts` and are completely decoupled from production runtime types.

### 1.1 Historical Candle Dataset (`RawHistoricalCandle`)
Represents an authentic, immutable historical candlestick record downloaded from Binance archives.

```typescript
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
```

### 1.2 Research Configuration (`ResearchConfig`)
Defines the parameters of a reproducible research run.

```typescript
export interface ResearchConfig {
  symbol: string;                       // e.g. "BTCUSDT"
  timeframe: "4h";
  startDate: string;                    // "2021-01-01"
  endDate: string;                      // "2026-09-19"
  initialBalance: number;               // default: 10,000 USD
  riskPerTradePercent: number;          // baseline: 1.0%
  direction: "LONG_ONLY" | "LONG_SHORT";// Baseline: LONG_ONLY
  
  // Execution Cost Parameters
  takerFeeRate: number;                 // baseline: 0.0005 (0.05%)
  slippageRate: number;                 // baseline: 0.0005 (0.05%)
  
  // Model D Fixed Parameters (Immutable Baseline)
  atrMultiplier: 2.5;
  trailingWindowBars: 5;
  maxStopLossDistancePercent: 6.0;

  // Chronological Split Boundaries
  splits: {
    devEnd: string;                     // "2023-06-30"
    valEnd: string;                     // "2024-09-30"
  };
}
```

### 1.3 Executed Trade Record (`ResearchTrade`)
Represents a simulated executed trade with exact causal attribution.

```typescript
export interface ResearchTrade {
  id: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  entryBarIndex: number;
  entryTimestamp: number;
  entryPrice: number;
  initialStopLoss: number;
  exitBarIndex: number;
  exitTimestamp: number;
  exitPrice: number;
  exitReason: "STOP_LOSS" | "TRAILING_STOP" | "END_OF_DATA";
  units: number;
  pnlGross: number;
  pnlNet: number;
  returnPercent: number;
  rMultiple: number;                    // PnL relative to initial 1R dollar risk
  highestRReached: number;
  holdingHours: number;
  feePaid: number;
  slippagePaid: number;
  regimeAtEntry: MarketRegimeClassification;
}
```

### 1.4 Market Regime Classification (`MarketRegimeClassification`)
Represents the macroeconomic environment at any given bar.

```typescript
export interface MarketRegimeClassification {
  trend: "BULL" | "BEAR" | "CHOP";     // Based on Close vs EMA200 and ADX(14) >= 20
  volatility: "HIGH" | "NORMAL" | "LOW";// Based on ATR14 percentile rank
  adx14: number;
  ema200DistancePercent: number;
}
```

### 1.5 Research Performance Summary (`ResearchSummary`)
Complete quantitative summary across any partition.

```typescript
export interface ResearchSummary {
  asset: string;
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
```

---

## 2. Storage & Persistence Layout

```text
data/
└── historical/
    ├── BTCUSDT_4h_2021_present.csv
    ├── ETHUSDT_4h_2021_present.csv
    ├── SOLUSDT_4h_2020_present.csv
    └── manifest.json                   # SHA-256 hashes, bar counts, date ranges
```

### `manifest.json` Schema
```json
{
  "version": "1.0.0",
  "generatedAt": "2026-09-19T17:00:00Z",
  "source": "https://data.binance.vision",
  "datasets": {
    "BTCUSDT": {
      "file": "BTCUSDT_4h_2021_present.csv",
      "bars": 12450,
      "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "startDate": "2021-01-01T00:00:00.000Z",
      "endDate": "2026-09-19T00:00:00.000Z"
    }
  }
}
```
