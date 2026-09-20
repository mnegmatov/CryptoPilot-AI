# Implementation Plan: Multi-Year Model D Research & Validation

**Branch**: `003-multiyear-model-d-validation` | **Date**: 2026-09-19 | **Spec**: [spec.md](file:///Users/itsnegmatov/Documents/CryptoPilot%20AI/specs/003-multiyear-model-d-validation/spec.md)

**Input**: Feature specification from `/specs/003-multiyear-model-d-validation/spec.md`

---

## 1. Summary

Perform a comprehensive, research-grade historical validation of the existing, frozen **Model D** strategy across multi-year real Binance data (2021 through present) on `BTCUSDT`, `ETHUSDT`, and `SOLUSDT` (4H timeframe).

The implementation strictly follows the user's architectural decisions:
1. **Primary Official Baseline**: **LONG-ONLY**.
2. **Secondary Research**: **LONG + SHORT** reported separately for comparison.
3. **Data Ingestion**: Download and cache authentic Binance historical datasets in `data/historical/*.csv` with SHA-256 manifest.
4. **Code Isolation**: All research logic placed in `src/research/`, leaving production code (`src/core/`, `src/app/`, `src/components/`) 100% untouched.
5. **Zero Lookahead & Strict Split**: Causal bar-by-bar point-in-time simulation with Dev (50%), Validation (25%), and a sealed Out-of-Sample (25%) partition.
6. **Comprehensive Analytics**: Benchmarks (Buy & Hold, EMA 20/50), Market Regime Breakdown, Slippage/Fee Stress Testing, Monte Carlo (5,000 runs), and Lookahead Audit Tests.

---

## 2. Technical Context

- **Language/Version**: TypeScript 5.x / Node.js 18+
- **Primary Dependencies**: Existing project math/stats utilities (`src/core/quant/indicators.ts`), Node.js `fs`, `crypto`, `https` for data ingestion. No heavy external dependencies added.
- **Storage**: `data/historical/` for raw immutable CSV OHLCV files and `manifest.json`.
- **Testing**: `vitest` (`src/__tests__/research-model-d.test.ts`).
- **Target Platform**: Node.js CLI / Offline Reproducible Research Environment.
- **Constraints**:
  - Zero modification to production Model D logic.
  - Zero synthetic or fallback candles.
  - Zero leakage of final OOS data into strategy decisions.
  - 100% offline reproducible after initial data ingest.

---

## 3. Constitution Check & Verification

*GATE: Must pass before implementation. Re-check post-implementation.*

| Principle | Compliance Status | Rationale |
| :--- | :--- | :--- |
| **Paper Trading Only** | **PASS** | Research is strictly historical backtesting and statistical evaluation. No real capital execution. |
| **Real Market Data** | **PASS** | Ingestion pipeline uses authentic Binance archives and validates timestamps, volume, and OHLC integrity. |
| **Deterministic Quant Engine** | **PASS** | Strategy decisions, stop levels, and indicators use deterministic mathematical formulas. |
| **No Lookahead / No Leakage** | **PASS** | Decisions made at bar \(T-1\) close, filled at bar \(T\) open, trailing stop uses closed historical swing bars. Automated tests explicitly assert zero lookahead. |
| **Benchmark Preservation** | **PASS** | Evaluated against standard Buy & Hold and EMA 20/50 Dual Trend benchmarks over identical chronological periods. |
| **Production Code Immutability** | **PASS** | All new logic resides in `src/research/` and `specs/003-multiyear-model-d-validation/`. Zero changes to `src/core/models/`, `src/core/signals/`, `src/components/`, or `src/app/`. |

---

## 4. Project Structure

### Documentation & Specification Artifacts
```text
specs/003-multiyear-model-d-validation/
├── spec.md              # Feature specification
├── plan.md              # Implementation plan (this document)
├── research.md          # Phase 0 research decisions & methodology
├── data-model.md        # Phase 1 data entities & schemas
├── quickstart.md        # Instructions to run ingest & validation
└── contracts/
    └── research-api.ts  # Typed interfaces for research components
```

### Source Code Architecture (Isolated in `src/research/`)
```text
src/
├── research/
│   ├── types.ts                     # Independent research types
│   ├── data/
│   │   ├── downloader.ts            # Binance archive fetcher with fallback
│   │   ├── loader.ts                # CSV parser and integrity validator
│   │   └── splitter.ts              # Chronological Dev/Val/OOS partitioner
│   ├── simulation/
│   │   ├── engine.ts                # Point-in-time Model D simulator (Long-Only & Long/Short)
│   │   ├── trailing.ts              # 5-bar structural swing trailing stop evaluator
│   │   └── benchmarks.ts            # Buy & Hold and EMA 20/50 benchmark runners
│   ├── analytics/
│   │   ├── metrics.ts               # Complete stats: Sharpe, Sortino, Payoff, Expectancy, MaxDD
│   │   ├── regime.ts                # Market regime classifier (Bull, Bear, Chop, HighVol)
│   │   ├── stress.ts                # Cost matrix (0.10%, 0.175%, 0.30%) & parameter neighborhood
│   │   └── monte-carlo.ts           # 5,000-run trade sequence resampling with VaR percentiles
│   ├── reports/
│   │   └── generator.ts             # Markdown report compiler answering all 10 core questions
│   └── cli/
│       ├── ingest.ts                # CLI script to download and validate datasets
│       └── run-validation.ts        # CLI script to execute full multi-year validation suite
data/
└── historical/                      # Raw authentic CSV datasets + manifest.json
research/
└── reports/                         # Generated markdown reports & JSON curves
src/__tests__/
└── research-model-d.test.ts         # Lookahead audit & strategy invariant unit tests
```

---

## 5. Phase-by-Phase Implementation Plan

### Phase 1: Data Ingestion & Integrity Engine
- Build `src/research/data/downloader.ts` to download historical monthly archives from Binance public data with REST pagination fallback.
- Build `src/research/data/loader.ts` to parse and validate CSVs (checking monotonicity, timestamp continuity, zero-volume, and OHLC invariants).
- Build `src/research/data/splitter.ts` for strict chronological 3-way partition (Dev: 50%, Val: 25%, OOS: 25%).
- Write unit tests for data ingestion integrity.

### Phase 2: Causal Simulation & Benchmark Engine
- Build `src/research/simulation/engine.ts` supporting strictly point-in-time trade evaluation.
- Implement Model D baseline: Long-Only primary, Long+Short secondary comparison.
- Implement structural 5-bar swing trailing stop (`trailing.ts`).
- Implement Buy & Hold and EMA 20/50 trend benchmarks (`benchmarks.ts`).
- Write automated tests in `src/__tests__/research-model-d.test.ts` verifying **zero lookahead leakage**.

### Phase 3: Analytics, Regimes & Stress Testing
- Implement comprehensive performance metrics calculator (`metrics.ts`).
- Implement market regime attribution matrix (`regime.ts`).
- Implement execution cost sensitivity matrix (0.10%, 0.175%, 0.30%) and parameter neighborhood surface (`stress.ts`).
- Implement Monte Carlo trade resampling engine (`monte-carlo.ts`) with 5,000 iterations.

### Phase 4: CLI Drivers & Report Generation
- Build `src/research/cli/ingest.ts` and `src/research/cli/run-validation.ts`.
- Build `src/research/reports/generator.ts` to format complete markdown findings answering the 10 core questions.
- Execute the ingestion for `BTCUSDT`, `ETHUSDT`, `SOLUSDT` (2021–2026).
- Execute the full validation suite and compile `research/reports/model_d_multiyear_validation.md`.

### Phase 5: Verification & Integrity Review
- Verify that `git diff -- src/core src/components src/app` is 100% clean.
- Run `npm test` to ensure all existing test suites pass.
- Run `npm run build` to confirm production build succeeds.
