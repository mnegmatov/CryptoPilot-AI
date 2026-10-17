import { NextRequest, NextResponse } from "next/server";
import { getMarketCandles, getMarketContext } from "@/core/data/market-feed";
import { PaperTradingService } from "@/core/paper/service";
import { verifyCronAuthorization } from "@/core/security/cron-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MONITORED_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const DEBOUNCE_INTERVAL_MS = 60 * 1000;

/**
 * Protected Vercel Cron Endpoint for Model D automatic execution:
 * Evaluates real Binance market data, updates trailing stops and stop loss exits,
 * checks for new closed 4H candles, and auto-executes Model D positions without requiring an open browser tab.
 *
 * Supports execution via:
 * - Upstash QStash (GET / POST with Upstash-Forward-Authorization or Upstash-Signature)
 * - cron-job.org / external cron (GET / POST with Authorization: Bearer <CRON_SECRET>)
 * - GitHub Actions (GET with Authorization: Bearer <CRON_SECRET>)
 */
async function handleModelDCron(request: NextRequest) {
  const auth = await verifyCronAuthorization(request);
  if (!auth.authorized) {
    return NextResponse.json(
      { success: false, error: auth.reason || "Unauthorized: Invalid CRON_SECRET" },
      { status: 401 }
    );
  }

  const results: Record<string, any> = {};

  try {
    const currentAccount = await PaperTradingService.getAccount();
    const now = Date.now();

    // Debounce Guard: if Model D account was already evaluated in the last 60s, skip redundant Binance queries
    if (currentAccount.lastUpdated && now - currentAccount.lastUpdated < DEBOUNCE_INTERVAL_MS) {
      return NextResponse.json({
        success: true,
        timestamp: now,
        mode: process.env.UPSTASH_REDIS_REST_URL ? "upstash_redis" : "local_file_dev",
        authMethod: auth.method,
        skipped: true,
        skipReason: `Cycle skipped: already evaluated ${Math.round((now - currentAccount.lastUpdated) / 1000)}s ago (debounce threshold is 60s)`,
        accountSummary: {
          balance: currentAccount.balance,
          equity: currentAccount.equity,
          realizedPnl: currentAccount.realizedPnl,
          openPositionsCount: currentAccount.positions.length,
          closedTradesCount: currentAccount.tradeHistory.length,
          version: currentAccount.version,
        },
        results: {},
      });
    }

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

    const updatedAccount = await PaperTradingService.getAccount();

    return NextResponse.json({
      success: true,
      timestamp: Date.now(),
      mode: process.env.UPSTASH_REDIS_REST_URL ? "upstash_redis" : "local_file_dev",
      authMethod: auth.method,
      skipped: false,
      accountSummary: {
        balance: updatedAccount.balance,
        equity: updatedAccount.equity,
        realizedPnl: updatedAccount.realizedPnl,
        openPositionsCount: updatedAccount.positions.length,
        closedTradesCount: updatedAccount.tradeHistory.length,
        version: updatedAccount.version,
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

export async function GET(request: NextRequest) {
  return handleModelDCron(request);
}

export async function POST(request: NextRequest) {
  return handleModelDCron(request);
}
