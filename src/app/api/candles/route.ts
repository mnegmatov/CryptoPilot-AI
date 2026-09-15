import { NextRequest, NextResponse } from "next/server";
import { getMarketCandles } from "@/core/data/market-feed";
import { Timeframe } from "@/core/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol") || "BTCUSDT";
  const timeframe = (searchParams.get("timeframe") as Timeframe) || "1h";
  const limit = parseInt(searchParams.get("limit") || "150", 10);

  try {
    const candles = await getMarketCandles(symbol, timeframe, limit);
    return NextResponse.json({
      success: true,
      symbol,
      timeframe,
      candles,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch candles" },
      { status: 500 }
    );
  }
}
