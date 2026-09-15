# Feature Specification: Terminal UX Redesign for CryptoPilot AI

**Feature Branch**: `002-terminal-ux-redesign`

**Created**: 2026-09-15

**Status**: Draft

**Input**: User description: "Create a new feature specification for a Terminal UX Redesign for CryptoPilot AI. Improve the existing trading terminal UI/UX for desktop and mobile without changing any quantitative trading logic."

---

## 1. Problem Statement & User Needs

Traders utilizing CryptoPilot AI require an institutional-grade, distraction-free environment to evaluate quantitative setups, monitor authentic price action, and execute virtual paper trades. While the underlying data pipeline and quantitative models (V1, V2, V3, and Model D) are reliable, the current interface exhibits key UX friction points:

1. **Desktop Information Hierarchy & Space Utilization**: The three-panel desktop workspace currently suffers from visual fragmentation. Critical trade execution parameters (entry range, stop loss, invalidation thresholds) compete visually with secondary metrics and dense badges. On various laptop displays (1280px–1536px), fixed container widths cause awkward whitespace or cramped content without intuitive visual groupings.
2. **Mobile Context Disconnection**: On viewports under 1024px, the existing segmented switcher ("График" / "Пары" / "Сигнал") completely hides the candlestick chart whenever a trader reviews the Signal Dossier or browses the Watchlist. Traders lose visual contact with chart structure precisely when analyzing entry zones and stop levels.
3. **Model D Strategy Ambiguity**: While Model D is designed around 4H trend-following with a 5-bar structural swing trailing stop and no fixed take profits, users previously could confuse +3R and +6R milestones with traditional static limit target orders. The UI must explicitly present these levels as informational milestones and articulate the trailing-exit mechanism.
4. **Data Integrity & Fallback Transparency**: Macro sentiment (Fear & Greed) or derivative funding rates may be legitimately unavailable during upstream rate limits or outages. The interface must communicate unavailable states (`—` / `Unavailable`) gracefully rather than jarring users with broken elements or synthetic placeholders.

---

## 2. Goals & Non-Goals

### Goals
- **G-1 (Desktop Ergonomics)**: Deliver a polished, high-density three-panel workspace (Watchlist left, Chart center, Signal Dossier right) with distinct visual hierarchy, dark terminal aesthetics, clear section grouping, and keyboard shortcuts (`⌘K` command palette, timeframe switching `1`-`4`, watchlist navigation).
- **G-2 (Mobile Chart-First Architecture)**: Re-architect mobile viewports (< 1024px) so the candlestick chart remains the anchor interface, with the Signal Dossier operating as an interactive bottom sheet (collapsed peek bar showing stance/score/price, expandable to full trade dossier) and quick drawer access for the Watchlist.
- **G-3 (Model D Clarity)**: Clearly differentiate Model D signals from standard fixed-TP setups: present +3R/+6R strictly as informational milestones/R-multiples and highlight the 5-bar structural trailing exit rule.
- **G-4 (Institutional Presentation)**: Present deterministic metrics (ADX, RSI, EMA alignment, Confluence score out of 100, Invalidation triggers) with unambiguous labeling, and format the AI Memo as a structured institutional briefing grounded strictly on real computed telemetry.
- **G-5 (Paper Trading Clarity)**: Enhance the presentation of virtual paper trading positions, PnL tracking, and Model D active trailing stop levels, emphasizing its strictly simulated nature.
- **G-6 (Resilient State Handling)**: Provide clean, non-disruptive visual indicators for loading skeletons, transient error recovery, and stale-data notices.

### Non-Goals
- **NG-1 (Zero Trading Logic Changes)**: NO modifications to quantitative trading engine calculations, Model D rules, signal generation algorithms, or indicator formulas.
- **NG-2 (Zero New Market Data Feeds)**: NO introduction of new unverified data sources (e.g. order-book depth, CVD, VWAP, synthetic BTC dominance). Only existing verified live feeds (Binance Spot, Binance Futures, Alternative.me) are utilized.
- **NG-3 (No Real Money Trading)**: CryptoPilot AI remains 100% simulated paper trading. No wallet connects, private key imports, or real order routing.
- **NG-4 (No Speculative Features)**: No social sharing widgets, gamification badges, or external third-party integrations outside the terminal's core scope.

