import { NextResponse } from "next/server";
import { getMarketContext, getWatchlistOverview } from "@/core/data/market-feed";
import { ApiErrorResponse } from "@/core/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [watchlist, context] = await Promise.all([
      getWatchlistOverview(),
      getMarketContext("BTCUSDT"),
    ]);

    return NextResponse.json({
      success: true,
      watchlist,
      context,
      timestamp: Date.now(),
    });
  } catch (error: any) {
    const isTimeout = error.message?.toLowerCase().includes("timeout");
    const errorPayload: ApiErrorResponse = {
      success: false,
      error: error.message || "Failed to fetch market data",
      code: isTimeout ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNAVAILABLE",
      timestamp: Date.now(),
    };

    return NextResponse.json(errorPayload, {
      status: isTimeout ? 504 : 502,
    });
  }
}
