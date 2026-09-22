# CryptoPilot AI 🚀

**CryptoPilot AI** is a production-quality cryptocurrency market analyst and trading signal platform engineered to evaluate digital asset markets like a disciplined institutional trader.

It combines **real-time deterministic market telemetry**, **quantitative technical analysis**, **multi-timeframe confluence**, **strict risk-management guardrails**, **historical backtesting**, **paper trading**, and **generative AI thesis synthesis**.

---

## 🏛️ Core Principles & Non-Negotiables

1. **Zero Invented Data**: AI is **never** the source of raw market data. All prices, volumes, and indicators are fetched and calculated deterministically from real exchange APIs.
2. **Decoupled Architecture**: Strict separation between Data Ingestion, Quantitative Analysis, Signal Generation, Risk Management, Backtesting, Paper Trading, and AI Explanation.
3. **Safety First**: **No real-money trading**. Mandatory backtesting and **paper trading only**.
4. **Institutional Trading Standards**: Every setup produces:
   - **BUY / WAIT / AVOID**
   - **Asset & Real Price**
   - **Entry Range (Min, Max, Ideal Pullback)**
   - **Stop Loss (ATR buffer + structural swing invalidation)**
   - **Confidence Score (0-100)**
   - **Explicit Invalidation Conditions**
   - **Technical Analysis & Macro Market Context**
   - **AI Institutional Thesis & Execution Guidance**

---

## 🤖 Model D Automatic Paper-Trading Architecture

Model D is our frozen, quantitative trend-following strategy. It automatically trades paper equity with the following architecture:

- **Hosting**: Vercel hosts the Next.js application and API.
- **Persistence**: Upstash Redis stores production paper-trading state.
- **Scheduler**: GitHub Actions triggers Model D every 10 minutes via a cron workflow (`*/10 * * * *`).
- **Endpoint**: `/api/cron/model-d` is the execution endpoint.
- **Security**: The `CRON_SECRET` repository secret protects the endpoint.
- **Universe**: BTCUSDT, ETHUSDT, and SOLUSDT are the validated Model D universe.

**Model D Frozen Rules (Infrastructure Only, No Performance Guarantees):**
- **Timeframe**: 4H
- **Market Trend**: Close > EMA200, EMA20 > EMA50
- **Entry**: Low <= EMA20, Close > EMA20
- **Stop Loss**: 2.5 × ATR(14)
- **Trailing**: Structural swing trailing
- **Risk**: 1% of paper equity per trade
- **Take Profit**: No fixed Take Profit (exits only on trailing stop loss)

---

## 🛠️ Technology Stack & Installed Skills

