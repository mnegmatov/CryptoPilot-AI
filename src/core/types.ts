export type Timeframe = "15m" | "1h" | "4h" | "1d";

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type MarketStance = "BUY" | "SHORT" | "WAIT" | "AVOID";

export interface TakeProfitTarget {
  level: number;
  price: number;
  percentage: number;
  rewardRisk: number;
  description: string;
  type?: "STRUCTURAL" | "R_MULTIPLE" | "LIQUIDITY";
  targetReason?: string;
}

export interface TechnicalIndicators {
  currentPrice: number;
  ema20: number;
  ema50: number;
  ema200: number;
  rsi14: number;
  rsiState: "OVERSOLD" | "NEUTRAL" | "OVERBOUGHT" | "BULLISH_DIVERGENCE" | "BEARISH_DIVERGENCE";
  macd: {
    macdLine: number;
    signalLine: number;
    histogram: number;
    trend: "BULLISH_CROSS" | "BEARISH_CROSS" | "BULLISH" | "BEARISH";
  };
  adx14: number;
  plusDI: number;
  minusDI: number;
  atr14: number;
  bollingerBands: {
    upper: number;
    middle: number;
    lower: number;
    bandwidth: number;
  };
  volumeRatio20: number; // Volume vs 20-period volume MA
  vwap?: number;
}

export interface MarketStructure {
  trendHTF: "BULLISH" | "BEARISH" | "RANGING"; // 4H / 1D
  trendLTF: "BULLISH" | "BEARISH" | "RANGING"; // 15m / 1h
  swingHigh: number;
  swingLow: number;
  keySupport: number;
  keyResistance: number;
  structureState: "HIGHER_HIGHS" | "LOWER_LOWS" | "CONSOLIDATION" | "BREAK_OF_STRUCTURE";
  htfEma200?: number;
  htfPriceAboveEma200?: boolean;
  liquiditySweep?: {
    type: "BULLISH_SWEEP" | "BEARISH_SWEEP";
    level: number;
    timestamp: number;
  };
  failedBreakout?: {
    type: "BULL_TRAP" | "BEAR_TRAP";
    level: number;
    timestamp: number;
  };
}

export interface MarketContextData {
  fearGreedIndex: number | null;
  fearGreedSentiment: string | null;
  fundingRate: number | null; // e.g. 0.0001 (0.01%) or null if unavailable
  openInterestEstimated?: number;
  btcDominance?: number | null;
  marketRegime: "TRENDING_BULL" | "TRENDING_BEAR" | "CHOPPY_RANGE" | "HIGH_VOLATILITY_EXPANSION";
}

export interface TradingSignal {
  id: string;
  asset: string; // e.g., "BTC/USDT"
  timestamp: number;
  stance: MarketStance;
  type: "LONG" | "SHORT" | "NONE";
  currentPrice: number;
  entryRange: {
    min: number;
    max: number;
    ideal: number;
  };
  stopLoss: number;
  stopLossPercentage: number;
  takeProfitTargets: TakeProfitTarget[];
  riskRewardRatio: number;
  confidenceScore: number; // 0 - 100
  recommendedRiskPercent?: number; // e.g. 1.5% for high trend, 0.75% for chop/low ADX
  invalidationConditions: string[];
  technicalSummary: TechnicalIndicators;
  marketStructure: MarketStructure;
  marketContext: MarketContextData;
  aiExplanation?: {
    thesis: string;
    whySetupExists: string;
    marketContextSummary: string;
    invalidationDetail: string;
    executionPlan: string;
  };
  strategyVersion?: "V1" | "V2" | "V3" | "MODEL_D";
}

export interface PositionRiskCalculation {
  portfolioEquity: number;
  riskPercentage: number; // e.g., 1.5%
  riskDollarAmount: number;
  entryPrice: number;
  stopLossPrice: number;
  positionUnits: number;
  positionNotionalValue: number;
  leverageRecommended: number;
  type: "LONG" | "SHORT";
}

export interface BacktestTrade {
  id: string;
  asset: string;
  entryTimestamp: number;
  exitTimestamp: number;
  type: "LONG" | "SHORT";
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  takeProfit: number;
  result: "WIN" | "LOSS" | "INVALIDATED";
  pnlDollar: number;
  pnlPercent: number;
  rMultiple: number;
  exitReason: "TP1" | "TP2" | "TP3" | "STOP_LOSS" | "TRAILING_STOP" | "TIMED_OUT" | "EMA_CROSS";
  durationHours: number;
}

export interface BacktestSummary {
  asset: string;
  timeframe: Timeframe;
  periodStart: string;
  periodEnd: string;
  initialBalance: number;
  finalBalance: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRatePercent: number;
  longTrades: number;
  shortTrades: number;
  longWinRatePercent: number;
  shortWinRatePercent: number;
  grossProfitDollar: number;
  grossLossDollar: number;
  averageWinDollar: number;
  averageLossDollar: number;
  profitFactor: number;
  maxDrawdownPercent: number;
  netProfitDollar: number;
  netProfitPercent: number;
  averageRMultiple: number;
  expectancyDollar: number;
  expectancyR: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  largestWinDollar: number;
  largestLossDollar: number;
  averageTradeDurationHours: number;
  smallSampleWarning: boolean;
  regimeBreakdown?: Record<string, {
    trades: number;
    winRatePercent: number;
    netProfitDollar: number;
    profitFactor: number;
  }>;
  trades: BacktestTrade[];
  equityCurve: Array<{ timestamp: number; equity: number }>;
}

export interface PaperPosition {
  id: string;
  signalId?: string;
  asset: string;
  type: "LONG" | "SHORT";
  status: "OPEN" | "CLOSED" | "PENDING";
  entryPrice: number;
  currentPrice: number;
  stopLoss: number;
  initialStopLoss?: number;
  takeProfit: number;
  sizeUnits: number;
  notionalValue: number;
  marginUsed: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  realizedPnl: number;
  openedAt: number;
  closedAt?: number;
  closeReason?: string;
  tp1Hit?: boolean;
  breakevenMoved?: boolean;
  trailingStopPrice?: number;
  highestHigh?: number;
  lowestLow?: number;
  trailingStopType?: "BREAKEVEN_ONLY" | "CHANDELIER_ATR" | "STRUCTURAL_SWING";
  chandelierMultiplier?: number;
  swingTrailingBars?: number;
  recentCandles?: Array<{ low: number; high: number }>;
  strategyVersion?: string;
}

export interface PaperAccount {
  balance: number;
  initialBalance: number;
  equity: number;
  unrealizedPnl: number;
  realizedPnl: number;
  positions: PaperPosition[];
  tradeHistory: PaperPosition[];
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  code?: "UPSTREAM_TIMEOUT" | "UPSTREAM_UNAVAILABLE" | "INVALID_PAYLOAD" | "INTERNAL_ERROR";
  timestamp: number;
}

export type ApiResponse<T> = ({ success: true } & T) | ApiErrorResponse;

export interface StaleQuoteState {
  isStale: boolean;
  lastUpdated?: number;
  message?: string;
}

export interface TerminalWorkspaceState {
  selectedSymbol: string;
  timeframe: Timeframe;
  mobileSheetState: "COLLAPSED" | "EXPANDED";
  isMobileWatchlistOpen: boolean;
  isCommandPaletteOpen: boolean;
  isCalculatorModalOpen: boolean;
  activeTab: "terminal" | "backtest" | "paper";
}
