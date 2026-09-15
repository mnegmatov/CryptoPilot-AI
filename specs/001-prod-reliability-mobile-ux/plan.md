# Implementation Plan: Production Data Reliability & Mobile Responsive UX

**Branch**: `001-prod-reliability-mobile-ux` | **Date**: 2026-09-15 | **Spec**: [specs/001-prod-reliability-mobile-ux/spec.md](spec.md)

**Input**: Feature specification from `specs/001-prod-reliability-mobile-ux/spec.md` with ratified clarifications from session 2026-09-15.

---

## Summary

This plan resolves the two primary production deficiencies of CryptoPilot AI on Vercel:
1. **Production Data Reliability**: Eliminates `$0.0000` ticker displays, blank TradingView charts, and infinite Signal Dossier spinners by introducing an internal server-side multi-endpoint fallback router (prioritizing `https://data-api.binance.vision`), enforcing request timeouts (8s), standard browser headers, removing silent dummy-zero catches, decoupling client loading/error states, and implementing transparent error recovery with stale-data preservation.
2. **Mobile Responsive UX**: Eliminates uncontrolled horizontal viewport blowout and layout collapsing on screens below 1024px by introducing a dedicated mobile segmented switcher ("График" / "Пары" / "Сигнал"), auto-switching to Chart on asset selection, wrapping wide tables in isolated horizontal scroll containers, resizing canvas charts via `ResizeObserver`, and ensuring 44×44px touch accessibility, while preserving 100% of the existing 3-column desktop layout on viewports >= 1024px.

---

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 20+ runtime (Next.js 15 App Router, React 19).

**Primary Dependencies**:
- `@google/generative-ai` (^0.24.0) — institutional qualitative analysis fallback
- `lightweight-charts` (^4.2.2) — TradingView canvas chart rendering
- `lucide-react` (^0.475.0) — UI iconography
- `sonner` (^2.0.1) — toast notifications
- `tailwind-merge` (^3.0.2), `clsx` (^2.1.1) — responsive styling
- `vitest` (^3.0.7) — unit and integration test runner

**Storage**: In-memory paper wallet state (`PaperTradingWallet`), client React state, and Next.js revalidated fetch caches. Zero persistent database schema changes required.

**Testing**: Vitest (`npm test`) with mocking for multi-endpoint network fallback and error states.

**Target Platform**: Vercel Serverless Functions (Next.js 15) and modern mobile/desktop web browsers (iOS Safari 16+, Android Chrome 110+, Desktop Chrome/Safari/Firefox).

**Project Type**: Next.js Full-Stack Web Application (Serverless API Routes + React Client Components).

**Performance Goals**:
- Initial live market data resolution on production < 2.0s;
- Signal calculation resolution < 3.0s;
- Chart render time < 2.5s;
- Document horizontal overflow on mobile viewports strictly 0px (`scrollWidth === window.innerWidth`);
- Chart canvas resize response < 16ms (60fps animation frame) via `ResizeObserver`.

**Constraints**:
- Zero synthetic or fake market data (Constitution Principle II);
- Strict Paper Trading Only, zero live trade execution, zero private API keys (Constitution Principle I);
- Zero changes to trading strategy logic, Model D baseline, or V1/V2/V3 quant math (Constitution Principles III, VII);
- Complete preservation of desktop 3-column layout on screens >= 1024px.

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Principle I (Paper Trading Only)**: PASS. No live trading endpoints, order execution keys, or exchange trade permissions are added or altered.
- [x] **Principle II (Real Market Data)**: PASS. The plan removes the silent `lastPrice: 0` fallback in `market-feed.ts` and routes requests through official Binance public endpoints (`data-api.binance.vision`). No fake quotes or synthetic prices are introduced.
- [x] **Principle III (Deterministic Quant Engine)**: PASS. All indicators in `src/core/quant/` remain strictly deterministic and untouched.
- [x] **Principle IV (AI as Analyst, Not Data Source)**: PASS. Gemini and the deterministic fallback analyst continue to operate exclusively on pre-calculated quantitative telemetry.
- [x] **Principle V (Zero Lookahead)**: PASS. Candle slicing and confirmed bar rules remain unchanged.
- [x] **Principle VII (Benchmark & Model D Baseline)**: PASS. Strategy Model D, V1, V2, and V3 implementations in `src/core/signals/generator.ts` and `src/core/backtest/engine.ts` are completely untouched.
- [x] **Principle VIII (Risk Management)**: PASS. Position sizing and virtual margin guardrails remain intact.
- [x] **Principle XIII (API Reliability & Fault Tolerance)**: PASS. The core objective of this plan directly enforces robust multi-endpoint fallbacks, timeouts, and transparent error reporting.
- [x] **Principle XIV (UI/UX Quality & Performance)**: PASS. Mobile responsive layout eliminates overflow while preserving desktop institutional terminal ergonomics.

