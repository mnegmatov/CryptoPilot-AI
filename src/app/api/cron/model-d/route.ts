import { NextRequest, NextResponse } from "next/server";
import { getMarketCandles, getMarketContext } from "@/core/data/market-feed";
import { PaperTradingService } from "@/core/paper/service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MONITORED_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

/**
 * Protected Vercel Cron Endpoint for Model D automatic execution:
 * Evaluates real Binance market data, updates trailing stops and stop loss exits,
 * checks for new closed 4H candles, and auto-executes Model D positions without requiring an open browser tab.
 */
export async function GET(request: NextRequest) {
  // Part 7: Security validation via CRON_SECRET
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

  const results: Record<string, any> = {};

  try {
    for (const symbol of MONITORED_SYMBOLS) {
      try {
        const [candles4h, context] = await Promise.all([
          getMarketCandles(symbol, "4h", 220),
          getMarketContext(symbol),
        ]);

        if (candles4h.length >= 50) {
          const report = await PaperTradingService.executeModelDAutoCycle(
            symbol,
            candles4h,
            context,
            true
          );

          results[symbol] = {
            success: true,
            trend: report.telemetry.trend4h,
            currentPrice: report.telemetry.currentPrice,
            signalStance: report.signal.stance,
            trailingUpdated: report.trailingUpdated,
            closedCount: report.closedPositions.length,
            opened: report.openedPosition ? report.openedPosition.id : null,
            skippedDuplicateCandle: report.skippedDuplicateCandle,
          };
        } else {
          results[symbol] = {
            success: false,
            error: "Insufficient 4H candles (<50)",
          };
        }
      } catch (assetErr: any) {
        console.error(`Cron error processing ${symbol}:`, assetErr);
        results[symbol] = {
          success: false,
          error: assetErr.message || "Execution error",
        };
      }
    }

    const currentAccount = await PaperTradingService.getAccount();

    return NextResponse.json({
      success: true,
      timestamp: Date.now(),
      mode: process.env.UPSTASH_REDIS_REST_URL ? "upstash_redis" : "local_file_dev",
      accountSummary: {
        balance: currentAccount.balance,
        equity: currentAccount.equity,
        realizedPnl: currentAccount.realizedPnl,
        openPositionsCount: currentAccount.positions.length,
        closedTradesCount: currentAccount.tradeHistory.length,
        version: currentAccount.version,
      },
      results,
    });
  } catch (error: any) {
    console.error("Cron Model D execution failed:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed Model D cron execution" },
      { status: 500 }
    );
  }
}
