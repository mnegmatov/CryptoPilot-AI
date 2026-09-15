"use client";

import React, { useEffect, useRef } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { ColorType, createChart, IChartApi, ISeriesApi, LineStyle } from "lightweight-charts";
import { Candle, Timeframe, TradingSignal } from "@/core/types";

interface TradingViewChartProps {
  symbol: string;
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  candles: Candle[];
  signal: TradingSignal | null;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export const TradingViewChart: React.FC<TradingViewChartProps> = ({
  symbol,
  timeframe,
  onTimeframeChange,
  candles,
  signal,
  loading,
  error,
  onRetry,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Initialize Lightweight Chart with explicit initial dimensions to avoid 0×0 canvas
    // during Next.js streaming hydration where flex dimensions resolve asynchronously.
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: "#0B0E14" },
        textColor: "#7B849B",
        fontSize: 11,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      },
      grid: {
        vertLines: { color: "#141A29" },
        horzLines: { color: "#141A29" },
      },
      crosshair: {
        vertLine: { color: "#333D56", width: 1, style: LineStyle.Dashed },
        horzLine: { color: "#333D56", width: 1, style: LineStyle.Dashed },
      },
      rightPriceScale: {
        borderColor: "#1E2638",
        scaleMargins: {
          top: 0.1,
          bottom: 0.2,
        },
      },
      timeScale: {
        borderColor: "#1E2638",
        timeVisible: true,
        secondsVisible: false,
      },
    });

    // Candlestick Series
    const candleSeries = chart.addCandlestickSeries({
      upColor: "#10B981",
      downColor: "#F43F5E",
      borderVisible: false,
      wickUpColor: "#10B981",
      wickDownColor: "#F43F5E",
    });

    // Volume Histogram Series
    const volumeSeries = chart.addHistogramSeries({
      color: "#1E2638",
      priceFormat: {
        type: "volume",
      },
      priceScaleId: "", // Overlay on chart
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    // Responsive ResizeObserver handles viewport transitions, mobile switching, and orientation changes
    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries[0] || !chartRef.current) return;
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        chartRef.current.applyOptions({ width, height });
        // Redraw all loaded data at the new canvas dimensions.
        // Required when candle data arrives before the first ResizeObserver callback
        // (race condition during streaming hydration on Vercel production).
        chartRef.current.timeScale().fitContent();
      }
    });

    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, []);

  // Update data when candles change
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || candles.length === 0) return;

    // Convert candles to Lightweight Charts format
    const formattedCandles = candles.map((c) => ({
      time: Math.floor(c.timestamp / 1000) as any,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const formattedVolume = candles.map((c) => ({
      time: Math.floor(c.timestamp / 1000) as any,
      value: c.volume,
      color: c.close >= c.open ? "rgba(16, 185, 129, 0.2)" : "rgba(244, 63, 94, 0.2)",
    }));

    candleSeriesRef.current.setData(formattedCandles);
    volumeSeriesRef.current.setData(formattedVolume);

    // Apply Entry / Stop Loss / TP lines if signal exists
    if (signal && chartRef.current) {
      // Remove old lines if any
      const markers: any[] = [];

      if (signal.stance === "BUY") {
        markers.push({
          time: Math.floor(signal.timestamp / 1000),
          position: "belowBar",
          color: "#38BDF8",
          shape: "arrowUp",
          text: `ВХОД LONG $${signal.entryRange.ideal.toLocaleString()}`,
        });
      } else if (signal.stance === "SHORT") {
        markers.push({
          time: Math.floor(signal.timestamp / 1000),
          position: "aboveBar",
          color: "#F43F5E",
          shape: "arrowDown",
          text: `ВХОД SHORT $${signal.entryRange.ideal.toLocaleString()}`,
        });
      }

      if (markers.length > 0) {
        candleSeriesRef.current.setMarkers(markers);
      }

      // Draw horizontal price lines on candle series
      candleSeriesRef.current.createPriceLine({
        price: signal.entryRange.ideal,
        color: "#38BDF8",
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: "ВХОД",
      });

      candleSeriesRef.current.createPriceLine({
        price: signal.stopLoss,
        color: "#F43F5E",
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: "СТОП-ЛОСС",
      });

      const isModelD = signal.id.includes("model_d");
      signal.takeProfitTargets.forEach((tp) => {
        candleSeriesRef.current?.createPriceLine({
          price: tp.price,
          color: isModelD ? "#38BDF8" : "#10B981",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: isModelD ? `Рубеж +${tp.rewardRisk}R (Milestone)` : `ТП${tp.level} (${tp.rewardRisk}R)`,
        });
      });

      chartRef.current.timeScale().fitContent();
    }
  }, [candles, signal]);

  const timeframes: Timeframe[] = ["15m", "1h", "4h", "1d"];

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0B0E14] lg:border-r border-[#1E2638]">
      {/* Chart Control Bar */}
      <div className="h-12 border-b border-[#1E2638] px-3 sm:px-4 flex items-center justify-between">
        <div className="flex items-center space-x-2 sm:space-x-3">
          <span className="font-bold text-sm text-white">
            {symbol.replace("USDT", "")}/USDT
          </span>
          <span className="hidden sm:inline text-xs text-[#7B849B]">Свечной график</span>

          {/* Timeframe Selector with touch targets */}
          <div className="flex bg-[#141A29] p-0.5 rounded border border-[#1E2638] ml-1 sm:ml-2">
            {timeframes.map((tf) => (
              <button
                key={tf}
                onClick={() => onTimeframeChange(tf)}
                className={`px-2.5 py-1 min-h-[32px] sm:min-h-[28px] text-xs font-mono font-medium rounded transition-colors ${
                  timeframe === tf
                    ? "bg-sky-500 text-white shadow-sm"
                    : "text-[#7B849B] hover:text-white"
                }`}
              >
                {tf.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="hidden sm:flex items-center space-x-3 text-xs font-mono">
          <div className="flex items-center space-x-1">
            <span className="h-2 w-2 rounded-full bg-sky-400" />
            <span className="text-[#7B849B]">Вход</span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            <span className="text-[#7B849B]">Стоп</span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-[#7B849B]">ТП</span>
          </div>
        </div>
      </div>

      {/* Chart Canvas & Overlays */}
      <div className="flex-1 relative w-full h-[calc(100%-3rem)] min-h-[350px]">
        {loading && (
          <div className="absolute inset-0 z-10 bg-[#0B0E14]/60 backdrop-blur-sm flex items-center justify-center">
            <div className="flex items-center space-x-2 text-sky-400 text-xs font-mono">
              <div className="h-3.5 w-3.5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
              <span>Загрузка рыночных свечей...</span>
            </div>
          </div>
        )}

        {error && candles.length === 0 && (
          <div className="absolute inset-0 z-20 bg-[#0B0E14]/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center space-y-3">
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="h-6 w-6 text-amber-400" />
            </div>
            <div className="text-sm font-semibold text-white">Не удалось загрузить свечной график</div>
            <div className="text-xs text-[#7B849B] max-w-sm leading-relaxed">
              {error}
            </div>
            {onRetry && (
              <button
                onClick={onRetry}
                className="mt-2 px-4 py-2 bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors flex items-center space-x-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Повторить загрузку</span>
              </button>
            )}
          </div>
        )}

        <div ref={chartContainerRef} className="w-full h-full" />
      </div>
    </div>
  );
};
