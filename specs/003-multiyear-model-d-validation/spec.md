# Feature Specification: Multi-Year Model D Research & Validation

**Feature Branch**: `003-multiyear-model-d-validation`

**Created**: 2026-09-19

**Status**: Draft (Specification Only — No implementation yet)

**Input**: User description: "We need to validate the existing Model D trading strategy over a substantially longer historical period using real Binance market data. IMPORTANT: This is a RESEARCH AND VALIDATION feature only. Do NOT modify the existing Model D strategy logic, signal formulas, indicators, risk calculations, paper trading behavior, UI, or production trading flow. The purpose is to answer one question: 'Does the existing Model D show a robust and repeatable edge across multiple years and different market regimes, or were the previous positive results mainly sample-specific?'"

---

## 1. Executive Summary & Purpose

The purpose of this feature is strictly **quantitative research, validation, and empirical stress-testing** of the existing, frozen **Model D** trading strategy over a multi-year historical horizon (target: 2021 through the present) using 100% authentic Binance market data.

The core research question to be answered is:
> **"Does the existing Model D show a robust and repeatable edge across multiple years and different market regimes, or were the previous positive results mainly sample-specific?"**

### Inviolable Governance Principles
1. **Strategy Immutability**: The Model D parameters, logic, indicators, and execution formulas are **strictly frozen**. Zero parameter tuning, curve-fitting, or logic replacement.
2. **Zero Synthetic / Fallback Data**: Every candlestick must be fetched from verified real Binance endpoints. No invented bars, no artificial fills.
3. **Strict Chronological Data Splitting**: No random k-fold shuffling of time series. Data is strictly divided into In-Sample (Development), Validation, and an untouched final Out-Of-Sample (OOS) holdout.
4. **Isolated Research Architecture**: All historical data ingestion, backtesting, Monte Carlo, and analysis scripts must reside in dedicated research/validation modules, leaving production trading routes, UI, and live engine files 100% untouched.
5. **No Subjective Grading**: Reports provide objective mathematical metrics, statistical distributions, and hypothesis test results without marketing adjectives or letter grades.

---

## 2. Research Scope & Dataset Requirements

### 2.1 Assets & Timeframe
- **Target Assets**: `BTCUSDT`, `ETHUSDT`, `SOLUSDT` (Binance Spot / USD-M Perpetual archive where spot history is available).
- **Timeframe**: `4H` (240-minute candlestick bars).
- **Target Historical Span**: 
  - Ideal: January 1, 2021 – Present (~5+ years; ~11,000+ 4H bars per asset).
  - Minimum acceptable: Earliest reliable Binance continuous history (for SOLUSDT: since Binance listing in late 2020) through present.

### 2.2 Data Ingestion & Storage Architecture
- Ingestion must page through Binance historical klines API (`startTime` / `endTime` pagination) with robust rate-limit backoff and caching to local artifacts (`.data/` or `research/data/`).
- Validation integrity: Check for missing candles (timestamp gaps > 4 hours), duplicate timestamps, zero volumes, and corrupt OHLC invariants (\(L \le O, C \le H\)).

### 2.3 Chronological Partitioning (No Lookahead Leakage)
A strict 3-way chronological split across the entire continuous history:
1. **In-Sample / Development (50%)**: ~2021-01-01 to ~2023-06-30 (Covers 2021 Bull, 2022 Bear market).
2. **Validation / Forward-Testing (25%)**: ~2023-07-01 to ~2024-09-30 (Covers recovery, sideways accumulation, early ETF rally).
3. **Final Out-of-Sample (OOS) Holdout (25%)**: ~2024-10-01 to Present (Strictly sealed until all research code and benchmark comparisons are finalized; zero post-hoc tuning).

---

## 3. Baseline Strategy Specification (Frozen Model D)

Model D baseline parameters that **MUST NOT** be modified:
- **Candle Timeframe**: 4H
- **Trend Filters**:
  - Macro Gate: `Close > EMA200` (for Longs) or `Close < EMA200` (for Shorts)
  - Medium Gate: `EMA20 > EMA50` (for Longs) or `EMA20 < EMA50` (for Shorts)
- **Entry Trigger (Pullback-Bounce)**:
  - Long: `Low <= EMA20` AND `Close > EMA20`
  - Short: `High >= EMA20` AND `Close < EMA20`
- **Initial Stop Loss**:
  - Distance: \(2.5 \times \text{ATR14}\) (capped at maximum 6.0% risk distance)
- **Exit & Trailing Mechanism**:
  - **No fixed Take Profit** (Winners are allowed to run).
  - **Structural Trailing Stop**: Trailing ratchet based on the lowest low (for Long) or highest high (for Short) of the last 5 completed 4H candles.
- **Position Sizing**:
  - Fixed fractional risk: 1.0% account equity risked per trade based on entry-to-stop distance.
- **Execution Mode**:
  - Simulated / Paper Trading only. No real money.

---

## 4. Benchmark Definitions

To avoid cherry-picking, Model D is benchmarked against two standard baselines over the exact same historical periods:
1. **Buy & Hold Benchmark**:
   - 100% long exposure from the first bar of the evaluation period to the last.
2. **EMA 20/50 Dual Trend-Following Benchmark**:
   - Long when `EMA20 > EMA50`, flat (or short) when `EMA20 < EMA50`, rebalanced on 4H close.

---

## 5. Quantitative Metrics to Compute

