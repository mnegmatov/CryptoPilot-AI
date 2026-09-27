import { Candle } from "../types";
import { fetchBinanceKlines, fetchBinance24hrTicker } from "../data/binance";
import { validateCandles } from "../data/market-feed";
import { BreakoutStorageService } from "./storage";
import { evaluateBreakoutLevels, checkPositionExit, V2_AD_CONFIG, StrategyConfig } from "./strategy";
import {
  BreakoutAccount,
  BreakoutAssetState,
  BreakoutClosedTrade,
  BreakoutCycleReport,
  BreakoutPosition,
  BreakoutSnapshot,
  BreakoutTelemetry,
} from "./types";

export const BREAKOUT_UNIVERSE = ["BTCUSDT", "ETHUSDT", "SOLUSDT"] as const;
const FOUR_HOURS_MS = 4 * 3600 * 1000;

export class BreakoutPaperService {
  /**
   * Returns the current Breakout Paper Trading account
   */
  static async getAccount(): Promise<BreakoutAccount> {
    return BreakoutStorageService.loadAccount();
  }

  /**
   * Resets the Breakout Paper Trading account back to initial $10,000 balance
   */
  static async resetAccount(): Promise<BreakoutAccount> {
    return BreakoutStorageService.resetAccount();
  }

  /**
   * Returns recent snapshots
   */
  static async getSnapshots(limit: number = 100): Promise<BreakoutSnapshot[]> {
    return BreakoutStorageService.getSnapshots(limit);
  }

  /**
   * Fetches real public candles from Binance without synthetic or fallback fake values
   */
  static async fetchRealCandles(symbol: string, limit: number = 60): Promise<Candle[]> {
    try {
      const raw = await fetchBinanceKlines(symbol, "4h", limit);
      return validateCandles(raw);
    } catch (err: any) {
      console.error(`[BreakoutPaper] Binance public data fetch failed for ${symbol}:`, err);
      throw new Error(`Real Binance 4H data unavailable for ${symbol}: ${err.message}`);
    }
  }

  /**
   * Fetches real live price from Binance ticker
   */
  static async fetchLivePrice(symbol: string): Promise<number> {
    try {
      const ticker = await fetchBinance24hrTicker(symbol);
      if (!ticker || typeof ticker.lastPrice !== "number" || ticker.lastPrice <= 0) {
        throw new Error(`Invalid ticker response for ${symbol}`);
      }
      return ticker.lastPrice;
    } catch (err: any) {
      console.error(`[BreakoutPaper] Failed to fetch live price for ${symbol}:`, err);
      throw new Error(`Real Binance live price unavailable for ${symbol}: ${err.message}`);
    }
  }

  /**
   * Recalculates account-level performance statistics
   */
  static updateAccountStats(account: BreakoutAccount): void {
    const trades = account.tradeHistory;
    const totalTrades = trades.length;
    const wins = trades.filter((t) => t.netPnl > 0);
    const losses = trades.filter((t) => t.netPnl <= 0);

    const winningTrades = wins.length;
    const losingTrades = losses.length;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

    const totalWinDollar = wins.reduce((sum, t) => sum + t.netPnl, 0);
    const totalLossDollar = Math.abs(losses.reduce((sum, t) => sum + t.netPnl, 0));
    const profitFactor = totalLossDollar > 0 ? totalWinDollar / totalLossDollar : totalWinDollar > 0 ? 99.9 : 0;

    const expectancy =
      totalTrades > 0 ? trades.reduce((sum, t) => sum + t.rMultiple, 0) / totalTrades : 0;

    const largestWin = wins.length > 0 ? Math.max(...wins.map((t) => t.netPnl)) : 0;
    const largestLoss = losses.length > 0 ? Math.min(...losses.map((t) => t.netPnl)) : 0;

    let longestStreak = 0;
    let currentStreak = 0;
    for (const t of trades) {
      if (t.netPnl <= 0) {
        currentStreak++;
        if (currentStreak > longestStreak) longestStreak = currentStreak;
      } else {
        currentStreak = 0;
      }
    }

    if (account.equity > account.stats.peakEquity) {
      account.stats.peakEquity = account.equity;
    }
    const currentDrawdown =
      account.stats.peakEquity > 0
        ? ((account.stats.peakEquity - account.equity) / account.stats.peakEquity) * 100
        : 0;
    const maxDrawdown = Math.max(account.stats.maxDrawdown, currentDrawdown);

    account.stats = {
      totalTrades,
      winningTrades,
      losingTrades,
      winRate,
      profitFactor,
      expectancy,
      maxDrawdown,
      currentDrawdown,
      peakEquity: account.stats.peakEquity,
      largestWin,
      largestLoss,
      longestLosingStreak: longestStreak,
      currentLosingStreak: currentStreak,
    };
  }

