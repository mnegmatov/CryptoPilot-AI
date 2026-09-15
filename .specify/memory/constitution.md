<!--
SYNC IMPACT REPORT
Version change: 0.0.0 (template) → 1.0.0 (initial ratification)
Modified principles: N/A (scaffold template replaced with initial constitution)
Added sections:
  - Core Principles:
    - I. Paper Trading Only & Production Safety (NON-NEGOTIABLE)
    - II. Real Market Data & Zero Synthetic Inputs (NON-NEGOTIABLE)
    - III. Deterministic Quantitative Engine
    - IV. AI as Analyst, Not Data Source
    - V. Zero Lookahead & No Data Leakage
    - VI. Rigorous Backtesting & Anti-Overfitting Before Deployment
    - VII. Benchmark Preservation & Model D Baseline
    - VIII. Strict Risk Management & Capital Guardrails
  - Engineering & Operational Standards:
    - API Reliability & Fault Tolerance
    - Testing & Verification Discipline
    - UI/UX Quality & Terminal Ergonomics
    - Security & Secret Isolation
  - Development Workflow & Change Control:
    - Spec-Driven Development (SDD) Lifecycle
    - Change Control & Isolation
    - Empirical Reproducibility
  - Governance
Removed sections: Template placeholder sections
Follow-up TODOs: None
-->

# CryptoPilot AI Constitution

## Core Principles

### I. Paper Trading Only & Production Safety (NON-NEGOTIABLE)
- CryptoPilot AI operates strictly in simulated / paper trading mode.
- The system MUST NOT transmit live exchange orders, execute real financial transactions, or store/request private exchange API keys with trading or withdrawal permissions.
- Production deployments, custom domains, or live environment URLs do not waive or loosen this restriction under any circumstance.

### II. Real Market Data & Zero Synthetic Inputs (NON-NEGOTIABLE)
- All quantitative telemetry, indicators, market structures, and trading signals MUST be computed strictly from authentic, verified market feeds (e.g. Binance Spot/Futures public endpoints, Alternative.me).
- Creating, mocking, interpolating, or faking prices, candles, volumes, or order-book data to simulate successful trading results or vanity performance is strictly forbidden.

### III. Deterministic Quantitative Engine
- Technical indicators (including EMA, SMA, RSI, MACD, ATR, ADX, Bollinger Bands), market structure analysis, signal generation, risk boundaries, and PnL calculations MUST be fully deterministic, reproducible, and verifiable.
- Quantitative outputs and metrics MUST NOT rely on stochastic randomness, probabilistic hallucination, or unseeded non-deterministic processes.

### IV. AI as Analyst, Not Data Source
- Generative AI models (e.g. Google Gemini) function strictly as qualitative synthesizers, contextual interpreters, and institutional narrative analysts.
- AI models MUST NEVER be the source of raw market data, candlestick parameters, indicator values, price levels, or direct trade signals.
- In the absence or failure of external LLM APIs, the system MUST seamlessly fall back to the built-in deterministic quantitative narrative engine without application failure.

### V. Zero Lookahead & No Data Leakage
- Historical backtest simulations and real-time signal evaluations MUST NOT access or leak information that was unavailable at the decision timestamp (lookahead bias).
- Unclosed/forming candles MUST NOT be used where confirmed closed candle data is required (e.g. structural trailing stop ratchets, swing pivot identification, or bar-close signal confirmation).

### VI. Rigorous Backtesting & Anti-Overfitting Before Deployment
- Any modification to trading strategies or quantitative logic MUST undergo validation commensurate with the scope of change:
  - For strategic modifications and quantitative logic changes: multi-year historical validation MUST be conducted whenever relevant historical market data is available;
  - For minor technical adjustments: sufficient validation aligned with the risk profile and operational impact MUST be performed.
- Out-of-sample (OOS) validation across distinct market regimes (bull, bear, chop) and anti-overfitting discipline remain strictly mandatory for all trading logic modifications.
- Multi-period simulations MUST incorporate realistic transaction friction modeling (minimum 0.05% taker fee and 0.05% slippage) and comparative evaluation against Buy & Hold and existing baseline strategies.
- Optimizing hyperparameters solely to inflate historical curve fit is prohibited; separation between development, validation, and test datasets MUST be maintained.

