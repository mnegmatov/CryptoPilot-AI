# Quickstart Validation Guide: Terminal UX Redesign

**Feature**: `002-terminal-ux-redesign`
**Date**: 2026-09-15
**Status**: Completed

This guide provides testable end-to-end verification procedures to validate the Terminal UX Redesign across desktop and mobile devices.

---

## 1. Prerequisites & Environment Setup

```bash
# Ensure dependencies are clean
npm install

# Run automated tests to verify quantitative baselines
npm test

# Run development server with network access
npm run dev
```
Open terminal at `http://localhost:3000`.

---

## 2. Desktop Workspace Verification (Viewport >= 1024px)

### Test Steps
1. Navigate to `http://localhost:3000` on a screen >= 1024px (e.g. 1440×900).
2. **Layout Check**:
   - Verify Left Panel shows Watchlist (~260px width) with 8 major Binance pairs.
   - Verify Center Panel shows the candlestick chart filling available width.
   - Verify Right Panel shows the Signal Dossier (~420px width).
   - Check `document.documentElement.scrollWidth === window.innerWidth` (no horizontal scrollbar).
   - Verify window does not scroll vertically (`h-[calc(100vh-4rem)]`).
3. **Keyboard Navigation Check**:
   - Press `1` -> timeframe changes to `15m` and chart updates.
   - Press `2` -> timeframe changes to `1h`.
   - Press `3` -> timeframe changes to `4h`.
   - Press `4` -> timeframe changes to `1d`.
   - Press `⌘K` (or `Ctrl+K`) -> Command Palette opens.
   - Press `Escape` -> Command Palette closes.
4. **Signal Dossier Hierarchy Check**:
   - Top tier: Stance pill (BUY / SHORT / WAIT / AVOID) and `Signal Score: {score}/100`.
   - Execution card: Entry zone (Min, Max, Ideal), Stop Loss ($ and % risk), R:R ratio.
   - Invalidation card: Bulleted criteria list.
   - Telemetry pills: ADX(14), RSI(14), 200 EMA status.
   - AI Memo: Structured JSON breakdown (Thesis, Why Setup Exists, Context, Execution Plan).

---

## 3. Mobile Chart-First & Bottom-Sheet Verification (Viewport < 1024px)

### Test Steps
1. Set browser viewport to mobile emulation (e.g. iPhone 14 Pro, 393×852).
2. **Chart-First Anchor Check**:
   - Verify candlestick chart remains visible in the upper viewport area.
   - Verify no horizontal overflow (`scrollWidth === innerWidth`).
3. **Bottom Sheet Collapsed (Peek) Check**:
   - Verify a persistent peek bar sits at bottom (~68px) displaying:
     - Stance badge (e.g. BUY),
     - Score (`Score: 85/100`),
     - Asset & Live Price,
     - Expand chevron toggle.
4. **Bottom Sheet Expansion Check**:
   - Tap the peek bar or swipe up -> sheet smoothly slides up.
   - Verify full trade parameters, invalidation conditions, and AI Memo are scrollable inside the sheet.
   - Tap `✕` or swipe down -> sheet returns to collapsed peek state.
5. **Mobile Watchlist Drawer Check**:
   - Tap pair selector button in the chart header -> slide-over Watchlist drawer appears.
   - Select another pair (e.g. `ETHUSDT`) -> drawer closes, chart and signal load for new pair.

---

## 4. Model D Strategy Presentation Verification

### Test Steps
1. Navigate to `/api/signal-model-d?symbol=BTCUSDT` or inspect Model D signal in terminal.
2. Verify target levels in Signal Dossier are labeled `Рубеж +3.0R (Milestone)` and `Рубеж +6.0R (Milestone)` with sky-blue accent styling.
3. Verify the dossier displays the explanation banner:
   *"Model D: Выход строго по структурному трейлинг-стопу (5 свечей). Рубежи +3R и +6R являются ориентирами (Milestones), а не фиксированными тейк-профитами."*
4. Verify TradingView price lines render dashed sky-blue lines titled `Рубеж +{R}R (Milestone)` instead of `ТП1/ТП2`.

---

## 5. Data Resiliency & Fallback Verification

### Test Steps
1. Simulate unavailable macro API (e.g. Fear & Greed or Funding Rate null):
   - Header pills must show `—` instead of crashing or showing fabricated numbers.
   - AI Memo must explicitly note that macro data is unavailable.
2. In the Watchlist, when a refresh is delayed, previous valid prices are retained with an amber timestamp pill (`Данные от [время]`).
