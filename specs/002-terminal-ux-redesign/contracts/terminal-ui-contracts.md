# UI Component & Event Contracts: Terminal UX Redesign

**Feature**: `002-terminal-ux-redesign`
**Date**: 2026-09-15
**Status**: Completed

---

## 1. Signal Dossier Component Contract

```typescript
export interface SignalDossierProps {
  /** The computed deterministic quantitative signal, or null during load/error */
  signal: TradingSignal | null;

  /** Indicates quantitative engine computation is in progress */
  loading: boolean;

  /** Error message if upstream candle resolution or signal generation failed */
  error?: string | null;

  /** Manual retry callback */
  onRetry?: () => void;

  /** Virtual paper trade dispatch handler */
  onDeployPaperTrade: (riskPct: number, orderType: "MARKET" | "LIMIT") => void;

  /** Mobile bottom sheet display mode */
  isMobileSheet?: boolean;

  /** Mobile bottom sheet expanded state */
  isExpanded?: boolean;

  /** Toggle mobile sheet expanded/collapsed */
  onToggleExpand?: () => void;
}
```

---

## 2. TradingView Candlestick Chart Component Contract

```typescript
export interface TradingViewChartProps {
  /** Selected market pair (e.g. "BTCUSDT") */
  symbol: string;

  /** Active timeframe */
  timeframe: Timeframe; // "15m" | "1h" | "4h" | "1d"

  /** Callback when user changes timeframe */
  onTimeframeChange: (tf: Timeframe) => void;

  /** Real validated historical candlesticks from Binance */
  candles: Candle[];

  /** Active signal to render overlay price lines (SL, Milestones / TPs) */
  signal: TradingSignal | null;

  /** Loading state */
  loading: boolean;

  /** Error state */
  error?: string | null;

  /** Retry handler */
  onRetry?: () => void;

  /** Mobile-only: trigger to open slide-over Watchlist drawer */
  onOpenMobileWatchlist?: () => void;
}
```

---

## 3. Watchlist Component Contract

```typescript
export interface WatchlistProps {
  /** Real-time watchlist assets from Binance batch tickers */
  assets: WatchlistAsset[];

  /** Currently selected symbol */
  selectedSymbol: string;

  /** Selection handler */
  onSelectSymbol: (symbol: string) => void;

  /** Loading indicator */
  loading: boolean;

  /** Error message */
  error?: string | null;

  /** Indicates data is stale due to background refresh delay */
  isStale?: boolean;

  /** Epoch timestamp of last successful update */
  lastUpdated?: number | null;

  /** Manual refresh trigger */
  onRetry?: () => void;

  /** Mobile-only: close drawer callback after selecting an asset */
  onCloseMobileDrawer?: () => void;
}
```

---

## 4. Keyboard Shortcuts Contract

| Key Combination | Scope | Action | Expected Outcome |
| :--- | :--- | :--- | :--- |
| `1` | Global (non-input) | Switch timeframe to 15m | Chart reloads 15m Binance candles |
| `2` | Global (non-input) | Switch timeframe to 1h | Chart reloads 1h Binance candles |
| `3` | Global (non-input) | Switch timeframe to 4h | Chart reloads 4h Binance candles |
| `4` | Global (non-input) | Switch timeframe to 1d | Chart reloads 1d Binance candles |
| `⌘K` / `Ctrl+K` | Global | Open Command Palette | Displays symbol search dialog |
| `Escape` | Global | Dismiss Overlays | Closes open drawer, modal, or mobile sheet |
