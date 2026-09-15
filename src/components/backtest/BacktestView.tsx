"use client";

import React, { useState } from "react";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart2,
  Calendar,
  DollarSign,
  Filter,
  Layers,
  Percent,
  Play,
  Settings2,
  Sliders,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { BacktestSummary, Timeframe } from "@/core/types";

interface BacktestViewProps {
  initialSymbol?: string;
}

export const BacktestView: React.FC<BacktestViewProps> = ({
  initialSymbol = "BTCUSDT",
}) => {
  const [symbol, setSymbol] = useState(initialSymbol);
  const [timeframe, setTimeframe] = useState<Timeframe>("1h");
  const [initialBalance, setInitialBalance] = useState(10000);
  const [riskPerTrade, setRiskPerTrade] = useState(1.5);

  // Research Strategy Controls
  const [enableShorts, setEnableShorts] = useState(true);
  const [enableAdxFilter, setEnableAdxFilter] = useState(true);
  const [adxThreshold, setAdxThreshold] = useState(20);
  const [enableLiquidityConfirmation, setEnableLiquidityConfirmation] = useState(true);
  const [fillModel, setFillModel] = useState<"PENETRATION" | "CONSERVATIVE_TOUCH">("PENETRATION");
  const [takerFeePercent, setTakerFeePercent] = useState(0.05);
  const [slippagePercent, setSlippagePercent] = useState(0.05);

  // Phase 4 Strategic Enhancements
  const [enableHtfGate, setEnableHtfGate] = useState(true);
  const [trailingStopType, setTrailingStopType] = useState<"CHANDELIER_ATR" | "BREAKEVEN_ONLY">("CHANDELIER_ATR");
  const [chandelierMultiplier, setChandelierMultiplier] = useState(2.5);
  const [enableRegimeRisk, setEnableRegimeRisk] = useState(true);

  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<BacktestSummary | null>(null);

  const handleRunBacktest = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          timeframe,
          initialBalance,
          riskPerTrade,
          enableShorts,
          enableAdxFilter,
          adxThreshold,
          enableLiquidityConfirmation,
          fillModel,
          takerFeePercent,
          slippagePercent,
          enableHtfGate,
          trailingStopType,
          chandelierMultiplier,
          enableRegimeRisk,
        }),
      });

      const data = await res.json();
      if (data.success && data.summary) {
        setSummary(data.summary);
        toast.success(
          `Backtest completed: ${data.summary.totalTrades} trades simulated (${data.summary.longTrades} Long, ${data.summary.shortTrades} Short).`
        );
      } else {
        toast.error(data.error || "Failed to run backtest");
      }
    } catch (err: any) {
      toast.error(err.message || "Backtest request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 bg-[#0B0E14] flex flex-col h-[calc(100vh-4rem)] overflow-y-auto">
      {/* Top Controls Bar */}
      <div className="p-5 border-b border-[#1E2638] bg-[#0E131F] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center space-x-2">
              <BarChart2 className="h-4 w-4 text-sky-400" />
              <span>Исследовательский движок бэктестинга</span>
            </h2>
            <p className="text-xs text-[#7B849B]">
              Двунаправленная симуляция walk-forward с консервативной моделью исполнения и без заглядывания вперед
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="bg-[#141A29] border border-[#1E2638] text-xs text-white rounded-lg px-3 py-2 font-mono"
            >
              <option value="BTCUSDT">BTC/USDT</option>
              <option value="ETHUSDT">ETH/USDT</option>
              <option value="SOLUSDT">SOL/USDT</option>
              <option value="BNBUSDT">BNB/USDT</option>
              <option value="AVAXUSDT">AVAX/USDT</option>
            </select>

            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value as Timeframe)}
              className="bg-[#141A29] border border-[#1E2638] text-xs text-white rounded-lg px-3 py-2 font-mono"
            >
              <option value="15m">15м Таймфрейм</option>
              <option value="1h">1ч Таймфрейм</option>
              <option value="4h">4ч Таймфрейм</option>
            </select>

            <button
              onClick={handleRunBacktest}
              disabled={loading}
              className="flex items-center space-x-2 bg-sky-500 hover:bg-sky-400 text-white font-semibold text-xs px-4 py-2 rounded-lg transition-all shadow-md shadow-sky-500/20 disabled:opacity-50"
            >
              {loading ? (
                <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5 fill-white" />
              )}
              <span>{loading ? "Симуляция..." : "Запустить бэктест"}</span>
            </button>
          </div>
        </div>

        {/* Strategy Research Ablation Controls */}
        <div className="bg-[#141A29] p-3 rounded-xl border border-[#1E2638] flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center space-x-2 cursor-pointer text-white">
              <input
                type="checkbox"
                checked={enableShorts}
                onChange={(e) => setEnableShorts(e.target.checked)}
                className="rounded border-[#1E2638] text-sky-500 focus:ring-0 bg-[#0B0E14]"
              />
              <span>Разрешить сетапы SHORT</span>
            </label>

            <label className="flex items-center space-x-2 cursor-pointer text-white">
              <input
                type="checkbox"
                checked={enableAdxFilter}
                onChange={(e) => setEnableAdxFilter(e.target.checked)}
                className="rounded border-[#1E2638] text-sky-500 focus:ring-0 bg-[#0B0E14]"
              />
              <span>ADX фильтр боковика</span>
            </label>

            {enableAdxFilter && (
              <div className="flex items-center space-x-2">
                <span className="text-[#7B849B]">Порог:</span>
                <input
                  type="number"
                  value={adxThreshold}
                  onChange={(e) => setAdxThreshold(Number(e.target.value))}
                  className="w-14 bg-[#0B0E14] border border-[#1E2638] rounded px-2 py-0.5 text-white"
                />
              </div>
            )}

            <label className="flex items-center space-x-2 cursor-pointer text-white">
              <input
                type="checkbox"
                checked={enableLiquidityConfirmation}
                onChange={(e) => setEnableLiquidityConfirmation(e.target.checked)}
                className="rounded border-[#1E2638] text-sky-500 focus:ring-0 bg-[#0B0E14]"
              />
              <span>Снятие ликвидности</span>
            </label>
          </div>

          <div className="flex items-center space-x-3 text-[#7B849B]">
            <span>Модель исполнения:</span>
            <select
              value={fillModel}
              onChange={(e) => setFillModel(e.target.value as any)}
              className="bg-[#0B0E14] border border-[#1E2638] text-xs text-white rounded px-2 py-1"
            >
              <option value="PENETRATION">Пробитие (Консервативная)</option>
              <option value="CONSERVATIVE_TOUCH">Только касание</option>
            </select>
          </div>
        </div>

        {/* Phase 4 Quantitative Strategy Upgrades */}
        <div className="bg-[#141A29] p-3 rounded-xl border border-[#1E2638] flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center space-x-2 cursor-pointer text-white">
              <input
                type="checkbox"
                checked={enableHtfGate}
                onChange={(e) => setEnableHtfGate(e.target.checked)}
                className="rounded border-[#1E2638] text-amber-500 focus:ring-0 bg-[#0B0E14]"
              />
              <span className="flex items-center space-x-1">
                <span className="text-amber-400 font-semibold">4H EMA200 фильтр</span>
                <span className="text-[#7B849B] text-[10px]">(Zero Lookahead)</span>
              </span>
            </label>

            <div className="flex items-center space-x-2">
              <span className="text-sky-400 font-semibold">Трейлинг-стоп:</span>
              <select
                value={trailingStopType}
                onChange={(e) => setTrailingStopType(e.target.value as any)}
                className="bg-[#0B0E14] border border-[#1E2638] text-xs text-white rounded px-2 py-1"
              >
                <option value="CHANDELIER_ATR">Chandelier ATR выход</option>
                <option value="BREAKEVEN_ONLY">Только безубыток 1.5R</option>
              </select>
            </div>

            {trailingStopType === "CHANDELIER_ATR" && (
              <div className="flex items-center space-x-2">
                <span className="text-[#7B849B]">Множитель ATR:</span>
                <input
                  type="number"
                  step="0.1"
                  value={chandelierMultiplier}
                  onChange={(e) => setChandelierMultiplier(Number(e.target.value))}
                  className="w-14 bg-[#0B0E14] border border-[#1E2638] rounded px-2 py-0.5 text-white"
                />
              </div>
            )}

            <label className="flex items-center space-x-2 cursor-pointer text-white">
              <input
                type="checkbox"
                checked={enableRegimeRisk}
                onChange={(e) => setEnableRegimeRisk(e.target.checked)}
                className="rounded border-[#1E2638] text-emerald-500 focus:ring-0 bg-[#0B0E14]"
              />
              <span className="flex items-center space-x-1">
                <span className="text-emerald-400 font-semibold">Риск по режимам</span>
                <span className="text-[#7B849B] text-[10px]">(1.5% Тренд / 0.75% Боковик)</span>
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-6 space-y-6">
        {!summary ? (
          <div className="border border-dashed border-[#1E2638] rounded-xl p-12 text-center space-y-3">
            <BarChart2 className="h-10 w-10 text-[#7B849B] mx-auto" />
            <h3 className="text-sm font-semibold text-white">Бэктест еще не запущен</h3>
            <p className="text-xs text-[#7B849B] max-w-md mx-auto">
              Настройте параметры стратегии выше и нажмите «Запустить бэктест» для проверки эффективности на исторических свечах Binance.
            </p>
          </div>
        ) : (
          <>
            {/* Small Sample Warning Alert */}
            {(summary.smallSampleWarning || summary.totalTrades < 15) && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center space-x-3 text-amber-400">
                <AlertCircle className="h-5 w-5 shrink-0 text-amber-400" />
                <div className="text-xs">
                  <span className="font-bold">Внимание: Малая статистическая выборка ({summary.totalTrades} сделок &lt; 15).</span>
                  <span className="text-amber-300/80 ml-1">
                    Результаты бэктеста могут быть подвержены случайности. Для институциональной оценки требуется большее число сделок или расширенный исторический период.
                  </span>
                </div>
              </div>
            )}

            {/* KPI Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <div className="bg-[#141A29] p-4 rounded-xl border border-[#1E2638]">
                <span className="text-[11px] text-[#7B849B] block">Винрейт (Win Rate)</span>
                <span className="text-xl font-mono font-bold text-white mt-1 block">
                  {summary.winRatePercent}%
                </span>
                <span className="text-[10px] text-[#7B849B]">
                  {summary.winningTrades}W / {summary.losingTrades}L
                </span>
              </div>

              <div className="bg-[#141A29] p-4 rounded-xl border border-[#1E2638]">
                <span className="text-[11px] text-[#7B849B] block">Лонг / Шорт</span>
                <span className="text-xs font-mono font-bold text-white mt-1 block">
                  L: {summary.longTrades} ({summary.longWinRatePercent}%)
                </span>
                <span className="text-xs font-mono font-bold text-white block">
                  S: {summary.shortTrades} ({summary.shortWinRatePercent}%)
                </span>
              </div>

              <div className="bg-[#141A29] p-4 rounded-xl border border-[#1E2638]">
                <span className="text-[11px] text-[#7B849B] block">Профит-фактор</span>
                <span
                  className={`text-xl font-mono font-bold mt-1 block ${
                    summary.profitFactor >= 1.5 ? "text-emerald-400" : summary.profitFactor >= 1.0 ? "text-sky-400" : "text-rose-400"
                  }`}
                >
                  {summary.profitFactor}
                </span>
                <span className="text-[10px] text-[#7B849B]">
                  +${summary.grossProfitDollar} / -${summary.grossLossDollar}
                </span>
              </div>

              <div className="bg-[#141A29] p-4 rounded-xl border border-[#1E2638]">
                <span className="text-[11px] text-[#7B849B] block">Чистая доходность</span>
                <span
                  className={`text-xl font-mono font-bold mt-1 block ${
                    summary.netProfitDollar >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {summary.netProfitDollar >= 0 ? "+" : ""}${summary.netProfitDollar.toLocaleString()}
                </span>
                <span className="text-[10px] text-[#7B849B]">
                  {summary.netProfitPercent}% общая
                </span>
              </div>

              <div className="bg-[#141A29] p-4 rounded-xl border border-[#1E2638]">
                <span className="text-[11px] text-[#7B849B] block">Матожидание</span>
                <span className={`text-xl font-mono font-bold mt-1 block ${summary.expectancyDollar >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {summary.expectancyDollar >= 0 ? "+" : ""}${summary.expectancyDollar}
                </span>
                <span className="text-[10px] text-[#7B849B]">
                  {summary.expectancyR}R на сделку
                </span>
              </div>

              <div className="bg-[#141A29] p-4 rounded-xl border border-[#1E2638]">
                <span className="text-[11px] text-[#7B849B] block">Макс. просадка</span>
                <span className="text-xl font-mono font-bold text-rose-400 mt-1 block">
                  -{summary.maxDrawdownPercent}%
                </span>
                <span className="text-[10px] text-[#7B849B]">
                  Шарп: {summary.sharpeRatio} • Сортино: {summary.sortinoRatio ?? "-"}
                </span>
              </div>
            </div>

            {/* Extended Quantitative Metrics Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
              <div className="bg-[#141A29] p-3 rounded-lg border border-[#1E2638] flex items-center justify-between">
                <span className="text-[#7B849B]">Серии побед/поражений:</span>
                <span className="text-white font-bold">
                  {summary.maxConsecutiveWins ?? 0}W / {summary.maxConsecutiveLosses ?? 0}L
                </span>
              </div>

              <div className="bg-[#141A29] p-3 rounded-lg border border-[#1E2638] flex items-center justify-between">
                <span className="text-[#7B849B]">Ср. длительность сделки:</span>
                <span className="text-white font-bold">
                  {summary.averageTradeDurationHours ?? 0} ч
                </span>
              </div>

              <div className="bg-[#141A29] p-3 rounded-lg border border-[#1E2638] flex items-center justify-between">
                <span className="text-[#7B849B]">Макс. прибыль сделки:</span>
                <span className="text-emerald-400 font-bold">
                  +${summary.largestWinDollar ?? 0}
                </span>
              </div>

              <div className="bg-[#141A29] p-3 rounded-lg border border-[#1E2638] flex items-center justify-between">
                <span className="text-[#7B849B]">Макс. убыток сделки:</span>
                <span className="text-rose-400 font-bold">
                  -${summary.largestLossDollar ?? 0}
                </span>
              </div>
            </div>

            {/* Equity Curve Visualizer */}
            <div className="bg-[#141A29] p-5 rounded-xl border border-[#1E2638] space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7B849B]">
                  Кривая капитала Walk-Forward ($10,000 стартовый депозит)
                </h3>
                <span className="text-xs font-mono text-emerald-400">
                  Итоговый капитал: ${summary.finalBalance.toLocaleString()}
                </span>
              </div>

              <div className="h-44 w-full pt-2">
                <svg className="w-full h-full overflow-visible" preserveAspectRatio="none">
                  {(() => {
                    const curve = summary.equityCurve;
                    if (curve.length < 2) return null;
                    const minEq = Math.min(...curve.map((c) => c.equity)) * 0.98;
                    const maxEq = Math.max(...curve.map((c) => c.equity)) * 1.02;
                    const range = maxEq - minEq || 1;

                    const points = curve
                      .map((pt, idx) => {
                        const x = (idx / (curve.length - 1)) * 100;
                        const y = 100 - ((pt.equity - minEq) / range) * 100;
                        return `${x},${y}`;
                      })
                      .join(" ");

                    return (
                      <polyline
                        fill="none"
                        stroke="#38BDF8"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={points}
                      />
                    );
                  })()}
                </svg>
              </div>
            </div>

            {/* Detailed Historical Trade Log */}
            <div className="bg-[#141A29] rounded-xl border border-[#1E2638] overflow-hidden">
              <div className="p-4 border-b border-[#1E2638] flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7B849B]">
                  Журнал сделок ({summary.trades.length} исполненных сетапов)
                </h3>
                <span className="text-xs text-[#7B849B]">
                  Реалистичные комиссии ({takerFeePercent}%) и проскальзывание ({slippagePercent}%)
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-[#0E131F] text-[#7B849B] border-b border-[#1E2638]">
                    <tr>
                      <th className="p-3">Инструмент</th>
                      <th className="p-3">Тип</th>
                      <th className="p-3">Исход</th>
                      <th className="p-3">Цена входа</th>
                      <th className="p-3">Цена выхода</th>
                      <th className="p-3">Чистый PnL ($)</th>
                      <th className="p-3">R-кратность</th>
                      <th className="p-3">Причина выхода</th>
                      <th className="p-3">Длительность</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E2638]/50">
                    {summary.trades.map((t) => (
                      <tr key={t.id} className="hover:bg-[#1E2638]/30 transition-colors">
                        <td className="p-3 text-white font-medium">{t.asset}</td>
                        <td className="p-3">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              t.type === "LONG"
                                ? "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                                : "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                            }`}
                          >
                            {t.type}
                          </span>
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              t.result === "WIN"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                            }`}
                          >
                            {t.result === "WIN" ? "ПРИБЫЛЬ" : "УБЫТОК"}
                          </span>
                        </td>
                        <td className="p-3 text-white">${t.entryPrice.toLocaleString()}</td>
                        <td className="p-3 text-white">${t.exitPrice.toLocaleString()}</td>
                        <td
                          className={`p-3 font-bold ${
                            t.pnlDollar >= 0 ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {t.pnlDollar >= 0 ? "+" : ""}${t.pnlDollar}
                        </td>
                        <td className="p-3 text-sky-300">{t.rMultiple}R</td>
                        <td className="p-3 text-[#7B849B]">
                          {t.exitReason === "STOP_LOSS"
                            ? "Стоп-лосс"
                            : t.exitReason === "TP1" || t.exitReason === "TP2" || t.exitReason === "TP3"
                            ? `Тейк-профит (${t.exitReason})`
                            : t.exitReason === "TRAILING_STOP"
                            ? "Трейлинг-стоп"
                            : t.exitReason === "TIMED_OUT"
                            ? "Таймаут"
                            : t.exitReason}
                        </td>
                        <td className="p-3 text-[#7B849B]">{t.durationHours} ч</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
