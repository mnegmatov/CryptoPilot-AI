# Feature Specification: Production Data Reliability & Mobile Responsive UX

**Feature Branch**: `001-prod-reliability-mobile-ux`

**Created**: 2026-09-15

**Status**: Clarified

**Input**: User description: "Исправить две реальные проблемы production-версии CryptoPilot AI: 1. Production data reliability (рыночные данные $0.0000, пустой график TradingView, бесконечный loading 'Генерация количественного сетапа...' на Vercel); 2. Mobile responsive UX (полноценная адаптивная версия терминала без потери функциональности и без ухудшения desktop UX)."

---

## Clarifications

### Session 2026-09-15

- Q: What layout interaction pattern should mobile users use to navigate between Chart, Watchlist, and Signal Dossier? → A: Segmented mobile switcher ("График" / "Пары" / "Сигнал"), displaying one primary terminal section at a time below 1024px, while keeping the full 3-column layout completely unchanged at >= 1024px.
- Q: What endpoint fallback architecture should be specified for the serverless backend to resolve Binance blocking on Vercel? → A: Internal server-side endpoint router prioritizing `https://data-api.binance.vision` (zero geo-restrictions for public market data) with sequential fallback to `api1.binance.com`, `api2.binance.com`, `api.binance.com`, request timeouts (<= 8s), browser User-Agent, and strict error propagation without synthetic prices.
- Q: How should the UI represent cached/stale data during temporary upstream feed failures? → A: Preserve the last successfully received real market prices with a subtle amber badge/state ("Данные от [время] — обновление...") and manual refresh trigger. Never replace failed data with `$0.0000` or any synthetic numbers.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Live Market Telemetry & Anti-Stall Terminal (Priority: P1)

As a cryptocurrency trader accessing CryptoPilot AI on the production deployment (Vercel), I want the trading terminal to reliably fetch and display authentic real-time market data (tickers, candles, quantitative signals) upon page load without showing `$0.0000` values, blank chart canvases, or endless loading indicators, so that I have immediate access to actionable, authentic market intelligence.

**Why this priority**:
Without reliable live market data, the platform provides zero utility to traders. Showing `$0.0000` or freezing in an infinite loading state breaks trust and violates the core project principle of Real Market Data.

**Independent Test**:
Can be fully tested by loading the production URL or deploying to a Vercel staging preview:
- The watchlist loads authentic prices for BTC, ETH, SOL, BNB, etc. (no `$0.0000`);
- The TradingView chart renders valid historical candles with visible prices;
- The Signal Dossier computes and displays the stance (BUY/WAIT/AVOID), entry ranges, and invalidation levels within standard request latency (< 3 seconds);
- No infinite spinners persist after data resolution completes.

**Acceptance Scenarios**:

1. **Given** the user navigates to the terminal on a production environment, **When** external market endpoints are accessible, **Then** all watchlist assets show non-zero authentic prices, 24h changes, and volume within 2 seconds of page load via `https://data-api.binance.vision`.
2. **Given** the user selects an asset (e.g. BTCUSDT), **When** candle data is fetched, **Then** the chart displays valid historical bars and automatically fits the visible price range.
3. **Given** the user requests a signal for any supported asset, **When** the quantitative engine runs, **Then** the Signal Dossier transitions out of the loading state and renders either a verified signal dossier or a clearly articulated status dossier (e.g. WAIT / AVOID).

---

### User Story 2 - Mobile-Responsive Trading Terminal Layout (Priority: P2)

As a trader using a smartphone (iOS Safari / Android Chrome, viewport width 360px–430px), I want an ergonomic, touch-friendly mobile terminal interface with a dedicated segmented switcher ("График" / "Пары" / "Сигнал") that eliminates horizontal page overflow and lets me easily view the candlestick chart, monitor the watchlist, inspect the signal dossier, and interact with controls, so that I can analyze setups and execute paper trades on the go without desktop UI degradation.

**Why this priority**:
A large portion of crypto traders monitor markets from mobile devices. The current desktop layout collapses into unusable nested containers on phones with clipped components and broken touch navigation.

