import { extractTechnicalIndicators } from "../quant/indicators";
import { analyzeMarketStructure } from "../quant/structure";
import { generateTradingSignal } from "../signals/generator";
import { BacktestSummary, BacktestTrade, Candle, Timeframe } from "../types";

export interface BacktestOptions {
  initialBalance?: number; // default $10,000
  riskPerTradePercent?: number; // default 1.5%
  takerFeePercent?: number; // default 0.05%
  slippagePercent?: number; // default 0.05%
  highVolSlippagePercent?: number; // default 0.15%
  minBarsWarmup?: number; // default 50 bars
  enableShorts?: boolean; // default true
  enableAdxFilter?: boolean; // default true
  adxThreshold?: number; // default 20
  enableLiquidityConfirmation?: boolean; // default true
  fillModel?: "CONSERVATIVE_TOUCH" | "PENETRATION"; // default PENETRATION

  // Phase 4 Strategic Enhancements & V2/V3 Architecture
  strategyVersion?: "V1" | "V2" | "V3"; // default "V2"
  enableHtfGate?: boolean; // default true for V2/V3, false for V1
  candlesHTF?: Candle[]; // optional explicit 4H candles
  trailingStopType?: "BREAKEVEN_ONLY" | "CHANDELIER_ATR"; // default "CHANDELIER_ATR"
  chandelierMultiplier?: number; // default 3.5 for V2/V3, 2.5 for V1
  enableScaleOut?: boolean; // default true for V2, false for V3/V1
  maxHoldingHours?: number; // default 240 for V3, 168 for V2, 48 for V1
  enableRegimeRisk?: boolean; // default false
  normalRiskPercent?: number; // default 1.5%
  lowAdxRiskPercent?: number; // default 0.75%
  adxRegimeThreshold?: number; // default 25
}

/**
 * Extracts strictly completed 4H candles prior to currentTimestamp to guarantee ZERO LOOKAHEAD BIAS.
 * If explicit 4H candles are provided, filters them strictly by (timestamp + 4h <= currentTimestamp).
 * Otherwise, synthesizes completed 4H candles from completed 1H history.
 */
export function getHistorical4hCandles(
  candles1h: Candle[],
  currentTimestamp: number,
  explicitHtfCandles?: Candle[]
): Candle[] {
  const fourHoursMs = 4 * 3600000;

  if (explicitHtfCandles && explicitHtfCandles.length > 0) {
    return explicitHtfCandles.filter((c) => c.timestamp + fourHoursMs <= currentTimestamp);
  }

  const completed4h: Candle[] = [];
  const buckets = new Map<number, Candle[]>();

  for (const c of candles1h) {
    const bucketKey = Math.floor(c.timestamp / fourHoursMs) * fourHoursMs;
    if (bucketKey + fourHoursMs <= currentTimestamp) {
      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, []);
      }
      buckets.get(bucketKey)!.push(c);
    }
  }

  for (const [bucketTimestamp, bars] of buckets.entries()) {
    if (bars.length > 0) {
      const open = bars[0].open;
      const close = bars[bars.length - 1].close;
      let high = bars[0].high;
      let low = bars[0].low;
      let volume = 0;
      for (const b of bars) {
        if (b.high > high) high = b.high;
        if (b.low < low) low = b.low;
        volume += b.volume;
      }
      completed4h.push({
        timestamp: bucketTimestamp,
        open,
        high,
        low,
        close,
        volume,
      });
    }
  }

  completed4h.sort((a, b) => a.timestamp - b.timestamp);
  return completed4h;
}

/**
 * Research-grade historical backtesting engine with bidirectional simulation,
 * non-optimistic penetration fill modeling, volatility-scaled slippage, and zero lookahead bias.
 */
