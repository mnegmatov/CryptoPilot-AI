"use client";

import React, { useEffect, useRef } from "react";
import { AlertTriangle, Maximize2, RefreshCw } from "lucide-react";
import { ColorType, createChart, IChartApi, IPriceLine, ISeriesApi, LineStyle } from "lightweight-charts";
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
  onOpenMobileWatchlist?: () => void;
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
  onOpenMobileWatchlist,
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const container = chartContainerRef.current;
    const initialWidth = container.clientWidth || (wrapperRef.current?.clientWidth ?? 600);
    const initialHeight = container.clientHeight || (wrapperRef.current?.clientHeight ?? 400);

    const chart = createChart(container, {
      width: Math.max(initialWidth, 100),
      height: Math.max(initialHeight, 100),
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

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#10B981",
      downColor: "#F43F5E",
      borderVisible: false,
      wickUpColor: "#10B981",
      wickDownColor: "#F43F5E",
    });

    const volumeSeries = chart.addHistogramSeries({
      color: "#1E2638",
      priceFormat: {
        type: "volume",
      },
      priceScaleId: "",
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

    const targetElement = wrapperRef.current || container;
    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries[0] || !chartRef.current) return;
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        chartRef.current.applyOptions({ width, height });
        chartRef.current.timeScale().fitContent();
      }
    });

    resizeObserver.observe(targetElement);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      priceLinesRef.current = [];
    };
  }, []);

  // Update data when candles or signal changes
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

    // CRITICAL: Always fitContent immediately when candles are loaded
    chartRef.current?.timeScale().fitContent();

    // Clean up previous price lines
    if (priceLinesRef.current.length > 0 && candleSeriesRef.current) {
      priceLinesRef.current.forEach((pl) => {
        try {
          candleSeriesRef.current?.removePriceLine(pl);
        } catch (e) {}
      });
      priceLinesRef.current = [];
    }

    // Apply Entry / Stop Loss / TP lines if signal exists
    if (signal && candleSeriesRef.current && chartRef.current) {
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

      candleSeriesRef.current.setMarkers(markers);

      if (signal.entryRange && signal.entryRange.ideal > 0) {
        const entryLine = candleSeriesRef.current.createPriceLine({
          price: signal.entryRange.ideal,
          color: "#38BDF8",
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: "ВХОД",
        });
        priceLinesRef.current.push(entryLine);
      }

      if (signal.stopLoss && signal.stopLoss > 0) {
        const slLine = candleSeriesRef.current.createPriceLine({
          price: signal.stopLoss,
          color: "#F43F5E",
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: "СТОП-ЛОСС",
        });
        priceLinesRef.current.push(slLine);
      }

      const isModelD = signal.id.includes("model_d");
      if (Array.isArray(signal.takeProfitTargets)) {
        signal.takeProfitTargets.forEach((tp) => {
          if (tp.price > 0) {
            const tpLine = candleSeriesRef.current?.createPriceLine({
              price: tp.price,
              color: isModelD ? "#38BDF8" : "#10B981",
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: isModelD ? `Рубеж +${tp.rewardRisk}R (Milestone)` : `ТП${tp.level} (${tp.rewardRisk}R)`,
            });
            if (tpLine) priceLinesRef.current.push(tpLine);
          }
        });
      }

      chartRef.current.timeScale().fitContent();
    }
  }, [candles, signal]);

  const timeframes: Timeframe[] = ["15m", "1h", "4h", "1d"];
  const timeframeHotkeys: Record<Timeframe, string> = {
    "15m": "1",
    "1h": "2",
    "4h": "3",
    "1d": "4",
  };

  const latestCandle = candles.length > 0 ? candles[candles.length - 1] : null;
  const currentPrice = signal?.currentPrice ?? latestCandle?.close ?? null;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0B0E14] lg:border-r border-[#1E2638]">
      {/* Chart Control Bar */}
      <div className="h-12 border-b border-[#1E2638] px-3 sm:px-4 flex items-center justify-between">
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Symbol & Pair Selector */}
          <div className="flex items-center space-x-2">
            <span className="font-bold text-sm text-white tracking-tight">
              {symbol.replace("USDT", "")}
              <span className="text-xs text-[#7B849B] font-normal">/USDT</span>
            </span>
            {onOpenMobileWatchlist && (
              <button
                onClick={onOpenMobileWatchlist}
                className="lg:hidden px-2 py-0.5 rounded bg-[#141A29] border border-[#1E2638] text-[11px] text-[#7B849B] hover:text-white flex items-center space-x-1"
                title="Выбрать другую пару"
              >
                <span>Пары</span>
                <span className="text-[9px]">▼</span>
              </button>
            )}
          </div>

          {/* Live Price Badge */}
          {currentPrice !== null && (
            <div className="hidden sm:flex items-center px-2 py-0.5 rounded bg-[#141A29] border border-[#1E2638] text-xs font-mono font-medium text-white">
              <span className="text-[#7B849B] mr-0.5">$</span>
              <span>
                {currentPrice > 1
                  ? currentPrice.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })
                  : currentPrice.toFixed(4)}
              </span>
            </div>
          )}

          {/* Timeframe Selector with hotkey indicators */}
          <div className="flex bg-[#141A29] p-0.5 rounded border border-[#1E2638] ml-1 sm:ml-2">
            {timeframes.map((tf) => (
              <button
                key={tf}
                onClick={() => onTimeframeChange(tf)}
                title={`Таймфрейм ${tf.toUpperCase()} [${timeframeHotkeys[tf]}]`}
                className={`px-2 sm:px-2.5 py-1 min-h-[32px] sm:min-h-[28px] text-xs font-mono font-medium rounded transition-colors flex items-center space-x-1 ${
                  timeframe === tf
                    ? "bg-sky-500 text-white shadow-sm font-semibold"
                    : "text-[#7B849B] hover:text-white"
                }`}
              >
                <span>{tf.toUpperCase()}</span>
                <span className="hidden xl:inline text-[9px] opacity-60">[{timeframeHotkeys[tf]}]</span>
              </button>
            ))}
          </div>
        </div>

        {/* Legend & Fit Content Trigger */}
        <div className="flex items-center space-x-3 text-xs font-mono">
          <div className="hidden sm:flex items-center space-x-3">
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

          {/* Fit Content Button */}
          <button
            onClick={() => chartRef.current?.timeScale().fitContent()}
            title="Масштабировать график по размеру"
            className="p-1.5 hover:bg-[#141A29] rounded text-[#7B849B] hover:text-white transition-colors border border-transparent hover:border-[#1E2638]"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Chart Canvas & Overlays */}
      <div ref={wrapperRef} className="flex-1 min-h-0 relative w-full h-full overflow-hidden">
        {loading && (
          <div className="absolute inset-0 z-20 bg-[#0B0E14]/60 backdrop-blur-sm flex items-center justify-center">
            <div className="flex items-center space-x-2 text-sky-400 text-xs font-mono">
              <div className="h-3.5 w-3.5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
              <span>Загрузка рыночных свечей...</span>
            </div>
          </div>
        )}

        {error && candles.length === 0 && (
          <div className="absolute inset-0 z-30 bg-[#0B0E14]/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center space-y-3">
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

        <div ref={chartContainerRef} className="absolute inset-0 w-full h-full" />
      </div>
    </div>
  );
};
