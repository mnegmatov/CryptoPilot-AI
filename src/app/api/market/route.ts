import { NextResponse } from "next/server";
import { getMarketContext, getWatchlistOverview } from "@/core/data/market-feed";

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
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch market data" },
      { status: 500 }
    );
  }
}
