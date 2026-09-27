import { NextRequest, NextResponse } from "next/server";
import { BreakoutPaperService } from "@/core/breakout-paper/service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Dedicated Protected Cron Endpoint for Model Breakout V2-AD Paper Trading execution.
 * Evaluates real Binance 4H public market data, manages stop losses & channel exits,
 * and enters positions on completed 4H candle breakouts at T+1 OPEN.
 * Zero connection to Model D or real-money trading.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    const urlKey = request.nextUrl.searchParams.get("key");
    const isAuthorized =
      authHeader === `Bearer ${cronSecret}` || urlKey === cronSecret;

    if (!isAuthorized) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Invalid CRON_SECRET" },
        { status: 401 }
      );
    }
  }

  try {
    const report = await BreakoutPaperService.executeCycle();

    return NextResponse.json({
      success: true,
      timestamp: report.timestamp,
      model: "Breakout V2-AD",
      mode: "PAPER TRADING",
      account: {
        equity: report.account.equity,
        cash: report.account.cash,
        realizedPnl: report.account.realizedPnl,
        unrealizedPnl: report.account.unrealizedPnl,
        openPositionsCount: report.account.positions.length,
        closedTradesCount: report.account.tradeHistory.length,
        winRate: report.account.stats.winRate,
        profitFactor: report.account.stats.profitFactor,
        maxDrawdown: report.account.stats.maxDrawdown,
        version: report.account.version,
      },
      openedPositions: report.openedPositionsThisCycle.map((p) => ({
        id: p.id,
        asset: p.asset,
        direction: p.direction,
        entryPrice: p.entryPrice,
        stopPrice: p.stopPrice,
      })),
      closedTrades: report.closedTradesThisCycle.map((t) => ({
        id: t.id,
        asset: t.asset,
        direction: t.direction,
        netPnl: t.netPnl,
        rMultiple: t.rMultiple,
        exitReason: t.exitReason,
      })),
      telemetry: Object.entries(report.telemetries).reduce(
        (acc, [asset, tel]) => {
          acc[asset] = {
            state: tel.state,
            currentPrice: tel.currentPrice,
            hh20: tel.hh20,
            ll20: tel.ll20,
            channelExitLevel: tel.channelExitLevel,
            volumeRatio: tel.volumeRatio,
            atr14: tel.atr14,
            cooldownRemainingBars: tel.cooldownRemainingBars,
            hasActivePosition: tel.activePosition !== null,
          };
          return acc;
        },
        {} as Record<string, any>
      ),
    });
  } catch (error: any) {
    console.error("[Breakout Cron] Execution error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Breakout Paper Trading cycle failed",
        model: "Breakout V2-AD",
      },
      { status: 500 }
    );
  }
}