---

## 3. User Scenarios & Testing *(mandatory)*

### User Story 1 - Desktop Three-Panel Terminal Navigation & Analysis (Priority: P1)

As a desktop cryptocurrency trader, I want a structured three-panel workspace displaying the Watchlist, Candlestick Chart, and Signal Dossier simultaneously, so that I can evaluate quantitative trade setups with clear visual hierarchy and zero screen clutter.

**Why this priority**:
Desktop analysis is the primary institutional workflow. Traders need simultaneous access to asset selection, visual price action, and computed execution levels without switching tabs.

**Independent Test**:
Can be fully tested on desktop browsers (>= 1024px). Verifies that selecting any pair from the left Watchlist instantaneously updates the center chart and right Signal Dossier without layout shift or horizontal overflow.

**Acceptance Scenarios**:
1. **Given** a desktop screen resolution (1440×900 or 1920×1080), **When** the terminal page loads, **Then** all three panels (Watchlist ~260px, Chart flex-1, Signal Dossier ~420px) are visible within a single screen height (`h-[calc(100vh-4rem)]`) without page-level scrollbars.
2. **Given** the three-panel layout, **When** the user presses keyboard shortcuts (`1` for 15m, `2` for 1h, `3` for 4h, `4` for 1d, or `⌘K` for search), **Then** the chart timeframe or search dialog updates immediately with clear active focus styling.
3. **Given** any active pair, **When** inspecting the right Signal Dossier, **Then** information is segmented into four sequential visual blocks:
   - Header (Stance badge, Signal Score /100, Asset ticker, Live price);
   - Execution Parameters (Entry range, Stop loss with % risk, R:R ratio, Targets/Milestones);
   - Market Structure & Confluence (Trend alignment, ADX/RSI telemetry, Invalidation conditions);
   - AI Analyst Synthesis (Institutional memo with thesis, setup rationale, and execution plan).

---

### User Story 2 - Mobile Chart-First Workspace with Bottom-Sheet Dossier (Priority: P1)

As a trader using a smartphone (viewport width 360px–430px), I want the live candlestick chart to remain permanently visible as the primary screen anchor, while the Signal Dossier is accessible via an ergonomic bottom sheet, so that I can inspect setup details without losing visual contact with the chart.

**Why this priority**:
Previous mobile navigation concealed the chart when inspecting signals. Mobile traders must verify candlestick structure against signal levels simultaneously.

**Independent Test**:
Can be tested on mobile viewport emulation (e.g. iPhone 14 Pro 393×852). Verifies that the chart renders full-width at the top, a persistent peek bar sits at the bottom showing key signal metrics, and tapping/swiping the sheet smoothly expands full dossier details.

**Acceptance Scenarios**:
1. **Given** a mobile viewport (< 1024px), **When** viewing an asset, **Then** the candlestick chart occupies the upper viewport and a sticky bottom-sheet peek bar displays: Stance badge (e.g., BUY), Signal Score (`Score: 85/100`), Current Price, and an expand indicator.
2. **Given** the collapsed bottom-sheet peek bar, **When** the user taps or drags it upward, **Then** the sheet smoothly expands to show complete trade parameters, invalidation conditions, and the AI Memo, while maintaining an accessible close/collapse handle.
3. **Given** the mobile terminal, **When** the user needs to change assets, **Then** a compact header bar provides a pair switcher button that slides open a lightweight Watchlist drawer without causing horizontal document scroll (`scrollWidth === innerWidth`).
4. **Given** all touch targets on mobile (timeframe buttons, pair items, sheet expanders, order deploy triggers), **When** measured, **Then** every interactive element meets or exceeds the 44×44px touch area standard.

