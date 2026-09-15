import { PaperAccount, PaperPosition, TradingSignal } from "../types";

const INITIAL_BALANCE = 10000;
const TAKER_FEE_RATE = 0.0005; // 0.05%
const SLIPPAGE_RATE = 0.0005; // 0.05%

export class PaperTradingWallet {
  private account: PaperAccount;

  constructor(initialBalance: number = INITIAL_BALANCE) {
    this.account = {
      balance: initialBalance,
      initialBalance,
      equity: initialBalance,
      unrealizedPnl: 0,
      realizedPnl: 0,
      positions: [],
      tradeHistory: [],
    };
  }

  public getAccount(): PaperAccount {
    this.recalculateEquity();
    return { ...this.account };
  }

  /**
   * Opens a paper position (LONG or SHORT) from a verified signal
   */
  public openPositionFromSignal(
    signal: TradingSignal,
    riskPercentage?: number,
    orderType: "MARKET" | "LIMIT" = "MARKET",
    trailingOptions?: {
      trailingStopType?: "BREAKEVEN_ONLY" | "CHANDELIER_ATR" | "STRUCTURAL_SWING";
      chandelierMultiplier?: number;
      swingTrailingBars?: number;
    }
  ): PaperPosition {
    this.recalculateEquity();

    const isShort = signal.stance === "SHORT" || signal.type === "SHORT";
    const posType: "LONG" | "SHORT" = isShort ? "SHORT" : "LONG";

    const basePrice = orderType === "MARKET" ? signal.currentPrice : signal.entryRange.ideal;
    const entryPrice = isShort
      ? Number((basePrice * (1 - SLIPPAGE_RATE)).toFixed(2))
      : Number((basePrice * (1 + SLIPPAGE_RATE)).toFixed(2));

    const stopLoss = signal.stopLoss;
    const stopDistance = Math.abs(entryPrice - stopLoss);

    if (stopDistance <= 0) {
      throw new Error("Invalid stop loss distance");
    }

    const effectiveRisk = riskPercentage ?? signal.recommendedRiskPercent ?? 1.5;
    const riskDollar = this.account.equity * (effectiveRisk / 100);
    const sizeUnits = Number((riskDollar / stopDistance).toFixed(4));
    const notionalValue = Number((sizeUnits * entryPrice).toFixed(2));
    const marginUsed = Number((notionalValue / 2.0).toFixed(2)); // conservative 2x margin

    // Deduct entry fee
    const openFee = Number((notionalValue * TAKER_FEE_RATE).toFixed(2));

    if (marginUsed + openFee > this.account.balance) {
      throw new Error("Insufficient virtual margin balance to open this position");
    }

    this.account.balance -= openFee;
    this.account.realizedPnl -= openFee;

    const isModelD = signal.strategyVersion === "MODEL_D";
    // Model D has NO fixed Take Profit (exits strictly by trailing stop)
    const defaultTP = isModelD
      ? (isShort ? Number((entryPrice * 0.1).toFixed(2)) : Number((entryPrice * 10).toFixed(2)))
      : isShort
      ? signal.takeProfitTargets[1]?.price || entryPrice * 0.94
      : signal.takeProfitTargets[1]?.price || entryPrice * 1.06;

    const defaultTrailingType = isModelD
      ? "STRUCTURAL_SWING"
      : "CHANDELIER_ATR";

    const position: PaperPosition = {
      id: `pos_${signal.asset}_${Date.now()}`,
      signalId: signal.id,
      asset: signal.asset,
      type: posType,
      status: "OPEN",
      entryPrice,
      currentPrice: entryPrice,
      stopLoss,
      initialStopLoss: stopLoss,
      takeProfit: defaultTP,
      sizeUnits,
      notionalValue,
      marginUsed,
      unrealizedPnl: 0,
      unrealizedPnlPercent: 0,
      realizedPnl: -openFee,
      openedAt: Date.now(),
      tp1Hit: false,
      breakevenMoved: false,
      highestHigh: entryPrice,
      lowestLow: entryPrice,
      trailingStopType: trailingOptions?.trailingStopType ?? defaultTrailingType,
      chandelierMultiplier: trailingOptions?.chandelierMultiplier ?? 2.5,
      swingTrailingBars: trailingOptions?.swingTrailingBars ?? 5,
      strategyVersion: signal.strategyVersion,
      recentCandles: [],
    };

    this.account.positions.push(position);
    this.recalculateEquity();
    return position;
  }