**Independent Test**:
Can be fully tested on physical mobile devices and browser emulation (e.g. iPhone 14 Pro 393×852, Pixel 7 412×915):
- Page width strictly equals viewport width (`document.documentElement.scrollWidth === window.innerWidth`);
- No unwanted horizontal document scrollbar appears;
- The segmented switcher seamlessly toggles between "График" (Chart), "Пары" (Watchlist), and "Сигнал" (Signal Dossier) with one tap;
- Only one primary section is rendered full-width at a time on viewports < 1024px;
- Touch targets on buttons, selectors, and watchlist items have a minimum size of 44×44px;
- Desktop 3-column layout at viewports >= 1024px remains completely unchanged.

**Acceptance Scenarios**:

1. **Given** a user opens the terminal on a mobile phone viewport (375px–430px), **When** the page renders, **Then** the main navigation header and content containers fit within 100vw without horizontal overflow.
2. **Given** the mobile terminal view is active (< 1024px), **When** the user taps "Пары", **Then** the watchlist occupies the primary content area; **When** the user taps an asset, the view automatically shifts focus to "График" or updates the active asset immediately.
3. **Given** a user rotates the device or resizes the browser window across 1024px, **When** the viewport reaches >= 1024px, **Then** the layout dynamically transitions to the full desktop three-column layout smoothly without page refresh.

---

### User Story 3 - Transparent Upstream Failure Notification & Self-Healing (Priority: P3)

As a trader using CryptoPilot AI, when an external exchange API or network connection experiences an outage, timeout, or rate-limiting block, I want the terminal to display an explicit, transparent error notification with a retry control, while retaining the last known verified real prices with a subtle amber status indicator ("Данные от [время] — обновление..."), rather than masking the problem with synthetic `$0.0000` values or hanging in an eternal spinner, so that I know exactly why data is unavailable and can recover with one click.

**Why this priority**:
Constitution Principle II dictates "Zero Synthetic Inputs / Real Market Data", and Principle XIII dictates "API Reliability & Fault Tolerance". Masking network errors with zeros or infinite loaders violates both.

**Independent Test**:
Can be fully tested by simulating network disconnection or a 500/429 upstream HTTP response:
- Watchlist displays the last verified real quote accompanied by an amber "Reconnecting..." badge with a "Retry" button instead of `$0.0000`;
- Chart displays an error overlay with a "Retry loading candles" button instead of a dead black box;
- Signal Dossier displays a structured "Signal Generation Error" card with the specific reason and a "Retry Signal" action instead of an infinite spinner.

**Acceptance Scenarios**:

1. **Given** an upstream network failure occurs during ticker fetching, **When** the API call fails, **Then** the UI retains the last verified real prices, marks them with an amber status badge, and provides a manual refresh button without emitting `$0.0000`.
2. **Given** an upstream network failure occurs during signal generation, **When** the request fails, **Then** the Signal Dossier terminates the loading spinner and displays an error card explaining that market data could not be retrieved from the exchange.
3. **Given** the upstream connectivity is restored, **When** the user clicks "Retry" or the next polling cycle fires, **Then** the error state clears and live data is restored.

---

### User Story 4 - Mobile Paper Trading & Model D Panel (Priority: P4)

As a trader managing virtual positions from a mobile phone, I want the Paper Trading and Model D tracking screens to be fully readable and operable on small screens, with touch-friendly order deployment, legible KPI cards, and responsive position tables, so that I can track and manage paper positions without horizontal layout blowout.

**Why this priority**:
Model D is the active baseline strategy. Executing paper trades and monitoring 4H telemetry on mobile must be safe, intuitive, and reliable.

**Independent Test**:
Can be tested in mobile viewport under the "Model D Демо-торговля" tab:
- Model D telemetry cards fit on mobile without clipping;
- "Открыть Model D демо-сделку" button is prominent and touch-accessible;
- Open Positions table adapts into responsive mobile cards or an isolated horizontal scroll container without expanding the root document width.

**Acceptance Scenarios**:

1. **Given** the user is on mobile in the Paper Trading tab, **When** viewing the Model D panel, **Then** all 4H indicator telemetry (EMA20, EMA50, EMA200, ATR stop) is legible without text clipping.
2. **Given** an active paper position exists, **When** viewed on a phone, **Then** position details (PnL, entry, trailing stop) and the "Close Position" button are immediately accessible.