---

### User Story 3 - Model D Structural Trailing vs. Standard Take-Profit Distinction (Priority: P2)

As a trend trader analyzing a Model D 4H setup, I want the Signal Dossier and Chart to clearly indicate that Model D has no fixed take-profit targets and exits strictly via a 5-bar structural swing trailing stop, so that I do not misinterpret +3R/+6R milestones as static limit orders.

**Why this priority**:
Model D is the active benchmark strategy. Mislabeling its informational milestones as standard take-profit targets confuses execution and violates strategy design.

**Independent Test**:
Can be tested by selecting a Model D 4H signal setup. Verifies that labels, badges, chart price lines, and dossier notes state "Milestone" / "Рубеж" rather than "Take Profit" / "ТП".

**Acceptance Scenarios**:
1. **Given** an active Model D signal, **When** rendered in the Signal Dossier, **Then** the targets section displays an informational banner explaining: *"Model D: выход строго по структурному трейлинг-стопу (минимум 5 закрытых 4H свечей). Рубежи +3R и +6R являются ориентирами (Milestones), а не фиксированными тейк-профитами."*
2. **Given** an active Model D signal, **When** viewing target items, **Then** each level is labeled `Рубеж +3.0R (Milestone)` and `Рубеж +6.0R (Milestone)` with distinctive accent styling (sky blue) rather than green `ТП1/ТП2` tags.
3. **Given** an active Model D signal, **When** price lines are plotted on the chart, **Then** the milestone lines render as dashed lines with the title `Рубеж +3R (Milestone)` rather than `ТП1`.
4. **Given** a standard V1/V2/V3 signal, **When** rendered, **Then** traditional take-profit targets (`ТП1`, `ТП2`, `ТП3`) with fixed price objectives remain clearly labeled as take-profit levels.

---

### User Story 4 - High-Visibility Telemetry, Resilient Error & Stale States (Priority: P2)

As a trader operating in volatile conditions, I want clear visual indicators when upstream feeds are loading, stale, or unavailable, so that I never act on outdated or fabricated data.

**Why this priority**:
Platform credibility relies on zero synthetic data. When market context (Fear & Greed, Funding Rate) cannot be fetched, users must see explicit unavailable markers (`—`) rather than missing elements or silent defaults.

**Independent Test**:
Can be tested by simulating upstream API timeouts or disconnected states. Verifies that stale data shows an amber timestamp badge, unavailable metrics show `—`, and error cards provide an inline retry trigger.

**Acceptance Scenarios**:
1. **Given** a macro metric (Funding Rate or Fear & Greed) fails to load from the upstream gateway, **When** the header or dossier renders, **Then** the value displays as `—` (em-dash) and the AI Memo states that the metric is currently unavailable.
2. **Given** a transient network interruption during background polling, **When** previous authentic prices are in cache, **Then** the Watchlist preserves the last real prices, renders an amber status badge (`Данные от [время] — обновление...`), and displays a manual retry button.
3. **Given** an unrecoverable feed failure where no data exists, **When** the component renders, **Then** a centered error state appears with an explanatory error description and a prominent `Повторить` (Retry) button.

---

### User Story 5 - Virtual Paper Trading Presentation (Priority: P3)

As a trader testing execution on CryptoPilot AI, I want an enhanced paper trading dashboard that clearly presents virtual capital, open positions, unrealized PnL, and live Model D trailing stop adjustments, so that I can monitor simulated trade progression safely.

**Why this priority**:
Paper trading validates strategy execution without financial risk. Clear visualization of position metrics reinforces understanding of Model D's dynamic trailing stops.

**Independent Test**:
Can be tested by navigating to the Paper Trading tab and opening a simulated position. Verifies that account balance, equity, margin allocation, and trailing stops update accurately without any references to real money deposits.

