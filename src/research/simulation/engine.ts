import { RawHistoricalCandle, ResearchConfig, ResearchTrade, ResearchDirection } from "../types";
import { calculateEMA, calculateATR } from "../../core/quant/indicators";
import { calculateStructuralSwingTrailing } from "./trailing";

export interface SimulationResult {
  symbol: string;
  direction: ResearchDirection;
  trades: ResearchTrade[];
  initialBalance: number;
  finalEquity: number;
  netPnlPercent: number;
  maxDrawdownPercent: number;
  equityCurve: { timestamp: number; equity: number; drawdownPercent: number }[];
}

/**
 * Causal Point-in-Time Model D Historical Simulator
 *
 * Strict Zero-Lookahead Guarantees:
 * 1. Indicator values (EMA20, EMA50, EMA200, ATR14) for bar T are computed strictly using completed closes up to bar T-1.
 * 2. Signal evaluation (Macro Gate, Trend Gate, Pullback-Bounce) occurs on closed bar T-1.
 * 3. Execution entry occurs at Open(T) with taker fee and slippage deducted.
 * 4. Stop Loss / Trailing:
 *    - Trailing ratchet at bar T uses strictly completed bars T-5 through T-1.
 *    - Intra-bar worst-case exit: Stop Loss is prioritized if Low(T) <= StopLoss for Longs
 *      (or High(T) >= StopLoss for Shorts).
 *    - Fill executed at StopLoss price adjusted for adverse slippage and exit fee.
 * 5. Primary baseline is LONG_ONLY. LONG_SHORT is a separate comparison mode.
 */