  /**
   * Updates all open positions against the latest real market price,
   * handles Structural Swing / Chandelier ATR stop ratcheting / breakeven ratcheting, and executes SL / TP exits.
   */
  public updateMarketPrices(symbol: string, currentPrice: number, currentATR?: number): PaperPosition[] {
    const closedPositions: PaperPosition[] = [];

    for (let i = this.account.positions.length - 1; i >= 0; i--) {
      const pos = this.account.positions[i];
      if (pos.asset !== symbol && pos.asset.replace("/", "") !== symbol.replace("/", "")) {
        continue;
      }

      pos.currentPrice = currentPrice;

      // Track extreme excursions for trailing stop
      if (pos.type === "LONG") {
        pos.highestHigh = Math.max(pos.highestHigh ?? pos.entryPrice, currentPrice);
      } else {
        pos.lowestLow = Math.min(pos.lowestLow ?? pos.entryPrice, currentPrice);
      }

      // PnL Calculation
      const priceDiff = pos.type === "LONG"
        ? currentPrice - pos.entryPrice
        : pos.entryPrice - currentPrice;

      pos.unrealizedPnl = Number((priceDiff * pos.sizeUnits).toFixed(2));
      pos.unrealizedPnlPercent = Number(((priceDiff / pos.entryPrice) * 100).toFixed(2));

      // Trailing stop management
      if (pos.trailingStopType === "STRUCTURAL_SWING") {
        if (pos.recentCandles && pos.recentCandles.length > 0) {
          const barsToUse = pos.swingTrailingBars ?? 5;
          const slice = pos.recentCandles.slice(-barsToUse);
          if (pos.type === "LONG") {
            const swingLow = Math.min(...slice.map((c) => c.low));
            if (swingLow > pos.stopLoss) {
              pos.stopLoss = Number(swingLow.toFixed(2));
              pos.trailingStopPrice = pos.stopLoss;
            }
          } else {
            const swingHigh = Math.max(...slice.map((c) => c.high));
            if (swingHigh < pos.stopLoss) {
              pos.stopLoss = Number(swingHigh.toFixed(2));
              pos.trailingStopPrice = pos.stopLoss;
            }
          }
        }
      } else if (pos.trailingStopType === "CHANDELIER_ATR" && currentATR && currentATR > 0) {
        const mult = pos.chandelierMultiplier ?? 2.5;
        if (pos.type === "LONG") {
          const chandelierStop = Number((pos.highestHigh! - mult * currentATR).toFixed(2));
          // Never move downward, never widen beyond initial stop loss
          if (chandelierStop > pos.stopLoss) {
            pos.stopLoss = chandelierStop;
            pos.trailingStopPrice = chandelierStop;
          }
        } else {
          const chandelierStop = Number((pos.lowestLow! + mult * currentATR).toFixed(2));
          // Never move upward, never widen beyond initial stop loss
          if (chandelierStop < pos.stopLoss) {
            pos.stopLoss = chandelierStop;
            pos.trailingStopPrice = chandelierStop;
          }
        }
      } else {
        // Automatic Breakeven Ratchet: if trade reaches 1.5R profit, move Stop Loss to Breakeven
        const initialRiskDistance = Math.abs(pos.entryPrice - (pos.initialStopLoss ?? pos.stopLoss));
        if (!pos.breakevenMoved && priceDiff >= initialRiskDistance * 1.5) {
          pos.stopLoss = pos.entryPrice;
          pos.breakevenMoved = true;
          pos.tp1Hit = true;
        }
      }

      // Check Stop Loss hit
      const isStopHit = pos.type === "LONG"
        ? currentPrice <= pos.stopLoss
        : currentPrice >= pos.stopLoss;

      // Check Take Profit hit
      const isTakeProfitHit = pos.type === "LONG"
        ? currentPrice >= pos.takeProfit
        : currentPrice <= pos.takeProfit;

      if (isStopHit) {
        const exitFee = Number((currentPrice * pos.sizeUnits * TAKER_FEE_RATE).toFixed(2));
        pos.status = "CLOSED";
        pos.closedAt = Date.now();
        pos.closeReason = (pos.trailingStopPrice !== undefined || pos.breakevenMoved || (pos.initialStopLoss !== undefined && pos.stopLoss !== pos.initialStopLoss)) ? "TRAILING_STOP_HIT" : "STOP_LOSS_HIT";
        pos.realizedPnl = pos.unrealizedPnl - exitFee;
        this.account.balance += pos.realizedPnl;
        this.account.realizedPnl += pos.realizedPnl;
        this.account.tradeHistory.unshift(pos);
        this.account.positions.splice(i, 1);
        closedPositions.push(pos);
      } else if (isTakeProfitHit) {
        const exitFee = Number((currentPrice * pos.sizeUnits * TAKER_FEE_RATE).toFixed(2));
        pos.status = "CLOSED";
        pos.closedAt = Date.now();
        pos.closeReason = "TAKE_PROFIT_HIT";
        pos.realizedPnl = pos.unrealizedPnl - exitFee;
        this.account.balance += pos.realizedPnl;
        this.account.realizedPnl += pos.realizedPnl;
        this.account.tradeHistory.unshift(pos);
        this.account.positions.splice(i, 1);
        closedPositions.push(pos);
      }
    }

    this.recalculateEquity();
    return closedPositions;
  }

