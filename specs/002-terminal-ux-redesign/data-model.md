# Data & UI State Models: Terminal UX Redesign

**Feature**: `002-terminal-ux-redesign`
**Date**: 2026-09-15
**Status**: Completed

---

## 1. Terminal UI Workspace State

Represents the interactive state of the terminal workspace across desktop and mobile viewports.

```typescript
export interface TerminalWorkspaceState {
  /** Active selected cryptocurrency pair (e.g. "BTCUSDT") */
  selectedSymbol: string;

  /** Active candlestick chart timeframe */
  timeframe: "15m" | "1h" | "4h" | "1d";

  /** Mobile bottom sheet expansion state (< 1024px) */
  mobileSheetState: "COLLAPSED" | "EXPANDED";

  /** Mobile slide-over watchlist drawer state */
  isMobileWatchlistOpen: boolean;

  /** Command palette (⌘K) visibility */
  isCommandPaletteOpen: boolean;

  /** Position sizing & risk calculator modal visibility */
  isCalculatorModalOpen: boolean;

  /** Active top-level navigation tab */
  activeTab: "terminal" | "backtest" | "paper";
}
```

---

## 2. Signal Dossier Presentation Model

Derived from the verified `TradingSignal` entity to drive structured visual rendering.

```typescript
export interface SignalDossierPresentation {
  /** Signal identifier */
  id: string;

  /** Asset symbol (e.g. "BTCUSDT") */
  asset: string;

  /** Formatted ticker display (e.g. "BTC / USDT") */
  displayTicker: string;

  /** Trade stance: BUY | SHORT | WAIT | AVOID */
  stance: "BUY" | "SHORT" | "WAIT" | "AVOID";

  /** UI color & badge theme for active stance */
  stanceTheme: {
    bg: string;
    text: string;
    border: string;
    label: string;
  };

  /** Confluence score strictly formatted as "/100" */
  signalScore: {
    value: number; // 0 - 100
    display: string; // e.g. "85/100"
    label: string; // "Signal Score /100"
    tier: "HIGH" | "MODERATE" | "LOW"; // >=70 emerald, >=50 amber, <50 rose
  };

  /** Execution parameters */
  execution: {
    entryMin: number;
    entryMax: number;
    entryIdeal: number;
    stopLoss: number;
    stopLossPercentage: number;
    riskRewardRatio: number;
  };

  /** Strategy classification */
  isModelD: boolean;

  /** Target ladder items (Milestones for Model D, TPs for V1/V2/V3) */
  targets: Array<{
    level: number;
    price: number;
    percentage: number;
    rewardRisk: number;
    label: string; // "Рубеж +3.0R (Milestone)" or "ТП1"
    isMilestone: boolean;
    description: string;
    targetReason?: string;
  }>;

  /** Strategy exit mechanism note */
  exitStrategyNote: string;

  /** Technical indicators & structure badges */
  telemetry: {
    adx: { value: number; isTrending: boolean };
    rsi: { value: number; state: string };
    trendHTF: "BULLISH" | "BEARISH" | "SIDEWAYS";
    trendLTF: "BULLISH" | "BEARISH" | "SIDEWAYS";
    liquiditySweep?: string;
  };

  /** Invalidation checklist */
  invalidationConditions: string[];

  /** Structured AI analyst memo */
  aiMemo?: {
    thesis: string;
    whySetupExists: string;
    marketContextSummary: string;
    invalidationDetail: string;
    executionPlan: string;
  };
}
```

---

## 3. Macro Market Context Presentation Model

Drives the top header sentiment pills and market context summaries, cleanly handling unavailable states.

```typescript
export interface MacroContextPresentation {
  /** Fear and greed score (0-100) or null if unavailable */
  fearGreedDisplay: string; // "72 (Greed)" or "—"
  isFearGreedAvailable: boolean;

  /** Funding rate percentage or null if unavailable */
  fundingRateDisplay: string; // "+0.0125%" or "—"
  isFundingAvailable: boolean;

  /** Market regime description */
  regimeDisplay: string; // "Бычий тренд", "Боковик / Рейндж", etc.
  regimeRaw: "TRENDING_BULL" | "TRENDING_BEAR" | "CHOPPY_RANGE" | "HIGH_VOLATILITY_EXPANSION";
}
```

---

## 4. State Transitions

```
[Mobile Terminal State Machine]

         ┌────────────────────────────────┐
         │ Chart Anchor Mounted (Full-W)  │
         │ Dossier: COLLAPSED (Peek ~68px)│
         └───────────────┬────────────────┘
                         │
         User Taps/Drags │ User Taps
         Peek Bar Up     │ Close/Drags Down
                         ▼
         ┌────────────────────────────────┐
         │ Chart Remains at Top (Backdrop)│
         │ Dossier: EXPANDED (Full Sheet) │
         └────────────────────────────────┘
                         │
         User Taps Pair  │ User Selects Pair /
         Selector        │ Taps Outside
                         ▼
         ┌────────────────────────────────┐
         │ Mobile Watchlist Drawer Open   │
         └────────────────────────────────┘
```
