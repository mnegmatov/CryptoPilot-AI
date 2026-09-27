"use client";

import React from "react";
import { Activity, BarChart3, Bot, Compass, Search, ShieldCheck, Terminal, Wallet, Zap } from "lucide-react";
import { MarketContextData } from "@/core/types";

interface HeaderProps {
  activeTab: "terminal" | "backtest" | "paper" | "breakout-paper";
  setActiveTab: (tab: "terminal" | "backtest" | "paper" | "breakout-paper") => void;
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
    <header className="border-b border-[#1E2638] bg-[#0B0E14] sticky top-0 z-40 w-full min-w-0">
      {/* Top Header Row */}
      <div className="h-12 px-3 md:px-4 flex items-center justify-between w-full min-w-0">
        {/* Brand & Market Status */}
        <div className="flex items-center space-x-3 md:space-x-4 min-w-0">
          <div
            className="flex items-center space-x-2 cursor-pointer shrink-0"
            onClick={() => setActiveTab("terminal")}
          >
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

          {/* Live Macro Sentiment Pills (Compact, xl+ only) */}
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

        {/* Desktop Navigation Tabs & Search (>= md screens) */}
        <div className="hidden md:flex items-center space-x-2">
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
              <span>Терминал</span>
            </button>
            <button
              onClick={() => setActiveTab("breakout-paper")}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all ${
                activeTab === "breakout-paper"
                  ? "bg-amber-500 text-slate-950 font-bold shadow-sm"
                  : "text-[#7B849B] hover:text-amber-400 hover:bg-[#1E2638]/50"
              }`}
            >
              <Zap className="h-3.5 w-3.5 shrink-0" />
              <span>Breakout Paper</span>
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
              <span>Model D</span>
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
              <span>Бэктестер</span>
            </button>
          </div>

          {/* ⌘K Search trigger button for desktop */}
          <button
            onClick={onOpenSearch}
            className="flex items-center space-x-1.5 bg-[#141A29] hover:bg-[#1E2638] text-[#7B849B] px-2.5 py-1 rounded-md border border-[#1E2638] text-xs transition-colors"
          >
            <span>Поиск</span>
            <kbd className="px-1.5 py-0.2 text-[9px] bg-[#0B0E14] text-gray-300 rounded border border-[#1E2638]">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Mobile Header Actions (< md screens) */}
        <div className="flex md:hidden items-center space-x-2 shrink-0">
          {/* Mobile Search Button (Min 44px touch target) */}
          <button
            onClick={onOpenSearch}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-[#141A29] text-[#7B849B] hover:text-white border border-[#1E2638] active:scale-95 transition-transform"
            aria-label="Поиск актива"
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Mobile Horizontal Scroll Navigation Bar (< md screens) */}
      <div className="flex md:hidden overflow-x-auto no-scrollbar scroll-smooth items-center gap-2 px-3 py-1.5 bg-[#080B10] border-t border-[#1E2638]/60 w-full min-w-0">
        <button
          onClick={() => setActiveTab("terminal")}
          className={`min-h-[44px] px-3.5 py-2 rounded-lg text-xs font-semibold font-mono flex items-center space-x-2 shrink-0 transition-all active:scale-[0.98] ${
            activeTab === "terminal"
              ? "bg-sky-500 text-white shadow-md shadow-sky-500/25"
              : "bg-[#141A29] text-[#7B849B] hover:text-white border border-[#1E2638]"
          }`}
        >
          <Terminal className="h-4 w-4 shrink-0" />
          <span>Терминал</span>
        </button>

        <button
          onClick={() => setActiveTab("breakout-paper")}
          className={`min-h-[44px] px-3.5 py-2 rounded-lg text-xs font-semibold font-mono flex items-center space-x-2 shrink-0 transition-all active:scale-[0.98] ${
            activeTab === "breakout-paper"
              ? "bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/25"
              : "bg-[#141A29] text-[#7B849B] hover:text-amber-400 border border-[#1E2638]"
          }`}
        >
          <Zap className="h-4 w-4 shrink-0" />
          <span>Breakout Paper</span>
        </button>

        <button
          onClick={() => setActiveTab("paper")}
          className={`min-h-[44px] px-3.5 py-2 rounded-lg text-xs font-semibold font-mono flex items-center space-x-2 shrink-0 transition-all active:scale-[0.98] ${
            activeTab === "paper"
              ? "bg-sky-500 text-white shadow-md shadow-sky-500/25 font-bold"
              : "bg-[#141A29] text-[#7B849B] hover:text-white border border-[#1E2638]"
          }`}
        >
          <Wallet className="h-4 w-4 shrink-0" />
          <span>Model D</span>
        </button>

        <button
          onClick={() => setActiveTab("backtest")}
          className={`min-h-[44px] px-3.5 py-2 rounded-lg text-xs font-semibold font-mono flex items-center space-x-2 shrink-0 transition-all active:scale-[0.98] ${
            activeTab === "backtest"
              ? "bg-sky-500 text-white shadow-md shadow-sky-500/25"
              : "bg-[#141A29] text-[#7B849B] hover:text-white border border-[#1E2638]"
          }`}
        >
          <BarChart3 className="h-4 w-4 shrink-0" />
          <span>Бэктестер</span>
        </button>
      </div>
    </header>
  );
};