---

## Project Structure & Affected Components

### Documentation (this feature)

```text
specs/001-prod-reliability-mobile-ux/
├── spec.md              # Ratified feature specification
├── checklists/
│   └── requirements.md  # Validated quality checklist (16/16 passing)
├── plan.md              # This implementation plan
└── tasks.md             # Implementation task list (/speckit-tasks output)
```

### Source Code Impact Matrix

```text
src/
├── app/
│   ├── api/
│   │   ├── candles/route.ts       # [MODIFY] Return typed error contracts and status codes
│   │   ├── market/route.ts        # [MODIFY] Return typed error contracts and propagate failures
│   │   ├── signal/route.ts        # [MODIFY] Enforce timeout and typed error contracts
│   │   └── signal-model-d/route.ts # [MODIFY] Enforce timeout and typed error contracts
│   ├── page.tsx                   # [MODIFY] Implement mobile segmented switcher, state decoupling (loading vs error vs stale), and auto-focus on symbol select
│   └── layout.tsx                 # [MODIFY] Ensure viewport meta and overflow constraints
├── components/
│   ├── layout/
│   │   └── Header.tsx             # [MODIFY] Mobile-compact navigation tabs and macro badge scaling
│   ├── terminal/
│   │   ├── Watchlist.tsx          # [MODIFY] Add Stale/Reconnecting badge, Retry button, 44px touch targets
│   │   ├── TradingViewChart.tsx   # [MODIFY] Replace window resize with ResizeObserver, add Error/Retry overlay
│   │   └── SignalDossier.tsx      # [MODIFY] Decouple loading spinner from null signal, add Error State card with Retry
│   └── paper/
│       └── PaperTradingView.tsx   # [MODIFY] Wrap wide 10-column tables in isolated overflow-x-auto, tune mobile telemetry cards
├── core/
│   ├── data/
│   │   ├── binance.ts             # [MODIFY] Multi-endpoint resilience (data-api.binance.vision -> api1-3 -> api), timeout (8s), browser headers
│   │   └── market-feed.ts         # [MODIFY] Remove silent dummy-zero catch block; propagate real fetch errors
│   └── types.ts                   # [MODIFY] Add ApiErrorResponse, ApiResponse<T>, and StaleQuoteMetadata types
└── __tests__/
    ├── binance-resilience.test.ts # [NEW] Test multi-endpoint fallback, timeout, and zero-data prevention
    └── api-error-contracts.test.ts# [NEW] Test API error handling and status code propagation
```

---

## Detailed Technical Implementation Approach

### 1. Binance Multi-Endpoint Resilience Architecture
In `src/core/data/binance.ts`:
- Define the ordered endpoint pool:
  ```typescript
  const BINANCE_PUBLIC_ENDPOINTS = [
    "https://data-api.binance.vision", // Dedicated public market data gateway (no geo-block)
    "https://api1.binance.com",        // Mirror cluster 1
    "https://api2.binance.com",        // Mirror cluster 2
    "https://api3.binance.com",        // Mirror cluster 3
    "https://api.binance.com",         // Primary standard gateway
  ];
  ```
- Implement `fetchBinanceWithFallback<T>(endpointPath: string, options?: RequestInit): Promise<T>`:
  - Iterates through `BINANCE_PUBLIC_ENDPOINTS` sequentially.
  - Attaches standard browser headers (`User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36`).
  - Attaches `AbortSignal.timeout(8000)` to each attempt.
  - If an endpoint returns 403, 451, 5xx, or times out, logs a warning and proceeds to the next endpoint in the pool.
  - If all endpoints fail, throws a typed `BinanceServiceUnavailableError` with the root cause details.
- Apply this helper across:
  - `fetchBinanceKlines`
  - `fetchBinanceKlinesRange`
  - `fetchBinance24hrTicker`
  - `fetchBinanceBatchTickers`
- For Futures Funding Rate (`src/core/data/binance.ts`): retain fallback to baseline `0.0001` (0.01%) only for funding rate when derivatives are blocked or unavailable on the instrument.