  /**
   * Main execution cycle for Model Breakout V2-AD.
   * Can be invoked by scheduler every 10 minutes or manually via API.
   */
  static async executeCycle(
    config: StrategyConfig = V2_AD_CONFIG,
    customCandlesMap?: Record<string, Candle[]>,
    customPricesMap?: Record<string, number>
  ): Promise<BreakoutCycleReport> {
    const unlock = await BreakoutStorageService.acquireLock();

    try {
      const account = await BreakoutStorageService.loadAccount();
      const telemetries: Record<string, BreakoutTelemetry> = {};
      const closedTradesThisCycle: BreakoutClosedTrade[] = [];
      const openedPositionsThisCycle: BreakoutPosition[] = [];
      const now = Date.now();

      // Track prices for snapshot
      const priceMap: Record<string, number> = {};

      for (const symbol of BREAKOUT_UNIVERSE) {
        // 1. Fetch market data
        const candles = customCandlesMap?.[symbol] ?? (await this.fetchRealCandles(symbol, 60));
        const livePrice = customPricesMap?.[symbol] ?? (await this.fetchLivePrice(symbol));
        priceMap[symbol] = livePrice;

        // 2. Separate completed 4H candles from forming candle
        const completedCandles = candles.filter((c) => c.timestamp + FOUR_HOURS_MS <= now);
        const formingCandles = candles.filter((c) => c.timestamp + FOUR_HOURS_MS > now);
        const formingCandle = formingCandles.length > 0 ? formingCandles[formingCandles.length - 1] : null;

        if (completedCandles.length < 25) {
          throw new Error(`Insufficient completed candles for ${symbol} (need >= 25)`);
        }

        const latestCompleted = completedCandles[completedCandles.length - 1]; // Candle T
        const existingPosition = account.positions.find((p) => p.asset === symbol) || null;

        // 3. Compute cooldown
        const lastExitTs = account.lastExitTimestamps[symbol] || 0;
        const barsSinceExit = lastExitTs > 0 ? Math.floor((latestCompleted.timestamp - lastExitTs) / FOUR_HOURS_MS) : 999;
        const cooldownRemainingBars = Math.max(0, config.cooldownCandles - barsSinceExit);

        // 4. Evaluate technical levels & breakout
        const techLevels = evaluateBreakoutLevels(
          symbol,
          completedCandles,
          existingPosition !== null,
          cooldownRemainingBars,
          config
        );

        let state: BreakoutAssetState = "WAIT";

        // 5. Handle existing open position (Intra-candle stop loss & completed candle channel exit)
        if (existingPosition) {
          state = "POSITION OPEN";

          // Update position live metrics
          existingPosition.currentPrice = livePrice;
          if (livePrice > existingPosition.highestPriceSinceEntry) {
            existingPosition.highestPriceSinceEntry = livePrice;
          }
          if (livePrice < existingPosition.lowestPriceSinceEntry) {
            existingPosition.lowestPriceSinceEntry = livePrice;
          }

          if (existingPosition.direction === "LONG") {
            existingPosition.unrealizedPnl =
              existingPosition.units * (livePrice - existingPosition.entryPrice);
          } else {
            existingPosition.unrealizedPnl =
              existingPosition.units * (existingPosition.entryPrice - livePrice);
          }
          existingPosition.unrealizedPnlPercent =
            (existingPosition.unrealizedPnl / existingPosition.positionSizeDollar) * 100;
          existingPosition.unrealizedR =
            existingPosition.riskDollar > 0
              ? existingPosition.unrealizedPnl / existingPosition.riskDollar
              : 0;
          existingPosition.channelExitLevel =
            existingPosition.direction === "LONG" ? techLevels.ll10 : techLevels.hh10;

          // Check if exit condition is triggered
          const exitCheck = checkPositionExit(
            existingPosition,
            latestCompleted,
            livePrice,
            { hh10: techLevels.hh10, ll10: techLevels.ll10 },
            config
          );

          if (exitCheck && exitCheck.shouldExit) {
            state = "EXIT";
            const exitPrice = exitCheck.exitPrice;
            const exitNotional = existingPosition.units * exitPrice;
            const exitFee = exitNotional * config.feeRate;
            const exitSlippage =
              existingPosition.units * Math.abs(exitPrice - (exitCheck.exitReason === "STOP_LOSS" ? existingPosition.stopPrice : latestCompleted.close));

            const totalFees = existingPosition.feesPaid + exitFee;
            const totalSlippage = existingPosition.slippagePaid + exitSlippage;

            let grossPnl = 0;
            if (existingPosition.direction === "LONG") {
              grossPnl = existingPosition.units * (exitPrice - existingPosition.entryPrice);
            } else {
              grossPnl = existingPosition.units * (existingPosition.entryPrice - exitPrice);
            }
            const netPnl = grossPnl - totalFees;
            const rMultiple = existingPosition.riskDollar > 0 ? netPnl / existingPosition.riskDollar : 0;
            const holdingDurationHours =
              Math.max(1, (now - existingPosition.entryTimestamp) / (3600 * 1000));

            const closedTrade: BreakoutClosedTrade = {
              id: `trade_${symbol}_${existingPosition.entryTimestamp}`,
              asset: symbol,
              direction: existingPosition.direction,
              breakoutTimestamp: existingPosition.breakoutTimestamp,
              breakoutLevel: existingPosition.breakoutLevel,
              entryTimestamp: existingPosition.entryTimestamp,
              entryPrice: existingPosition.entryPrice,
              stopPrice: existingPosition.stopPrice,
              exitTimestamp: now,
              exitPrice,
              exitReason: exitCheck.exitReason,
              quantity: existingPosition.units,
              riskDollar: existingPosition.riskDollar,
              fees: totalFees,
              slippage: totalSlippage,
              grossPnl,
              netPnl,
              pnlPercent: (netPnl / existingPosition.positionSizeDollar) * 100,
              rMultiple,
              holdingDurationHours,
            };

            // Update cash and account
            account.cash += existingPosition.positionSizeDollar + netPnl;
            account.realizedPnl += netPnl;
            account.fees += totalFees;
            account.slippagePaid += totalSlippage;
            account.tradeHistory.push(closedTrade);
            closedTradesThisCycle.push(closedTrade);

            // Record exit timestamp for cooldown
            account.lastExitTimestamps[symbol] = latestCompleted.timestamp;

            // Remove from open positions
            account.positions = account.positions.filter((p) => p.id !== existingPosition.id);
          }
        } else {
          // 6. No existing position: check for new breakout execution
          if (techLevels.signal && techLevels.signal.status === "ACTIVE") {
            state = "BREAKOUT DETECTED";

            const sig = techLevels.signal;
            const lastProcessed = account.lastProcessedCandles[symbol] || 0;

            // Execution Rule:
            // Breakout occurs on completed candle T.
            // Entry is ONLY on next 4H candle T+1 OPEN.
            // Check if candle T has not yet been traded, and we are currently on T+1
            const isNewSignalCandle = sig.breakoutTimestamp > lastProcessed;
            const isCandleTPlus1 =
              formingCandle !== null && formingCandle.timestamp === sig.breakoutTimestamp + FOUR_HOURS_MS;

            // Check timing: must be within candle T+1 window (not T+2 or later)
            const isWithinTPlus1Window =
              now >= sig.breakoutTimestamp + FOUR_HOURS_MS &&
              now < sig.breakoutTimestamp + 2 * FOUR_HOURS_MS;

            if (isNewSignalCandle && isCandleTPlus1 && isWithinTPlus1Window) {
              // Execute entry at T+1 OPEN with slippage
              const rawEntryPrice = formingCandle.open;
              const actualEntryPrice =
                sig.direction === "LONG"
                  ? rawEntryPrice * (1 + config.slippageRate)
                  : rawEntryPrice * (1 - config.slippageRate);

              const stopDist = config.atrMultiplier * sig.atr;
              const stopPrice =
                sig.direction === "LONG"
                  ? actualEntryPrice - stopDist
                  : actualEntryPrice + stopDist;

              const currentEquity = account.cash + account.positions.reduce((acc, p) => acc + p.unrealizedPnl, 0);
              const riskDollar = currentEquity * (config.riskPerTradePercent / 100);
              const units = riskDollar / stopDist;
              const positionSizeDollar = units * actualEntryPrice;
              const entryFee = positionSizeDollar * config.feeRate;
              const entrySlippage = units * Math.abs(actualEntryPrice - rawEntryPrice);

              const newPosition: BreakoutPosition = {
                id: `pos_${symbol}_${formingCandle.timestamp}`,
                asset: symbol,
                direction: sig.direction,
                entryTimestamp: formingCandle.timestamp,
                entryPrice: actualEntryPrice,
                stopPrice,
                initialStopDistance: stopDist,
                units,
                riskDollar,
                positionSizeDollar,
                feesPaid: entryFee,
                slippagePaid: entrySlippage,
                currentPrice: livePrice,
                unrealizedPnl: 0,
                unrealizedPnlPercent: 0,
                unrealizedR: 0,
                highestPriceSinceEntry: actualEntryPrice,
                lowestPriceSinceEntry: actualEntryPrice,
                breakoutTimestamp: sig.breakoutTimestamp,
                breakoutLevel: sig.breakoutLevel,
                breakoutVolRatio: sig.volRatio,
                channelExitLevel: sig.direction === "LONG" ? techLevels.ll10 : techLevels.hh10,
              };

              account.cash -= entryFee;
              account.fees += entryFee;
              account.slippagePaid += entrySlippage;
              account.positions.push(newPosition);
              openedPositionsThisCycle.push(newPosition);
              account.lastProcessedCandles[symbol] = sig.breakoutTimestamp;

              sig.status = "EXECUTED";
              state = "POSITION OPEN";
            }
          }
        }

        // 7. Store telemetry for asset
        telemetries[symbol] = {
          asset: symbol,
          state,
          currentPrice: livePrice,
          hh20: techLevels.hh20,
          ll20: techLevels.ll20,
          channelExitLevel: techLevels.ll10,
          volumeRatio: techLevels.volRatio,
          atr14: techLevels.atr14,
          cooldownRemainingBars,
          lastCompletedCandle: {
            timestamp: latestCompleted.timestamp,
            open: latestCompleted.open,
            high: latestCompleted.high,
            low: latestCompleted.low,
            close: latestCompleted.close,
            volume: latestCompleted.volume,
          },
          formingCandle: formingCandle
            ? {
                timestamp: formingCandle.timestamp,
                open: formingCandle.open,
                high: formingCandle.high,
                low: formingCandle.low,
                close: formingCandle.close,
              }
            : null,
          pendingSignal: techLevels.signal,
          activePosition: account.positions.find((p) => p.asset === symbol) || null,
          lastExitTimestamp: lastExitTs > 0 ? lastExitTs : null,
        };
      }

      // 8. Recompute total account equity & unrealized PnL
      const totalUnrealizedPnl = account.positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
      account.unrealizedPnl = totalUnrealizedPnl;
      account.equity = account.cash + totalUnrealizedPnl;

      // 9. Update stats
      this.updateAccountStats(account);

      // 10. Persist periodic snapshot
      const snapshot: BreakoutSnapshot = {
        timestamp: now,
        equity: account.equity,
        cash: account.cash,
        unrealizedPnl: account.unrealizedPnl,
        realizedPnl: account.realizedPnl,
        openPositions: account.positions.length,
        btcPrice: priceMap["BTCUSDT"] || 0,
        ethPrice: priceMap["ETHUSDT"] || 0,
        solPrice: priceMap["SOLUSDT"] || 0,
      };
      await BreakoutStorageService.saveSnapshot(snapshot);

      // 11. Persist updated account
      await BreakoutStorageService.saveAccount(account);

      return {
        timestamp: now,
        success: true,
        telemetries,
        account,
        closedTradesThisCycle,
        openedPositionsThisCycle,
      };
    } finally {
      await unlock();
    }
  }
}
