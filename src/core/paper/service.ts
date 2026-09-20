import { Candle, MarketContextData, PaperPosition, TradingSignal } from "../types";
import { generateModelDSignalFrom4hCandles } from "../signals/generator";
import { computeModelDTelemetry, ModelDTelemetry } from "./model-d-tracker";
import { getPaperAccount, mutatePaperAccount, PersistentPaperAccount } from "./storage";
import { PaperTradingWallet } from "./wallet";

export interface ModelDExecutionCycleReport {
  symbol: string;
  signal: TradingSignal;
  telemetry: ModelDTelemetry;
  trailingUpdated: boolean;
  closedPositions: PaperPosition[];
  openedPosition?: PaperPosition;
  activePosition?: PaperPosition;
  skippedDuplicateCandle: boolean;
  account: PersistentPaperAccount;
}

/**
 * Production Paper Trading Service:
 * Wraps paper operations with atomic distributed locking and durable storage (Upstash Redis / local file fallback).
 */
export class PaperTradingService {
  /**
   * Fetches the current authoritative paper trading account.
   */
  public static async getAccount(): Promise<PersistentPaperAccount> {
    return getPaperAccount();
  }

  /**
   * Opens a paper position under atomic lock.
   */
  public static async openPosition(
    signal: TradingSignal,
    riskPercentage?: number,
    orderType: "MARKET" | "LIMIT" = "MARKET",
    trailingOptions?: {
      trailingStopType?: "BREAKEVEN_ONLY" | "CHANDELIER_ATR" | "STRUCTURAL_SWING";
      chandelierMultiplier?: number;
      swingTrailingBars?: number;
    }
  ): Promise<{ position: PaperPosition; account: PersistentPaperAccount }> {
    const { result, account } = await mutatePaperAccount((acc) => {
      const wallet = new PaperTradingWallet(acc, false);
      const position = wallet.openPositionFromSignal(signal, riskPercentage, orderType, trailingOptions);
      return { result: position, modified: true };
    });

    return { position: result, account };
  }

  /**
   * Closes an open position manually under atomic lock.
   */
  public static async closePosition(
    positionId: string,
    currentPrice?: number
  ): Promise<{ position: PaperPosition; account: PersistentPaperAccount }> {
    const { result, account } = await mutatePaperAccount((acc) => {
      const wallet = new PaperTradingWallet(acc, false);
      const position = wallet.closePosition(positionId, currentPrice);
      return { result: position, modified: true };
    });

    return { position: result, account };
  }

  /**
   * Updates market prices and evaluates stop exits under atomic lock.
   */
  public static async updateMarketPrices(
    symbol: string,
    currentPrice: number,
    currentATR?: number
  ): Promise<{ closed: PaperPosition[]; account: PersistentPaperAccount }> {
    const { result, account } = await mutatePaperAccount((acc) => {
      const wallet = new PaperTradingWallet(acc, false);
      const closed = wallet.updateMarketPrices(symbol, currentPrice, currentATR);
      return { result: closed, modified: true };
    });

    return { closed: result, account };
  }

  /**
   * Updates structural trailing stops using closed 4H candles under atomic lock.
   */
  public static async updateStructuralTrailingStop(
    symbol: string,
    closedCandles: Array<{ low: number; high: number }>
  ): Promise<{ updated: PaperPosition[]; account: PersistentPaperAccount }> {
    const { result, account } = await mutatePaperAccount((acc) => {
      const wallet = new PaperTradingWallet(acc, false);
      const updated = wallet.updateStructuralTrailingStop(symbol, closedCandles);
      return { result: updated, modified: updated.length > 0 };
    });

    return { updated: result, account };
  }

