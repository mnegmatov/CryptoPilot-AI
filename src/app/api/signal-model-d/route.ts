import { NextRequest, NextResponse } from "next/server";
import { getMarketCandles, getMarketContext } from "@/core/data/market-feed";
import { PaperTradingService } from "@/core/paper/service";
import { ApiErrorResponse } from "@/core/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol") || "BTCUSDT";
  const autoTrade = searchParams.get("autoTrade") !== "false";

  try {
    const [candles4h, context] = await Promise.all([
      getMarketCandles(symbol, "4h", 220),
      getMarketContext(symbol),
    ]);

    if (candles4h.length < 50) {
      const errorPayload: ApiErrorResponse = {
        success: false,
        error: "Insufficient 4H candles from Binance (minimum 50 required)",
        code: "UPSTREAM_UNAVAILABLE",
        timestamp: Date.now(),
      };
      return NextResponse.json(errorPayload, { status: 502, headers: NO_CACHE_HEADERS });
    }

    // Run complete Model D automated lifecycle with persistent Upstash/Redis locking:
    const cycleResult = await PaperTradingService.executeModelDAutoCycle(
      symbol,
      candles4h,
      context,
      autoTrade
    );
    const { signal, telemetry, trailingUpdated, closedPositions, openedPosition, activePosition, skippedDuplicateCandle } =
      cycleResult;

    // Deterministic narrative (No hallucinated facts)
    signal.aiExplanation = {
      thesis: telemetry.trend4h === "BULLISH"
        ? `Model D 4H: Восходящая структура. Цена $${telemetry.currentPrice.toLocaleString()} выше EMA200 ($${telemetry.ema200.toLocaleString()}) и EMA20 > EMA50.`
        : telemetry.trend4h === "BEARISH"
        ? `Model D 4H: Нисходящая структура. Цена $${telemetry.currentPrice.toLocaleString()} ниже EMA200 ($${telemetry.ema200.toLocaleString()}) и EMA20 < EMA50.`
        : `Model D 4H: Рынок в боковике/консолидации относительно 4H EMA200/50/20. Ожидание направленного тренда.`,
      whySetupExists: signal.stance === "BUY"
        ? `Зафиксирован откат к 4H EMA20 ($${telemetry.ema20.toLocaleString()}) с удержанием уровня и закрытием выше EMA20.`
        : signal.stance === "SHORT"
        ? `Зафиксирован откат вверх к 4H EMA20 ($${telemetry.ema20.toLocaleString()}) с отскоком вниз и закрытием ниже EMA20.`
        : `Условия входа (pullback-bounce к EMA20) пока не сформированы. Текущий статус: ожидание.`,
      marketContextSummary: `4H EMA20: $${telemetry.ema20.toLocaleString()} | EMA50: $${telemetry.ema50.toLocaleString()} | EMA200: $${telemetry.ema200.toLocaleString()} | ATR14: $${telemetry.atr14.toLocaleString()} | Трейлинг Long: $${telemetry.swingTrailingLevelLong.toLocaleString()}`,
      invalidationDetail: signal.invalidationConditions.join(". "),
      executionPlan: `Вход по рынку или лимитом. Стоп: 2.5×ATR14 ($${signal.stopLoss.toLocaleString()}). Сопровождение: 5-свечной свинговый минимум без фиксированного тейка.`,
    };

    return NextResponse.json(
      {
        success: true,
        signal,
        telemetry,
        autoExecution: {
          trailingUpdated,
          closedPositions,
          openedPosition,
          activePosition,
          skippedDuplicateCandle,
        },
        timestamp: Date.now(),
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (error: any) {
    console.error(`Error generating Model D signal for ${symbol}:`, error);
    const isTimeout = error.message?.toLowerCase().includes("timeout");
    const errorPayload: ApiErrorResponse = {
      success: false,
      error: error.message || "Failed to generate Model D signal",
      code: isTimeout ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNAVAILABLE",
      timestamp: Date.now(),
    };

    return NextResponse.json(errorPayload, {
      status: isTimeout ? 504 : 502,
      headers: NO_CACHE_HEADERS,
    });
  }
}
