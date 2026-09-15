"use client";

import React from "react";
import { Activity, BarChart3, Bot, Compass, ShieldCheck, Terminal, Wallet } from "lucide-react";
import { MarketContextData } from "@/core/types";

interface HeaderProps {
  activeTab: "terminal" | "backtest" | "paper";
  setActiveTab: (tab: "terminal" | "backtest" | "paper") => void;
  context: MarketContextData | null;
  onOpenSearch: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  context,
  onOpenSearch,
}) => {
  return (
    <header className="h-16 border-b border-[#1E2638] bg-[#0B0E14] px-4 md:px-6 flex items-center justify-between sticky top-0 z-40">
      {/* Brand & Market Status */}
      <div className="flex items-center space-x-6">
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab("terminal")}>
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
            <Compass className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold tracking-tight text-white text-base">CryptoPilot</span>
              <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-sky-500/10 text-sky-400 rounded border border-sky-500/20">
                PRO AI
              </span>
            </div>
            <div className="flex items-center space-x-1.5 text-[11px] text-[#7B849B]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Потоки данных в реальном времени (без синтетики)</span>
            </div>
          </div>
        </div>

        {/* Live Macro Sentiment Pills */}
        {context && (
          <div className="hidden lg:flex items-center space-x-3 border-l border-[#1E2638] pl-6 text-xs">
            <div className="flex items-center space-x-2 bg-[#141A29] px-2.5 py-1 rounded border border-[#1E2638]">
              <Activity className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-[#7B849B]">Страх и жадность:</span>
              <span className="font-semibold text-white">
                {context.fearGreedIndex} ({context.fearGreedSentiment})
              </span>
            </div>
            <div className="flex items-center space-x-2 bg-[#141A29] px-2.5 py-1 rounded border border-[#1E2638]">
              <BarChart3 className="h-3.5 w-3.5 text-indigo-400" />
              <span className="text-[#7B849B]">Фандинг:</span>
              <span className="font-mono text-emerald-400">
                {(context.fundingRate * 100).toFixed(4)}%
              </span>
            </div>
            <div className="flex items-center space-x-2 bg-[#141A29] px-2.5 py-1 rounded border border-[#1E2638]">
              <ShieldCheck className="h-3.5 w-3.5 text-sky-400" />
              <span className="text-[#7B849B]">Режим:</span>
              <span className="text-sky-300 font-medium capitalize">
                {context.marketRegime === "TRENDING_BULL"
                  ? "Бычий тренд"
                  : context.marketRegime === "TRENDING_BEAR"
                  ? "Медвежий тренд"
                  : context.marketRegime === "CHOPPY_RANGE"
                  ? "Боковик / Рейндж"
                  : context.marketRegime === "HIGH_VOLATILITY_EXPANSION"
                  ? "Высокая волатильность"
                  : (context.marketRegime as string).replace(/_/g, " ").toLowerCase()}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center space-x-2">
        <div className="flex bg-[#141A29] p-1 rounded-lg border border-[#1E2638]">
          <button
            onClick={() => setActiveTab("terminal")}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === "terminal"
                ? "bg-sky-500 text-white shadow-sm"
                : "text-[#7B849B] hover:text-white hover:bg-[#1E2638]/50"
            }`}
          >
            <Terminal className="h-3.5 w-3.5" />
            <span>Терминал и Сигналы</span>
          </button>
          <button
            onClick={() => setActiveTab("backtest")}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === "backtest"
                ? "bg-sky-500 text-white shadow-sm"
                : "text-[#7B849B] hover:text-white hover:bg-[#1E2638]/50"
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            <span>Бэктестер</span>
          </button>
          <button
            onClick={() => setActiveTab("paper")}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === "paper"
                ? "bg-sky-500 text-white shadow-sm"
                : "text-[#7B849B] hover:text-white hover:bg-[#1E2638]/50"
            }`}
          >
            <Wallet className="h-3.5 w-3.5" />
            <span>Демо-торговля</span>
            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Model D
            </span>
          </button>
        </div>

        {/* ⌘K Search trigger button */}
        <button
          onClick={onOpenSearch}
          className="hidden sm:flex items-center space-x-2 bg-[#141A29] hover:bg-[#1E2638] text-[#7B849B] px-3 py-1.5 rounded-lg border border-[#1E2638] text-xs transition-colors"
        >
          <span>Поиск актива</span>
          <kbd className="px-1.5 py-0.5 text-[10px] bg-[#0B0E14] text-gray-300 rounded border border-[#1E2638]">
            ⌘K
          </kbd>
        </button>
      </div>
    </header>
  );
};
