"use client";

import React, { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  Compass,
  DollarSign,
  History,
  Layers,
  Play,
  RotateCcw,
  Shield,
  TrendingDown,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  BreakoutAccount,
  BreakoutAssetState,
  BreakoutClosedTrade,
  BreakoutPosition,
  BreakoutSnapshot,
  BreakoutTelemetry,
} from "@/core/breakout-paper/types";
import { BreakoutEquityChart } from "./BreakoutEquityChart";

export const BreakoutPaperView: React.FC = () => {
  const [account, setAccount] = useState<BreakoutAccount | null>(null);
  const [snapshots, setSnapshots] = useState<BreakoutSnapshot[]>([]);
  const [telemetries, setTelemetries] = useState<Record<string, BreakoutTelemetry>>({});
  const [loading, setLoading] = useState(true);
  const [triggeringCycle, setTriggeringCycle] = useState(false);
  const [resetting, setResetting] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/breakout", {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      const data = await res.json();
      if (data.success && data.account) {
        setAccount(data.account);
        if (Array.isArray(data.snapshots)) {
          setSnapshots(data.snapshots);
        }
      }
    } catch (err) {
      console.error("Failed to fetch Breakout Paper state:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRunCycle = async () => {
    setTriggeringCycle(true);
    try {
      const res = await fetch("/api/breakout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cycle" }),
      });
      const data = await res.json();
      if (data.success && data.report) {
        setAccount(data.report.account);
        setTelemetries(data.report.telemetries);
        if (data.snapshots) setSnapshots(data.snapshots);

        if (data.report.openedPositionsThisCycle?.length > 0) {
          data.report.openedPositionsThisCycle.forEach((p: BreakoutPosition) => {
            toast.success(
              `Breakout Вход: ${p.asset} ${p.direction} по $${p.entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })} (Стоп: $${p.stopPrice.toFixed(2)})`
            );
          });
        }

        if (data.report.closedTradesThisCycle?.length > 0) {
          data.report.closedTradesThisCycle.forEach((t: BreakoutClosedTrade) => {
            const pnlFormatted = `${t.netPnl >= 0 ? "+" : ""}$${t.netPnl.toFixed(2)} (${t.rMultiple >= 0 ? "+" : ""}${t.rMultiple.toFixed(2)}R)`;
            toast.info(`Breakout Выход (${t.exitReason}): ${t.asset} PnL: ${pnlFormatted}`);
          });
        }

        toast.success("Цикл Breakout V2-AD успешно выполнен на реальных данных Binance!");
      } else {
        toast.error(data.error || "Ошибка выполнения цикла");
      }
    } catch (err: any) {
      toast.error(err.message || "Ошибка подключения к Breakout API");
    } finally {
      setTriggeringCycle(false);
    }
  };

  const handleResetAccount = async () => {
    if (!window.confirm("Сбросить демо-счёт Breakout до исходных $10,000 и очистить позиции?")) {
      return;
    }
    setResetting(true);
    try {
      const res = await fetch("/api/breakout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      const data = await res.json();
      if (data.success && data.account) {
        setAccount(data.account);
        setTelemetries({});
        toast.success("Демо-счёт Breakout V2-AD сброшен до $10,000");
      } else {
        toast.error(data.error || "Ошибка сброса");
      }
    } catch (err: any) {
      toast.error(err.message || "Ошибка сброса");
    } finally {
      setResetting(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Auto-poll every 6 seconds to keep live metrics updated
    const interval = setInterval(fetchStatus, 6000);
    return () => clearInterval(interval);
  }, []);

  const totalReturnDollar = account ? account.equity - account.initialBalance : 0;
  const totalReturnPercent = account ? (totalReturnDollar / account.initialBalance) * 100 : 0;

  const getStateBadge = (state?: BreakoutAssetState) => {
    switch (state) {
      case "BREAKOUT DETECTED":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            ПРОБОЙ
          </span>
        );
      case "POSITION OPEN":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            В ПОЗИЦИИ
          </span>
        );
      case "EXIT":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
            ВЫХОД
          </span>
        );
      case "WAIT":
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#1E2638] text-[#7B849B] border border-[#2D3748]">
            ОЖИДАНИЕ
          </span>
        );
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#07090E] p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6 w-full max-w-full min-w-0">
      {/* ========================================================================= */}
      {/* 1. TOP BANNER / SYSTEM CONTROLS (HEADER) */}
      {/* ========================================================================= */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 bg-[#0B0E14] border border-[#1E2638] p-3.5 sm:p-4 rounded-xl shadow-lg w-full max-w-full min-w-0">
        <div className="flex items-start sm:items-center space-x-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-amber-500 to-indigo-600 flex items-center justify-center shadow-md shadow-amber-500/20 shrink-0 mt-0.5 sm:mt-0">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">
                Breakout Paper Trading
              </h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                Model: Breakout V2-AD
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20 shrink-0">
                PAPER
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-[#7B849B] mt-0.5 font-mono leading-relaxed">
              4H • BTC, ETH, SOL • Вход: T+1 OPEN • Stop: 2×ATR • Vol Ratio ≥ 1.2 • Кулдаун: 5 св.
            </p>
          </div>
        </div>

        {/* Action Buttons: Responsive full-width on mobile, compact on desktop */}
        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto shrink-0 pt-1 sm:pt-0">
          <button
            onClick={handleRunCycle}
            disabled={triggeringCycle}
            className="min-h-[44px] px-3.5 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all shadow-md shadow-amber-500/20 disabled:opacity-50 flex items-center justify-center space-x-2 active:scale-95"
          >
            <Play className={`h-4 w-4 shrink-0 ${triggeringCycle ? "animate-spin" : ""}`} />
            <span>{triggeringCycle ? "Выполнение..." : "Запустить цикл live"}</span>
          </button>
          <button
            onClick={handleResetAccount}
            disabled={resetting}
            className="min-h-[44px] px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#141A29] hover:bg-[#1E2638] text-[#7B849B] hover:text-white border border-[#1E2638] transition-all disabled:opacity-50 flex items-center justify-center space-x-2 active:scale-95"
          >
            <RotateCcw className="h-4 w-4 shrink-0" />
            <span>Сброс</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. ACCOUNT OVERVIEW (Mobile 2-Column Grid / Desktop Full Grid) */}
      {/* ========================================================================= */}
      <div className="space-y-2.5 sm:space-y-3">
        {/* Primary 4-Card 2x2 Grid (Mobile) / 4-Col (Desktop) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3">
          {/* 1. Equity */}
          <div className="bg-[#0B0E14] border border-[#1E2638] p-3 sm:p-3.5 rounded-xl flex flex-col justify-between min-h-[96px]">
            <div className="flex items-center justify-between text-[#7B849B] text-xs font-mono">
              <span className="truncate">Эквити (Equity)</span>
              <Wallet className="h-3.5 w-3.5 text-sky-400 shrink-0 ml-1" />
            </div>
            <div className="text-base sm:text-lg md:text-xl font-bold font-mono text-white truncate my-1">
              ${account ? account.equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "10,000.00"}
            </div>
            <div className={`text-[11px] font-mono truncate ${totalReturnPercent >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {totalReturnPercent >= 0 ? "+" : ""}{totalReturnPercent.toFixed(2)}% ({totalReturnDollar >= 0 ? "+" : ""}${totalReturnDollar.toFixed(2)})
            </div>
          </div>

          {/* 2. Cash */}
          <div className="bg-[#0B0E14] border border-[#1E2638] p-3 sm:p-3.5 rounded-xl flex flex-col justify-between min-h-[96px]">
            <div className="flex items-center justify-between text-[#7B849B] text-xs font-mono">
              <span className="truncate">Доступный кэш</span>
              <DollarSign className="h-3.5 w-3.5 text-emerald-400 shrink-0 ml-1" />
            </div>
            <div className="text-base sm:text-lg md:text-xl font-bold font-mono text-white truncate my-1">
              ${account ? account.cash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "10,000.00"}
            </div>
            <div className="text-[11px] font-mono text-[#7B849B] truncate">
              Депозит: $10,000.00
            </div>
          </div>

          {/* 3. Realized PnL */}
          <div className="bg-[#0B0E14] border border-[#1E2638] p-3 sm:p-3.5 rounded-xl flex flex-col justify-between min-h-[96px]">
            <div className="flex items-center justify-between text-[#7B849B] text-xs font-mono">
              <span className="truncate">Реализованный PnL</span>
              <Activity className="h-3.5 w-3.5 text-emerald-400 shrink-0 ml-1" />
            </div>
            <div className={`text-base sm:text-lg md:text-xl font-bold font-mono truncate my-1 ${account && account.realizedPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {account && account.realizedPnl >= 0 ? "+" : ""}${account ? account.realizedPnl.toFixed(2) : "0.00"}
            </div>
            <div className="text-[11px] font-mono text-[#7B849B] truncate">
              Комиссии: ${account ? account.fees.toFixed(2) : "0.00"}
            </div>
          </div>

          {/* 4. Unrealized PnL */}
          <div className="bg-[#0B0E14] border border-[#1E2638] p-3 sm:p-3.5 rounded-xl flex flex-col justify-between min-h-[96px]">
            <div className="flex items-center justify-between text-[#7B849B] text-xs font-mono">
              <span className="truncate">Нереализованный PnL</span>
              <Activity className="h-3.5 w-3.5 text-amber-400 shrink-0 ml-1" />
            </div>
            <div className={`text-base sm:text-lg md:text-xl font-bold font-mono truncate my-1 ${account && account.unrealizedPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {account && account.unrealizedPnl >= 0 ? "+" : ""}${account ? account.unrealizedPnl.toFixed(2) : "0.00"}
            </div>
            <div className="text-[11px] font-mono text-[#7B849B] truncate">
              Позиций: {account ? account.positions.length : 0}
            </div>
          </div>
        </div>

        {/* Secondary Metrics Row: 3 columns on mobile & desktop */}
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
          {/* Current / Max Drawdown */}
          <div className="bg-[#0B0E14] border border-[#1E2638] p-2.5 sm:p-3 rounded-xl flex flex-col justify-between min-h-[76px]">
            <div className="flex items-center justify-between text-[#7B849B] text-[11px] font-mono">
              <span className="truncate">Просадка</span>
              <TrendingDown className="h-3 w-3 text-rose-400 shrink-0" />
            </div>
            <div className="text-sm sm:text-base font-bold font-mono text-rose-400 truncate my-0.5">
              {account ? account.stats.currentDrawdown.toFixed(2) : "0.00"}%
            </div>
            <div className="text-[10px] font-mono text-[#7B849B] truncate">
              Макс: {account ? account.stats.maxDrawdown.toFixed(2) : "0.00"}%
            </div>
          </div>

          {/* Win Rate / Profit Factor */}
          <div className="bg-[#0B0E14] border border-[#1E2638] p-2.5 sm:p-3 rounded-xl flex flex-col justify-between min-h-[76px]">
            <div className="flex items-center justify-between text-[#7B849B] text-[11px] font-mono">
              <span className="truncate">Винрейт / PF</span>
              <TrendingUp className="h-3 w-3 text-indigo-400 shrink-0" />
            </div>
            <div className="text-sm sm:text-base font-bold font-mono text-white truncate my-0.5">
              {account ? account.stats.winRate.toFixed(1) : "0.0"}%
            </div>
            <div className="text-[10px] font-mono text-[#7B849B] truncate">
              PF: {account ? account.stats.profitFactor.toFixed(2) : "0.00"}
            </div>
          </div>

          {/* Total Trades & Streak */}
          <div className="bg-[#0B0E14] border border-[#1E2638] p-2.5 sm:p-3 rounded-xl flex flex-col justify-between min-h-[76px]">
            <div className="flex items-center justify-between text-[#7B849B] text-[11px] font-mono">
              <span className="truncate">Всего сделок</span>
              <History className="h-3 w-3 text-purple-400 shrink-0" />
            </div>
            <div className="text-sm sm:text-base font-bold font-mono text-white truncate my-0.5">
              {account ? account.stats.totalTrades : 0}
            </div>
            <div className="text-[10px] font-mono text-[#7B849B] truncate">
              W: {account ? account.stats.winningTrades : 0} • L: {account ? account.stats.losingTrades : 0}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. OPEN POSITIONS (Mobile Cards / Desktop Table) */}
      {/* ========================================================================= */}
      <div className="bg-[#0B0E14] border border-[#1E2638] rounded-xl p-3.5 sm:p-4 space-y-3 w-full max-w-full min-w-0">
        <div className="flex items-center justify-between">
          <h2 className="text-xs sm:text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center space-x-2">
            <Layers className="h-4 w-4 text-sky-400 shrink-0" />
            <span>Открытые позиции ({account?.positions.length || 0})</span>
          </h2>
          {account && account.positions.length > 0 && (
            <span className="text-[11px] font-mono text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              В РЫНКЕ
            </span>
          )}
        </div>

        {account && account.positions.length > 0 ? (
          <>
            {/* Mobile Cards View (< md screens) */}
            <div className="md:hidden space-y-3">
              {account.positions.map((pos) => {
                const isProfit = pos.unrealizedPnl >= 0;
                return (
                  <div
                    key={pos.id}
                    className="bg-[#141A29]/90 border border-[#1E2638] rounded-xl p-3.5 space-y-3 shadow-md"
                  >
                    {/* Card Top: Asset, Direction, Live PnL */}
                    <div className="flex items-center justify-between border-b border-[#1E2638] pb-2.5">
                      <div className="flex items-center space-x-2">
                        <span className="text-base font-bold text-white font-mono">{pos.asset}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-bold font-mono ${
                            pos.direction === "LONG"
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                              : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                          }`}
                        >
                          {pos.direction}
                        </span>
                      </div>
                      <div className="text-right">
                        <div
                          className={`text-sm font-bold font-mono ${
                            isProfit ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {isProfit ? "+" : ""}${pos.unrealizedPnl.toFixed(2)} ({isProfit ? "+" : ""}{pos.unrealizedR.toFixed(2)}R)
                        </div>
                      </div>
                    </div>

                    {/* 2-Column Key Metrics Grid */}
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      <div className="bg-[#0B0E14] p-2 rounded-lg border border-[#1E2638]">
                        <span className="text-[10px] text-[#7B849B] block">Цена входа:</span>
                        <span className="font-semibold text-white mt-0.5 block">
                          ${pos.entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="bg-[#0B0E14] p-2 rounded-lg border border-[#1E2638]">
                        <span className="text-[10px] text-[#7B849B] block">Текущая цена:</span>
                        <span className="font-semibold text-white mt-0.5 block">
                          ${pos.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="bg-[#0B0E14] p-2 rounded-lg border border-[#1E2638]">
                        <span className="text-[10px] text-[#7B849B] block">Стоп-лосс (2×ATR):</span>
                        <span className="font-semibold text-rose-400 mt-0.5 block">
                          ${pos.stopPrice.toFixed(2)}
                        </span>
                      </div>
                      <div className="bg-[#0B0E14] p-2 rounded-lg border border-[#1E2638]">
                        <span className="text-[10px] text-[#7B849B] block">Канал выхода (10):</span>
                        <span className="font-semibold text-amber-300 mt-0.5 block">
                          ${pos.channelExitLevel.toFixed(2)}
                        </span>
                      </div>
                      <div className="bg-[#0B0E14] p-2 rounded-lg border border-[#1E2638]">
                        <span className="text-[10px] text-[#7B849B] block">Размер позиции:</span>
                        <span className="font-semibold text-white mt-0.5 block">
                          ${pos.positionSizeDollar.toFixed(0)} ({pos.units.toFixed(2)} ед.)
                        </span>
                      </div>
                      <div className="bg-[#0B0E14] p-2 rounded-lg border border-[#1E2638]">
                        <span className="text-[10px] text-[#7B849B] block">Риск на сделку:</span>
                        <span className="font-semibold text-emerald-400 mt-0.5 block">
                          ${pos.riskDollar.toFixed(0)} (1.0%)
                        </span>
                      </div>
                    </div>

                    {/* Metadata Footer */}
                    <div className="flex items-center justify-between text-[10px] font-mono text-[#7B849B] pt-1">
                      <span>Пробой: ${pos.breakoutLevel.toFixed(2)} (Vol: {pos.breakoutVolRatio.toFixed(2)}x)</span>
                      <span>{new Date(pos.entryTimestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table View (>= md screens) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-[#1E2638] text-[#7B849B] text-left">
                    <th className="pb-2">Актив</th>
                    <th className="pb-2">Направление</th>
                    <th className="pb-2">Вход</th>
                    <th className="pb-2">Стоп (2×ATR)</th>
                    <th className="pb-2">Канал выхода</th>
                    <th className="pb-2">Тек. цена</th>
                    <th className="pb-2">Размер ($)</th>
                    <th className="pb-2">Нереал. PnL</th>
                    <th className="pb-2">R-Кратность</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2638]/50 text-white">
                  {account.positions.map((pos) => (
                    <tr key={pos.id} className="hover:bg-[#141A29]/50">
                      <td className="py-2.5 font-bold">{pos.asset}</td>
                      <td className="py-2.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            pos.direction === "LONG"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-rose-500/20 text-rose-400"
                          }`}
                        >
                          {pos.direction}
                        </span>
                      </td>
                      <td className="py-2.5">${pos.entryPrice.toFixed(2)}</td>
                      <td className="py-2.5 text-rose-400">${pos.stopPrice.toFixed(2)}</td>
                      <td className="py-2.5 text-amber-300">${pos.channelExitLevel.toFixed(2)}</td>
                      <td className="py-2.5">${pos.currentPrice.toFixed(2)}</td>
                      <td className="py-2.5">${pos.positionSizeDollar.toFixed(2)}</td>
                      <td
                        className={`py-2.5 font-bold ${
                          pos.unrealizedPnl >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {pos.unrealizedPnl >= 0 ? "+" : ""}${pos.unrealizedPnl.toFixed(2)}
                      </td>
                      <td
                        className={`py-2.5 font-bold ${
                          pos.unrealizedR >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {pos.unrealizedR >= 0 ? "+" : ""}{pos.unrealizedR.toFixed(2)}R
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="py-6 text-center text-xs font-mono text-[#7B849B]">
            Нет открытых позиций в текущий момент. Система ожидает подтверждённых пробоев 4H свечей.
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 4. CURRENT SIGNALS / MONITORING (1 signal = 1 card) */}
      {/* ========================================================================= */}
      <div className="space-y-3 w-full max-w-full min-w-0">
        <div className="flex items-center justify-between flex-wrap gap-1">
          <h2 className="text-xs sm:text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center space-x-2">
            <Compass className="h-4 w-4 text-amber-400 shrink-0" />
            <span>Мониторинг активов Breakout V2-AD (Binance 4H)</span>
          </h2>
          <span className="text-[10px] text-[#7B849B] font-mono">Цикл каждые 10 мин</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
          {(["BTCUSDT", "ETHUSDT", "SOLUSDT"] as const).map((symbol) => {
            const tel = telemetries[symbol];
            const pos = account?.positions.find((p) => p.asset === symbol);

            return (
              <div
                key={symbol}
                className="bg-[#0B0E14] border border-[#1E2638] p-3.5 sm:p-4 rounded-xl space-y-3 w-full max-w-full min-w-0 shadow-sm"
              >
                {/* Header: Asset + Status Badge + Current Price */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-base font-bold text-white font-mono">{symbol}</span>
                    {getStateBadge(pos ? "POSITION OPEN" : tel?.state)}
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold font-mono text-white">
                      ${tel ? tel.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "—"}
                    </div>
                  </div>
                </div>

                {/* 2-Column Indicator Grid */}
                <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-[#141A29] p-2.5 rounded-lg border border-[#1E2638]">
                  <div>
                    <span className="text-[10px] text-[#7B849B] block">HH20 (Пробой Вверх):</span>
                    <div className="font-semibold text-white mt-0.5 truncate">
                      ${tel ? tel.hh20.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "—"}
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#7B849B] block">LL20 (Пробой Вниз):</span>
                    <div className="font-semibold text-white mt-0.5 truncate">
                      ${tel ? tel.ll20.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "—"}
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#7B849B] block">Объёмный фильтр:</span>
                    <div
                      className={`font-semibold mt-0.5 flex items-center space-x-1 ${
                        tel && tel.volumeRatio >= 1.2 ? "text-emerald-400" : "text-[#7B849B]"
                      }`}
                    >
                      <span>{tel ? tel.volumeRatio.toFixed(2) : "—"}x</span>
                      {tel && tel.volumeRatio >= 1.2 && (
                        <span className="text-[9px] text-emerald-400 font-bold">(≥1.2)</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#7B849B] block">ATR(14):</span>
                    <div className="font-semibold text-white mt-0.5 truncate">
                      ${tel ? tel.atr14.toFixed(2) : "—"}
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#7B849B] block">Выход из канала:</span>
                    <div className="font-semibold text-amber-300 mt-0.5 truncate">
                      ${tel ? tel.channelExitLevel.toFixed(2) : "—"}
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#7B849B] block">Кулдаун:</span>
                    <div className="font-semibold text-white mt-0.5 truncate">
                      {tel && tel.cooldownRemainingBars > 0
                        ? `${tel.cooldownRemainingBars} св. (${tel.cooldownRemainingBars * 4}ч)`
                        : "Готов к входу"}
                    </div>
                  </div>
                </div>

                {/* If active position exists */}
                {pos && (
                  <div className="bg-emerald-500/10 border border-emerald-500/30 p-2.5 rounded-lg text-xs font-mono space-y-1.5">
                    <div className="flex items-center justify-between font-semibold">
                      <span className="text-emerald-400 flex items-center space-x-1">
                        <span>{pos.direction} ПОЗИЦИЯ</span>
                        <span className="text-[9px] bg-emerald-500/20 px-1 py-0.2 rounded">1% Риск</span>
                      </span>
                      <span className={pos.unrealizedPnl >= 0 ? "text-emerald-400" : "text-rose-400"}>
                        {pos.unrealizedPnl >= 0 ? "+" : ""}${pos.unrealizedPnl.toFixed(2)} ({pos.unrealizedR >= 0 ? "+" : ""}{pos.unrealizedR.toFixed(2)}R)
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-[11px] text-[#A0AEC0]">
                      <div>Вход: ${pos.entryPrice.toFixed(2)}</div>
                      <div>Стоп: ${pos.stopPrice.toFixed(2)}</div>
                      <div>Размер: {pos.units.toFixed(2)} ед.</div>
                      <div>Время: {new Date(pos.entryTimestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. EQUITY CURVE (Responsive SVG Chart with ResizeObserver) */}
      {/* ========================================================================= */}
      <BreakoutEquityChart
        snapshots={snapshots}
        initialBalance={account?.initialBalance ?? 10000}
        currentEquity={account?.equity}
      />

      {/* ========================================================================= */}
      {/* 6. TRADE HISTORY (Mobile Cards / Desktop Table) */}
      {/* ========================================================================= */}
      <div className="bg-[#0B0E14] border border-[#1E2638] rounded-xl p-3.5 sm:p-4 space-y-3 w-full max-w-full min-w-0">
        <h2 className="text-xs sm:text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center space-x-2">
          <History className="h-4 w-4 text-purple-400 shrink-0" />
          <span>История закрытых сделок ({account?.tradeHistory.length || 0})</span>
        </h2>

        {account && account.tradeHistory.length > 0 ? (
          <>
            {/* Mobile Trade Cards (< md screens) */}
            <div className="md:hidden space-y-2.5">
              {account.tradeHistory.slice().reverse().map((t) => {
                const isProfit = t.netPnl >= 0;
                return (
                  <div
                    key={t.id}
                    className="bg-[#141A29]/80 border border-[#1E2638] rounded-xl p-3 space-y-2"
                  >
                    {/* Top Row: Symbol, Direction, Net PnL */}
                    <div className="flex items-center justify-between border-b border-[#1E2638] pb-2">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-white font-mono text-sm">{t.asset}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            t.direction === "LONG"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-rose-500/20 text-rose-400"
                          }`}
                        >
                          {t.direction}
                        </span>
                      </div>
                      <div
                        className={`font-mono font-bold text-sm ${
                          isProfit ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {isProfit ? "+" : ""}${t.netPnl.toFixed(2)} ({t.rMultiple >= 0 ? "+" : ""}{t.rMultiple.toFixed(2)}R)
                      </div>
                    </div>

                    {/* Middle Row: Entry -> Exit, Reason, Duration */}
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      <div>
                        <span className="text-[10px] text-[#7B849B] block">Вход → Выход:</span>
                        <span className="text-white">
                          ${t.entryPrice.toFixed(2)} → ${t.exitPrice.toFixed(2)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-[#7B849B] block">Длительность:</span>
                        <span className="text-white">{t.holdingDurationHours.toFixed(1)}ч</span>
                      </div>
                    </div>

                    {/* Expandable Disclosure Details */}
                    <details className="text-[11px] font-mono text-[#7B849B] pt-1.5 border-t border-[#1E2638]/50 cursor-pointer">
                      <summary className="text-[10px] text-sky-400 font-medium hover:underline">
                        Подробнее о сделке
                      </summary>
                      <div className="mt-2 space-y-1 bg-[#0B0E14] p-2 rounded border border-[#1E2638]">
                        <div className="flex justify-between">
                          <span>Причина выхода:</span>
                          <span className="text-white font-semibold">{t.exitReason}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Комиссии + Слиппедж:</span>
                          <span className="text-white">${(t.fees + t.slippage).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Время выхода:</span>
                          <span className="text-white">
                            {new Date(t.exitTimestamp).toLocaleString([], {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <div className="flex justify-between text-[9px] text-[#64748B]">
                          <span>ID:</span>
                          <span className="truncate max-w-[160px]">{t.id}</span>
                        </div>
                      </div>
                    </details>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table View (>= md screens) */}
            <div className="hidden md:block overflow-x-auto max-h-72">
              <table className="w-full text-xs font-mono">
                <thead className="sticky top-0 bg-[#0B0E14]">
                  <tr className="border-b border-[#1E2638] text-[#7B849B] text-left">
                    <th className="pb-2">Время выхода</th>
                    <th className="pb-2">Актив</th>
                    <th className="pb-2">Тип</th>
                    <th className="pb-2">Вход</th>
                    <th className="pb-2">Выход</th>
                    <th className="pb-2">Причина</th>
                    <th className="pb-2">Net PnL</th>
                    <th className="pb-2">R-Multiple</th>
                    <th className="pb-2">Комиссии / Slip</th>
                    <th className="pb-2">Удержание</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2638]/50 text-white">
                  {account.tradeHistory.slice().reverse().map((t) => (
                    <tr key={t.id} className="hover:bg-[#141A29]/50">
                      <td className="py-2 text-[#7B849B]">
                        {new Date(t.exitTimestamp).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="py-2 font-bold">{t.asset}</td>
                      <td className="py-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            t.direction === "LONG"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-rose-500/20 text-rose-400"
                          }`}
                        >
                          {t.direction}
                        </span>
                      </td>
                      <td className="py-2">${t.entryPrice.toFixed(2)}</td>
                      <td className="py-2">${t.exitPrice.toFixed(2)}</td>
                      <td className="py-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] ${
                            t.exitReason === "STOP_LOSS"
                              ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                              : "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                          }`}
                        >
                          {t.exitReason}
                        </span>
                      </td>
                      <td
                        className={`py-2 font-bold ${
                          t.netPnl >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {t.netPnl >= 0 ? "+" : ""}${t.netPnl.toFixed(2)}
                      </td>
                      <td
                        className={`py-2 font-bold ${
                          t.rMultiple >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {t.rMultiple >= 0 ? "+" : ""}{t.rMultiple.toFixed(2)}R
                      </td>
                      <td className="py-2 text-[#7B849B]">
                        ${(t.fees + t.slippage).toFixed(2)}
                      </td>
                      <td className="py-2 text-[#7B849B]">
                        {t.holdingDurationHours.toFixed(1)}ч
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="py-6 text-center text-xs font-mono text-[#7B849B]">
            История сделок пуста. Сделки будут появляться автоматически по мере закрытия позиций.
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 7. RESEARCH METHODOLOGY DISCLAIMER */}
      {/* ========================================================================= */}
      <div className="bg-[#0B0E14] border border-[#1E2638] p-3.5 sm:p-4 rounded-xl text-xs font-mono space-y-2 text-[#7B849B] w-full max-w-full min-w-0">
        <div className="flex items-center space-x-2 text-amber-400 font-bold">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Изолированная исследовательская среда (Isolated Research Environment)</span>
        </div>
        <p className="leading-relaxed">
          Данный модуль функционирует в режиме виртуального исполнения (Virtual Paper Trading) и предназначен исключительно для проверки поведения модели <strong>Breakout V2-AD</strong> на текущем реальном рынке криптовалют. Торговые ордера на биржу не отправляются, реальные средства не используются.
        </p>
        <p className="leading-relaxed">
          Исторические показатели бэктеста Out-of-Sample (BTC +8.49%, ETH +39.79%, SOL +14.95%) получены на ретроспективных данных и не гарантируют положительный результат в будущем. Результаты live демо-торговли рассчитываются независимо от исторического бэктеста с базового баланса $10,000.
        </p>
      </div>
    </div>
  );
};