### Skills Installed (`.agents/skills/`)
From [`emilkowalski/skills`](https://github.com/emilkowalski/skills.git):
- **`emil-design-eng`**: Design engineering, spacing, visual polish, and layout philosophy.
- **`pick-ui-library`**: Curated library decisions (`lightweight-charts`, `cmdk`, `sonner`, `tailwind`).
- **`apple-design`**: Fluid, restrained typography and interface hierarchy.
- **`animate`**: Micro-interactions, spring curves, and state transitions.
- **`ask-sonner`**: Clean toast notifications for trade orders and price alerts.

### Tech Stack
- **Framework**: Next.js 15 (App Router) + React 19 + TypeScript.
- **Database**: Upstash Redis (Serverless KV store).
- **Automation**: GitHub Actions.
- **Styling**: Tailwind CSS with custom institutional dark-mode terminal palette.
- **Charts**: TradingView `lightweight-charts`.
- **Command Palette**: `cmdk` (⌘K asset search).
- **Notifications**: `sonner`.
- **Validation**: `zod`.
- **Testing**: `vitest`.
- **AI Synthesis**: Google Generative AI (`@google/generative-ai`) with deterministic quantitative fallback.

---

## 📡 Market Data APIs (Zero Synthetic Data)

| Feed | Provider | Purpose | Auth |
| :--- | :--- | :--- | :--- |
| **Candlesticks (OHLCV)** | Binance Spot Public API | 15m, 1h, 4h, 1d historical & real-time klines | Zero Auth |
| **24h Tickers** | Binance Public REST | Live prices, 24h change %, 24h volume, high/low | Zero Auth |
| **Derivatives & Funding** | Binance Futures Public API | Real-time perpetual funding rate & regime | Zero Auth |
| **Market Sentiment** | Alternative.me | Crypto Fear & Greed Index (0-100) | Zero Auth |
| **Institutional Thesis** | Gemini 2.0 Flash / Quant Engine | Grounded narrative explanation of setups | Optional (`GEMINI_API_KEY`) |

---

## 📂 Project Architecture

```
src/
├── app/
│   ├── api/
│   │   ├── backtest/route.ts      # Vectorized historical backtest simulation
│   │   ├── candles/route.ts       # Real historical OHLCV candles
│   │   ├── cron/model-d/route.ts  # Model D execution endpoint (triggered by GitHub Actions)
│   │   ├── market/route.ts        # Live watchlist tickers & macro context
│   │   ├── paper/route.ts         # Paper trading wallet operations
│   │   └── signal/route.ts        # Deterministic signal & AI thesis generation
│   ├── globals.css                # Terminal styling, custom scrollbars, glowing borders
│   ├── layout.tsx                 # Root layout with Sonner toast provider
│   └── page.tsx                   # Main trading terminal dashboard
├── components/
│   ├── backtest/
│   │   └── BacktestView.tsx       # Backtest UI, equity curves, trade log table
│   ├── layout/
│   │   └── Header.tsx             # Macro sentiment banner & navigation tabs
│   ├── paper/
│   │   └── PaperTradingView.tsx   # Virtual account equity, active positions, PnL
│   └── terminal/
│       ├── CommandPalette.tsx     # ⌘K instant asset search
│       ├── PositionCalculatorModal.tsx # Risk management & position sizing modal
│       ├── SignalDossier.tsx      # BUY/WAIT/AVOID dossier & AI explanation
│       ├── TradingViewChart.tsx   # 60fps canvas chart with trade overlays
│       └── Watchlist.tsx          # Real-time asset list with live prices
├── core/
│   ├── ai/
│   │   └── analyst.ts             # Fact-grounded institutional analyst engine
│   ├── backtest/
│   │   └── engine.ts              # Historical backtester with fees & slippage
│   ├── data/
│   │   ├── binance.ts             # Binance public REST API client
│   │   ├── market-feed.ts         # Unified market feed & validation
│   │   └── sentiment.ts           # Alternative.me Fear & Greed client
│   ├── paper/
│   │   ├── storage.ts             # Upstash Redis state persistence
│   │   └── wallet.ts              # Paper trading virtual account & order manager
│   ├── quant/
│   │   ├── indicators.ts          # EMA, SMA, RSI, MACD, ATR, Bollinger, VWAP
│   │   └── structure.ts           # Pivots, HH/LL, BOS, Key Support & Resistance
│   ├── risk/
│   │   └── position-sizer.ts      # Capital allocation, risk % sizing, guardrails
│   ├── signals/
│   │   └── generator.ts           # Deterministic signal generation & scoring
│   └── types.ts                   # Core domain data contracts
└── __tests__/
    ├── backtest.test.ts           # Backtest & paper trading unit tests
    ├── indicators.test.ts         # Quantitative indicator unit tests
    └── signals.test.ts            # Signal generator & risk unit tests
```

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Automated Unit Tests
```bash
npm test
```

### 3. Start Local Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Build for Production
```bash
npm run build
npm start
```

### 5. Environment Variables Configuration
To run the platform securely and reliably:
- `UPSTASH_REDIS_REST_URL`: Provided by Upstash (Required in production)
- `UPSTASH_REDIS_REST_TOKEN`: Provided by Upstash (Required in production)
- `CRON_SECRET`: Random secure string (Required in production to authorize Model D)
- `GEMINI_API_KEY`: (Optional) AI thesis generation

To configure the scheduler in GitHub Actions, navigate to **Settings → Secrets and variables → Actions** and add:
- Secret: `CRON_SECRET`
- Variable: `MODEL_D_CRON_URL` (e.g., `https://<your-vercel-domain>/api/cron/model-d`)
