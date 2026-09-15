import { NextRequest, NextResponse } from "next/server";
import { runBacktest } from "@/core/backtest/engine";
import { getMarketCandles } from "@/core/data/market-feed";
import { Timeframe } from "@/core/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const symbol = body.symbol || "BTCUSDT";
    const timeframe = (body.timeframe as Timeframe) || "1h";
    const initialBalance = parseFloat(body.initialBalance) || 10000;
    const riskPerTrade = parseFloat(body.riskPerTrade) || 1.5;
    const enableShorts = body.enableShorts !== undefined ? Boolean(body.enableShorts) : true;
    const enableAdxFilter = body.enableAdxFilter !== undefined ? Boolean(body.enableAdxFilter) : true;
    const adxThreshold = body.adxThreshold !== undefined ? parseFloat(body.adxThreshold) : 20;
    const enableLiquidityConfirmation = body.enableLiquidityConfirmation !== undefined ? Boolean(body.enableLiquidityConfirmation) : true;
    const takerFeePercent = body.takerFeePercent !== undefined ? parseFloat(body.takerFeePercent) : 0.05;
    const slippagePercent = body.slippagePercent !== undefined ? parseFloat(body.slippagePercent) : 0.05;
    const fillModel = body.fillModel || "PENETRATION";

    // Phase 4 Strategy Parameters
    const enableHtfGate = body.enableHtfGate !== undefined ? Boolean(body.enableHtfGate) : true;
    const trailingStopType = body.trailingStopType || "CHANDELIER_ATR";
    const chandelierMultiplier = body.chandelierMultiplier !== undefined ? parseFloat(body.chandelierMultiplier) : 2.5;
    const enableRegimeRisk = body.enableRegimeRisk !== undefined ? Boolean(body.enableRegimeRisk) : true;
    const normalRiskPercent = body.normalRiskPercent !== undefined ? parseFloat(body.normalRiskPercent) : 1.5;
    const lowAdxRiskPercent = body.lowAdxRiskPercent !== undefined ? parseFloat(body.lowAdxRiskPercent) : 0.75;
    const adxRegimeThreshold = body.adxRegimeThreshold !== undefined ? parseFloat(body.adxRegimeThreshold) : 25;

    // Fetch candles for backtest simulation (and 4H candles for zero-lookahead HTF gating)
    const [candles, candles4h] = await Promise.all([
      getMarketCandles(symbol, timeframe, 500),
      timeframe === "1h" ? getMarketCandles(symbol, "4h", 300).catch(() => []) : Promise.resolve([]),
    ]);

    const summary = runBacktest(symbol, timeframe, candles, {
      initialBalance,
      riskPerTradePercent: riskPerTrade,
      takerFeePercent,
      slippagePercent,
      enableShorts,
      enableAdxFilter,
      adxThreshold,
      enableLiquidityConfirmation,
      fillModel,
      enableHtfGate,
      candlesHTF: candles4h.length > 0 ? candles4h : undefined,
      trailingStopType,
      chandelierMultiplier,
      enableRegimeRisk,
      normalRiskPercent,
      lowAdxRiskPercent,
      adxRegimeThreshold,
    });

    return NextResponse.json({
      success: true,
      summary,
    });
  } catch (error: any) {
    console.error("Backtest execution failed:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to execute backtest" },
      { status: 500 }
    );
  }
}
