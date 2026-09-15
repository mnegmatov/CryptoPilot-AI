# Implementation Tasks: Terminal UX Redesign for CryptoPilot AI

**Branch**: `002-terminal-ux-redesign` | **Date**: 2026-09-15 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish styling variables, animation keyframes, and shared UI presentation types for the redesign.

- [x] T001 Configure bottom-sheet transitions, scrollbar utilities, and mobile touch constraints in src/app/globals.css
- [x] T002 [P] Export typed workspace and component presentation interfaces in src/core/types.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core layout scaffolding, mobile state management, and keyboard event routing required before individual panels can be rendered.

**⚠️ CRITICAL**: All user stories depend on this layout foundation.

- [x] T003 Implement global keyboard shortcut listener (`1`–`4` for timeframe, `Escape` to close overlays) in src/app/page.tsx
- [x] T004 [P] Establish responsive layout container (`h-[calc(100vh-4rem)]` desktop 3-panel, mobile full-width wrapper) in src/app/page.tsx
- [x] T005 [P] Setup mobile drawer and bottom-sheet toggle state hooks in src/app/page.tsx

**Checkpoint**: Foundation ready — three-panel desktop container and mobile viewport state coordinator are initialized.

---

## Phase 3: User Story 1 - Desktop Three-Panel Terminal Navigation & Analysis (Priority: P1) 🎯 MVP

**Goal**: Deliver a rigid, distraction-free desktop workspace (Watchlist left, Chart center, Signal Dossier right) with strict visual hierarchy and keyboard shortcuts.

**Independent Test**: Load the terminal on desktop (>= 1024px); verify all three panels are visible within viewport height without document scrollbars, timeframes switch instantly with keys `1`–`4`, and selecting pairs updates chart and dossier synchronously.

### Tests for User Story 1
- [x] T006 [P] [US1] Unit test desktop three-panel layout constraints and keyboard hotkeys in src/__tests__/desktop-terminal.test.ts

### Implementation for User Story 1
- [x] T007 [P] [US1] Redesign left Watchlist panel geometry (~260px fixed width, tabular ticker rows, 24h change indicators) in src/components/terminal/Watchlist.tsx
- [x] T008 [P] [US1] Redesign center TradingView chart control bar (timeframe selector `15m`/`1h`/`4h`/`1d`, live price badge, fit content trigger) in src/components/terminal/TradingViewChart.tsx
- [x] T009 [US1] Structure right Signal Dossier desktop layout into four distinct visual tiers (Header/Score, Execution Box, Telemetry & Invalidation, AI Memo) in src/components/terminal/SignalDossier.tsx
- [x] T010 [US1] Wire desktop three-panel layout and keyboard-driven timeframe state in src/app/page.tsx

**Checkpoint**: Desktop three-panel terminal is completely functional, ergonomic, and independently testable.

---

## Phase 4: User Story 2 - Mobile Chart-First Workspace with Bottom-Sheet Dossier (Priority: P1)

**Goal**: Re-architect viewports < 1024px so the candlestick chart anchors the top view, the Signal Dossier acts as an interactive bottom sheet (collapsed peek bar ~68px, expandable to full dossier), and the Watchlist opens via a slide-over drawer.

**Independent Test**: Load terminal in mobile emulation (393×852); verify chart is continuously visible, bottom peek bar shows Stance/Score/Price, swiping/tapping expands full dossier, pair selector slides in Watchlist drawer, and horizontal document overflow is strictly 0px.

### Tests for User Story 2
- [ ] T011 [P] [US2] Update mobile terminal integration test suite covering chart continuity and bottom-sheet expansion states in src/__tests__/mobile-terminal.test.ts

### Implementation for User Story 2
- [ ] T012 [P] [US2] Implement mobile collapsed peek bar component (~68px height, Stance badge, Signal Score /100, Live Price, expand chevron) in src/components/terminal/SignalDossier.tsx
- [ ] T013 [US2] Implement mobile bottom-sheet slide-up expansion overlay with drag handle and close button in src/components/terminal/SignalDossier.tsx
- [ ] T014 [P] [US2] Implement slide-over mobile Watchlist drawer with backdrop overlay in src/components/terminal/Watchlist.tsx
- [ ] T015 [US2] Integrate mobile header pair switcher (`BTC/USDT ▼`) in src/components/terminal/TradingViewChart.tsx
- [ ] T016 [US2] Integrate chart-first mobile layout with coordinated bottom sheet and drawer state in src/app/page.tsx

**Checkpoint**: Mobile chart-first layout and interactive bottom sheet deliver fluid one-thumb navigation without concealing the chart.

---

## Phase 5: User Story 3 - Model D Structural Trailing vs. Standard Take-Profit Distinction (Priority: P2)

**Goal**: Clearly differentiate Model D setups from standard fixed-target signals by designating +3R/+6R as informational milestones and articulating the 5-bar structural swing trailing exit rule.

**Independent Test**: Select a Model D 4H setup; verify targets are labeled `Рубеж +3.0R (Milestone)` with sky-blue accents, chart lines render as Milestones, and the dossier includes the 5-bar swing trailing explanation banner.

