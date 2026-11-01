import { NextRequest, NextResponse } from "next/server";
import { BreakoutV3Service } from "@/core/breakout-v3/service";
import { verifyCronAuthorization } from "@/core/security/cron-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Dedicated Protected Cron Endpoint for Model Breakout V3 Paper Trading execution.
 *
 * ISOLATION:
 * - Separate Redis namespace (cryptopilot:paper:breakout-v3:v1)
 * - Separate endpoint (/api/cron/breakout-v3)
 * - Does NOT interfere with V2-AD (/api/cron/breakout) or Model D (/api/cron/paper-trading)
 *
 * Differences from V2-AD:
 * - Fixed Channel Exit (prior10 excludes candle T)
 * - ADX(14) >= 25 Regime Filter + EMA(50) Directional Filter
 * - ATR multiplier 2.2 (experimental)
 *
 * Supports execution via:
 * - Upstash QStash (GET / POST with Upstash-Forward-Authorization or Upstash-Signature)
 * - cron-job.org / external cron (GET / POST with Authorization: Bearer <CRON_SECRET>)
 */
async function handleBreakoutV3Cron(request: NextRequest) {
  const auth = await verifyCronAuthorization(request);
  if (!auth.authorized) {
    return NextResponse.json(
      { success: false, error: auth.reason || "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const report = await BreakoutV3Service.executeCycle();

    return NextResponse.json({
      success: true,
      timestamp: report.timestamp,
      model: "Breakout V3 (Experimental)",
      mode: "PAPER TRADING",
      authMethod: auth.method,
      skipped: report.skipped || false,
      skipReason: report.skipReason || null,
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
    console.error("[Breakout V3 Cron] Execution error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Breakout V3 Paper Trading cycle failed",
        model: "Breakout V3 (Experimental)",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return handleBreakoutV3Cron(request);
}

export async function POST(request: NextRequest) {
  return handleBreakoutV3Cron(request);
}