  /**
   * Resets the paper account - ONLY upon explicit user request.
   */
  public static async resetAccount(initialBalance: number = 10000): Promise<PersistentPaperAccount> {
    const { account } = await mutatePaperAccount((acc) => {
      acc.balance = initialBalance;
      acc.initialBalance = initialBalance;
      acc.equity = initialBalance;
      acc.unrealizedPnl = 0;
      acc.realizedPnl = 0;
      acc.positions = [];
      acc.tradeHistory = [];
      acc.lastProcessedCandles = {};
      return { result: null, modified: true };
    });

    return account;
  }

  /**
   * Complete automated Model D execution cycle:
   * 1. Evaluates 4H closed candles strictly (zero lookahead).
   * 2. Ratchets structural 5-bar swing trailing stop.
   * 3. Evaluates market price against stops and executes any pending exits.
   * 4. Enforces duplicate candle prevention: same 4H closed bar cannot trigger twice.
   * 5. Opens 1% risk position if signal is BUY and asset is not currently in market.
   * 6. Persists all changes under atomic lock.
   */
  public static async executeModelDAutoCycle(
    symbol: string,
    candles4h: Candle[],
    context: MarketContextData,
    autoTrade: boolean = true
  ): Promise<ModelDExecutionCycleReport> {
    if (candles4h.length < 50) {
      throw new Error("Insufficient 4H candles for Model D auto cycle (minimum 50 required)");
    }

    // 1. Compute deterministic telemetry and signal
    const telemetry = computeModelDTelemetry(symbol, candles4h);
    const signal = generateModelDSignalFrom4hCandles(symbol, candles4h, context);

    // 2. Execute mutation under atomic lock
    const { result, account } = await mutatePaperAccount((acc) => {
      const wallet = new PaperTradingWallet(acc, false);

      // Trailing stop ratchet using strictly completed closed 4H bars (excluding active bar)
      const closedBars = candles4h.slice(-6, -1).map((c) => ({ low: c.low, high: c.high }));
      const updatedTrailing = wallet.updateStructuralTrailingStop(symbol, closedBars);

      // Live price evaluation and exit checks
      const closedPositions = wallet.updateMarketPrices(symbol, telemetry.currentPrice, telemetry.atr14);

      // Duplicate closed bar check: last completed bar before active bar
      const lastClosedBar = candles4h[candles4h.length - 2];
      const lastClosedBarTimestamp = lastClosedBar?.timestamp;

      if (!acc.lastProcessedCandles) {
        acc.lastProcessedCandles = {};
      }

      const alreadyProcessed =
        lastClosedBarTimestamp !== undefined &&
        acc.lastProcessedCandles[symbol] === lastClosedBarTimestamp;

      let openedPosition: PaperPosition | undefined;
      let skippedDuplicateCandle = false;

      const normSymbol = symbol.replace("/", "");
      const hasOpenPosition = acc.positions.some(
        (p) => p.asset.replace("/", "") === normSymbol && p.status === "OPEN"
      );

      if (autoTrade && signal.stance === "BUY") {
        if (!hasOpenPosition) {
          if (!alreadyProcessed) {
            // Valid new closed 4H bar: open position
            openedPosition = wallet.openPositionFromSignal(
              signal,
              1.0, // Fixed 1.0% institutional risk per Model D spec
              "MARKET",
              {
                trailingStopType: "STRUCTURAL_SWING",
                swingTrailingBars: 5,
              }
            );

            if (lastClosedBarTimestamp !== undefined) {
              acc.lastProcessedCandles[symbol] = lastClosedBarTimestamp;
            }
          } else {
            skippedDuplicateCandle = true;
          }
        }
      }

      const activePosition = acc.positions.find(
        (p) => p.asset.replace("/", "") === normSymbol && p.status === "OPEN"
      );

      return {
        result: {
          symbol,
          signal,
          telemetry,
          trailingUpdated: updatedTrailing.length > 0,
          closedPositions,
          openedPosition,
          activePosition,
          skippedDuplicateCandle,
        },
        modified: true,
      };
    });

    return {
      ...result,
      account,
    };
  }
}