---

### Edge Cases

- **EC-001 (Binance Regional IP Restriction on Vercel)**: What happens when Vercel serverless functions running in US datacenter regions receive HTTP 451 (Unavailable For Legal Reasons) or HTTP 403 (Cloudflare WAF / Geoblock) from `api.binance.com`?
  - *Requirement*: The system MUST utilize an internal endpoint router prioritizing `https://data-api.binance.vision` (which carries zero geographic restrictions for public market telemetry) and sequentially falling back to `https://api1.binance.com`, `https://api2.binance.com`, and `https://api.binance.com`, accompanied by a standard browser-compatible User-Agent header and an 8-second request timeout.
- **EC-002 (Intermittent Network Drop / Stale Quotes)**: What happens if a user experiences a temporary network blip or an upstream endpoint times out during a polling cycle?
  - *Requirement*: The terminal preserves previously received authentic prices and candle bars, shows a subtle amber status indicator ("Данные от [время] — обновление...") with a manual refresh button, and resumes normal telemetry when connectivity recovers. It MUST NEVER overwrite valid data with `$0.0000` or synthetic quotes.
- **EC-003 (Rapid Viewport Rotation / Resize)**: What happens when a user rotates their smartphone from portrait (390px) to landscape (844px)?
  - *Requirement*: The Lightweight Charts container MUST automatically recompute canvas width and height via `ResizeObserver` without clipping price scales or requiring a manual page refresh.
- **EC-004 (All Upstream Data Sources Unavailable)**: What happens if all Binance public API endpoints fail simultaneously?
  - *Requirement*: The UI displays an explicit upstream maintenance error banner with a manual "Try Again" button. It MUST NEVER generate synthetic prices or display `$0.0000`.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Upstream API Reliability & Error Handling
- **FR-001**: The system MUST eliminate silent fallback to dummy values (`lastPrice: 0`) in market feed ingestion. Network or parsing errors MUST propagate explicit, typed error structures.
- **FR-002**: Upstream market data clients MUST implement an internal server-side endpoint router prioritizing `https://data-api.binance.vision` with sequential fallback to `https://api1.binance.com`, `https://api2.binance.com`, and `https://api.binance.com`, enforcing request timeouts (maximum 8 seconds) and browser User-Agent headers.
- **FR-003**: Serverless API routes (`/api/market`, `/api/candles`, `/api/signal`, `/api/signal-model-d`) MUST provide consistent JSON error contracts `{ success: false, error: string, code: string }` with appropriate HTTP status codes when upstream feeds fail.
- **FR-004**: The client-side data layer MUST decouple `loading` state from `error` state. When an API call fails, the client MUST set `loading = false` and set an explicit `error` state.
- **FR-005**: The Signal Dossier component MUST display a dedicated, informative Error State with a "Повторить запрос" (Retry) action whenever a signal fetch fails, and MUST NEVER remain indefinitely in the "Генерация количественного сетапа..." state when loading is finished.
- **FR-006**: The TradingView Chart component MUST display an Error / Retry overlay whenever candle fetching fails, explaining that exchange data could not be reached.
- **FR-007**: When live ticker data cannot be refreshed due to transient upstream failure, the Watchlist component MUST retain the last successfully received authentic prices accompanied by an amber status indicator ("Данные от [время] — обновление...") and a manual refresh trigger. It MUST NEVER substitute failed data with `$0.0000` or synthetic values.

