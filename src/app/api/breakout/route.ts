import { NextRequest, NextResponse } from "next/server";
import { BreakoutPaperService } from "@/core/breakout-paper/service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Dedicated API endpoint for Breakout Paper Trading UI dashboard:
 * Fetches account summary, active positions, trade history, live asset telemetry, and snapshots.
 */
export async function GET(request: NextRequest) {
  try {
    const [account, snapshots] = await Promise.all([
      BreakoutPaperService.getAccount(),
      BreakoutPaperService.getSnapshots(60),
    ]);

    return NextResponse.json({
      success: true,
      model: "Breakout V2-AD",
      mode: "PAPER TRADING",
      account,
      snapshots,
    });
  } catch (error: any) {
    console.error("[Breakout API] GET error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load Breakout Paper account" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action || "cycle";

    if (action === "reset") {
      const resetAccount = await BreakoutPaperService.resetAccount();
      return NextResponse.json({
        success: true,
        message: "Breakout Paper Trading account reset to initial $10,000",
        account: resetAccount,
      });
    }

    // Default action: execute a live evaluation cycle now
    const report = await BreakoutPaperService.executeCycle();
    const snapshots = await BreakoutPaperService.getSnapshots(60);

    return NextResponse.json({
      success: true,
      message: "Breakout Paper Trading cycle executed successfully",
      report,
      snapshots,
    });
  } catch (error: any) {
    console.error("[Breakout API] POST error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Action failed" },
      { status: 500 }
    );
  }
}
