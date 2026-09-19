"use client";

import React, { useState } from "react";
import { AlertTriangle, RefreshCw, Search, TrendingDown, TrendingUp } from "lucide-react";
import { WatchlistAsset } from "@/core/data/market-feed";

interface WatchlistProps {
  assets: WatchlistAsset[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  loading: boolean;
  error?: string | null;
  isStale?: boolean;
  lastUpdated?: number | null;
  onRetry?: () => void;
  onCloseMobileDrawer?: () => void;
}

export const Watchlist: React.FC<WatchlistProps> = ({
  assets,
  selectedSymbol,
  onSelectSymbol,
  loading,
  error,
  isStale,
  lastUpdated,
  onRetry,
  onCloseMobileDrawer,
}) => {
  const [searchQuery, setSearchQuery] = useState("");

  const handleSelect = (symbol: string) => {
    onSelectSymbol(symbol);
    if (onCloseMobileDrawer) {
      onCloseMobileDrawer();
    }
  };

  const filteredAssets = assets.filter((asset) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      asset.symbol.toLowerCase().includes(q) ||
      asset.name.toLowerCase().includes(q)
    );
  });

  return (
    <div className="w-full lg:w-[210px] shrink-0 bg-[#0E131F] lg:border-r border-[#1E2638] flex flex-col h-full overflow-hidden">
      {/* Header & Refresh */}
      <div className="px-2.5 py-2 border-b border-[#1E2638] flex items-center justify-between bg-[#0E131F] shrink-0">
        <div className="flex items-center space-x-1.5">
          <span className="text-xs font-bold text-white tracking-tight">
            Рынки
          </span>
          <span className="text-[9px] font-mono text-[#7B849B] bg-[#141A29] px-1.5 py-0.2 rounded border border-[#1E2638]">
            {filteredAssets.length}
          </span>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            disabled={loading}
            title="Обновить котировки"
            className="p-1 hover:bg-[#1E2638] rounded text-[#7B849B] hover:text-white transition-colors"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin text-sky-400" : ""}`} />
          </button>
        )}
      </div>

      {/* Quick Search Filter */}
      <div className="p-1.5 border-b border-[#1E2638] bg-[#0A0E17] shrink-0">
        <div className="relative flex items-center">
          <Search className="h-3 w-3 text-[#7B849B] absolute left-2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск пары..."
            className="w-full bg-[#141A29] border border-[#1E2638] rounded pl-6 pr-2 py-1 text-[11px] font-mono text-white placeholder-[#7B849B] focus:outline-none focus:border-sky-500 transition-colors"
          />
        </div>
      </div>

      {/* Stale Data Amber Notice */}
      {isStale && (
        <div className="px-2 py-1 bg-amber-500/10 border-b border-amber-500/20 text-[10px] text-amber-300 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-1 truncate">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
            <span className="truncate">
              {lastUpdated
                ? `${new Date(lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : "Связь..."}
            </span>
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="text-[10px] font-semibold text-amber-400 hover:text-amber-200 underline shrink-0 ml-1"
            >
              Обновить
            </button>
          )}
        </div>
      )}

      {/* Error state */}
      {error && assets.length === 0 ? (
        <div className="flex-1 p-3 flex flex-col items-center justify-center text-center space-y-2">
          <AlertTriangle className="h-5 w-5 text-amber-400" />
          <div className="text-[11px] font-medium text-white">Котировки недоступны</div>
          <div className="text-[10px] text-[#7B849B] max-w-[160px] leading-relaxed">
            {error}
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-1 px-2.5 py-1 bg-sky-500 hover:bg-sky-400 text-white text-[11px] font-semibold rounded shadow-sm transition-colors flex items-center space-x-1"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Повторить</span>
            </button>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto divide-y divide-[#1E2638]/40">
          {loading && assets.length === 0 ? (
            <div className="p-2.5 space-y-2">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="animate-pulse flex justify-between py-1">
                  <div className="h-3.5 bg-[#1E2638] rounded w-12" />
                  <div className="h-3.5 bg-[#1E2638] rounded w-16" />
                </div>
              ))}
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="p-4 text-center text-xs text-[#7B849B]">
              Пара не найдена
            </div>
          ) : (
            filteredAssets.map((asset) => {
              const isSelected = selectedSymbol === asset.symbol;
              const isPositive = asset.change24h >= 0;

              return (
                <button
                  key={asset.symbol}
                  onClick={() => handleSelect(asset.symbol)}
                  className={`w-full text-left px-2.5 py-2 min-h-[36px] transition-all flex items-center justify-between group ${
                    isSelected
                      ? "bg-[#162032] border-l-2 border-sky-400 text-white"
                      : "hover:bg-[#141A29]/70 text-[#CBD5E1]"
                  }`}
                >
                  <div className="flex items-baseline space-x-1">
                    <span className={`font-mono text-xs font-bold ${isSelected ? "text-sky-300" : "text-white group-hover:text-sky-300"}`}>
                      {asset.symbol.replace("USDT", "")}
                    </span>
                    <span className="text-[9px] text-[#7B849B] font-mono">/USDT</span>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-mono text-xs font-medium text-white">
                      ${asset.lastPrice > 1
                        ? asset.lastPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : asset.lastPrice.toFixed(4)}
                    </div>
                    <div
                      className={`flex items-center justify-end text-[10px] font-mono font-medium ${
                        isPositive ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {isPositive ? (
                        <TrendingUp className="h-2.5 w-2.5 mr-0.5 inline" />
                      ) : (
                        <TrendingDown className="h-2.5 w-2.5 mr-0.5 inline" />
                      )}
                      <span>{isPositive ? "+" : ""}{asset.change24h.toFixed(2)}%</span>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