#### Mobile Responsive Architecture
- **FR-008**: The application layout MUST be fully responsive across mobile viewports (min-width: 320px, standard: 375px–430px), tablet (768px–1023px), and desktop (>= 1024px).
- **FR-009**: The root document width MUST NOT exceed the device viewport width (`overflow-x: hidden` safety, strictly zero horizontal page scroll).
- **FR-010**: On viewports below 1024px, the Terminal view MUST implement a segmented mobile switcher allowing users to toggle between three exclusive primary sections: "График" (Candlestick Chart), "Пары" (Watchlist), and "Сигнал" (Signal Dossier). Only one primary section is rendered full-width at a time. The active section must be switchable with a single tap.
- **FR-011**: On desktop viewports (>= 1024px), the three-column layout (Watchlist sidebar, central Chart, right Signal Dossier) MUST remain completely preserved with identical ergonomics, widths, and layout proportions.
- **FR-012**: The top navigation Header MUST be responsive: on mobile screens (< 768px), navigation tabs MUST collapse into a compact, touch-friendly tab bar with short labels or icons to prevent horizontal header overflow.
- **FR-013**: The TradingView Canvas Chart MUST dynamically resize its dimensions when viewport size or device orientation changes, utilizing `ResizeObserver` on the chart container.
- **FR-014**: All interactive mobile controls (segmented switcher, timeframe selectors, watchlist items, trade execution buttons, search trigger) MUST adhere to touch accessibility standards with minimum tap target dimensions of 44×44px or equivalent touch padding.
- **FR-015**: In the Paper Trading and Backtest views, wide data tables MUST either be wrapped in isolated horizontal scroll containers with visual scroll cues or presented as responsive card stacks on small screens, preventing page-level layout breakage.
- **FR-016**: The dark terminal aesthetic, institutional color palette, typography hierarchy, and glowing border accents MUST be preserved across all screen sizes.

---

### Key Entities

- **MarketFeedSnapshot**: Represents verified live market telemetry for an asset (symbol, name, lastPrice, change24h, high24h, low24h, volumeQuote, fetchTimestamp, feedStatus: "LIVE" | "STALE" | "OUTAGE").
- **ChartTelemetryState**: Encapsulates chart data lifecycle (symbol, timeframe, candles array, loading: boolean, error: string | null, lastFetchedAt: number).
- **SignalTelemetryState**: Encapsulates signal generation lifecycle (symbol, signal: TradingSignal | null, loading: boolean, error: string | null, retryCount: number).
- **TerminalLayoutState**: Manages responsive view modes (activeTab: "terminal" | "backtest" | "paper", mobileActiveSection: "chart" | "watchlist" | "signal", isMobile: boolean).

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of supported assets in the Watchlist display authentic, non-zero prices upon page load when Binance public endpoints are operational (zero instances of `$0.0000`).
- **SC-002**: The TradingView Chart renders valid historical candlestick series on initial page load in under 2.5 seconds on standard broadband / 4G connections.
- **SC-003**: The Signal Dossier component resolves into either a verified signal dossier or a distinct, actionable error state in 100% of network scenarios; the loading spinner MUST NOT run for longer than the API timeout limit (maximum 8 seconds).
- **SC-004**: On mobile viewports (360px to 430px wide), the document horizontal overflow width is exactly 0px (`document.documentElement.scrollWidth === window.innerWidth`).
- **SC-005**: 100% of interactive buttons, selectors, and watchlist tap targets on mobile viewports meet or exceed the 44×44px touch target guideline.
- **SC-006**: Transitioning viewport width between 360px and 1920px results in zero visual collisions, zero overlapping text, and zero broken containers.
- **SC-007**: Existing automated unit and integration tests (34 tests) pass with 100% success rate, supplemented by new automated tests covering multi-endpoint routing and error state transitions.
- **SC-008**: All operations strictly maintain Paper Trading Only guardrails: zero live order execution capability, zero private API key storage.

---

## Assumptions

- **Target Deployment Platform**: Vercel Serverless Functions running Next.js 15 (Node.js runtime).
- **Data Source Boundaries**: Public Binance REST / Futures endpoints (`data-api.binance.vision`, `api.binance.com`, `api1-3.binance.com`) and Alternative.me for Fear & Greed index. No private exchange API credentials or authenticated endpoints are required.
- **Browser Compatibility**: Modern mobile browsers (iOS Safari 16+, Android Chrome 110+, Mobile Firefox) and modern desktop browsers (Chrome, Safari, Edge, Firefox).
- **Desktop Invariance**: Existing desktop ergonomics, color scheme, 3-column layout, and keyboard shortcuts (⌘K) are to be preserved without regression.
- **Quant & Strategy Invariance**: Quantitative indicator formulas (EMA, MACD, RSI, ADX, ATR), market structure algorithms, Model D baseline, and V1/V2/V3 trading logic remain untouched.