  /**
   * Updates structural swing trailing stops for all open positions using newly completed 4H bars.
   * Zero lookahead: Only accepts closed 4H candles.
   */
  public updateStructuralTrailingStop(
    symbol: string,
    closedCandles: Array<{ low: number; high: number }>
  ): PaperPosition[] {
    const updatedPositions: PaperPosition[] = [];

    for (const pos of this.account.positions) {
      if (pos.asset !== symbol && pos.asset.replace("/", "") !== symbol.replace("/", "")) {
        continue;
      }
      if (pos.trailingStopType !== "STRUCTURAL_SWING") {
        continue;
      }

      pos.recentCandles = [...closedCandles];
      const barsToUse = pos.swingTrailingBars ?? 5;
      const slice = closedCandles.slice(-barsToUse);

      if (slice.length > 0) {
        if (pos.type === "LONG") {
          const swingLow = Math.min(...slice.map((c) => c.low));
          if (swingLow > pos.stopLoss) {
            pos.stopLoss = Number(swingLow.toFixed(2));
            pos.trailingStopPrice = pos.stopLoss;
            updatedPositions.push(pos);
          }
        } else {
          const swingHigh = Math.max(...slice.map((c) => c.high));
          if (swingHigh < pos.stopLoss) {
            pos.stopLoss = Number(swingHigh.toFixed(2));
            pos.trailingStopPrice = pos.stopLoss;
            updatedPositions.push(pos);
          }
        }
      }
    }

    return updatedPositions;
  }

  /**
   * Manually closes an open paper trade
   */
  public closePosition(positionId: string, currentPrice?: number): PaperPosition {
    const idx = this.account.positions.findIndex((p) => p.id === positionId);
    if (idx === -1) {
      throw new Error(`Position ${positionId} not found`);
    }

    const pos = this.account.positions[idx];
    const finalPrice = currentPrice ?? pos.currentPrice;
    pos.currentPrice = finalPrice;
    pos.status = "CLOSED";
    pos.closedAt = Date.now();
    pos.closeReason = "MANUAL_CLOSE";

    const priceDiff = pos.type === "LONG"
      ? finalPrice - pos.entryPrice
      : pos.entryPrice - finalPrice;

    const exitFee = Number((finalPrice * pos.sizeUnits * TAKER_FEE_RATE).toFixed(2));
    pos.realizedPnl = Number((priceDiff * pos.sizeUnits - exitFee).toFixed(2));
    pos.unrealizedPnl = 0;
    pos.unrealizedPnlPercent = 0;

    this.account.balance += pos.realizedPnl;
    this.account.realizedPnl += pos.realizedPnl;
    this.account.tradeHistory.unshift(pos);
    this.account.positions.splice(idx, 1);

    this.recalculateEquity();
    return pos;
  }

  /**
   * Resets virtual paper trading account
   */
  public resetAccount(balance: number = INITIAL_BALANCE) {
    this.account = {
      balance,
      initialBalance: balance,
      equity: balance,
      unrealizedPnl: 0,
      realizedPnl: 0,
      positions: [],
      tradeHistory: [],
    };
  }

  private recalculateEquity() {
    let totalUnrealized = 0;
    for (const pos of this.account.positions) {
      totalUnrealized += pos.unrealizedPnl;
    }
    this.account.unrealizedPnl = Number(totalUnrealized.toFixed(2));
    this.account.equity = Number((this.account.balance + totalUnrealized).toFixed(2));
  }
}

export const globalPaperWallet = new PaperTradingWallet(10000);
