"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { BreakoutSnapshot } from "@/core/breakout-paper/types";

interface BreakoutEquityChartProps {
  snapshots: BreakoutSnapshot[];
  initialBalance?: number;
  currentEquity?: number;
}

export const BreakoutEquityChart: React.FC<BreakoutEquityChartProps> = ({
  snapshots,
  initialBalance = 10000,
  currentEquity,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: 320,
    height: 230,
  });
  const [hoveredPoint, setHoveredPoint] = useState<{
    x: number;
    y: number;
    equity: number;
    timestamp: number;
  } | null>(null);

  // ResizeObserver to handle container width/height dynamically on rotation / resize
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0) {
          setDimensions({
            width: Math.floor(width),
            height: height > 0 ? Math.floor(height) : 230,
          });
        }
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Compute points with padding
  const chartData = useMemo(() => {
    const dataPoints: { timestamp: number; equity: number }[] = [];

    if (snapshots.length === 0) {
      const now = Date.now();
      dataPoints.push({ timestamp: now - 3600000, equity: initialBalance });
      dataPoints.push({ timestamp: now, equity: currentEquity ?? initialBalance });
    } else {
      snapshots.forEach((s) => {
        dataPoints.push({ timestamp: s.timestamp, equity: s.equity });
      });
      if (currentEquity !== undefined && (dataPoints.length === 0 || dataPoints[dataPoints.length - 1].equity !== currentEquity)) {
        dataPoints.push({ timestamp: Date.now(), equity: currentEquity });
      }
    }

    // Sort by timestamp
    dataPoints.sort((a, b) => a.timestamp - b.timestamp);

    let minVal = Math.min(initialBalance, ...dataPoints.map((d) => d.equity));
    let maxVal = Math.max(initialBalance, ...dataPoints.map((d) => d.equity));

    if (minVal === maxVal) {
      minVal -= 10;
      maxVal += 10;
    } else {
      const range = maxVal - minVal;
      minVal -= range * 0.1;
      maxVal += range * 0.1;
    }

    return { dataPoints, minVal, maxVal };
  }, [snapshots, initialBalance, currentEquity]);

  const { dataPoints, minVal, maxVal } = chartData;

  const padLeft = 56;
  const padRight = 16;
  const padTop = 20;
  const padBottom = 26;

  const width = Math.max(dimensions.width, 240);
  const height = Math.max(dimensions.height, 220);

  const innerWidth = width - padLeft - padRight;
  const innerHeight = height - padTop - padBottom;

  const getX = (index: number, total: number) => {
    if (total <= 1) return padLeft + innerWidth / 2;
    return padLeft + (index / (total - 1)) * innerWidth;
  };

  const getY = (val: number) => {
    const ratio = (val - minVal) / (maxVal - minVal);
    return padTop + innerHeight - ratio * innerHeight;
  };

  // Generate SVG path
  const linePoints = dataPoints.map((d, i) => ({
    x: getX(i, dataPoints.length),
    y: getY(d.equity),
    equity: d.equity,
    timestamp: d.timestamp,
  }));

  const pathD = linePoints.reduce(
    (acc, pt, i) => (i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`),
    ""
  );

  const areaD = linePoints.length > 0
    ? `${pathD} L ${linePoints[linePoints.length - 1].x} ${padTop + innerHeight} L ${linePoints[0].x} ${padTop + innerHeight} Z`
    : "";

  const baselineY = getY(initialBalance);
  const latestEquity = dataPoints[dataPoints.length - 1]?.equity ?? initialBalance;
  const isProfitable = latestEquity >= initialBalance;
  const strokeColor = isProfitable ? "#10B981" : "#F43F5E";
  const fillColor = isProfitable ? "url(#equityGreenGradient)" : "url(#equityRedGradient)";

  return (
    <div className="w-full max-w-full bg-[#0B0E14] border border-[#1E2638] rounded-xl p-3 sm:p-4 space-y-2 overflow-hidden">
      {/* Header with Title and Current Value */}
      <div className="flex items-center justify-between flex-wrap gap-2 text-xs font-mono">
        <div className="flex items-center space-x-2">
          {isProfitable ? (
            <TrendingUp className="h-4 w-4 text-emerald-400 shrink-0" />
          ) : (
            <TrendingDown className="h-4 w-4 text-rose-400 shrink-0" />
          )}
          <span className="font-bold text-white uppercase tracking-wider text-xs sm:text-sm">
            Кривая капитала (Equity Curve)
          </span>
          <span className="text-[10px] text-[#7B849B] bg-[#141A29] px-1.5 py-0.5 rounded border border-[#1E2638]">
            {snapshots.length} снэпшотов
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-[#7B849B] text-[11px]">Эквити:</span>
          <span
            className={`font-bold font-mono text-sm sm:text-base ${
              isProfitable ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            ${latestEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* SVG Canvas Container */}
      <div
        ref={containerRef}
        className="w-full h-[220px] sm:h-[260px] relative select-none overflow-hidden touch-pan-y"
      >
        <svg
          width={width}
          height={height}
          className="w-full h-full overflow-visible"
          onMouseLeave={() => setHoveredPoint(null)}
          onTouchEnd={() => setHoveredPoint(null)}
        >
          <defs>
            <linearGradient id="equityGreenGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10B981" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="equityRedGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F43F5E" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#F43F5E" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines and Y-axis tick values */}
          <line
            x1={padLeft}
            y1={padTop}
            x2={width - padRight}
            y2={padTop}
            stroke="#1E2638"
            strokeDasharray="3 3"
          />
          <text
            x={padLeft - 6}
            y={padTop + 4}
            textAnchor="end"
            fontSize="10"
            fontFamily="monospace"
            fill="#7B849B"
          >
            ${maxVal.toFixed(0)}
          </text>

          {/* Baseline $10,000 line */}
          <line
            x1={padLeft}
            y1={baselineY}
            x2={width - padRight}
            y2={baselineY}
            stroke="#38BDF8"
            strokeDasharray="4 4"
            strokeWidth="1"
            opacity="0.6"
          />
          <text
            x={padLeft - 6}
            y={baselineY + 3}
            textAnchor="end"
            fontSize="9"
            fontFamily="monospace"
            fill="#38BDF8"
          >
            $10k
          </text>

          <line
            x1={padLeft}
            y1={padTop + innerHeight}
            x2={width - padRight}
            y2={padTop + innerHeight}
            stroke="#1E2638"
            strokeDasharray="3 3"
          />
          <text
            x={padLeft - 6}
            y={padTop + innerHeight + 4}
            textAnchor="end"
            fontSize="10"
            fontFamily="monospace"
            fill="#7B849B"
          >
            ${minVal.toFixed(0)}
          </text>

          {/* Area fill */}
          {areaD && <path d={areaD} fill={fillColor} />}

          {/* Main Curve Line */}
          {pathD && (
            <path
              d={pathD}
              fill="none"
              stroke={strokeColor}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Data Points */}
          {linePoints.map((pt, idx) => (
            <g key={idx}>
              <circle
                cx={pt.x}
                cy={pt.y}
                r={idx === linePoints.length - 1 ? "4" : "3"}
                fill={strokeColor}
                stroke="#0B0E14"
                strokeWidth="1.5"
                className="cursor-pointer transition-transform hover:scale-125"
                onMouseEnter={() => setHoveredPoint(pt)}
                onTouchStart={() => setHoveredPoint(pt)}
              />
            </g>
          ))}

          {/* Hover indicator vertical line */}
          {hoveredPoint && (
            <line
              x1={hoveredPoint.x}
              y1={padTop}
              x2={hoveredPoint.x}
              y2={padTop + innerHeight}
              stroke="#E2E8F0"
              strokeWidth="1"
              strokeDasharray="2 2"
              opacity="0.5"
            />
          )}
        </svg>

        {/* Hover / Active Tooltip */}
        {hoveredPoint && (
          <div
            className="absolute z-20 pointer-events-none bg-[#141A29] border border-[#1E2638] px-2.5 py-1.5 rounded-lg shadow-lg text-[11px] font-mono text-white"
            style={{
              left: Math.min(Math.max(hoveredPoint.x - 60, 10), width - 130),
              top: Math.max(hoveredPoint.y - 48, 10),
            }}
          >
            <div className="font-bold text-sky-400">
              ${hoveredPoint.equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[9px] text-[#7B849B]">
              {new Date(hoveredPoint.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        )}
      </div>

      {/* Footer Meta / X-Axis Times */}
      <div className="flex items-center justify-between text-[10px] font-mono text-[#7B849B] pt-1 border-t border-[#1E2638]/50">
        <span>Старт: $10,000.00</span>
        <span>Базовый риск: 1.0% на сделку</span>
      </div>
    </div>
  );
};
