# Research & Design Decisions: Terminal UX Redesign

**Feature**: `002-terminal-ux-redesign`
**Date**: 2026-09-15
**Status**: Completed

---

## 1. Desktop Workspace Layout & Ergonomics

### Decision
Implement a rigid 3-panel institutional layout constrained to `h-[calc(100vh-4rem)]` with zero window-level scrolling:
- **Left Panel (260px)**: Compact Watchlist with high-density tabular rows (Ticker, Last Price, 24h Change, Volume).
- **Center Panel (`flex-1 min-w-0`)**: Fluid TradingView candlestick chart with integrated top control bar (Symbol header, timeframe switcher, indicators status, fit content).
- **Right Panel (420px)**: Structured Signal Dossier organized into four distinct visual sections (Header/Score, Execution Plan, Telemetry & Invalidation, AI Memo).

### Rationale
- Institutional crypto trading terminals (Bloomberg, TradingView, Binance Pro) anchor the chart as the focal interaction plane while providing immediate peripheral access to asset selection and quantitative execution dossiers.
- Constraining panel heights to `100vh - header` prevents disjointed page-level scrolling and keeps all controls in fixed, predictable visual locations.
- Setting `min-w-0` on the flex center container eliminates flexbox minimum-width overflow bugs on sub-1440px displays.

### Alternatives Considered
- *Collapsible Side Panels (Accordion/Splitter)*: Adds unnecessary drag-handle complexity and layout recalculation overhead for lightweight-charts without meaningful trader benefit on standard 1080p+ screens.
- *Tabbed Desktop Panels*: Hiding the dossier or watchlist behind tabs reduces situational awareness and forces unnecessary clicking.

---

## 2. Mobile Terminal Architecture (< 1024px)

### Decision
Adopt a **Chart-First Anchor with Interactive Bottom-Sheet Dossier**:
1. **Primary Anchor**: The candlestick chart remains permanently mounted in the upper viewport area (`flex-1 min-h-[320px]`).
2. **Bottom-Sheet Signal Dossier**:
   - *Collapsed (Peek Bar, ~68px)*: Floats at the bottom of the screen displaying: Stance Badge (`BUY`/`SHORT`/`WAIT`/`AVOID`), `Score: {score}/100`, Asset Ticker, Live Price, and a prominent drag/expand chevron.
   - *Expanded Sheet*: Slides up to reveal full execution parameters, invalidation conditions, Model D trailing logic, and the AI Memo, with an accessible close handle and drag affordance.
3. **Mobile Watchlist Drawer**: Accessible via a sleek pair-selector button in the chart header (`BTC/USDT ▼`), sliding in as a lightweight slide-over drawer that closes immediately upon selecting a pair.

### Rationale
- The previous mobile design forced a 3-button segmented control ("График" / "Пары" / "Сигнал") that completely concealed the chart whenever a trader inspected signal parameters or browsed assets.
- Traders cannot evaluate an entry range or stop loss safely without seeing the candlestick structure and EMA support levels simultaneously.
- A bottom sheet preserves visual chart continuity while offering ergonomic one-thumb interaction on mobile viewports (360px–430px).

### Alternatives Considered
- *Full-page tab switching (existing)*: Rejected because it breaks visual correlation between chart structure and quantitative signal metrics.
- *Stacked vertical scrolling layout*: Stacking Watchlist + Chart + Dossier vertically leads to endless scrolling (>2500px page height) and clumsy chart gesture capture conflicts (pinching the chart zooms price rather than scrolling the page).

---

## 3. Model D Presentation vs. Standard Take-Profit Setups

### Decision
Enforce strict visual and semantic separation between Model D trend-following signals and standard V1/V2/V3 fixed-target signals:
- **Model D Setups**:
  - Target section header: `Информационные рубежи (Milestones / R-multiples)`.
  - Level badges: `Рубеж +3.0R (Milestone)` and `Рубеж +6.0R (Milestone)` with sky-blue accent styling (`text-sky-400 bg-sky-500/10 border-sky-500/20`).
  - Context banner: *"Model D: Выход строго по структурному трейлинг-стопу (минимум 5 закрытых 4H свечей). Рубежи являются ориентирами, а не фиксированными тейк-профитами."*
  - Chart lines: Rendered as dashed sky-blue lines labeled `Рубеж +{R}R (Milestone)`.
- **Standard V1/V2/V3 Setups**:
  - Target section header: `Тейк-профит уровни (Take Profit Targets)`.
  - Level badges: `ТП1`, `ТП2`, `ТП3` with green accent styling.
  - Chart lines: Rendered as dashed emerald lines labeled `ТП{level} ({R}R)`.

### Rationale
- Adheres directly to Constitutional Article VII and Phase 0 integrity rules.
- Eliminates user confusion regarding why a Model D trade is not automatically closed at +3R in paper trading (Model D lets winners run until the 5-bar swing low is breached).

---

## 4. Keyboard Navigation & Interaction Ergonomics

### Decision
Implement lightweight, native keyboard listeners on `window` (bypassed when focus is in `<input>`, `<textarea>`, or `[contenteditable]`):
- `1`: Switch chart to `15m` timeframe.
- `2`: Switch chart to `1h` timeframe.
- `3`: Switch chart to `4h` timeframe.
- `4`: Switch chart to `1d` timeframe.
- `⌘K` / `Ctrl+K`: Open Command Palette / Quick Search.
- `Escape`: Close open drawers, modals, or expanded mobile bottom sheet.

### Rationale
- Professional traders rely heavily on rapid single-key timeframe inspection without moving their cursor back and forth across high-resolution displays.
- Zero external keyboard libraries needed; a clean React `useEffect` listener provides instant response with zero runtime overhead.

---

## 5. UI Presentation of Unavailable Data & Grounding

### Decision
- **Header & Metric Cards**: Any unavailable macro value (Funding Rate or Fear & Greed) strictly renders as `—` (em-dash).
- **Tooltips**: Hovering/tapping on `—` indicates `"Данные временно недоступны от рыночного шлюза"`.
- **AI Memo**: The structured JSON breakdown explicitly states in `marketContextSummary` when metrics are absent, preventing any LLM hallucination of neutral values.

### Rationale
- Upholds Article II (Real Market Data & Zero Synthetic Inputs).
- Reinforces user confidence by transparently signaling when external providers are experiencing outages or rate limits.
