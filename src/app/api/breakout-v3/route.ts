import { NextRequest, NextResponse } from "next/server";
import { BreakoutV3Service } from "@/core/breakout-v3/service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Breakout V3 Status & Monitoring API
 *
 * GET /api/breakout-v3 — Returns current account state, performance stats,
 * open positions, exit reason breakdown, and recent snapshots.
 *
 * No authentication required (read-only monitoring).
 */
export async function GET(_request: NextRequest) {
  try {
    const account = await BreakoutV3Service.getAccount();
    const snapshots = await BreakoutV3Service.getSnapshots(50);

    // Exit reason breakdown
    const exitReasonBreakdown = {
      STOP_LOSS: 0,
      CHANNEL_EXIT: 0,
      MANUAL: 0,
    };
    for (const trade of account.tradeHistory) {
      if (trade.exitReason in exitReasonBreakdown) {
        exitReasonBreakdown[trade.exitReason as keyof typeof exitReasonBreakdown]++;
      }
    }

    // Average holding duration
    const avgHoldingHours =
      account.tradeHistory.length > 0
        ? account.tradeHistory.reduce((sum, t) => sum + t.holdingDurationHours, 0) /
          account.tradeHistory.length
        : 0;

    // Average R-multiple
    const avgRMultiple =
      account.tradeHistory.length > 0
        ? account.tradeHistory.reduce((sum, t) => sum + t.rMultiple, 0) /
          account.tradeHistory.length
        : 0;

    // Total fees and slippage
    const totalFees = account.fees;
    const totalSlippage = account.slippagePaid;

    // Return on initial capital
    const returnPercent =
      account.initialBalance > 0
        ? ((account.equity - account.initialBalance) / account.initialBalance) * 100
        : 0;

    return NextResponse.json({
      model: "Breakout V3 (Experimental)",
      mode: "PAPER TRADING",
      version: "3.0.0",
      config: {
        atrMultiplier: 2.2,
        adxThreshold: 25,
        emaPeriod: 50,
        breakoutLookback: 20,
        exitLookback: 10,
        channelExitFix: "prior10 excludes candle T",
        riskPerTrade: "1%",
        universe: ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
        timeframe: "4H",
      },
      account: {
        initialBalance: account.initialBalance,
        equity: Number(account.equity.toFixed(2)),
        cash: Number(account.cash.toFixed(2)),
        realizedPnl: Number(account.realizedPnl.toFixed(2)),
        unrealizedPnl: Number(account.unrealizedPnl.toFixed(2)),
        fees: Number(totalFees.toFixed(2)),
        slippage: Number(totalSlippage.toFixed(2)),
        returnPercent: Number(returnPercent.toFixed(2)),
        version: account.version,
        accountingVersion: account.accountingVersion,
        lastUpdated: account.lastUpdated
          ? new Date(account.lastUpdated).toISOString()
          : null,
      },
      stats: {
        totalTrades: account.stats.totalTrades,
        winningTrades: account.stats.winningTrades,
        losingTrades: account.stats.losingTrades,
        winRate: Number(account.stats.winRate.toFixed(1)),
        profitFactor: Number(account.stats.profitFactor.toFixed(2)),
        expectancy: Number(account.stats.expectancy.toFixed(3)),
        avgRMultiple: Number(avgRMultiple.toFixed(3)),
        maxDrawdown: Number(account.stats.maxDrawdown.toFixed(2)),
        currentDrawdown: Number(account.stats.currentDrawdown.toFixed(2)),
        peakEquity: Number(account.stats.peakEquity.toFixed(2)),
        largestWin: Number(account.stats.largestWin.toFixed(2)),
        largestLoss: Number(account.stats.largestLoss.toFixed(2)),
        longestLosingStreak: account.stats.longestLosingStreak,
        currentLosingStreak: account.stats.currentLosingStreak,
        avgHoldingHours: Number(avgHoldingHours.toFixed(1)),
        exitReasonBreakdown,
      },
      openPositions: account.positions.map((p) => ({
        id: p.id,
        asset: p.asset,
        direction: p.direction,
        entryPrice: Number(p.entryPrice.toFixed(4)),
        stopPrice: Number(p.stopPrice.toFixed(4)),
        channelExitLevel: Number(p.channelExitLevel.toFixed(4)),
        units: Number(p.units.toFixed(6)),
        positionSizeDollar: Number(p.positionSizeDollar.toFixed(2)),
        riskDollar: Number(p.riskDollar.toFixed(2)),
        currentPrice: Number(p.currentPrice.toFixed(4)),
        unrealizedPnl: Number(p.unrealizedPnl.toFixed(2)),
        unrealizedPnlPercent: Number(p.unrealizedPnlPercent.toFixed(2)),
        unrealizedR: Number(p.unrealizedR.toFixed(3)),
        entryTimestamp: new Date(p.entryTimestamp).toISOString(),
      })),
      recentTrades: account.tradeHistory.slice(-10).reverse().map((t) => ({
        id: t.id,
        asset: t.asset,
        direction: t.direction,
        entryPrice: Number(t.entryPrice.toFixed(4)),
        exitPrice: Number(t.exitPrice.toFixed(4)),
        exitReason: t.exitReason,
        netPnl: Number(t.netPnl.toFixed(2)),
        pnlPercent: Number(t.pnlPercent.toFixed(2)),
        rMultiple: Number(t.rMultiple.toFixed(3)),
        holdingDurationHours: Number(t.holdingDurationHours.toFixed(1)),
        entryTimestamp: new Date(t.entryTimestamp).toISOString(),
        exitTimestamp: new Date(t.exitTimestamp).toISOString(),
      })),
      snapshotCount: snapshots.length,
      latestSnapshot: snapshots.length > 0 ? {
        timestamp: new Date(snapshots[snapshots.length - 1].timestamp).toISOString(),
        equity: Number(snapshots[snapshots.length - 1].equity.toFixed(2)),
      } : null,
    });
  } catch (error: any) {
    console.error("[Breakout V3 Status] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch Breakout V3 status",
        model: "Breakout V3 (Experimental)",
      },
      { status: 500 }
    );
  }
}