For every asset (`BTCUSDT`, `ETHUSDT`, `SOLUSDT`) and for each partition (In-Sample, Validation, OOS, and Full Multi-Year):

| Category | Required Metrics |
| :--- | :--- |
| **PnL & Growth** | Total Net PnL (%), Compounded Annual Growth Rate (CAGR), Annualized Return, Final Equity |
| **Trade Statistics** | Total Trades, Win Rate (%), Profit Factor, Expectancy ($ and R), Average Win ($ and R), Average Loss ($ and R), Payoff Ratio (Avg Win / Avg Loss) |
| **Risk & Drawdown** | Maximum Peak-to-Trough Drawdown (MDD in % and $), Max Drawdown Duration (bars and days), Ulcer Index |
| **Risk-Adjusted Ratios** | Annualized Sharpe Ratio (0% risk-free rate), Annualized Sortino Ratio, Calmar Ratio (CAGR / MDD) |
| **Streak & Outlier Analysis**| Max Consecutive Losses, Max Consecutive Wins, Best Single Trade (R and %), Worst Single Trade (R and %), Top 5 Outlier Trades Contribution to Total PnL (to detect lottery-ticket skewness) |
| **Temporal Distributions** | Monthly Returns Heatmap, Yearly Returns Table, Average & Median Trade Duration (in 4H bars and hours) |
| **Visual Curves** | Equity Curve (vs Buy & Hold), Underwater Drawdown Curve |

---

## 6. Market Regime Breakdown

Model D's performance must be segregated across distinct macro regimes to detect where the strategy thrives and where it bleeds capital:
1. **Bull Market**: Sustained periods where 4H Close > EMA200 and ADX(14) \(\ge 20\).
2. **Bear Market**: Sustained periods where 4H Close < EMA200 and ADX(14) \(\ge 20\).
3. **Sideways / Consolidation**: ADX(14) \(< 20\) or price repeatedly crossing EMA200 within 20 bars.
4. **High-Volatility Expansion**: ATR(14) as a percentage of price in the top 20th percentile of the historical dataset.
5. **Low-Volatility Compression**: ATR(14) in the bottom 20th percentile.

---

## 7. Robustness & Sensitivity Stress Testing

### 7.1 Transaction Cost & Slippage Stress Matrix
Evaluate the strategy across 3 execution cost scenarios:
1. **Baseline / Realistic**: 0.05% taker commission + 0.05% slippage per side (0.10% round-trip).
2. **Adverse / High Slippage**: 0.075% commission + 0.10% slippage per side (0.175% round-trip).
3. **Severe Stress**: 0.10% commission + 0.20% slippage per side (0.30% round-trip).

### 7.2 Parameter Neighborhood Stability (Sensitivity, NOT Optimization)
To ensure the strategy does not live on an unstable parameter cliff, evaluate neighboring parameter bands:
- **ATR Stop Multiplier**: Test \([2.0, 2.25, \mathbf{2.5}, 2.75, 3.0]\).
- **Structural Trailing Window**: Test \([3, 4, \mathbf{5}, 6, 7]\) completed 4H bars.
- **Risk Per Trade**: Test \([0.5\%, 0.75\%, \mathbf{1.0\%}, 1.5\%]\).
*Constraint*: Baseline Model D remains the sole official result; sensitivity outputs are solely used to verify flatness of the parameter surface.

### 7.3 Monte Carlo Simulation
- **Trade Shuffling (1,000 to 5,000 iterations)**: Sample trade returns with replacement to simulate alternate sequence paths.
- **Outputs**:
  - Median Maximum Drawdown.
  - 95th Percentile Maximum Drawdown (Value-at-Risk).
  - 99th Percentile Maximum Drawdown.
  - Distribution of final equity and Probability of Capital Loss (\(P(\text{Equity} < \text{Initial})\)).

---

## 8. Lookahead & Data Leakage Verification

Automated audit tests must explicitly verify:
1. **Point-in-Time Signal Generation**: Trade entries at bar \(T\) occur strictly at the open of bar \(T\) using data up to closed bar \(T-1\). Zero usage of bar \(T\)'s high/low/close during signal trigger.
2. **Trailing Stop Mechanics**: The 5-bar swing stop at bar \(T\) is calculated using bars \(T-5\) through \(T-1\).
3. **Indicator Calculation**: EMAs and ATR at bar \(T\) do not incorporate future bars (strictly causal calculation).
4. **Benchmark Synchronization**: Benchmark returns use identical start and end timestamps.

---

## 9. Deliverables & Definition of Done

The feature is considered complete when:
- [ ] Multi-year authentic Binance 4H data for `BTCUSDT`, `ETHUSDT`, `SOLUSDT` is ingested and validated.
- [ ] Chronological 3-way split (Dev / Validation / OOS) is strictly enforced.
- [ ] Full backtest results across all 3 assets with all required metrics, monthly/yearly breakdowns, and visual curves are generated.
- [ ] Benchmark comparison (Buy & Hold, EMA 20/50) is documented.
- [ ] Market regime attribution analysis is produced.
- [ ] Cost sensitivity and Monte Carlo stress tests are completed.
- [ ] Lookahead audit tests pass with 100% confidence.
- [ ] A consolidated research synthesis report (`research/reports/model_d_multiyear_validation.md`) answers all 10 core questions.
- [ ] Existing test suite (`npm test`) passes without regressions.
- [ ] Production build (`npm run build`) passes cleanly.
- [ ] Model D production code and UI remain completely untouched.
