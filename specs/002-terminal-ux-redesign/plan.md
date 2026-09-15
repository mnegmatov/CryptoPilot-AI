# Implementation Plan: Terminal UX Redesign for CryptoPilot AI

**Branch**: `002-terminal-ux-redesign` | **Date**: 2026-09-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-terminal-ux-redesign/spec.md`

---

## Summary

The Terminal UX Redesign transforms the CryptoPilot AI trading interface into an institutional-grade, responsive workspace across desktop and mobile without altering any quantitative trading formulas or Model D logic. The desktop terminal adopts a high-density, zero-scroll three-panel layout (Watchlist, Candlestick Chart, Signal Dossier) with keyboard shortcuts (`1`–`4`, `⌘K`). Mobile viewports are re-architected with a **chart-first anchor**, rendering the Signal Dossier as an ergonomic, interactive bottom sheet (collapsed peek bar showing stance/score/price, expandable to full execution details) and providing a slide-over Watchlist drawer. Model D setups are explicitly differentiated with `Milestone / R-multiple` indicators and structural trailing stop notes, while macro fallbacks transparently render `—` when data is unavailable.

---

## Technical Context

**Language/Version**: TypeScript 5.8 / Node.js 20+
**Primary Dependencies**: Next.js 15.5.25 (App Router), React 19, Tailwind CSS 3.4, `lightweight-charts` 4.2, `lucide-react`, `cmdk`, `sonner`
**Storage**: In-memory virtual paper trading store (stateless simulated ledger)
**Testing**: Vitest 3.2.7 (unit & integration tests, 11 test suites, 61+ tests)
**Target Platform**: Evergreen desktop and mobile web browsers (Chrome, Safari iOS, Firefox, Edge)
**Project Type**: Next.js Fullstack Web Terminal
**Performance Goals**: 60fps candlestick rendering, < 50ms mobile bottom sheet animation, zero layout shift (CLS = 0)
**Constraints**: Zero horizontal overflow (`scrollWidth === innerWidth`), touch targets >= 44×44px, WCAG AA contrast >= 4.5:1, NO quantitative engine modifications
**Scale/Scope**: 8 major Binance spot/futures pairs (BTC, ETH, SOL, BNB, AVAX, LINK, NEAR, SUI), 4 timeframes (15m, 1h, 4h, 1d)

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

- [x] **Article I (Paper Trading Only & Production Safety)**: Terminal operates strictly in virtual simulation mode. Zero real exchange order routing or private key requests. (PASS)
- [x] **Article II (Real Market Data & Zero Synthetic Inputs)**: Only authentic Binance Spot/Futures and Alternative.me endpoints are used. Unavailable values explicitly render as `—`. (PASS)
- [x] **Article III (Deterministic Quantitative Engine)**: Indicators, structure, and signals are 100% deterministic. No stochastic generation. (PASS)
- [x] **Article IV (AI as Analyst, Not Data Source)**: AI memo strictly synthesizes computed quantitative telemetry. Never invents prices or indicators. (PASS)
- [x] **Article V (Zero Lookahead & No Data Leakage)**: Signal and trailing stop evaluations use confirmed closed bars. (PASS)
- [x] **Article VII (Benchmark Preservation & Model D Baseline)**: Model D logic is untouched. +3R/+6R levels are presented strictly as informational milestones. (PASS)
- [x] **Article VIII (Strict Risk Management & Capital Guardrails)**: Mandatory stop loss, position sizer modal, and 1.0% default risk are preserved. (PASS)

---

## Project Structure

### Documentation (this feature)

```text
specs/002-terminal-ux-redesign/
├── plan.md              # Implementation Plan
├── research.md          # Architecture & UX Design Decisions
├── data-model.md        # Data & UI State Models
├── quickstart.md        # End-to-End Validation Guide
├── contracts/           # Component & Event Contracts
│   └── terminal-ui-contracts.md
├── checklists/          # Specification Quality Checklist
│   └── requirements.md
└── spec.md              # Feature Specification
```

### Source Code Architecture

```text
src/
├── app/
│   ├── page.tsx                             # Main terminal page: responsive 3-panel / mobile bottom-sheet coordinator
│   ├── globals.css                          # Custom scrollbar styles & bottom sheet animation utilities
│   └── layout.tsx                           # Root HTML/body shell
├── components/
│   ├── layout/
│   │   └── Header.tsx                       # Global header with macro sentiment pills (— fallback) and tab router
│   ├── terminal/
│   │   ├── TradingViewChart.tsx             # Candlestick chart with timeframe bar, keyboard hotkeys, and milestone lines
│   │   ├── SignalDossier.tsx                # Structured dossier: Header/Score, Trade Plan, Milestones, Invalidation, AI Memo
│   │   ├── Watchlist.tsx                    # Compact high-density pair list with 24h metrics and stale alerts
│   │   ├── CommandPalette.tsx               # ⌘K quick symbol search
│   │   └── PositionCalculatorModal.tsx      # Risk-managed position sizing modal
│   └── paper/
│       └── PaperTradingView.tsx             # Simulated paper trading portfolio with Model D trailing stop tracker
└── core/
    ├── types.ts                             # Core domain types (MarketContextData, TradingSignal)
    ├── ai/
    │   └── analyst.ts                       # AI institutional memo generator
    └── signals/
        └── generator.ts                     # Deterministic signal & Model D generator
```

---

## Phase 0: Research & Decision Summary

All architectural and UX decisions are documented and resolved in [research.md](./research.md):
1. **Desktop 3-Panel Geometry**: Fixed height `h-[calc(100vh-4rem)]`, Left Watchlist `260px`, Center Chart `flex-1 min-w-0`, Right Signal Dossier `420px`.
2. **Mobile Chart-First Architecture**: Upper viewport anchors the chart, lower viewport hosts the Signal Dossier bottom sheet (`~68px` collapsed peek bar, slides up to full sheet), header hosts quick Watchlist drawer.
3. **Model D Visual Separation**: Distinctive sky-blue milestone tags (`Рубеж +3.0R (Milestone)`) and structural trailing stop explanation.
4. **Keyboard Shortcuts**: Keys `1`–`4` for timeframe switching, `⌘K` for search, `Escape` to close overlays.
5. **Transparent Fallbacks**: Null macro data renders as `—` with informative tooltip.

---

## Phase 1: Design Artifacts

- **Data Models**: Defined in [data-model.md](./data-model.md).
- **Interface Contracts**: Defined in [contracts/terminal-ui-contracts.md](./contracts/terminal-ui-contracts.md).
- **Validation Guide**: Defined in [quickstart.md](./quickstart.md).