export function runBacktest(
  asset: string,
  timeframe: Timeframe,
  candles: Candle[],
  options: BacktestOptions = {}
): BacktestSummary {
  const initialBalance = options.initialBalance ?? 10000;
  const riskPercent = (options.riskPerTradePercent ?? 1.5) / 100;
  const baseFeeRate = (options.takerFeePercent ?? 0.05) / 100;
  const normalSlippage = (options.slippagePercent ?? 0.05) / 100;
  const highVolSlippage = (options.highVolSlippagePercent ?? 0.15) / 100;
  const warmup = options.minBarsWarmup ?? 50;
  const fillModel = options.fillModel ?? "PENETRATION";

  if (candles.length <= warmup + 10) {
    throw new Error(`Insufficient candles for backtesting (minimum ${warmup + 10} required)`);
  }

  let balance = initialBalance;
  let peakBalance = initialBalance;
  let maxDrawdownDollar = 0;
  let maxDrawdownPercent = 0;

  const trades: BacktestTrade[] = [];
  const equityCurve: Array<{ timestamp: number; equity: number }> = [
    { timestamp: candles[warmup].timestamp, equity: balance },
  ];

  let activeTrade: {
    id: string;
    type: "LONG" | "SHORT";
    entryBarIndex: number;
    entryTimestamp: number;
    entryPrice: number;
    stopLoss: number;
    initialStopLoss: number;
    highestHighSinceEntry: number;
    lowestLowSinceEntry: number;
    hasTrailed?: boolean;
    tp1: number;
    tp2: number;
    tp3: number;
    units: number;
    initialUnits: number;
    positionSizeDollar: number;
    riskDollar: number;
    breakevenMoved?: boolean;
    partialClosed?: boolean;
    realizedPartialPnl?: number;
  } | null = null;

  // Walk-forward bar-by-bar simulation through time
  // CRITICAL: slice(0, i) strictly enforces ZERO LOOKAHEAD BIAS.
  // Signals generated at candle i-1 can only be filled on candle i or later.
  for (let i = warmup; i < candles.length; i++) {
    const historicalSlice = candles.slice(0, i);
    const currentBar = candles[i];

    // Dynamic volatility-aware slippage calculation
    const barVolatility = (currentBar.high - currentBar.low) / (currentBar.close || 1);
    const currentSlippage = barVolatility > 0.02 ? highVolSlippage : normalSlippage;

    const indicators = extractTechnicalIndicators(historicalSlice);
    const currentATR = indicators.atr14;

    const isV1 = options.strategyVersion === "V1";
    const isV3 = options.strategyVersion === "V3";
    const enableScaleOut = options.enableScaleOut ?? (!isV1 && !isV3);
    const maxHold = options.maxHoldingHours ?? (isV1 ? 48 : isV3 ? 240 : 168);

    // 1. Manage active open trade
    if (activeTrade) {
      let closed = false;
      let exitPrice = 0;
      let exitReason: BacktestTrade["exitReason"] = "STOP_LOSS";

      if (activeTrade.type === "LONG") {
        // Conservative intra-candle resolution:
        // If a single candle touches both Stop Loss and Take Profit, Stop Loss is prioritized.
        const hitSL = currentBar.low <= activeTrade.stopLoss;
        const trendInversion = isV3 && currentBar.close < indicators.ema50;

        if (hitSL) {
          exitPrice = activeTrade.stopLoss * (1 - currentSlippage);
          exitReason = activeTrade.hasTrailed ? "TRAILING_STOP" : "STOP_LOSS";
          closed = true;
        } else if (trendInversion) {
          exitPrice = currentBar.close * (1 - currentSlippage);
          exitReason = "EMA_CROSS";
          closed = true;
        } else if (!isV3 && currentBar.high >= activeTrade.tp3) {
          exitPrice = activeTrade.tp3 * (1 - currentSlippage);
          exitReason = "TP3";
          closed = true;
        } else if (!isV3 && currentBar.high >= activeTrade.tp2 && (!enableScaleOut || activeTrade.partialClosed)) {
          exitPrice = activeTrade.tp2 * (1 - currentSlippage);
          exitReason = "TP2";
          closed = true;
        } else {
          // Check Partial Scale-out on TP1 if enabled in V2
          const hitTP1 = currentBar.high >= activeTrade.tp1;
          if (enableScaleOut && hitTP1 && !activeTrade.partialClosed) {
            const scaleUnits = activeTrade.units * 0.5;
            const tp1ExitPrice = activeTrade.tp1 * (1 - currentSlippage);
            const partialGross = (tp1ExitPrice - activeTrade.entryPrice) * scaleUnits;
            const partialFees = (scaleUnits * activeTrade.entryPrice + scaleUnits * tp1ExitPrice) * baseFeeRate;
            activeTrade.realizedPartialPnl = (activeTrade.realizedPartialPnl ?? 0) + partialGross - partialFees;
            activeTrade.units -= scaleUnits;
            activeTrade.partialClosed = true;
            // Ratchet stop loss to entry price (breakeven)
            activeTrade.stopLoss = Math.max(activeTrade.stopLoss, activeTrade.entryPrice);
            activeTrade.breakevenMoved = true;
          }

          if (options.trailingStopType === "CHANDELIER_ATR" || isV3) {
            // Chandelier ATR Trailing Stop:
            // Update highest high reached since entry
            activeTrade.highestHighSinceEntry = Math.max(activeTrade.highestHighSinceEntry, currentBar.high);
            const multiplier = options.chandelierMultiplier ?? (isV1 ? 2.5 : 3.5);
            const chandelierStop = activeTrade.highestHighSinceEntry - multiplier * currentATR;

            // Must never move upward and must never widen beyond initial stop loss
            if (chandelierStop > activeTrade.stopLoss) {
              activeTrade.stopLoss = chandelierStop;
              activeTrade.hasTrailed = true;
            }

            if (i - activeTrade.entryBarIndex > maxHold) {
              // Timed out (stale trade beyond maxHold)
              exitPrice = currentBar.close;
              exitReason = "TIMED_OUT";
              closed = true;
            }
          } else {
            // BREAKEVEN_ONLY mode (Baseline)
            if (hitTP1 && !activeTrade.breakevenMoved) {
              // Breakeven Ratchet: Once TP1 is hit, move stop loss to entry price
              activeTrade.stopLoss = activeTrade.entryPrice;
              activeTrade.breakevenMoved = true;
            } else if (hitTP1 && i - activeTrade.entryBarIndex > 16 && isV1) {
              // Take profit 1 exit if trade is aging
              exitPrice = activeTrade.tp1 * (1 - currentSlippage);
              exitReason = "TP1";
              closed = true;
            } else if (i - activeTrade.entryBarIndex > maxHold) {
              // Timed out (stale trade beyond maxHold)
              exitPrice = currentBar.close;
              exitReason = "TIMED_OUT";
              closed = true;
            }
          }
        }
      } else {
        // SHORT trade management
        // For shorts: low price = profit, high price = loss
        const hitSL = currentBar.high >= activeTrade.stopLoss;
        const trendInversion = isV3 && currentBar.close > indicators.ema50;

        if (hitSL) {
          exitPrice = activeTrade.stopLoss * (1 + currentSlippage);
          exitReason = activeTrade.hasTrailed ? "TRAILING_STOP" : "STOP_LOSS";
          closed = true;
        } else if (trendInversion) {
          exitPrice = currentBar.close * (1 + currentSlippage);
          exitReason = "EMA_CROSS";
          closed = true;
        } else if (!isV3 && currentBar.low <= activeTrade.tp3) {
          exitPrice = activeTrade.tp3 * (1 + currentSlippage);
          exitReason = "TP3";
          closed = true;
        } else if (!isV3 && currentBar.low <= activeTrade.tp2 && (!enableScaleOut || activeTrade.partialClosed)) {
          exitPrice = activeTrade.tp2 * (1 + currentSlippage);
          exitReason = "TP2";
          closed = true;
        } else {
          // Check Partial Scale-out on TP1 if enabled in V2
          const hitTP1 = currentBar.low <= activeTrade.tp1;
          if (enableScaleOut && hitTP1 && !activeTrade.partialClosed) {
            const scaleUnits = activeTrade.units * 0.5;
            const tp1ExitPrice = activeTrade.tp1 * (1 + currentSlippage);
            const partialGross = (activeTrade.entryPrice - tp1ExitPrice) * scaleUnits;
            const partialFees = (scaleUnits * activeTrade.entryPrice + scaleUnits * tp1ExitPrice) * baseFeeRate;
            activeTrade.realizedPartialPnl = (activeTrade.realizedPartialPnl ?? 0) + partialGross - partialFees;
            activeTrade.units -= scaleUnits;
            activeTrade.partialClosed = true;
            // Ratchet stop loss to entry price (breakeven)
            activeTrade.stopLoss = Math.min(activeTrade.stopLoss, activeTrade.entryPrice);
            activeTrade.breakevenMoved = true;
          }

          if (options.trailingStopType === "CHANDELIER_ATR" || isV3) {
            // Chandelier ATR Trailing Stop:
            // Update lowest low reached since entry
            activeTrade.lowestLowSinceEntry = Math.min(activeTrade.lowestLowSinceEntry, currentBar.low);
            const multiplier = options.chandelierMultiplier ?? (isV1 ? 2.5 : 3.5);
            const chandelierStop = activeTrade.lowestLowSinceEntry + multiplier * currentATR;

            // Must never move upward and must never widen beyond initial stop loss
            if (chandelierStop < activeTrade.stopLoss) {
              activeTrade.stopLoss = chandelierStop;
              activeTrade.hasTrailed = true;
            }

            if (i - activeTrade.entryBarIndex > maxHold) {
              // Timed out (stale trade beyond maxHold)
              exitPrice = currentBar.close;
              exitReason = "TIMED_OUT";
              closed = true;
            }
          } else {
            // BREAKEVEN_ONLY mode (Baseline)
            if (hitTP1 && !activeTrade.breakevenMoved) {
              // Breakeven Ratchet: Once TP1 is hit, move stop loss to entry price
              activeTrade.stopLoss = activeTrade.entryPrice;
              activeTrade.breakevenMoved = true;
            } else if (hitTP1 && i - activeTrade.entryBarIndex > 16 && isV1) {
              // Take profit 1 exit if trade is aging
              exitPrice = activeTrade.tp1 * (1 + currentSlippage);
              exitReason = "TP1";
              closed = true;
            } else if (i - activeTrade.entryBarIndex > maxHold) {
              // Timed out (stale trade beyond maxHold)
              exitPrice = currentBar.close;
              exitReason = "TIMED_OUT";
              closed = true;
            }
          }
        }
      }

      if (closed) {
        // Calculate PnL for Long vs Short taking into account partial scale-out
        const remainingGrossPnl = activeTrade.type === "LONG"
          ? (exitPrice - activeTrade.entryPrice) * activeTrade.units
          : (activeTrade.entryPrice - exitPrice) * activeTrade.units;

        const remainingFees = (activeTrade.units * activeTrade.entryPrice + exitPrice * activeTrade.units) * baseFeeRate;
        const netPnl = remainingGrossPnl - remainingFees + (activeTrade.realizedPartialPnl ?? 0);

        balance += netPnl;
        if (balance > peakBalance) peakBalance = balance;

        const currentDrawdownDollar = peakBalance - balance;
        const currentDrawdownPct = (currentDrawdownDollar / peakBalance) * 100;
        if (currentDrawdownPct > maxDrawdownPercent) {
          maxDrawdownPercent = currentDrawdownPct;
          maxDrawdownDollar = currentDrawdownDollar;
        }

        const isWin = netPnl > 0;
        const rMultiple = activeTrade.riskDollar > 0 ? netPnl / activeTrade.riskDollar : 0;

        trades.push({
          id: activeTrade.id,
          asset,
          entryTimestamp: activeTrade.entryTimestamp,
          exitTimestamp: currentBar.timestamp,
          type: activeTrade.type,
          entryPrice: activeTrade.entryPrice,
          exitPrice,
          stopLoss: activeTrade.stopLoss,
          takeProfit: activeTrade.tp2,
          result: isWin ? "WIN" : "LOSS",
          pnlDollar: Number(netPnl.toFixed(2)),
          pnlPercent: Number(((netPnl / activeTrade.positionSizeDollar) * 100).toFixed(2)),
          rMultiple: Number(rMultiple.toFixed(2)),
          exitReason,
          durationHours: Math.round((currentBar.timestamp - activeTrade.entryTimestamp) / 3600000),
        });

        equityCurve.push({
          timestamp: currentBar.timestamp,
          equity: Number(balance.toFixed(2)),
        });

        activeTrade = null;
      }
    }

    // 2. Scan for new trading signals if no active trade
    if (!activeTrade) {
      try {
        const htfCandles = getHistorical4hCandles(historicalSlice, currentBar.timestamp, options.candlesHTF);
        const structure = analyzeMarketStructure(historicalSlice, htfCandles.length >= 10 ? htfCandles : undefined);
        const contextMock = {
          fearGreedIndex: 52,
          fearGreedSentiment: "Neutral",
          fundingRate: 0.0001,
          marketRegime: "TRENDING_BULL" as const,
        };

        const signal = generateTradingSignal(asset, indicators, structure, contextMock, {
          strategyVersion: options.strategyVersion ?? "V2",
          adxThreshold: options.adxThreshold ?? (isV1 ? 20 : 25),
          enableShorts: options.enableShorts ?? true,
          enableAdxFilter: options.enableAdxFilter ?? true,
          enableLiquidityConfirmation: options.enableLiquidityConfirmation ?? true,
          enableHtfGate: options.enableHtfGate ?? (isV1 ? false : true),
          regimeRiskThreshold: options.adxRegimeThreshold ?? 25,
          normalRiskPercent: options.normalRiskPercent ?? 1.5,
          lowAdxRiskPercent: options.lowAdxRiskPercent ?? 0.75,
        });

        const atr = indicators.atr14;

        // Dynamic Regime-Specific Risk Sizing
        let tradeRiskPercent = riskPercent;
        if (options.enableRegimeRisk) {
          const normalRisk = (options.normalRiskPercent ?? 1.5) / 100;
          const lowRisk = (options.lowAdxRiskPercent ?? 0.75) / 100;
          const regimeThreshold = options.adxRegimeThreshold ?? 25;
          tradeRiskPercent = indicators.adx14 >= regimeThreshold ? normalRisk : lowRisk;
        }

        const minConfidence = isV1 ? 65 : 75;

        // LONG entry execution with conservative penetration fill check
        if (signal.stance === "BUY" && signal.confidenceScore >= minConfidence) {
          const targetEntry = signal.entryRange.ideal;
          const penetrationBuffer = fillModel === "PENETRATION" ? atr * 0.05 : 0;
          const isFilled = currentBar.low <= targetEntry - penetrationBuffer || currentBar.open <= targetEntry;

          if (isFilled) {
            const actualEntryPrice = targetEntry * (1 + currentSlippage);
            const stopLoss = signal.stopLoss;
            const stopDist = Math.abs(actualEntryPrice - stopLoss);

            if (stopDist > 0 && actualEntryPrice > stopLoss) {
              const riskDollar = balance * tradeRiskPercent;
              const units = riskDollar / stopDist;
              const positionSizeDollar = units * actualEntryPrice;

              if (positionSizeDollar <= balance * 3.0) {
                activeTrade = {
                  id: `bt_${asset}_L_${i}`,
                  type: "LONG",
                  entryBarIndex: i,
                  entryTimestamp: currentBar.timestamp,
                  entryPrice: actualEntryPrice,
                  stopLoss,
                  initialStopLoss: stopLoss,
                  highestHighSinceEntry: actualEntryPrice,
                  lowestLowSinceEntry: actualEntryPrice,
                  hasTrailed: false,
                  tp1: signal.takeProfitTargets[0]?.price ?? actualEntryPrice * 1.04,
                  tp2: signal.takeProfitTargets[1]?.price ?? actualEntryPrice * 1.08,
                  tp3: signal.takeProfitTargets[2]?.price ?? actualEntryPrice * 1.15,
                  units,
                  initialUnits: units,
                  positionSizeDollar,
                  riskDollar,
                  partialClosed: false,
                  realizedPartialPnl: 0,
                };
              }
            }
          }
        }
        // SHORT entry execution with conservative penetration fill check
        else if (signal.stance === "SHORT" && signal.confidenceScore >= minConfidence && (options.enableShorts ?? true)) {
          const targetEntry = signal.entryRange.ideal;
          const penetrationBuffer = fillModel === "PENETRATION" ? atr * 0.05 : 0;
          const isFilled = currentBar.high >= targetEntry + penetrationBuffer || currentBar.open >= targetEntry;

          if (isFilled) {
            const actualEntryPrice = targetEntry * (1 - currentSlippage);
            const stopLoss = signal.stopLoss;
            const stopDist = Math.abs(stopLoss - actualEntryPrice);

            if (stopDist > 0 && stopLoss > actualEntryPrice) {
              const riskDollar = balance * tradeRiskPercent;
              const units = riskDollar / stopDist;
              const positionSizeDollar = units * actualEntryPrice;

              if (positionSizeDollar <= balance * 3.0) {
                activeTrade = {
                  id: `bt_${asset}_S_${i}`,
                  type: "SHORT",
                  entryBarIndex: i,
                  entryTimestamp: currentBar.timestamp,
                  entryPrice: actualEntryPrice,
                  stopLoss,
                  initialStopLoss: stopLoss,
                  highestHighSinceEntry: actualEntryPrice,
                  lowestLowSinceEntry: actualEntryPrice,
                  hasTrailed: false,
                  tp1: signal.takeProfitTargets[0]?.price ?? actualEntryPrice * 0.96,
                  tp2: signal.takeProfitTargets[1]?.price ?? actualEntryPrice * 0.92,
                  tp3: signal.takeProfitTargets[2]?.price ?? actualEntryPrice * 0.85,
                  units,
                  initialUnits: units,
                  positionSizeDollar,
                  riskDollar,
                  partialClosed: false,
                  realizedPartialPnl: 0,
                };
              }
            }
          }
        }
      } catch (err) {
        // Skip bar if insufficient data or edge case
      }
    }
  }

  // Calculate detailed research-grade performance statistics
  const winningTrades = trades.filter((t) => t.result === "WIN");
  const losingTrades = trades.filter((t) => t.result === "LOSS");
  const winRatePercent = trades.length > 0
    ? Number(((winningTrades.length / trades.length) * 100).toFixed(1))
    : 0;

  const longTrades = trades.filter((t) => t.type === "LONG");
  const shortTrades = trades.filter((t) => t.type === "SHORT");
  const winningLongs = longTrades.filter((t) => t.result === "WIN");
  const winningShorts = shortTrades.filter((t) => t.result === "WIN");

  const longWinRate = longTrades.length > 0
    ? Number(((winningLongs.length / longTrades.length) * 100).toFixed(1))
    : 0;
  const shortWinRate = shortTrades.length > 0
    ? Number(((winningShorts.length / shortTrades.length) * 100).toFixed(1))
    : 0;

  const grossProfit = winningTrades.reduce((acc, t) => acc + t.pnlDollar, 0);
  const grossLoss = Math.abs(losingTrades.reduce((acc, t) => acc + t.pnlDollar, 0));
  const profitFactor = grossLoss > 0
    ? Number((grossProfit / grossLoss).toFixed(2))
    : grossProfit > 0 ? 99.9 : 0;

  const netProfitDollar = Number((balance - initialBalance).toFixed(2));
  const netProfitPercent = Number((((balance - initialBalance) / initialBalance) * 100).toFixed(2));

  const averageWinDollar = winningTrades.length > 0
    ? Number((grossProfit / winningTrades.length).toFixed(2))
    : 0;
  const averageLossDollar = losingTrades.length > 0
    ? Number((grossLoss / losingTrades.length).toFixed(2))
    : 0;

  const averageRMultiple = trades.length > 0
    ? Number((trades.reduce((acc, t) => acc + t.rMultiple, 0) / trades.length).toFixed(2))
    : 0;

  // Mathematical expectancy
  const winProbability = trades.length > 0 ? winningTrades.length / trades.length : 0;
  const lossProbability = 1 - winProbability;
  const expectancyDollar = Number((winProbability * averageWinDollar - lossProbability * averageLossDollar).toFixed(2));
  const expectancyR = Number((averageRMultiple).toFixed(2));

  // Annualized Sharpe Ratio
  const returns = trades.map((t) => t.pnlPercent);
  const meanReturn = returns.length > 0
    ? returns.reduce((a, b) => a + b, 0) / returns.length
    : 0;
  const variance = returns.length > 1
    ? returns.reduce((acc, r) => acc + Math.pow(r - meanReturn, 2), 0) / (returns.length - 1)
    : 1;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? Number(((meanReturn / stdDev) * Math.sqrt(365)).toFixed(2)) : 0;

  // Annualized Sortino Ratio (Downside deviation penalization only)
  const negativeReturns = returns.filter((r) => r < 0);
  const downsideVariance = negativeReturns.length > 0
    ? negativeReturns.reduce((acc, r) => acc + Math.pow(r, 2), 0) / returns.length
    : 0;
  const downsideDeviation = Math.sqrt(downsideVariance);
  const sortinoRatio = downsideDeviation > 0
    ? Number(((meanReturn / downsideDeviation) * Math.sqrt(365)).toFixed(2))
    : meanReturn > 0 ? 99.9 : 0;

  // Consecutive wins & losses
  let currentWins = 0;
  let maxConsecutiveWins = 0;
  let currentLosses = 0;
  let maxConsecutiveLosses = 0;

  for (const t of trades) {
    if (t.result === "WIN") {
      currentWins++;
      currentLosses = 0;
      if (currentWins > maxConsecutiveWins) maxConsecutiveWins = currentWins;
    } else {
      currentLosses++;
      currentWins = 0;
      if (currentLosses > maxConsecutiveLosses) maxConsecutiveLosses = currentLosses;
    }
  }

  // Extreme trade metrics & average duration
  const largestWinDollar = winningTrades.length > 0
    ? Number(Math.max(...winningTrades.map((t) => t.pnlDollar)).toFixed(2))
    : 0;
  const largestLossDollar = losingTrades.length > 0
    ? Number(Math.min(...losingTrades.map((t) => t.pnlDollar)).toFixed(2))
    : 0;
  const averageTradeDurationHours = trades.length > 0
    ? Number((trades.reduce((acc, t) => acc + t.durationHours, 0) / trades.length).toFixed(1))
    : 0;
  const smallSampleWarning = trades.length < 15;

  return {
    asset,
    timeframe,
    periodStart: new Date(candles[0].timestamp).toISOString().split("T")[0],
    periodEnd: new Date(candles[candles.length - 1].timestamp).toISOString().split("T")[0],
    initialBalance,
    finalBalance: Number(balance.toFixed(2)),
    totalTrades: trades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    winRatePercent,
    longTrades: longTrades.length,
    shortTrades: shortTrades.length,
    longWinRatePercent: longWinRate,
    shortWinRatePercent: shortWinRate,
    grossProfitDollar: Number(grossProfit.toFixed(2)),
    grossLossDollar: Number(grossLoss.toFixed(2)),
    averageWinDollar,
    averageLossDollar,
    profitFactor,
    maxDrawdownPercent: Number(maxDrawdownPercent.toFixed(2)),
    netProfitDollar,
    netProfitPercent,
    averageRMultiple,
    expectancyDollar,
    expectancyR,
    sharpeRatio,
    sortinoRatio,
    maxConsecutiveWins,
    maxConsecutiveLosses,
    largestWinDollar,
    largestLossDollar,
    averageTradeDurationHours,
    smallSampleWarning,
    trades: trades.reverse(),
    equityCurve,
  };
}
