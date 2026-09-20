import { Candle, MarketContextData, PaperPosition, TradingSignal } from "../types";
import { calculateATR, calculateEMA } from "../quant/indicators";
import { generateModelDSignalFrom4hCandles } from "../signals/generator";
import { PaperTradingWallet, globalPaperWallet } from "./wallet";

export interface ModelDTelemetry {
  symbol: string;
  currentPrice: number;
  ema20: number;
  ema50: number;
  ema200: number;
  atr14: number;
  trend4h: "BULLISH" | "BEARISH" | "RANGING";
  isMacroBull: boolean;
  isMacroBear: boolean;
  isTrendBull: boolean;
  isTrendBear: boolean;
  swingTrailingLevelLong: number;
  swingTrailingLevelShort: number;
  lastClosedBarTime: number;
}

export interface ModelDAutoExecutionResult {
  symbol: string;
  signal: TradingSignal;
  telemetry: ModelDTelemetry;
  trailingUpdated: boolean;
  closedPositions: PaperPosition[];
  openedPosition?: PaperPosition;
  activePosition?: PaperPosition;
}

/**
 * Computes deterministic 4H Model D indicator telemetry from real 4H candles.
 * Strict zero-lookahead: trailing levels use strictly completed bars before the latest bar.
 */
export function computeModelDTelemetry(symbol: string, candles4h: Candle[]): ModelDTelemetry {
  if (candles4h.length < 50) {
    throw new Error("Insufficient 4H candles for Model D telemetry (minimum 50 required)");
  }

  const closes = candles4h.map((c) => c.close);
  const ema20Arr = calculateEMA(closes, 20);
  const ema50Arr = calculateEMA(closes, 50);
  const ema200Arr = calculateEMA(closes, Math.min(200, closes.length - 1));
  const atrArr = calculateATR(candles4h, 14);

  const lastIdx = closes.length - 1;
  const currentPrice = closes[lastIdx];
  const ema20 = ema20Arr[lastIdx] ?? currentPrice;
  const ema50 = ema50Arr[lastIdx] ?? currentPrice;
  const ema200 = ema200Arr[lastIdx] ?? currentPrice;
  const atr14 = atrArr[lastIdx] ?? (currentPrice * 0.02);

  const isMacroBull = currentPrice > ema200;
  const isMacroBear = currentPrice < ema200;
  const isTrendBull = ema20 > ema50;
  const isTrendBear = ema20 < ema50;

  let trend4h: "BULLISH" | "BEARISH" | "RANGING" = "RANGING";
  if (isMacroBull && isTrendBull) {
    trend4h = "BULLISH";
  } else if (isMacroBear && isTrendBear) {
    trend4h = "BEARISH";
  }

  // Previous 5 completed bars (excluding current bar if still forming)
  const completedBars = candles4h.slice(-6, -1);
  const swingTrailingLevelLong = completedBars.length > 0
    ? Math.min(...completedBars.map((b) => b.low))
    : currentPrice - 2.5 * atr14;

  const swingTrailingLevelShort = completedBars.length > 0
    ? Math.max(...completedBars.map((b) => b.high))
    : currentPrice + 2.5 * atr14;

  return {
    symbol,
    currentPrice,
    ema20: Number(ema20.toFixed(2)),
    ema50: Number(ema50.toFixed(2)),
    ema200: Number(ema200.toFixed(2)),
    atr14: Number(atr14.toFixed(2)),
    trend4h,
    isMacroBull,
    isMacroBear,
    isTrendBull,
    isTrendBear,
    swingTrailingLevelLong: Number(swingTrailingLevelLong.toFixed(2)),
    swingTrailingLevelShort: Number(swingTrailingLevelShort.toFixed(2)),
    lastClosedBarTime: candles4h[candles4h.length - 2]?.timestamp ?? 0,
  };
}

/**
 * Synchronizes structural swing trailing stop updates across open Model D paper positions
 */
export function syncModelDTrailingStops(
  symbol: string,
  candles4h: Candle[],
  wallet: PaperTradingWallet = globalPaperWallet
) {
  if (candles4h.length < 6) return [];
  // Use strictly completed 4H bars (excluding active forming bar)
  const closedBars = candles4h.slice(-6, -1).map((c) => ({ low: c.low, high: c.high }));
  return wallet.updateStructuralTrailingStop(symbol, closedBars);
}

/**
 * Complete automated Model D execution cycle:
 * Market Data → Signal → Trailing Ratchet → Live Price Exits → Auto-Entry → State
 */
export function processModelDAutoCycle(
  symbol: string,
  candles4h: Candle[],
  context: MarketContextData,
  autoTrade: boolean = true,
  wallet: PaperTradingWallet = globalPaperWallet
): ModelDAutoExecutionResult {
  if (candles4h.length < 50) {
    throw new Error("Insufficient 4H candles for Model D auto cycle (minimum 50 required)");
  }

  // 1. Generate deterministic Model D signal
  const signal = generateModelDSignalFrom4hCandles(symbol, candles4h, context);

  // 2. Compute 4H telemetry
  const telemetry = computeModelDTelemetry(symbol, candles4h);

  // 3. Keep paper wallet trailing stops synchronized with the latest closed 4H candles
  // Strictly zero-lookahead: use completed 4H bars excluding active forming bar
  const closedBars = candles4h.slice(-6, -1).map((c) => ({ low: c.low, high: c.high }));
  const updatedTrailing = wallet.updateStructuralTrailingStop(symbol, closedBars);
  const trailingUpdated = updatedTrailing.length > 0;

  // 4. Update market prices with latest price and check for trailing stop / stop loss / TP exits
  const closedPositions = wallet.updateMarketPrices(symbol, telemetry.currentPrice, telemetry.atr14);

  // 5. If autoTrade is enabled and signal is BUY (Model D is LONG-ONLY official baseline),
  // check if a position is already OPEN for this symbol
  let openedPosition: PaperPosition | undefined;
  const currentPositions = wallet.getAccount().positions;
  const normSymbol = symbol.replace("/", "");
  const hasOpenPosition = currentPositions.some(
    (p) => p.asset.replace("/", "") === normSymbol && p.status === "OPEN"
  );

  if (autoTrade && signal.stance === "BUY" && !hasOpenPosition) {
    openedPosition = wallet.openPositionFromSignal(
      signal,
      1.0, // Fixed 1.0% institutional risk per Model D spec
      "MARKET",
      {
        trailingStopType: "STRUCTURAL_SWING",
        swingTrailingBars: 5,
      }
    );
  }

  const activePosition = wallet.getAccount().positions.find(
    (p) => p.asset.replace("/", "") === normSymbol && p.status === "OPEN"
  );

  return {
    symbol,
    signal,
    telemetry,
    trailingUpdated,
    closedPositions,
    openedPosition,
    activePosition,
  };
}