export function runCausalModelDSimulation(
  candles: RawHistoricalCandle[],
  config: ResearchConfig
): SimulationResult {
  const initialBalance = config.initialBalance || 10000;
  const riskFraction = (config.riskPerTradePercent || 1.0) / 100;
  const takerFeeRate = config.takerFeeRate ?? 0.0005;
  const slippageRate = config.slippageRate ?? 0.0005;
  const atrMultiplier = config.atrMultiplier || 2.5;
  const trailingWindow = config.trailingWindowBars || 5;
  const maxStopLossPct = (config.maxStopLossDistancePercent || 6.0) / 100;
  const isLongOnly = config.direction === "LONG_ONLY";

  if (candles.length < 210) {
    return {
      symbol: config.symbol,
      direction: config.direction,
      trades: [],
      initialBalance,
      finalEquity: initialBalance,
      netPnlPercent: 0,
      maxDrawdownPercent: 0,
      equityCurve: [],
    };
  }

  // Pre-calculate full causal indicator series
  // Note: calculateEMA and calculateATR are strictly causal arrays where element i uses only elements 0..i
  const closes = candles.map((c) => c.close);
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const ema200 = calculateEMA(closes, 200);
  const atr14 = calculateATR(candles, 14);

  let cash = initialBalance;
  let activeTrade: ResearchTrade | null = null;
  const completedTrades: ResearchTrade[] = [];

  let peakEquity = initialBalance;
  let maxDrawdownPercent = 0;
  const equityCurve: { timestamp: number; equity: number; drawdownPercent: number }[] = [];

  // Start iteration after warmup period (205 bars to allow EMA200 and ATR14 to stabilize)
  const warmupBars = 205;

  for (let i = warmupBars; i < candles.length; i++) {
    const currentBar = candles[i];
    const prevBarIndex = i - 1;
    const prevBar = candles[prevBarIndex];

    // Indicator values strictly on CLOSED bar T-1
    const pEma20 = ema20[prevBarIndex];
    const pEma50 = ema50[prevBarIndex];
    const pEma200 = ema200[prevBarIndex];
    const pAtr = atr14[prevBarIndex] || prevBar.close * 0.02;

    // 1. MANAGE ACTIVE TRADE FIRST (INTRA-BAR RESOLUTION ON CURRENT BAR)
    if (activeTrade) {
      let exitOccurred = false;
      let exitPrice = 0;
      let exitReason: "STOP_LOSS" | "TRAILING_STOP" | "END_OF_DATA" = "STOP_LOSS";

      // Calculate Trailing level available at start of bar T (using bars T-5 .. T-1)
      const trailingLevel = calculateStructuralSwingTrailing(
        candles,
        i,
        activeTrade.direction,
        trailingWindow
      );

      if (activeTrade.direction === "LONG") {
        // Ratchet trailing stop upward only
        if (trailingLevel !== null && trailingLevel > activeTrade.currentStopLoss) {
          activeTrade.currentStopLoss = Math.max(activeTrade.currentStopLoss, trailingLevel);
        }

        // Check intra-candle hit of Stop Loss (worst-case: low touches or breaks stop)
        if (currentBar.low <= activeTrade.currentStopLoss) {
          exitOccurred = true;
          // Fill at stop price minus slippage
          exitPrice = activeTrade.currentStopLoss * (1 - slippageRate);
          exitReason = activeTrade.currentStopLoss > activeTrade.entryPrice ? "TRAILING_STOP" : "STOP_LOSS";
        }
      } else {
        // SHORT POSITION
        // Ratchet trailing stop downward only
        if (trailingLevel !== null && trailingLevel < activeTrade.currentStopLoss) {
          activeTrade.currentStopLoss = Math.min(activeTrade.currentStopLoss, trailingLevel);
        }

        // Check intra-candle hit of Stop Loss for Short (high touches or breaks stop)
        if (currentBar.high >= activeTrade.currentStopLoss) {
          exitOccurred = true;
          // Fill at stop price plus slippage
          exitPrice = activeTrade.currentStopLoss * (1 + slippageRate);
          exitReason = activeTrade.currentStopLoss < activeTrade.entryPrice ? "TRAILING_STOP" : "STOP_LOSS";
        }
      }

      if (exitOccurred) {
        // Process trade settlement
        activeTrade.exitBarIndex = i;
        activeTrade.exitTimestamp = currentBar.timestamp;
        activeTrade.exitPrice = exitPrice;
        activeTrade.exitReason = exitReason;

        const grossPnl =
          activeTrade.direction === "LONG"
            ? (exitPrice - activeTrade.entryPrice) * activeTrade.units
            : (activeTrade.entryPrice - exitPrice) * activeTrade.units;

        const exitFee = activeTrade.units * exitPrice * takerFeeRate;
        activeTrade.feePaid += exitFee;
        activeTrade.pnlGross = grossPnl;
        activeTrade.pnlNet = grossPnl - activeTrade.feePaid - activeTrade.slippagePaid;
        activeTrade.returnPercent = (activeTrade.pnlNet / (activeTrade.units * activeTrade.entryPrice)) * 100;
        activeTrade.holdingHours = (currentBar.timestamp - activeTrade.entryTimestamp) / (3600 * 1000);

        const initial1rRisk = activeTrade.units * Math.abs(activeTrade.entryPrice - activeTrade.initialStopLoss);
        activeTrade.rMultiple = initial1rRisk > 0 ? activeTrade.pnlNet / initial1rRisk : 0;

        // Return capital to cash pool
        cash += activeTrade.units * activeTrade.entryPrice + activeTrade.pnlNet;
        completedTrades.push(activeTrade);
        activeTrade = null;
      }
    }

    // 2. SIGNAL EVALUATION & EXECUTION (Only if no active position)
    if (!activeTrade) {
      // Long Model D Criteria on bar T-1:
      // Macro Gate: Close > EMA200
      // Trend Gate: EMA20 > EMA50
      // Pullback-Bounce: Low <= EMA20 and Close > EMA20
      const isLongMacro = prevBar.close > pEma200;
      const isLongTrend = pEma20 > pEma50;
      const isLongPullbackBounce = prevBar.low <= pEma20 && prevBar.close > pEma20;
      const signalLong = isLongMacro && isLongTrend && isLongPullbackBounce;

      // Short Model D Criteria on bar T-1:
      // Macro Gate: Close < EMA200
      // Trend Gate: EMA20 < EMA50
      // Bounce-Rejection: High >= EMA20 and Close < EMA20
      const isShortMacro = prevBar.close < pEma200;
      const isShortTrend = pEma20 < pEma50;
      const isShortBounceRejection = prevBar.high >= pEma20 && prevBar.close < pEma20;
      const signalShort = !isLongOnly && isShortMacro && isShortTrend && isShortBounceRejection;

      if (signalLong || signalShort) {
        const direction: "LONG" | "SHORT" = signalLong ? "LONG" : "SHORT";
        const entryPrice =
          direction === "LONG" ? currentBar.open * (1 + slippageRate) : currentBar.open * (1 - slippageRate);

        // Initial Stop Loss calculation
        let rawStopDistance = atrMultiplier * pAtr;
        const maxStopDistance = entryPrice * maxStopLossPct;
        const stopDistance = Math.min(rawStopDistance, maxStopDistance);

        const stopLoss =
          direction === "LONG" ? Number((entryPrice - stopDistance).toFixed(2)) : Number((entryPrice + stopDistance).toFixed(2));

        // Risk-based position sizing (1.0% of account equity)
        const currentEquity = cash;
        const riskCapital = currentEquity * riskFraction;
        const distancePerUnit = Math.abs(entryPrice - stopLoss);

        if (distancePerUnit > 0) {
          const units = riskCapital / distancePerUnit;
          const entryValue = units * entryPrice;

          // Ensure leverage/margin check (position value <= cash * 1.5)
          const maxAllowedValue = cash * 1.5;
          const constrainedUnits = entryValue > maxAllowedValue ? maxAllowedValue / entryPrice : units;

          const entryFee = constrainedUnits * entryPrice * takerFeeRate;
          const slippageAmount = constrainedUnits * entryPrice * slippageRate;

          cash -= constrainedUnits * entryPrice;

          activeTrade = {
            id: `trade_${config.symbol}_${currentBar.timestamp}`,
            symbol: config.symbol,
            direction,
            entryBarIndex: i,
            entryTimestamp: currentBar.timestamp,
            entryPrice,
            initialStopLoss: stopLoss,
            currentStopLoss: stopLoss,
            exitBarIndex: -1,
            exitTimestamp: -1,
            exitPrice: 0,
            exitReason: "STOP_LOSS",
            units: constrainedUnits,
            pnlGross: 0,
            pnlNet: 0,
            returnPercent: 0,
            rMultiple: 0,
            highestRReached: 0,
            holdingHours: 0,
            feePaid: entryFee,
            slippagePaid: slippageAmount,
            regimeAtEntry: {
              trend: pEma20 > pEma50 ? (direction === "LONG" ? "BULL" : "BEAR") : "CHOP",
              volatility: pAtr / prevBar.close > 0.03 ? "HIGH" : "NORMAL",
              adx14: 25,
              ema200DistancePercent: Math.abs((prevBar.close - pEma200) / pEma200) * 100,
            },
          };
        }
      }
    }

    // 3. EQUITY CURVE RECORDING (MARK TO MARKET ON CLOSE)
    let currentEquity = cash;
    if (activeTrade) {
      const openPnl =
        activeTrade.direction === "LONG"
          ? (currentBar.close - activeTrade.entryPrice) * activeTrade.units
          : (activeTrade.entryPrice - currentBar.close) * activeTrade.units;
      currentEquity += activeTrade.units * activeTrade.entryPrice + openPnl;
    }

    if (currentEquity > peakEquity) {
      peakEquity = currentEquity;
    }
    const currentDd = ((peakEquity - currentEquity) / peakEquity) * 100;
    if (currentDd > maxDrawdownPercent) {
      maxDrawdownPercent = currentDd;
    }

    equityCurve.push({
      timestamp: currentBar.timestamp,
      equity: currentEquity,
      drawdownPercent: currentDd,
    });
  }

  // Settle any remaining open trade on final bar
  if (activeTrade && candles.length > 0) {
    const lastBar = candles[candles.length - 1];
    const exitPrice = activeTrade.direction === "LONG" ? lastBar.close * (1 - slippageRate) : lastBar.close * (1 + slippageRate);
    activeTrade.exitBarIndex = candles.length - 1;
    activeTrade.exitTimestamp = lastBar.timestamp;
    activeTrade.exitPrice = exitPrice;
    activeTrade.exitReason = "END_OF_DATA";

    const grossPnl =
      activeTrade.direction === "LONG"
        ? (exitPrice - activeTrade.entryPrice) * activeTrade.units
        : (activeTrade.entryPrice - exitPrice) * activeTrade.units;

    const exitFee = activeTrade.units * exitPrice * takerFeeRate;
    activeTrade.feePaid += exitFee;
    activeTrade.pnlGross = grossPnl;
    activeTrade.pnlNet = grossPnl - activeTrade.feePaid - activeTrade.slippagePaid;
    cash += activeTrade.units * activeTrade.entryPrice + activeTrade.pnlNet;
    completedTrades.push(activeTrade);
    activeTrade = null;
  }

  const finalEquity = cash;
  const netPnlPercent = ((finalEquity - initialBalance) / initialBalance) * 100;

  return {
    symbol: config.symbol,
    direction: config.direction,
    trades: completedTrades,
    initialBalance,
    finalEquity,
    netPnlPercent,
    maxDrawdownPercent,
    equityCurve,
  };
}