**Acceptance Scenarios**:
1. **Given** the Paper Trading view, **When** viewed by the user, **Then** a prominent header banner clearly indicates: *"Симулированный демо-счёт — торговля без риска реальным капиталом"*.
2. **Given** an open Model D position, **When** a new 4H candle closes with a higher 5-bar swing low, **Then** the position table displays the updated trailing stop level with a badge (`Свинг 5св`) and shows `Без TP (Трейлинг)` in the target column.
3. **Given** an open position, **When** the user clicks `Закрыть позицию`, **Then** a confirmation toast confirms position closure, computes final realized PnL, and updates the account balance immediately.

---

## 4. Edge Cases

- **Extreme Screen Widths (< 360px or > 2560px)**: On compact phones (<= 375px), labels and metrics must truncate gracefully with tooltips and avoid line breaks that overlap containers. On ultra-wide monitors (>= 1920px), the terminal must cap panel expansion or center layout while allowing the chart to expand fluidly.
- **Unavailable Macro Data During Signal Calculation**: If both Funding Rate and Fear & Greed are null, the signal generation engine continues computing technical confluence without applying funding/sentiment bias, and the dossier marks macro telemetry as `—`.
- **Rapid Symbol Switching**: If the user switches symbols in the Watchlist in rapid succession, previous in-flight HTTP requests must be aborted or ignored to prevent race conditions where an older symbol's candles overwrite the newly selected asset.
- **WebSocket Disconnection on Mobile Backgrounding**: When mobile browsers pause WebSocket connections upon screen lock or app switching, the terminal must gracefully reconnect or fall back to REST polling upon returning to the active tab.

---

## 5. Requirements *(mandatory)*

### Functional Requirements

#### Workspace & Layout Architecture
- **FR-001**: The desktop interface MUST provide a three-panel layout (Left: Watchlist, Center: TradingView Chart, Right: Signal Dossier) rendered side-by-side on viewports >= 1024px (`lg` breakpoint).
- **FR-002**: The desktop layout MUST fit within the viewport height (`h-[calc(100vh-4rem)]`) with internal scrolling restricted to the individual panels (Watchlist and Signal Dossier), preventing window-level vertical and horizontal scrolling.
- **FR-003**: The mobile interface MUST present a chart-anchored layout on viewports < 1024px where the candlestick chart occupies the primary upper area.
- **FR-004**: The mobile Signal Dossier MUST be rendered as an interactive bottom sheet with two discrete states:
  - *Collapsed (Peek)*: height ~68px displaying Stance badge, Signal Score /100, Asset, Live Price, and expand toggle;
  - *Expanded*: slide-up overlay displaying the full Signal Dossier with smooth touch drag and tap-to-dismiss behavior.
- **FR-005**: The mobile Watchlist MUST be accessible via a compact drawer or header switcher without replacing the chart canvas.
- **FR-006**: The entire application MUST have zero horizontal document overflow (`document.documentElement.scrollWidth === window.innerWidth`) across all supported resolutions (360px to 3840px).

#### Signal Dossier Presentation
- **FR-007**: The Signal Dossier MUST display the overall stance prominently using established semantic color coding:
  - `BUY`: Emerald green background tint with high-contrast text;
  - `SHORT`: Rose red background tint with high-contrast text;
  - `WAIT`: Amber yellow background tint with high-contrast text;
  - `AVOID`: Slate gray background tint with high-contrast text.
- **FR-008**: The confluence score MUST be labeled strictly as `Signal Score: {score}/100` (or `Скор сигнала: {score}/100`), accompanied by an explanatory hint clarifying that this is a deterministic confluence score and NOT a winning probability.
- **FR-009**: Trade execution parameters MUST be grouped in a dedicated card displaying:
  - Entry Range (`Min` – `Max`, with `Ideal` entry highlighted);
  - Stop Loss (Price and percentage risk distance);
  - Risk-to-Reward Ratio (formatted as `{R}R`).
