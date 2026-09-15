import { NextRequest, NextResponse } from "next/server";
import { globalPaperWallet } from "@/core/paper/wallet";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    success: true,
    account: globalPaperWallet.getAccount(),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action;

    if (action === "OPEN") {
      const { signal, riskPercentage, orderType, trailingStopType, chandelierMultiplier } = body;
      const position = globalPaperWallet.openPositionFromSignal(
        signal,
        riskPercentage,
        orderType || "MARKET",
        { trailingStopType, chandelierMultiplier }
      );
      return NextResponse.json({ success: true, position, account: globalPaperWallet.getAccount() });
    }

    if (action === "CLOSE") {
      const { positionId, currentPrice } = body;
      const position = globalPaperWallet.closePosition(positionId, currentPrice);
      return NextResponse.json({ success: true, position, account: globalPaperWallet.getAccount() });
    }

    if (action === "UPDATE_PRICE") {
      const { symbol, price, atr } = body;
      const closed = globalPaperWallet.updateMarketPrices(symbol, price, atr);
      return NextResponse.json({ success: true, closed, account: globalPaperWallet.getAccount() });
    }

    if (action === "UPDATE_4H_TRAILING") {
      const { symbol, closedCandles } = body;
      const updated = globalPaperWallet.updateStructuralTrailingStop(symbol, closedCandles || []);
      return NextResponse.json({ success: true, updated, account: globalPaperWallet.getAccount() });
    }

    if (action === "RESET") {
      globalPaperWallet.resetAccount(body.initialBalance || 10000);
      return NextResponse.json({ success: true, account: globalPaperWallet.getAccount() });
    }

    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed paper trade operation" },
      { status: 500 }
    );
  }
}
