"use client";

import React, { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  DollarSign,
  History,
  Layers,
  RotateCcw,
  Shield,
  TrendingDown,
  TrendingUp,
  Wallet,
  XCircle,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { PaperAccount, PaperPosition, TradingSignal } from "@/core/types";
import { ModelDTelemetry } from "@/core/paper/model-d-tracker";

interface ModelDApiResponse {
  success: boolean;
  signal: TradingSignal;
  telemetry: ModelDTelemetry;
  error?: string;
}

export const PaperTradingView: React.FC = () => {
  const [account, setAccount] = useState<PaperAccount | null>(null);
  const [loading, setLoading] = useState(true);

  // Model D state
  const [selectedAsset, setSelectedAsset] = useState<string>("BTCUSDT");
  const [modelDData, setModelDData] = useState<ModelDApiResponse | null>(null);
  const [loadingModelD, setLoadingModelD] = useState(false);
  const [deployingModelD, setDeployingModelD] = useState(false);

  const fetchAccount = async () => {
    try {
      const res = await fetch("/api/paper");
      const data = await res.json();
      if (data.success && data.account) {
        setAccount(data.account);
      }
    } catch (err) {
      // ignore poll error
    } finally {
      setLoading(false);
    }
  };

  const fetchModelD = async (symbol: string) => {
    setLoadingModelD(true);
    try {
      const res = await fetch(`/api/signal-model-d?symbol=${symbol}`);
      const data = await res.json();
      if (data.success) {
        setModelDData(data);
      } else {
        console.warn("Model D fetch warning:", data.error);
      }
    } catch (err) {
      console.error("Model D fetch error:", err);
    } finally {
      setLoadingModelD(false);
    }
  };

  useEffect(() => {
    fetchAccount();
    const interval = setInterval(fetchAccount, 3000); // 3-second live refresh
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchModelD(selectedAsset);
    const interval = setInterval(() => fetchModelD(selectedAsset), 15000); // 15s refresh for 4H telemetry
    return () => clearInterval(interval);
  }, [selectedAsset]);

  const handleClosePosition = async (positionId: string) => {
    try {
      const res = await fetch("/api/paper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CLOSE", positionId }),
      });
      const data = await res.json();
      if (data.success) {
        setAccount(data.account);
        toast.success("Позиция успешно закрыта.");
      } else {
        toast.error(data.error || "Не удалось закрыть позицию");
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeployModelDTrade = async () => {
    if (!modelDData?.signal) return;
    setDeployingModelD(true);
    try {
      const res = await fetch("/api/paper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "OPEN",
          signal: modelDData.signal,
          riskPercentage: 1.0, // Fixed 1.0% risk per Model D institutional spec
          orderType: "MARKET",
          trailingStopType: "STRUCTURAL_SWING",
          swingTrailingBars: 5,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAccount(data.account);
        toast.success(`Демо-ордер Model D (${modelDData.signal.stance}) успешно открыт с риском 1.0%!`);
      } else {
        toast.error(data.error || "Не удалось открыть демо-позицию");
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeployingModelD(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("Вы уверены, что хотите сбросить виртуальный портфель до $10,000?")) {
      return;
    }

    try {
      const res = await fetch("/api/paper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "RESET", initialBalance: 10000 }),
      });
      const data = await res.json();
      if (data.success) {
        setAccount(data.account);
        toast.success("Виртуальный портфель сброшен до $10,000.00.");
      } else {
        toast.error(data.error || "Не удалось сбросить баланс");
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (loading && !account) {
    return (
      <div className="flex-1 bg-[#0B0E14] flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="h-6 w-6 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const equity = account?.equity ?? 10000;
  const balance = account?.balance ?? 10000;
  const unrealized = account?.unrealizedPnl ?? 0;
  const realized = account?.realizedPnl ?? 0;
  const openPositions = account?.positions ?? [];
  const history = account?.tradeHistory ?? [];

  // Find active Model D position for selected asset
  const activeModelDPosition = openPositions.find(
    (p) =>
      (p.asset === selectedAsset || p.asset.replace("/", "") === selectedAsset.replace("/", "")) &&
      (p.strategyVersion === "MODEL_D" || p.trailingStopType === "STRUCTURAL_SWING")
  );

  const telemetry = modelDData?.telemetry;
  const signal = modelDData?.signal;

  return (
    <div className="flex-1 bg-[#0B0E14] flex flex-col h-[calc(100vh-4rem)] overflow-y-auto">
      {/* Top Header Banner */}
      <div className="p-5 border-b border-[#1E2638] bg-[#0E131F] flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white flex items-center space-x-2">
            <Wallet className="h-4 w-4 text-emerald-400" />
            <span>Виртуальный портфель (Демо-торговля CryptoPilot)</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20">
              PAPER TRADING ONLY
            </span>
          </h2>
          <p className="text-xs text-[#7B849B]">
            Симуляция исполнения ордеров по котировкам Binance в реальном времени. Реальные деньги отключены.
          </p>
        </div>

        <button
          onClick={handleReset}
          className="flex items-center space-x-1.5 text-xs text-[#7B849B] hover:text-white bg-[#141A29] px-3 py-1.5 rounded-lg border border-[#1E2638] transition-colors"
        >
          <RotateCcw className="h-3 w-3" />
          <span>Сбросить портфель</span>
        </button>
      </div>

      <div className="p-6 space-y-6">
        {/* ========================================================================= */}
        {/* MODEL D 4H DYNAMIC TREND-FOLLOWING PANEL */}
        {/* ========================================================================= */}
        <div className="bg-gradient-to-br from-[#121829] to-[#0E1322] p-5 rounded-2xl border border-sky-500/30 shadow-lg shadow-sky-950/20">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#1E2638] pb-4">
            <div>
              <div className="flex items-center space-x-2.5">
                <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 tracking-wide">
                  MODEL D (4H TREND-FOLLOWING)
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  GRADE B+ VALIDATED
                </span>
              </div>
              <p className="text-xs text-[#94A3B8] mt-1.5">
                4H Pullback-Bounce на EMA20 + 2.5×ATR Initial Stop + 5-свечной Structural Swing Trailing. Без фикс. TP.
              </p>
            </div>

            {/* Asset Selector */}
            <div className="flex items-center space-x-1.5 bg-[#0B0E17] p-1 rounded-xl border border-[#1E2638]">
              {["BTCUSDT", "ETHUSDT", "SOLUSDT"].map((sym) => (
                <button
                  key={sym}
                  onClick={() => setSelectedAsset(sym)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-colors ${
                    selectedAsset === sym
                      ? "bg-sky-500 text-white shadow-md shadow-sky-500/30"
                      : "text-[#7B849B] hover:text-white"
                  }`}
                >
                  {sym.replace("USDT", "")}
                </button>
              ))}
            </div>
          </div>

          {/* Model D Telemetry Grid */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mt-4">
            {/* 4H Trend */}
            <div className="bg-[#0B0E17]/80 p-3 rounded-xl border border-[#1E2638]">
              <span className="text-[11px] text-[#7B849B] block">4H Тренд</span>
              <div className="flex items-center space-x-1.5 mt-1">
                {telemetry?.trend4h === "BULLISH" ? (
                  <span className="flex items-center text-xs font-bold text-emerald-400">
                    <TrendingUp className="h-3.5 w-3.5 mr-1" /> Бычий
                  </span>
                ) : telemetry?.trend4h === "BEARISH" ? (
                  <span className="flex items-center text-xs font-bold text-purple-400">
                    <TrendingDown className="h-3.5 w-3.5 mr-1" /> Медвежий
                  </span>
                ) : (
                  <span className="flex items-center text-xs font-bold text-amber-400">
                    <Activity className="h-3.5 w-3.5 mr-1" /> Боковик
                  </span>
                )}
              </div>
              <span className="text-[10px] text-[#64748B] font-mono block mt-0.5">
                {telemetry ? (telemetry.isMacroBull ? "Цена > EMA200" : "Цена < EMA200") : "Загрузка..."}
              </span>
            </div>

            {/* EMA20 */}
            <div className="bg-[#0B0E17]/80 p-3 rounded-xl border border-[#1E2638]">
              <span className="text-[11px] text-[#7B849B] block">4H EMA 20 (Динамич.)</span>
              <span className="text-sm font-mono font-bold text-sky-400 mt-1 block">
                ${telemetry ? telemetry.ema20.toLocaleString() : "..."}
              </span>
              <span className="text-[10px] text-[#64748B]">Зона входа/отката</span>
            </div>

            {/* EMA50 */}
            <div className="bg-[#0B0E17]/80 p-3 rounded-xl border border-[#1E2638]">
              <span className="text-[11px] text-[#7B849B] block">4H EMA 50</span>
              <span className="text-sm font-mono font-bold text-[#CBD5E1] mt-1 block">
                ${telemetry ? telemetry.ema50.toLocaleString() : "..."}
              </span>
              <span className="text-[10px] text-[#64748B]">Тренд фильтр</span>
            </div>

            {/* EMA200 */}
            <div className="bg-[#0B0E17]/80 p-3 rounded-xl border border-[#1E2638]">
              <span className="text-[11px] text-[#7B849B] block">4H EMA 200 (Макро)</span>
              <span className="text-sm font-mono font-bold text-indigo-400 mt-1 block">
                ${telemetry ? telemetry.ema200.toLocaleString() : "..."}
              </span>
              <span className="text-[10px] text-[#64748B]">Макро-гейт</span>
            </div>

            {/* Initial Stop / ATR */}
            <div className="bg-[#0B0E17]/80 p-3 rounded-xl border border-[#1E2638]">
              <span className="text-[11px] text-[#7B849B] block">Initial Stop (2.5×ATR)</span>
              <span className="text-sm font-mono font-bold text-rose-400 mt-1 block">
                ${signal ? signal.stopLoss.toLocaleString() : "..."}
              </span>
              <span className="text-[10px] text-[#64748B]">
                ATR14: ${telemetry ? telemetry.atr14.toLocaleString() : "..."}
              </span>
            </div>

            {/* Structural Swing Trailing Level */}
            <div className="bg-[#0B0E17]/80 p-3 rounded-xl border border-emerald-500/30 bg-emerald-950/10">
              <span className="text-[11px] text-emerald-400 block font-semibold">Свинг-трейлинг (5 св.)</span>
              <span className="text-sm font-mono font-bold text-emerald-300 mt-1 block">
                ${telemetry
                  ? (telemetry.trend4h === "BEARISH" ? telemetry.swingTrailingLevelShort : telemetry.swingTrailingLevelLong).toLocaleString()
                  : "..."}
              </span>
              <span className="text-[10px] text-[#64748B]">Динамический стоп</span>
            </div>
          </div>

          {/* Model D Active Position or Signal Execution Bar */}
          <div className="mt-4 p-3.5 bg-[#0B0E17] rounded-xl border border-[#1E2638] flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div
                className={`h-3 w-3 rounded-full ${
                  activeModelDPosition ? "bg-emerald-400 animate-pulse" : "bg-[#475569]"
                }`}
              />
              <div>
                <span className="text-xs font-semibold text-white block">
                  Статус позиции Model D ({selectedAsset}):
                </span>
                <span className="text-xs font-mono text-[#94A3B8]">
                  {activeModelDPosition ? (
                    <span className="text-emerald-400 font-bold">
                      В РЫНКЕ ({activeModelDPosition.type}) — Вход: ${activeModelDPosition.entryPrice.toLocaleString()} | 
                      Трейлинг-стоп: ${activeModelDPosition.stopLoss.toLocaleString()} | 
                      PnL: {activeModelDPosition.unrealizedPnl >= 0 ? "+" : ""}${activeModelDPosition.unrealizedPnl} ({activeModelDPosition.unrealizedPnlPercent}%)
                    </span>
                  ) : (
                    <span>
                      Нет открытой позиции. Сигнал:{" "}
                      <strong
                        className={
                          signal?.stance === "BUY"
                            ? "text-emerald-400 font-bold"
                            : signal?.stance === "SHORT"
                            ? "text-purple-400 font-bold"
                            : "text-[#94A3B8]"
                        }
                      >
                        {signal?.stance || "WAIT"}
                      </strong>{" "}
                      (Signal Score: {signal?.confidenceScore || 0}/100)
                    </span>
                  )}
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {activeModelDPosition ? (
                <button
                  onClick={() => handleClosePosition(activeModelDPosition.id)}
                  className="px-3 py-1.5 text-xs font-semibold bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 rounded-lg border border-rose-500/30 transition-colors"
                >
                  Закрыть позицию Model D
                </button>
              ) : (
                <button
                  onClick={handleDeployModelDTrade}
                  disabled={deployingModelD || !signal}
                  className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center space-x-1.5 ${
                    signal?.stance === "BUY"
                      ? "bg-emerald-500 hover:bg-emerald-400 text-white shadow-md shadow-emerald-500/30"
                      : signal?.stance === "SHORT"
                      ? "bg-purple-600 hover:bg-purple-500 text-white shadow-md shadow-purple-600/30"
                      : "bg-[#1E2638] hover:bg-[#2A344D] text-[#94A3B8] border border-[#334155]"
                  }`}
                >
                  <Zap className="h-3.5 w-3.5" />
                  <span>
                    {deployingModelD
                      ? "Открытие..."
                      : signal?.stance === "BUY"
                      ? "Открыть Model D ЛОНГ (1.0% риск)"
                      : signal?.stance === "SHORT"
                      ? "Открыть Model D ШОРТ (1.0% риск)"
                      : "Открыть Model D демо-сделку (1.0% риск)"}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* KPI Balance Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[#141A29] p-4 rounded-xl border border-[#1E2638]">
            <span className="text-xs text-[#7B849B] block">Общий капитал (Equity)</span>
            <span className="text-2xl font-mono font-bold text-white mt-1 block">
              ${equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-[11px] text-[#7B849B]">Депозит + Нереализованный PnL</span>
          </div>

          <div className="bg-[#141A29] p-4 rounded-xl border border-[#1E2638]">
            <span className="text-xs text-[#7B849B] block">Доступный баланс</span>
            <span className="text-2xl font-mono font-bold text-white mt-1 block">
              ${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-[11px] text-[#7B849B]">Виртуальный USD</span>
          </div>

          <div className="bg-[#141A29] p-4 rounded-xl border border-[#1E2638]">
            <span className="text-xs text-[#7B849B] block">Нереализованный PnL</span>
            <span
              className={`text-2xl font-mono font-bold mt-1 block ${
                unrealized >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {unrealized >= 0 ? "+" : ""}${unrealized.toFixed(2)}
            </span>
            <span className="text-[11px] text-[#7B849B]">По открытым позициям</span>
          </div>

          <div className="bg-[#141A29] p-4 rounded-xl border border-[#1E2638]">
            <span className="text-xs text-[#7B849B] block">Реализованный PnL</span>
            <span
              className={`text-2xl font-mono font-bold mt-1 block ${
                realized >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {realized >= 0 ? "+" : ""}${realized.toFixed(2)}
            </span>
            <span className="text-[11px] text-[#7B849B]">Закрытые сделки</span>
          </div>
        </div>

        {/* Active Open Positions Table */}
        <div className="bg-[#141A29] rounded-xl border border-[#1E2638] overflow-hidden">
          <div className="p-4 border-b border-[#1E2638] flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7B849B]">
              Активные открытые позиции ({openPositions.length})
            </h3>
            <span className="text-xs text-emerald-400 font-mono">Обновление котировок live</span>
          </div>

          {openPositions.length === 0 ? (
            <div className="p-8 text-center text-[#7B849B] text-xs space-y-1">
              <p>Нет активных открытых позиций.</p>
              <p className="text-[11px]">
                Открывайте сделки через панель Model D выше или из вкладки «Терминал и Сигналы».
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-xs font-mono">
                <thead className="bg-[#0E131F] text-[#7B849B] border-b border-[#1E2638]">
                  <tr>
                    <th className="p-3">Инструмент</th>
                    <th className="p-3">Стратегия</th>
                    <th className="p-3">Тип</th>
                    <th className="p-3">Кол-во</th>
                    <th className="p-3">Цена входа</th>
                    <th className="p-3">Текущая цена</th>
                    <th className="p-3">Стоп-лосс / Трейлинг</th>
                    <th className="p-3">Тейк-профит</th>
                    <th className="p-3">Нереализованный PnL</th>
                    <th className="p-3 text-right">Действие</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2638]/50">
                  {openPositions.map((pos) => {
                    const isProfit = pos.unrealizedPnl >= 0;
                    const isModelD = pos.strategyVersion === "MODEL_D" || pos.trailingStopType === "STRUCTURAL_SWING";
                    return (
                      <tr key={pos.id} className="hover:bg-[#1E2638]/30 transition-colors">
                        <td className="p-3 text-white font-bold">{pos.asset}</td>
                        <td className="p-3">
                          {isModelD ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              MODEL D 4H
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#1E2638] text-[#94A3B8]">
                              V2/V3 1H
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              pos.type === "LONG"
                                ? "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                                : "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                            }`}
                          >
                            {pos.type}
                          </span>
                        </td>
                        <td className="p-3 text-white">{pos.sizeUnits}</td>
                        <td className="p-3 text-white">${pos.entryPrice.toLocaleString()}</td>
                        <td className="p-3 text-white font-bold">
                          ${pos.currentPrice.toLocaleString()}
                        </td>
                        <td className="p-3 text-rose-400 font-bold">
                          ${pos.stopLoss.toLocaleString()}
                          {pos.trailingStopType === "STRUCTURAL_SWING" && (
                            <span className="ml-1 px-1 py-0.2 bg-emerald-500/20 text-emerald-300 text-[9px] rounded font-bold">
                              Свинг 5св
                            </span>
                          )}
                          {pos.breakevenMoved && (
                            <span className="ml-1 px-1 py-0.2 bg-emerald-500/20 text-emerald-300 text-[9px] rounded font-bold">
                              БУ
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-emerald-400">
                          {isModelD ? (
                            <span className="text-[#94A3B8] italic text-[11px]">Без TP (Трейлинг)</span>
                          ) : (
                            `$${pos.takeProfit.toLocaleString()}`
                          )}
                        </td>
                        <td className="p-3 font-bold">
                          <span className={isProfit ? "text-emerald-400" : "text-rose-400"}>
                            {isProfit ? "+" : ""}${pos.unrealizedPnl} ({isProfit ? "+" : ""}
                            {pos.unrealizedPnlPercent}%)
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleClosePosition(pos.id)}
                            className="px-2.5 py-1 text-[11px] font-semibold bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 rounded border border-rose-500/30 transition-colors"
                          >
                            Закрыть позицию
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Closed Positions History */}
        <div className="bg-[#141A29] rounded-xl border border-[#1E2638] overflow-hidden">
          <div className="p-4 border-b border-[#1E2638] flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7B849B]">
              История закрытых сделок ({history.length})
            </h3>
            <span className="text-xs text-[#7B849B]">Недавние симулированные выходы</span>
          </div>

          {history.length === 0 ? (
            <div className="p-8 text-center text-[#7B849B] text-xs">
              В истории пока нет закрытых сделок.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-xs font-mono">
                <thead className="bg-[#0E131F] text-[#7B849B] border-b border-[#1E2638]">
                  <tr>
                    <th className="p-3">Инструмент</th>
                    <th className="p-3">Причина выхода</th>
                    <th className="p-3">Цена входа</th>
                    <th className="p-3">Цена выхода</th>
                    <th className="p-3">Реализованный PnL ($)</th>
                    <th className="p-3">Время закрытия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2638]/50">
                  {history.map((h) => (
                    <tr key={h.id} className="hover:bg-[#1E2638]/30 transition-colors">
                      <td className="p-3 text-white font-bold">{h.asset}</td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            h.closeReason === "TAKE_PROFIT_HIT"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : h.closeReason === "STOP_LOSS_HIT"
                              ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                              : "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                          }`}
                        >
                          {h.closeReason === "TAKE_PROFIT_HIT"
                            ? "Тейк-профит"
                            : h.closeReason === "STOP_LOSS_HIT"
                            ? "Стоп-лосс"
                            : h.closeReason === "TRAILING_STOP_HIT"
                            ? "Трейлинг-стоп (Свинг)"
                            : h.closeReason?.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="p-3 text-white">${h.entryPrice.toLocaleString()}</td>
                      <td className="p-3 text-white">${h.currentPrice.toLocaleString()}</td>
                      <td
                        className={`p-3 font-bold ${
                          h.realizedPnl >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {h.realizedPnl >= 0 ? "+" : ""}${h.realizedPnl}
                      </td>
                      <td className="p-3 text-[#7B849B]">
                        {h.closedAt ? new Date(h.closedAt).toLocaleTimeString() : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
