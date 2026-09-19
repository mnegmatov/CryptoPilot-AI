"use client";

import React from "react";
import { Activity, BarChart3, Bot, Compass, Search, ShieldCheck, Terminal, Wallet } from "lucide-react";
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
    <header className="h-12 border-b border-[#1E2638] bg-[#0B0E14] px-3 md:px-4 flex items-center justify-between sticky top-0 z-40">
      {/* Brand & Market Status */}
      <div className="flex items-center space-x-3 md:space-x-4">
        <div className="flex items-center space-x-2 cursor-pointer" onClick={() => setActiveTab("terminal")}>
          <div className="h-7 w-7 rounded-md bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-md shadow-sky-500/20 shrink-0">
            <Compass className="h-4 w-4 text-white" />
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="font-bold tracking-tight text-white text-xs md:text-sm">CryptoPilot</span>
            <span className="px-1.5 py-0.2 text-[9px] font-semibold bg-sky-500/10 text-sky-400 rounded border border-sky-500/20">
              PRO
            </span>
          </div>
        </div>

        {/* Live Macro Sentiment Pills (Compact) */}
        {context && (
          <div className="hidden xl:flex items-center space-x-2 border-l border-[#1E2638] pl-3 text-[11px] font-mono">
            <div className="flex items-center space-x-1.5 bg-[#141A29] px-2 py-0.5 rounded border border-[#1E2638]">
              <Activity className="h-3 w-3 text-amber-400" />
              <span className="text-[#7B849B]">F&G:</span>
              <span className="font-semibold text-white">
                {context.fearGreedIndex !== null
                  ? `${context.fearGreedIndex} (${context.fearGreedSentiment || "—"})`
                  : "—"}
              </span>
            </div>
            <div className="flex items-center space-x-1.5 bg-[#141A29] px-2 py-0.5 rounded border border-[#1E2638]">
              <BarChart3 className="h-3 w-3 text-indigo-400" />
              <span className="text-[#7B849B]">Funding:</span>
              <span className="font-semibold text-emerald-400">
                {context.fundingRate !== null
                  ? `${(context.fundingRate * 100).toFixed(4)}%`
                  : "—"}
              </span>
            </div>
            <div className="flex items-center space-x-1.5 bg-[#141A29] px-2 py-0.5 rounded border border-[#1E2638]">
              <ShieldCheck className="h-3 w-3 text-sky-400" />
              <span className="text-[#7B849B]">Режим:</span>
              <span className="text-sky-300 font-medium">
                {context.marketRegime === "TRENDING_BULL"
                  ? "Бычий"
                  : context.marketRegime === "TRENDING_BEAR"
                  ? "Медвежий"
                  : context.marketRegime === "CHOPPY_RANGE"
                  ? "Боковик"
                  : context.marketRegime === "HIGH_VOLATILITY_EXPANSION"
                  ? "Волатильность"
                  : (context.marketRegime as string).replace(/_/g, " ").toLowerCase()}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Tabs & Search */}
      <div className="flex items-center space-x-2">
        <div className="flex bg-[#141A29] p-0.5 rounded-md border border-[#1E2638]">
          <button
            onClick={() => setActiveTab("terminal")}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all ${
              activeTab === "terminal"
                ? "bg-sky-500 text-white shadow-sm"
                : "text-[#7B849B] hover:text-white hover:bg-[#1E2638]/50"
            }`}
          >
            <Terminal className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">Терминал</span>
          </button>
          <button
            onClick={() => setActiveTab("backtest")}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all ${
              activeTab === "backtest"
                ? "bg-sky-500 text-white shadow-sm"
                : "text-[#7B849B] hover:text-white hover:bg-[#1E2638]/50"
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">Бэктестер</span>
          </button>
          <button
            onClick={() => setActiveTab("paper")}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all ${
              activeTab === "paper"
                ? "bg-sky-500 text-white shadow-sm"
                : "text-[#7B849B] hover:text-white hover:bg-[#1E2638]/50"
            }`}
          >
            <Wallet className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">Демо</span>
          </button>
        </div>

        {/* ⌘K Search trigger button */}
        <button
          onClick={onOpenSearch}
          className="hidden sm:flex items-center space-x-1.5 bg-[#141A29] hover:bg-[#1E2638] text-[#7B849B] px-2.5 py-1 rounded-md border border-[#1E2638] text-xs transition-colors"
        >
          <span>Поиск</span>
          <kbd className="px-1.5 py-0.2 text-[9px] bg-[#0B0E14] text-gray-300 rounded border border-[#1E2638]">
            ⌘K
          </kbd>
        </button>

        {/* Mobile Search Button */}
        <button
          onClick={onOpenSearch}
          className="sm:hidden flex items-center justify-center p-1.5 rounded-md bg-[#141A29] text-[#7B849B] hover:text-white border border-[#1E2638]"
          aria-label="Поиск актива"
        >
          <Search className="h-3.5 w-3.5" />
        </button>
      </div>
    </header>
  );
};