- **FR-010**: For Model D setups, target levels MUST be labeled as `Рубеж +{R}R (Milestone)` and MUST include an explicit notice explaining that Model D uses a 5-bar structural swing trailing exit rather than fixed limit take-profit orders.
- **FR-011**: For standard V1/V2/V3 setups, target levels MUST be labeled as `ТП{level}` with exact price, percentage gain, and R-multiple.
- **FR-012**: Quantitative telemetry badges MUST display computed values for:
  - `ADX(14)` (with visual indication if >= 20 trend threshold);
  - `RSI(14)` (with state: Overbought, Oversold, Divergence, or Normal);
  - `200 EMA` status;
  - Market Structure (HTF Trend, LTF Trend, Liquidity Sweeps).
- **FR-013**: Invalidation conditions MUST be presented as a bulleted checklist detailing the exact criteria that negate the setup.

#### AI Analyst Memo Presentation
- **FR-014**: The AI Analyst section MUST be titled `Институциональный тезис AI` (AI Institutional Thesis) and display a clear visual badge indicating that it synthesizes deterministic quantitative facts.
- **FR-015**: The AI Memo MUST present five structured sub-sections:
  - Thesis (Краткий тезис);
  - Setup Rationale (Обоснование сетапа);
  - Market Context (Рыночный контекст);
  - Invalidation (Условия отмены);
  - Execution Plan (План сделки).
- **FR-016**: When macro data (Funding Rate, Fear & Greed) is unavailable, the AI Memo MUST explicitly state that the data is unavailable and MUST NOT cite synthetic or assumed baseline values.

#### Chart Interaction & Ergonomics
- **FR-017**: The chart component MUST maintain the lightweight-charts candlestick rendering using real Binance OHLCV data.
- **FR-018**: The chart header MUST provide an ergonomic timeframe selector (`15m`, `1h`, `4h`, `1d`) with active state styling and minimum 44×44px touch targets on mobile.
- **FR-019**: Overlay indicators (EMA20, EMA50, EMA200) and trade price lines (Stop Loss, Take Profits / Model D Milestones) MUST be clearly legible with distinct color and line-style differentiation (solid for Stop Loss, dashed for Targets/Milestones).
- **FR-020**: The chart MUST support keyboard shortcuts: `1` (15m), `2` (1h), `3` (4h), `4` (1d) when the chart container or terminal body has focus.

#### Watchlist Interaction
- **FR-021**: The Watchlist MUST display all supported crypto assets (BTC, ETH, SOL, BNB, AVAX, LINK, NEAR, SUI) showing Symbol, Name, Last Price, and 24h Percentage Change.
- **FR-022**: The active selected asset MUST have a prominent active state styling (subtle accent highlight and border indicator).
- **FR-023**: When background market polling is in progress or delayed, the Watchlist MUST preserve the last valid authentic prices and display an unobtrusive stale-data indicator.

#### Paper Trading & Risk Calculator
- **FR-024**: The terminal MUST provide a Position Sizing Calculator accessible directly from the Signal Dossier, allowing traders to input virtual equity ($1,000–$1,000,000) and risk percentage (0.5%–3.0%) to compute exact position units and margin.
- **FR-025**: The `Deploy Paper Trade` action MUST open a simulated order strictly in virtual memory, displaying an immediate toast notification and linking to the Paper Trading view.
- **FR-026**: The Paper Trading view MUST visibly brand all balances and positions as simulated demo assets.

---

