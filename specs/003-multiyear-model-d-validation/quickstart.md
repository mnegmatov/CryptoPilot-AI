# Quickstart: Multi-Year Model D Research & Validation

This quickstart guides running and verifying the reproducible multi-year Model D research suite.

---

## 1. Prerequisites

- Node.js >= 18.x
- Local disk space: ~50MB (for 5 years of 4H CSV candles for 3 assets)
- Network connection required ONLY for initial data ingestion from Binance Archive. Once downloaded, all research is 100% offline reproducible.

---

## 2. Ingest Multi-Year Binance Historical Data

To download and validate the 2021–2026 authentic 4H dataset for `BTCUSDT`, `ETHUSDT`, and `SOLUSDT`:

```bash
# Ingest and validate historical datasets
npx ts-node src/research/cli/ingest.ts --symbols BTCUSDT,ETHUSDT,SOLUSDT --from 2021
```

Verification output:
```text
[INGEST] BTCUSDT: 12,450 4H bars downloaded. Gaps: 0. Anomalies: 0. Saved to data/historical/BTCUSDT_4h_2021_present.csv
[INGEST] ETHUSDT: 12,450 4H bars downloaded. Gaps: 0. Anomalies: 0. Saved to data/historical/ETHUSDT_4h_2021_present.csv
[INGEST] SOLUSDT: 12,980 4H bars downloaded. Gaps: 0. Anomalies: 0. Saved to data/historical/SOLUSDT_4h_2020_present.csv
[INGEST] Manifest generated at data/historical/manifest.json with SHA-256 integrity checksums.
```

---

## 3. Run the Research & Validation Suite

To run the complete validation suite (Long-Only baseline + Long/Short secondary comparison + Benchmarks + Regimes + Monte Carlo):

```bash
# Run multi-year research backtest
npx ts-node src/research/cli/run-validation.ts
```

This generates:
1. `research/reports/model_d_multiyear_validation.md` (Full comprehensive markdown report)
2. `research/reports/equity_curves.json` (Time-series data for equity & drawdowns)
3. `research/reports/monte_carlo_distributions.json` (VaR drawdown & equity quantiles)

---

## 4. Run Lookahead & Data Integrity Audit Tests

Verify that Model D has strictly zero lookahead bias and that all invariants hold:

```bash
# Run dedicated research unit & regression tests
npm test src/__tests__/research-model-d.test.ts
```

All tests should pass with:
- Zero bar \(T\) leakage into signal decision.
- Zero future bars in EMA/ATR calculation.
- 5-bar swing trailing stop using strictly bars \(T-5 \dots T-1\).
- Exact chronological splitting enforcement (Dev / Val / OOS).
