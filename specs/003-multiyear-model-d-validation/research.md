# Phase 0 Research: Multi-Year Model D Research & Validation

## 1. Executive Research Summary

The goal of this research phase is to establish the exact, reproducible methodology for validating the frozen **Model D** strategy over a 5-year historical horizon (2021–2026) across `BTCUSDT`, `ETHUSDT`, and `SOLUSDT` without introducing lookahead bias, parameter tuning, or synthetic data.

### Primary Decisions & Answers to Core Requirements

| Research Question | Architectural Decision | Rationale |
| :--- | :--- | :--- |
| **Strategy Direction** | **Long-Only** (Official Baseline); **Long+Short** (Secondary Comparison). | Model D's core specification is long trend-following with a 5-bar swing trailing stop. Testing Long-Only preserves the authentic baseline, while Long+Short isolates whether short signals enhance or dilute risk-adjusted edge. |
| **Historical Data Source** | Binance Public Data Archive (`data.binance.vision`) with REST pagination fallback. | Direct download of multi-year monthly kline archives avoids thousands of REST calls, eliminates IP rate limits, and provides authentic exchange-published data. |
| **Local Data Persistence** | `data/historical/<SYMBOL>_4h_2021_present.csv`. | Raw CSV storage guarantees 100% offline reproducibility, immutability, and instant auditability without network dependencies. |
| **Code Isolation** | All research code located in `src/research/`. | Leaves production strategy code, API routes, and terminal UI completely untouched. |
| **Chronological Split** | Dev (50%): 2021-01-01 to 2023-06-30<br>Val (25%): 2023-07-01 to 2024-09-30<br>OOS (25%): 2024-10-01 to Present. | Prevents data leakage and temporal snooping. The final OOS period remains strictly sealed until the evaluation pipeline is frozen. |
| **Zero Lookahead Audit** | Automated tests checking point-in-time calculation at open of bar \(T\) using strictly closed bar \(T-1\) indicators. | Verifies mathematically that no intra-candle or future-candle leakage can contaminate results. |

---

## 2. Binance Historical Data Ingestion Architecture

### 2.1 Archive & REST Dual-Path Pipeline
- **Archive Source**: Binance public data monthly zips (`https://data.binance.vision/data/spot/monthly/klines/{SYMBOL}/4h/`).
- **REST Fallback / Gap Fill**: Binance REST klines endpoint `/api/v3/klines` with `startTime` and `endTime` pagination.
- **CSV Schema**:
  ```csv
  timestamp,open,high,low,close,volume,close_time,quote_volume,count,taker_buy_volume,taker_buy_quote_volume
  1609459200000,28923.63,29080.00,28682.00,28995.13,2311.81,1609473599999,66827821.12,41235,1154.21,33382910.45
  ```

### 2.2 Data Integrity Validation Rules
Every downloaded historical dataset must pass an automated validation gate before entering the simulator:
1. **Monotonicity**: Timestamps strictly increasing (\(t_{i} > t_{i-1}\)).
2. **Interval Consistency**: Exact 4-hour spacing (\(\Delta t = 14\,400\,000\) ms). Any gap \(\ge 8\) hours is flagged and logged.
3. **Zero / Duplicate Checking**: No duplicate timestamps allowed.
4. **Candle Price Invariants**:
   - \(Low \le Open \le High\)
   - \(Low \le Close \le High\)
   - \(Low > 0, High > 0, Open > 0, Close > 0\)
5. **Volume Realism**: Volume and Quote Volume \(\ge 0\).

---

## 3. Simulator Architecture & Zero-Lookahead Guarantees

### 3.1 Point-in-Time Simulation Loop
The research simulator iterates bar-by-bar across the historical dataset:
1. **Indicator Calculation (Bar \(T-1\))**:
   - Closes up to bar \(T-1\) are fed to EMA20, EMA50, EMA200, and ATR14.
   - Trend state evaluated: Macro Gate (`Close > EMA200`), Trend Gate (`EMA20 > EMA50`).
2. **Signal Evaluation (Bar \(T-1\))**:
   - Pullback-bounce evaluated on closed bar \(T-1\): `Low <= EMA20` and `Close > EMA20`.
3. **Execution at Bar \(T\) Open**:
   - Trade entered at `Open(T)` with realistic slippage and taker fees deducted.
   - Sizing: \(1.0\%\) account equity risked based on entry-to-stop distance.
4. **Trade Management (Bar \(T\))**:
   - Intra-bar worst-case evaluation: Stop loss triggered if `Low(T) <= StopLoss`.
   - Structural trailing stop updated: Stop ratchets to \(\min(\text{Low}_{T-5} \dots \text{Low}_{T-1})\) if higher than previous stop.

---

## 4. Benchmark Specifications

1. **Buy & Hold**:
   - Initial balance allocated at `Open(Bar 0)`. Units held until `Close(Bar N)`.
   - Reinvests nothing, takes no stops, tracks gross market beta.
2. **EMA 20/50 Trend Following**:
   - Long when `EMA20 > EMA50` on 4H close; exit/flat when `EMA20 < EMA50`.
   - No trailing stop, standard trend filter comparison.

---

## 5. Statistical Stress Testing

1. **Monte Carlo Permutation (5,000 Runs)**:
   - Resamples trade sequences with replacement.
   - Computes empirical CDF of Maximum Drawdown and Final Equity.
   - Outputs 95th and 99th percentile VaR drawdowns.
2. **Transaction Cost Sensitivity**:
   - Matrix testing: 0.10%, 0.175%, and 0.30% round-trip costs.
3. **Parameter Flatness Audit**:
   - Evaluates ATR stop multiplier \([2.0, 2.25, 2.5, 2.75, 3.0]\) and trailing window \([3, 4, 5, 6, 7]\) to verify the strategy does not rely on a localized curve-fit spike.