### Implementation for User Story 3
- [ ] T017 [P] [US3] Add Model D structural trailing exit explanation banner and milestone tags in src/components/terminal/SignalDossier.tsx
- [ ] T018 [P] [US3] Render dashed sky-blue milestone price lines for Model D signals in src/components/terminal/TradingViewChart.tsx
- [ ] T019 [US3] Ensure AI Analyst institutional memo describes Model D milestone targets and trailing exit logic in src/core/ai/analyst.ts

**Checkpoint**: Model D informational milestones and trailing exits are unambiguously presented across the chart, dossier, and AI memo.

---

## Phase 6: User Story 4 - High-Visibility Telemetry, Resilient Error & Stale States (Priority: P2)

**Goal**: Provide transparent, high-contrast visual indicators when upstream feeds are loading, stale, or unavailable (`—`).

**Independent Test**: Disconnect network or trigger upstream timeout; verify header macro sentiment displays `—`, Watchlist displays amber stale timestamp pill (`Данные от [время]`), and error cards render inline retry triggers.

### Implementation for User Story 4
- [ ] T020 [P] [US4] Enhance macro sentiment pills with high-contrast unavailable states (`—`) and tooltip explanation in src/components/layout/Header.tsx
- [ ] T021 [P] [US4] Polish Watchlist amber stale-data banner and skeleton loading shimmer in src/components/terminal/Watchlist.tsx
- [ ] T022 [US4] Polish Signal Dossier error card with clear failure description and retry button in src/components/terminal/SignalDossier.tsx

**Checkpoint**: All transient and unavailable data states are visually polished and adhere to zero-synthetic-data standards.

---

## Phase 7: User Story 5 - Virtual Paper Trading Presentation (Priority: P3)

**Goal**: Enhance the virtual paper trading dashboard to highlight simulated portfolio metrics, active Model D trailing stops, and clear demo account branding.

**Independent Test**: Navigate to the Paper Trading tab; verify virtual account banner is prominently displayed, Model D positions show live trailing stop levels with `Свинг 5св` badge, and closing positions executes cleanly.

### Implementation for User Story 5
- [ ] T023 [P] [US5] Add prominent virtual demo banner and polish portfolio summary cards (Equity, Balance, PnL) in src/components/paper/PaperTradingView.tsx
- [ ] T024 [US5] Enhance open positions table with distinct Model D trailing stop badges (`Свинг 5св`, `БУ`) and position close actions in src/components/paper/PaperTradingView.tsx

**Checkpoint**: Virtual paper trading view clearly communicates simulation parameters and dynamic trailing stop progression.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Accessibility verification, build verification, and end-to-end quickstart scenario testing.

- [ ] T025 [P] Audit WCAG AA contrast (>= 4.5:1) and touch target sizing (>= 44×44px) across all interactive controls in src/app/globals.css
- [ ] T026 Execute automated test suite (`npm test`) across all 12 test suites in src/__tests__/
- [ ] T027 Execute Next.js production build (`npm run build`) to verify strict TypeScript typing and bundle optimization
- [ ] T028 Validate end-to-end quickstart scenarios per specs/002-terminal-ux-redesign/quickstart.md

---

## Dependencies & Execution Order

### Phase Dependencies
- **Phase 1 (Setup)**: Can start immediately.
- **Phase 2 (Foundational)**: Depends on Phase 1; **blocks all user story phases**.
- **Phase 3 (US1 - Desktop MVP)**: Depends on Phase 2; can be implemented independently.
- **Phase 4 (US2 - Mobile Bottom Sheet)**: Depends on Phase 2; builds on component layout from Phase 3.
- **Phase 5 (US3 - Model D Milestones)**: Depends on Phase 3 and Phase 4.
- **Phase 6 (US4 - Resilient States)**: Can run in parallel with Phase 5.
- **Phase 7 (US5 - Paper Trading)**: Depends on Phase 2; independent of Phase 3/4.
- **Phase 8 (Polish)**: Depends on completion of all desired user story phases.

### Parallel Opportunities
- T001 and T002 can run in parallel.
- T004 and T005 can run in parallel within Foundational phase.
- T007 (Watchlist), T008 (Chart), and T009 (Dossier) can be developed in parallel during Phase 3.
- T012 (Peek bar) and T014 (Watchlist drawer) can be developed in parallel during Phase 4.
- T017 (Dossier) and T018 (Chart) can run in parallel during Phase 5.
- T020 (Header) and T021 (Watchlist) can run in parallel during Phase 6.

---

## Implementation Strategy: MVP First

1. **Sprint 1 (MVP Foundation)**:
   - Complete Phase 1 (Setup) and Phase 2 (Foundational).
   - Complete Phase 3 (User Story 1 - Desktop Three-Panel Terminal).
   - *Verify Desktop MVP*: Load desktop view, verify three panels, test keyboard shortcuts.
2. **Sprint 2 (Mobile Ergonomics)**:
   - Complete Phase 4 (User Story 2 - Mobile Chart-First & Bottom Sheet).
   - *Verify Mobile MVP*: Emulate 393px viewport, test peek bar, bottom sheet expansion, and drawer.
3. **Sprint 3 (Refinements & Polish)**:
   - Complete Phase 5 (Model D Milestones) and Phase 6 (Resilient States).
   - Complete Phase 7 (Paper Trading Presentation).
   - Run Phase 8 (Automated tests, Next.js build, Quickstart validation).
