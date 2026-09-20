import { NextRequest, NextResponse } from "next/server";
import { PaperTradingService } from "@/core/paper/service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

export async function GET() {
  try {
    const account = await PaperTradingService.getAccount();
    return NextResponse.json(
      {
        success: true,
        account,
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (error: any) {
    console.error("Paper API GET error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch paper trading account" },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action;

    if (action === "OPEN") {
      const { signal, riskPercentage, orderType, trailingStopType, chandelierMultiplier, swingTrailingBars } = body;
      const { position, account } = await PaperTradingService.openPosition(
        signal,
        riskPercentage,
        orderType || "MARKET",
        { trailingStopType, chandelierMultiplier, swingTrailingBars }
      );
      return NextResponse.json(
        { success: true, position, account },
        { headers: NO_CACHE_HEADERS }
      );
    }

    if (action === "CLOSE") {
      const { positionId, currentPrice } = body;
      const { position, account } = await PaperTradingService.closePosition(positionId, currentPrice);
      return NextResponse.json(
        { success: true, position, account },
        { headers: NO_CACHE_HEADERS }
      );
    }

    if (action === "UPDATE_PRICE") {
      const { symbol, price, atr } = body;
      const { closed, account } = await PaperTradingService.updateMarketPrices(symbol, price, atr);
      return NextResponse.json(
        { success: true, closed, account },
        { headers: NO_CACHE_HEADERS }
      );
    }

    if (action === "UPDATE_4H_TRAILING") {
      const { symbol, closedCandles } = body;
      const { updated, account } = await PaperTradingService.updateStructuralTrailingStop(symbol, closedCandles || []);
      return NextResponse.json(
        { success: true, updated, account },
        { headers: NO_CACHE_HEADERS }
      );
    }

    if (action === "RESET") {
      const account = await PaperTradingService.resetAccount(body.initialBalance || 10000);
      return NextResponse.json(
        { success: true, account },
        { headers: NO_CACHE_HEADERS }
      );
    }

    return NextResponse.json(
      { success: false, error: "Unknown action" },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  } catch (error: any) {
    console.error("Paper API POST error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed paper trade operation" },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
