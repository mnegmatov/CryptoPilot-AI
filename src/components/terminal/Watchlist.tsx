"use client";

import React from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { WatchlistAsset } from "@/core/data/market-feed";

interface WatchlistProps {
  assets: WatchlistAsset[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  loading: boolean;
}

export const Watchlist: React.FC<WatchlistProps> = ({
  assets,
  selectedSymbol,
  onSelectSymbol,
  loading,
}) => {
  return (
    <div className="w-full md:w-64 bg-[#0E131F] border-r border-[#1E2638] flex flex-col h-[calc(100vh-4rem)]">
      <div className="p-3 border-b border-[#1E2638] flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#7B849B]">
          Список наблюдения
        </span>
        <span className="text-[11px] text-[#7B849B]">Спот Binance</span>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-[#1E2638]/60">
        {loading && assets.length === 0 ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="animate-pulse flex justify-between">
                <div className="h-4 bg-[#1E2638] rounded w-16" />
                <div className="h-4 bg-[#1E2638] rounded w-20" />
              </div>
            ))}
          </div>
        ) : (
          assets.map((asset) => {
            const isSelected = selectedSymbol === asset.symbol;
            const isPositive = asset.change24h >= 0;

            return (
              <button
                key={asset.symbol}
                onClick={() => onSelectSymbol(asset.symbol)}
                className={`w-full text-left p-3 transition-colors flex items-center justify-between group ${
                  isSelected
                    ? "bg-[#141A29] border-l-2 border-sky-500"
                    : "hover:bg-[#141A29]/60"
                }`}
              >
                <div>
                  <div className="flex items-center space-x-1.5">
                    <span className="font-semibold text-xs text-white group-hover:text-sky-300 transition-colors">
                      {asset.symbol.replace("USDT", "")}
                    </span>
                    <span className="text-[10px] text-[#7B849B]">/USDT</span>
                  </div>
                  <div className="text-[11px] text-[#7B849B] truncate max-w-[80px]">
                    {asset.name}
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-mono text-xs text-white font-medium">
                    ${asset.lastPrice > 1 ? asset.lastPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : asset.lastPrice.toFixed(4)}
                  </div>
                  <div
                    className={`flex items-center justify-end text-[11px] font-mono font-medium ${
                      isPositive ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {isPositive ? (
                      <TrendingUp className="h-3 w-3 mr-0.5 inline" />
                    ) : (
                      <TrendingDown className="h-3 w-3 mr-0.5 inline" />
                    )}
                    <span>{isPositive ? "+" : ""}{asset.change24h.toFixed(2)}%</span>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