### 2. Typed API Error Contracts
In `src/core/types.ts`:
```typescript
export interface ApiErrorResponse {
  success: false;
  error: string;
  code: "UPSTREAM_TIMEOUT" | "UPSTREAM_UNAVAILABLE" | "INVALID_PAYLOAD" | "INTERNAL_ERROR";
  timestamp: number;
}

export type ApiResponse<T> = ({ success: true } & T) | ApiErrorResponse;
```
In serverless routes (`/api/market`, `/api/candles`, `/api/signal`, `/api/signal-model-d`):
- Catch blocks return `NextResponse.json<ApiErrorResponse>`:
  - Status 504 if error is timeout;
  - Status 502/503 if upstream Binance pool failed;
  - Status 400 for bad parameters;
  - Status 500 for unexpected errors.
- Never return `{ success: true }` with dummy or empty payload on failure.

### 3. Loading vs. Error State Decoupling
In `src/app/page.tsx`:
- Refactor top-level state to track errors independently:
  ```typescript
  const [watchlistError, setWatchlistError] = useState<string | null>(null);
  const [isWatchlistStale, setIsWatchlistStale] = useState(false);
  const [lastMarketUpdate, setLastMarketUpdate] = useState<number | null>(null);

  const [candlesError, setCandlesError] = useState<string | null>(null);
  const [signalError, setSignalError] = useState<string | null>(null);
  ```
- Pass explicit error props and retry handlers:
  - `<Watchlist error={watchlistError} isStale={isWatchlistStale} lastUpdate={lastMarketUpdate} onRetry={fetchMarketOverview} ... />`
  - `<TradingViewChart error={candlesError} onRetry={() => fetchCandles(selectedSymbol, timeframe)} ... />`
  - `<SignalDossier error={signalError} onRetry={() => fetchSignal(selectedSymbol)} ... />`

### 4. Stale Real-Price Preservation
In `src/core/data/market-feed.ts` and `src/app/page.tsx`:
- Remove the catch block in `getWatchlistOverview()` that silently returned `lastPrice: 0`. Errors will bubble up so the caller knows the fetch failed.
- In `fetchMarketOverview()` in `page.tsx`:
  - If the request fails, check if `watchlist.length > 0`:
    - If yes: keep current `watchlist` items, set `isWatchlistStale = true`, and set `watchlistError = "Связь с биржей прервана. Отображаются последние сохранённые цены."`.
    - If no (initial load failed): set `watchlistError = "Не удалось получить рыночные данные"`, keep `watchlist = []`.
  - On successful fetch: clear `watchlistError`, set `isWatchlistStale = false`, set `lastMarketUpdate = Date.now()`.

### 5. Chart and Signal Dossier Error Recovery
In `src/components/terminal/TradingViewChart.tsx`:
- When `error` is true and `candles.length === 0`:
  Render an institutional error overlay inside the chart container:
  - Warning icon, message `"Не удалось загрузить график"`, detailed error text, and a prominent `"Повторить загрузку"` button.
  - Retain previously rendered chart series if a background poll fails (do not blank out the chart on transient refresh errors).
In `src/components/terminal/SignalDossier.tsx`:
- Disentangle `if (loading || !signal)`:
  - If `loading`: render spinning loader `"Генерация количественного сетапа..."`.
  - If `error && !signal`: render dedicated Error State card:
    - AlertTriangle icon.
    - Header: `"Ошибка генерации торгового сигнала"`.
    - Body: specific reason (e.g. `"Биржевой шлюз Binance недоступен"`).
    - Action button: `"Повторить анализ"`, calling `onRetry`.
  - If `!loading && !signal && !error`: render neutral idle state.
  - If `signal`: render full institutional signal dossier.

### 6. Responsive Mobile Terminal Navigation
In `src/app/page.tsx`:
- Below `lg` (< 1024px), render a Mobile Segmented Switcher bar above the main content:
  ```typescript
  const [mobileSection, setMobileSection] = useState<"chart" | "watchlist" | "signal">("chart");
  ```
- Render segments:
  - `[ График ]`
  - `[ Пары (${watchlist.length}) ]`
  - `[ Сигнал (${signal?.stance || "..."}) ]`
- Only display the active section full-screen on mobile:
  - `mobileSection === "watchlist"`: `<Watchlist ... />` fills width and height.
  - `mobileSection === "chart"`: `<TradingViewChart ... />` fills width and height.
  - `mobileSection === "signal"`: `<SignalDossier ... />` fills width and height.
- Auto-focus transition: When the user selects an asset in the Watchlist on mobile, execute `setSelectedSymbol(sym)` AND `setMobileSection("chart")`, immediately presenting the updated chart to the user.

