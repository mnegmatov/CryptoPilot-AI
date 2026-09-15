"use client";

import React from "react";
import { AlertTriangle, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
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
  const handleSelect = (symbol: string) => {
    onSelectSymbol(symbol);
    if (onCloseMobileDrawer) {
      onCloseMobileDrawer();
    }
  };

  return (
    <div className="w-full lg:w-[260px] shrink-0 bg-[#0E131F] lg:border-r border-[#1E2638] flex flex-col h-full lg:h-[calc(100vh-4rem)]">
      <div className="p-3 border-b border-[#1E2638] flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#7B849B]">
          Список наблюдения
        </span>
        <div className="flex items-center space-x-1.5">
          <span className="text-[11px] text-[#7B849B]">Спот Binance</span>
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
      </div>

      {/* Stale Data Amber Notice */}
      {isStale && (
        <div className="px-3 py-2 bg-amber-500/10 border-b border-amber-500/20 text-[11px] text-amber-300 flex items-center justify-between">
          <div className="flex items-center space-x-1.5 truncate">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="truncate">
              {lastUpdated
                ? `Данные от ${new Date(lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
                : "Связь восстанавливается..."}
            </span>
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="text-[10px] font-semibold text-amber-400 hover:text-amber-200 underline ml-2 shrink-0"
            >
              Повторить
            </button>
          )}
        </div>
      )}

      {/* Error state if no assets available */}
      {error && assets.length === 0 ? (
        <div className="flex-1 p-4 flex flex-col items-center justify-center text-center space-y-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
          </div>
          <div className="text-xs font-medium text-white">Котировки временно недоступны</div>
          <div className="text-[11px] text-[#7B849B] max-w-[200px] leading-relaxed">
            {error}
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-1 px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors flex items-center space-x-1.5"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Повторить</span>
            </button>
          )}
        </div>
      ) : (
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
                  onClick={() => handleSelect(asset.symbol)}
                  className={`w-full text-left p-3.5 min-h-[48px] transition-colors flex items-center justify-between group ${
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
                    <div className="text-[11px] text-[#7B849B] truncate max-w-[90px]">
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
      )}
    </div>
  );
};
