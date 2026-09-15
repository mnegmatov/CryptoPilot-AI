import { NextRequest, NextResponse } from "next/server";
import { generateAIExplanation } from "@/core/ai/analyst";
import { getMarketCandles, getMarketContext } from "@/core/data/market-feed";
import { extractTechnicalIndicators } from "@/core/quant/indicators";
import { analyzeMarketStructure } from "@/core/quant/structure";
import { generateTradingSignal } from "@/core/signals/generator";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol") || "BTCUSDT";

  try {
    const [candles1h, candles4h, context] = await Promise.all([
      getMarketCandles(symbol, "1h", 200),
      getMarketCandles(symbol, "4h", 100).catch(() => []),
      getMarketContext(symbol),
    ]);

    const indicators = extractTechnicalIndicators(candles1h);
    const structure = analyzeMarketStructure(candles1h, candles4h.length > 0 ? candles4h : undefined);
    const signal = generateTradingSignal(symbol, indicators, structure, context, {
      enableHtfGate: true,
    });

    // AI synthesis (grounded on deterministic facts)
    const explanation = await generateAIExplanation(signal);
    signal.aiExplanation = explanation;

    return NextResponse.json({
      success: true,
      signal,
    });
  } catch (error: any) {
    console.error(`Error generating signal for ${symbol}:`, error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to generate signal" },
      { status: 500 }
    );
  }
}
