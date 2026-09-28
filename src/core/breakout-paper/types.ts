export type BreakoutAssetState = "WAIT" | "BREAKOUT DETECTED" | "POSITION OPEN" | "EXIT";

export interface BreakoutSignal {
  asset: string;
  direction: "LONG" | "SHORT";
  breakoutTimestamp: number;
  breakoutLevel: number;
  atr: number;
  volRatio: number;
  expectedEntryPrice: number;
  stopPrice: number;
  status: "ACTIVE" | "EXPIRED" | "EXECUTED";
}

export interface BreakoutPosition {
  id: string;
  asset: string;
  direction: "LONG" | "SHORT";
  entryTimestamp: number;
  entryPrice: number;
  stopPrice: number;
  initialStopDistance: number;
  units: number;
  riskDollar: number;
  positionSizeDollar: number;
  feesPaid: number;
  slippagePaid: number;
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  unrealizedR: number;
  highestPriceSinceEntry: number;
  lowestPriceSinceEntry: number;
  breakoutTimestamp: number;
  breakoutLevel: number;
  breakoutVolRatio: number;
  channelExitLevel: number;
}

export interface BreakoutClosedTrade {
  id: string;
  asset: string;
  direction: "LONG" | "SHORT";
  breakoutTimestamp: number;
  breakoutLevel: number;
  entryTimestamp: number;
  entryPrice: number;
  stopPrice: number;
  exitTimestamp: number;
  exitPrice: number;
  exitReason: "STOP_LOSS" | "CHANNEL_EXIT" | "MANUAL";
  quantity: number;
  riskDollar: number;
  fees: number;
  slippage: number;
  grossPnl: number;
  netPnl: number;
  pnlPercent: number;
  rMultiple: number;
  holdingDurationHours: number;
}

export interface BreakoutAccountStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;
  maxDrawdown: number;
  currentDrawdown: number;
  peakEquity: number;
  largestWin: number;
  largestLoss: number;
  longestLosingStreak: number;
  currentLosingStreak: number;
}

export interface BreakoutAccount {
  initialBalance: number;
  cash: number;
  equity: number;
  unrealizedPnl: number;
  realizedPnl: number;
  fees: number;
  slippagePaid: number;
  positions: BreakoutPosition[];
  tradeHistory: BreakoutClosedTrade[];
  version: number;
  /** Accounting schema version. Version 2 reserves open position notional from cash. */
  accountingVersion?: number;
  lastUpdated: number;
  lastProcessedCandles: Record<string, number>; // symbol -> timestamp of last evaluated completed 4H candle
  lastExitTimestamps: Record<string, number>;    // symbol -> timestamp of candle on which position exited
  stats: BreakoutAccountStats;
}

export interface BreakoutSnapshot {
  timestamp: number;
  equity: number;
  cash: number;
  unrealizedPnl: number;
  realizedPnl: number;
  openPositions: number;
  btcPrice: number;
  ethPrice: number;
  solPrice: number;
}

export interface BreakoutTelemetry {
  asset: string;
  state: BreakoutAssetState;
  currentPrice: number;
  hh20: number;
  ll20: number;
  channelExitLevel: number;
  volumeRatio: number;
  atr14: number;
  cooldownRemainingBars: number;
  lastCompletedCandle: {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  } | null;
  formingCandle: {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
  } | null;
  pendingSignal: BreakoutSignal | null;
  activePosition: BreakoutPosition | null;
  lastExitTimestamp: number | null;
}

export interface BreakoutCycleReport {
  timestamp: number;
  success: boolean;
  telemetries: Record<string, BreakoutTelemetry>;
  account: BreakoutAccount;
  closedTradesThisCycle: BreakoutClosedTrade[];
  openedPositionsThisCycle: BreakoutPosition[];
  error?: string;
}