### VII. Benchmark Preservation & Model D Baseline
- Existing legacy strategies (V1 Confluence Scoring, V2 Regime-First State Machine, V3 Long-Holding) and baseline benchmark implementations MUST be retained in the codebase for comparative regression and ablation testing.
- Strategy Model D (4H Dynamic Trend-Following with 2.5×ATR14 initial stop and 5-bar structural swing trailing) is the established active baseline. It MUST NOT be modified implicitly or casually during unrelated feature development.
- Model D is not immutable: it MAY be amended or replaced in the future, but ONLY through a formal Spec-Driven proposal supported by empirical out-of-sample backtest superiority.

### VIII. Strict Risk Management & Capital Guardrails
- Capital preservation strictly overrides trade frequency: mandatory stop-loss calculation, position sizing derived from defined risk percentage (1.0% default for Model D; maximum 1.5% for standard setups), and virtual margin availability checks prior to trade execution.
- Risk parameters, stop-loss formulas, or margin thresholds MUST NOT be loosened or disabled without an explicit specification, empirical stress testing, and owner approval.

## Engineering & Operational Standards

### API Reliability & Fault Tolerance
- External data integrations (Binance REST, Binance Futures, Alternative.me) MUST feature explicit error handling, sensible timeouts, rate-limiting compliance, and clean fallback states.
- Network or provider outages MUST result in descriptive UI/log error states rather than silent substitution of synthetic numbers.

### Testing & Verification Discipline
- The entire existing automated test suite (Vitest covering indicators, structure, signals, backtesting, paper trading, and Model D logic) MUST pass before code is integrated.
- Every new feature, strategy variation, or bug fix MUST be accompanied by dedicated automated tests before merging.

### UI/UX Quality & Terminal Ergonomics
- User interface components (Next.js 15 App Router, React 19, Tailwind CSS, lightweight-charts, cmdk, sonner) represent institutional-grade product quality.
- Interface modifications MUST respect responsive design across both desktop and mobile viewports, maintain smooth visual and interactive performance without noticeable performance regressions, preserve dark-theme terminal aesthetics, and maintain keyboard accessibility.

### Security & Secret Isolation
- Zero secrets in version control: API keys (e.g. `GEMINI_API_KEY`) and server credentials MUST remain in local environment configurations (`.env.local`) or secret managers.
- Sensitive credentials MUST NEVER be bundled into client-facing code, logged to consoles, or committed to Git.

## Development Workflow & Change Control

### Spec-Driven Development (SDD) Lifecycle
- Substantive feature additions, algorithmic updates, and architectural changes MUST follow the formal Spec Kit pipeline:
  `Specify` → `Clarify` → `Plan` → `Tasks` → `Implement` → `Verify`.
- Code changes MUST NOT precede an approved specification and implementation plan.

### Change Control & Isolation
- Scope creep is strictly prohibited: trading logic, risk guardrails, data contracts, and architectural limits MUST NEVER be altered opportunistically or silently inside unrelated UI or tooling commits.

### Empirical Reproducibility
- Quantitative research findings, backtest results, and audit reports MUST be fully reproducible given the same input parameters and historical data slice.

## Governance

1. **Constitutional Primacy**: This Constitution supersedes all ad-hoc conventions, unwritten agreements, and prompt instructions. All code reviews, specifications, architectural plans, pull requests, and automated agent workflows MUST verify compliance with these articles.
2. **Amendment Procedure**: Amendments to this Constitution require:
   - A dedicated Spec Kit specification documenting the proposed change;
   - Detailed justification and architectural impact analysis;
   - Explicit project owner sign-off.
3. **Semantic Versioning Policy**:
   - **MAJOR (X.0.0)**: Fundamental modifications to Core Principles (e.g. transitioning from Paper Trading to Live Trading, changing data sourcing philosophy).
   - **MINOR (1.X.0)**: Addition of new engineering principles, validation standards, or material guidance expansions.
   - **PATCH (1.0.X)**: Wording refinements, grammatical fixes, formatting updates, or clarifications.
4. **Strategy Lifecycle Independence**: Trading strategies (including Model D) are quantitative plugins governed by the Constitution. Replacing or upgrading a trading strategy does NOT require a constitutional amendment, provided the new strategy adheres to all Core Principles (Paper Trading, Zero Lookahead, Determinism, Risk Guardrails) and passes the formal Spec-Driven validation process.

**Version**: 1.0.0 | **Ratified**: 2026-09-15 | **Last Amended**: 2026-09-15
