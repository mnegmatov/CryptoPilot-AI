"use client";

import React, { useEffect, useRef } from "react";
import { ColorType, createChart, IChartApi, ISeriesApi, LineStyle } from "lightweight-charts";
import { Candle, Timeframe, TradingSignal } from "@/core/types";

interface TradingViewChartProps {
  symbol: string;
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  candles: Candle[];
  signal: TradingSignal | null;
  loading: boolean;
}

export const TradingViewChart: React.FC<TradingViewChartProps> = ({
  symbol,
  timeframe,
  onTimeframeChange,
  candles,
  signal,
  loading,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Initialize Lightweight Chart
    const chart = createChart(chartContainerRef.current, {
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

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
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
      color: c.close >= c.open ? "rgba(16, 185, 129, 0.25)" : "rgba(244, 63, 94, 0.25)",
    }));

    candleSeriesRef.current.setData(formattedCandles);
    volumeSeriesRef.current.setData(formattedVolume);

    // Overlay Signal Price Lines (Entry, Stop Loss, TP1, TP2)
    if (signal) {
      // Clear previous price lines if possible by recreating or resetting series markers
      try {
        candleSeriesRef.current.createPriceLine({
          price: signal.entryRange.ideal,
          color: "#38BDF8",
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: "ВХОД",
        });

        candleSeriesRef.current.createPriceLine({
          price: signal.stopLoss,
          color: "#F43F5E",
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `СТОП (${signal.stopLossPercentage}%)`,
        });

        if (signal.takeProfitTargets[0]) {
          candleSeriesRef.current.createPriceLine({
            price: signal.takeProfitTargets[0].price,
            color: "#10B981",
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: `ТП1 (${signal.takeProfitTargets[0].rewardRisk}R)`,
          });
        }

        if (signal.takeProfitTargets[1]) {
          candleSeriesRef.current.createPriceLine({
            price: signal.takeProfitTargets[1].price,
            color: "#10B981",
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: true,
            title: `ТП2 (${signal.takeProfitTargets[1].rewardRisk}R)`,
          });
        }
      } catch (err) {
        // Handle price line updates
      }
    }

    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, [candles, signal]);

  const timeframes: Timeframe[] = ["15m", "1h", "4h", "1d"];

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0B0E14] border-r border-[#1E2638]">
      {/* Chart Control Bar */}
      <div className="h-12 border-b border-[#1E2638] px-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <span className="font-bold text-sm text-white">
            {symbol.replace("USDT", "")}/USDT
          </span>
          <span className="text-xs text-[#7B849B]">Свечной график 60fps</span>

          {/* Timeframe Selector */}
          <div className="flex bg-[#141A29] p-0.5 rounded border border-[#1E2638] ml-2">
            {timeframes.map((tf) => (
              <button
                key={tf}
                onClick={() => onTimeframeChange(tf)}
                className={`px-2.5 py-1 text-xs font-mono font-medium rounded transition-colors ${
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
        <div className="hidden sm:flex items-center space-x-4 text-xs font-mono">
          <div className="flex items-center space-x-1.5">
            <span className="h-2 w-2 rounded-full bg-sky-400" />
            <span className="text-[#7B849B]">Вход</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            <span className="text-[#7B849B]">Стоп-лосс</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-[#7B849B]">Тейк-профит</span>
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="flex-1 relative w-full h-[calc(100%-3rem)] min-h-[350px]">
        {loading && (
          <div className="absolute inset-0 z-10 bg-[#0B0E14]/60 backdrop-blur-sm flex items-center justify-center">
            <div className="flex items-center space-x-2 text-sky-400 text-xs font-mono">
              <div className="h-3 w-3 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
              <span>Загрузка рыночных данных...</span>
            </div>
          </div>
        )}
        <div ref={chartContainerRef} className="w-full h-full" />
      </div>
    </div>
  );
};