## 6. Key Entities & Visual Hierarchy

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ TOP HEADER (Brand, Live Status, Fear & Greed Pill, Funding Pill, Regime, Tabs, ⌘K)      │
├───────────────────┬───────────────────────────────────────────────┬────────────────────┤
│ LEFT PANEL        │ CENTER PANEL                                  │ RIGHT PANEL        │
│ Watchlist (260px) │ TradingView Candlestick Chart (Flex-1)        │ Signal Dossier     │
│                   │                                               │ (420px)            │
│ • Asset items     │ • Symbol & Live Price Header                  │ • Stance & Score   │
│ • 24h % Change    │ • Timeframe Pills (15m / 1h / 4h / 1d)        │ • Execution Grid   │
│ • Quote volume    │ • Candlestick Series                          │ • Stop Loss / RR   │
│ • Stale indicator │ • EMA Overlays (20, 50, 200)                  │ • Milestones / TPs │
│ • Refresh trigger │ • Price Lines (SL, TP / Model D Milestones)   │ • Invalidation     │
│                   │ • Real-time WebSocket tick updates            │ • Telemetry Badges │
│                   │                                               │ • AI Memo Box      │
│                   │                                               │ • Deploy Paper CTA │
└───────────────────┴───────────────────────────────────────────────┴────────────────────┘
```

### Visual Priority Hierarchy (Signal Dossier)
1. **Primary Focus (Top 20%)**: Stance (BUY / SHORT / WAIT / AVOID) + Signal Score (/100) + Asset & Real-Time Price.
2. **Actionable Trade Plan (Next 30%)**: Entry Range + Stop Loss with % risk distance + Take Profits / Model D Milestones with R-multiples + Primary CTA (Deploy Paper Trade / Calculate Position).
3. **Validation & Invalidation (Next 25%)**: Invalidation conditions checklist + Market Structure / Regime + Quant Telemetry Badges (ADX, RSI, Liquidity Sweeps).
4. **Context & Synthesis (Bottom 25%)**: AI Analyst Institutional Memo (Structured JSON breakdown).

---

## 7. Success Criteria *(mandatory)*

### Measurable Outcomes
- **SC-001 (Layout Conformance)**: 100% of tested viewports from 360px width (iPhone SE / mini) to 3840px width (4K desktop) exhibit zero horizontal document overflow (`scrollWidth === innerWidth`).
- **SC-002 (Mobile Chart Continuity)**: On viewports < 1024px, the candlestick chart remains rendered and visible at least in the upper 45% of the viewport during 100% of standard user interactions.
- **SC-003 (Touch Target Ergonomics)**: 100% of interactive controls (buttons, timeframe selectors, bottom-sheet drag headers, watchlist rows) provide an effective touch hit area of at least 44×44px on mobile devices.
- **SC-004 (Visual Clarity & Legibility)**: All foreground text, data numbers, and badge indicators achieve a minimum contrast ratio of 4.5:1 against their terminal backgrounds in compliance with WCAG AA standards.
- **SC-005 (Model D Differentiation)**: 100% of Model D signal presentations explicitly label target levels as "Milestone" / "Рубеж" and contain zero instances of static "Take Profit" or "ТП" labels in the Model D targets section.
- **SC-006 (Zero Trading Engine Drift)**: 100% of automated tests across indicators, structure, signals, paper trading, and Model D logic continue to pass with zero modifications to quantitative formulas.

---

## 8. Assumptions

- **A-001 (Modern Browser Support)**: Users access CryptoPilot AI using evergreen web browsers supporting CSS Grid, Flexbox, CSS Backdrop Filter, and modern ECMAScript standards (Chrome 110+, Safari 16+, Firefox 110+, Edge 110+).
- **A-002 (Virtual Trading Scope)**: All trade placement interactions generate virtual paper ledger entries in the existing mock wallet database; no external brokerage or exchange credentials are required or accepted.
- **A-003 (Upstream Feed Characteristics)**: Real market data is supplied via Binance public REST endpoints, public WebSocket ticker streams, and Alternative.me Fear & Greed API. When an upstream provider times out or returns an error, the UI displays explicit unavailable states (`—`) as ratified in Phase 0.
- **A-004 (Language Localization)**: Core quantitative and market terminology follows standard international trading nomenclature (RSI, ADX, EMA, Long, Short, R:R, Signal Score), while narrative explanations and invalidation descriptions are presented in professional Russian as established in the current codebase.