### 7. Desktop Layout Preservation
- Wrap the Mobile Segmented Switcher in `flex lg:hidden`.
- On `lg:` (>= 1024px):
  - Container retains `flex lg:flex-row w-full h-[calc(100vh-4rem)] overflow-hidden`.
  - Watchlist renders as left sidebar (`w-64 border-r`).
  - TradingViewChart renders as center area (`flex-1`).
  - SignalDossier renders as right panel (`w-[460px] border-l`).
  - All three components are permanently visible simultaneously, preserving desktop parity.

### 8. ResizeObserver for TradingView Chart
In `src/components/terminal/TradingViewChart.tsx`:
- Replace `window.addEventListener("resize", handleResize)` with a `ResizeObserver`:
  ```typescript
  const observer = new ResizeObserver((entries) => {
    if (!entries[0] || !chartRef.current) return;
    const { width, height } = entries[0].contentRect;
    if (width > 0 && height > 0) {
      chartRef.current.applyOptions({ width, height });
    }
  });
  if (chartContainerRef.current) {
    observer.observe(chartContainerRef.current);
  }
  ```
- This ensures accurate, smooth re-rendering when:
  - Switching between mobile sections ("Пары" -> "График");
  - Rotating device orientation (portrait <-> landscape);
  - Resizing desktop windows across breakpoints.

### 9. Mobile Touch Accessibility & Header Responsiveness
In `src/components/layout/Header.tsx`:
- On `< md` (< 768px):
  - Hide verbose text labels on tab buttons; show intuitive icons + active highlight dot or compact badges.
  - Hide secondary macro pill text to prevent horizontal header stretching.
  - Header maintains `px-3` and `h-14`, strictly preventing horizontal scroll blowout.
- Touch target enforcement:
  - Timeframe buttons in `TradingViewChart.tsx`: minimum padding `py-2 px-3` (min 44px tap target).
  - Watchlist items: `p-3.5` (min 48px height).
  - Modal close and trade execution buttons: minimum `h-11` (44px).

### 10. Responsive Paper Trading & Backtest Tables
In `src/components/paper/PaperTradingView.tsx` and `src/components/backtest/BacktestView.tsx`:
- Wrap table elements in `<div className="w-full overflow-x-auto rounded-xl border border-[#1E2638] -webkit-overflow-scrolling-touch">`.
- Prevent root container overflow by applying `max-w-full overflow-x-hidden` on parent views.
- Telemetry grid in `PaperTradingView`: ensure `grid-cols-2 sm:grid-cols-3 md:grid-cols-6` scales fonts and paddings gracefully on screens down to 360px.

### 11. Tests & Verification Strategy
1. **Automated Unit Tests (`vitest run`)**:
   - `src/__tests__/binance-resilience.test.ts`:
     - Test 1: Verifies that `fetchBinanceWithFallback` calls `https://data-api.binance.vision` first.
     - Test 2: Verifies fallback to `api1.binance.com` if `data-api.binance.vision` returns 500 or times out.
     - Test 3: Verifies that an exception is thrown when all endpoints fail, with zero synthetic quotes generated.
     - Test 4: Verifies that User-Agent and timeouts are attached to requests.
   - `src/__tests__/api-error-contracts.test.ts`:
     - Test 1: Verifies `/api/market` returns `success: false` and status 502/503 when Binance is down.
     - Test 2: Verifies `/api/candles` returns `success: false` on failure.
     - Test 3: Verifies `/api/signal` propagates error contract instead of hanging.
   - All existing 34 tests in `src/__tests__/` must continue passing without modification.
2. **Manual & Responsive Verification**:
   - Verify viewports: 375px (iPhone SE), 393px (iPhone 14 Pro), 412px (Pixel 7), 768px (iPad Mini), 1280px+ (MacBook / Desktop).
   - Evaluate `window.innerWidth === document.documentElement.scrollWidth` (must evaluate to `true` on all viewports).
   - Simulate network failure in DevTools (Offline / Block request URL) to confirm error cards and retry buttons appear.

---

## Complexity Tracking

> No constitutional violations. No unnecessary complexity introduced.

| Design Choice | Why Needed | Simpler Alternative Rejected Because |
| :--- | :--- | :--- |
| Server-side endpoint pool | Overcomes regional/cloud IP blocks on Vercel without proxy infrastructure | Hardcoding single endpoint breaks on Vercel US datacenters; paid proxy adds external dependency |
| Mobile segmented switcher | Allows ergonomic mobile usage of complex 3-column trading terminal | Stacking all 3 columns vertically makes chart invisible and causes infinite scrolling |
| `ResizeObserver` | Accurately tracks chart container resize on tab switch & rotation | Window `resize` event misses container size changes when toggling CSS display/tabs |
