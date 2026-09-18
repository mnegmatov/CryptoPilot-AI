"use client";

import React, { useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  Gauge,
  Info,
  Layers,
  Percent,
  Play,
  RefreshCw,
  Shield,
  Sparkles,
  Target,
  Waves,
} from "lucide-react";
import { TradingSignal } from "@/core/types";
import { PositionCalculatorModal } from "./PositionCalculatorModal";

interface SignalDossierProps {
  signal: TradingSignal | null;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  onDeployPaperTrade: (riskPct: number, orderType: "MARKET" | "LIMIT") => void;
  isMobileSheet?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export const SignalDossier: React.FC<SignalDossierProps> = ({
  signal,
  loading,
  error,
  onRetry,
  onDeployPaperTrade,
  isMobileSheet,
  isExpanded,
  onToggleExpand,
}) => {
  const [showCalculator, setShowCalculator] = useState(false);
  const [activeTab, setActiveTab] = useState<"targets" | "telemetry" | "ai">("targets");

  if (loading) {
    return (
      <div className="w-full lg:w-[360px] shrink-0 bg-[#0E131F] lg:border-l border-[#1E2638] p-6 flex flex-col items-center justify-center space-y-4 h-full">
        <div className="h-8 w-8 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
        <div className="text-center">
          <p className="text-xs font-mono text-sky-400 font-medium">
            Генерация количественного сетапа...
          </p>
          <p className="text-[11px] text-[#7B849B] mt-1">
            Оценка ADX, EMA200, снятия ликвидности и динамических целей
          </p>
        </div>
      </div>
    );
  }

  if (error && !signal) {
    return (
      <div className="w-full lg:w-[360px] shrink-0 bg-[#0E131F] lg:border-l border-[#1E2638] p-6 flex flex-col items-center justify-center space-y-4 h-full text-center">
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <AlertTriangle className="h-6 w-6 text-amber-400" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-white">Не удалось рассчитать сигнал</p>
          <p className="text-xs text-[#7B849B] max-w-xs leading-relaxed">{error}</p>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-2 px-4 py-2 bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors flex items-center space-x-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Повторить анализ</span>
          </button>
        )}
      </div>
    );
  }

  if (!signal) {
    return (
      <div className="w-full lg:w-[360px] shrink-0 bg-[#0E131F] lg:border-l border-[#1E2638] p-6 flex flex-col items-center justify-center space-y-3 h-full text-center">
        <div className="text-xs text-[#7B849B]">Выберите торговую пару для расчёта сигнала</div>
      </div>
    );
  }

  const stanceColors: Record<string, { bg: string; text: string; border: string }> = {
    BUY: {
      bg: "bg-emerald-500/10",
      text: "text-emerald-400",
      border: "border-emerald-500/30",
    },
    SHORT: {
      bg: "bg-rose-500/10",
      text: "text-rose-400",
      border: "border-rose-500/30",
    },
    WAIT: {
      bg: "bg-amber-500/10",
      text: "text-amber-400",
      border: "border-amber-500/30",
    },
    AVOID: {
      bg: "bg-slate-500/10",
      text: "text-slate-400",
      border: "border-slate-500/30",
    },
  };

  const currentStance = stanceColors[signal.stance] || stanceColors.WAIT;
  const isShort = signal.stance === "SHORT" || signal.type === "SHORT";
  const isModelD = signal.id.includes("model_d");
  const stanceLabel =
    signal.stance === "BUY"
      ? "СЕТАП: ПОКУПКА"
      : signal.stance === "SHORT"
      ? "СЕТАП: ШОРТ"
      : signal.stance === "WAIT"
      ? "ОЖИДАНИЕ"
      : "ИЗБЕГАТЬ";

  return (
    <div className="w-full lg:w-[360px] shrink-0 bg-[#0E131F] lg:border-l border-[#1E2638] flex flex-col h-full overflow-hidden">
      {/* 1. STICKY EXECUTIVE CARD (Always visible above the fold) */}
      <div className="p-4 border-b border-[#1E2638] bg-[#0E131F] shrink-0 space-y-3">
        {/* Top Status Bar: Stance + R:R + Signal Score */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span
              className={`px-2.5 py-1 rounded text-xs font-mono font-bold tracking-wide uppercase border ${currentStance.bg} ${currentStance.text} ${currentStance.border}`}
            >
              {stanceLabel}
            </span>
            <span className="text-[11px] font-mono text-[#7B849B] bg-[#141A29] px-2 py-0.5 rounded border border-[#1E2638]">
              R:R {signal.riskRewardRatio}R
            </span>
          </div>

          {/* Confluence Score Pill */}
          <div
            className="flex items-center space-x-1.5 bg-[#141A29] px-2.5 py-1 rounded border border-[#1E2638]"
            title="Детерминированный скор сетапа (0-100)"
          >
            <span className="text-[10px] text-[#7B849B] uppercase font-semibold">Скор:</span>
            <span
              className={`text-xs font-mono font-bold ${
                signal.confidenceScore >= 70
                  ? "text-emerald-400"
                  : signal.confidenceScore >= 50
                  ? "text-amber-400"
                  : "text-rose-400"
              }`}
            >
              {signal.confidenceScore}/100
            </span>
          </div>
        </div>

        {/* Asset Title & Live Price */}
        <div className="flex items-baseline justify-between">
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="text-lg font-bold text-white tracking-tight">
                {signal.asset.replace("USDT", "")}
              </span>
              <span className="text-xs text-[#7B849B]">/USDT</span>
            </div>
            <div className="text-[10px] text-[#7B849B] space-x-1 font-mono mt-0.5">
              <span>1H: <span className="text-white font-medium">{signal.marketStructure.trendLTF}</span></span>
              <span>•</span>
              <span>4H: <span className="text-white font-medium">{signal.marketStructure.trendHTF}</span></span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-base font-mono font-bold text-white">
              ${signal.currentPrice > 1
                ? signal.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : signal.currentPrice.toFixed(4)}
            </div>
            <div className="text-[10px] text-[#7B849B]">Текущая цена</div>
          </div>
        </div>

        {/* Executive Execution Parameters Box (Entry & Stop Loss) */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          {/* Entry Range */}
          <div className="bg-[#141A29] p-2.5 rounded-lg border border-[#1E2638]">
            <div className="text-[10px] text-[#7B849B] uppercase font-semibold">Вход</div>
            <div className="text-xs font-mono font-bold text-sky-400 truncate mt-0.5">
              ${signal.entryRange.ideal.toLocaleString()}
            </div>
            <div className="text-[10px] text-[#7B849B] truncate font-mono">
              ${signal.entryRange.min.toLocaleString()} - ${signal.entryRange.max.toLocaleString()}
            </div>
          </div>

          {/* Stop Loss */}
          <div className="bg-[#141A29] p-2.5 rounded-lg border border-[#1E2638]">
            <div className="text-[10px] text-[#7B849B] uppercase font-semibold">Стоп-лосс</div>
            <div className="text-xs font-mono font-bold text-rose-400 truncate mt-0.5">
              ${signal.stopLoss.toLocaleString()}
            </div>
            <div className="text-[10px] text-rose-400/80 font-mono">
              {signal.stopLossPercentage}% риск
            </div>
          </div>
        </div>

        {/* Primary Action Button (Prominent, High-Contrast, Instantly Actionable) */}
        <button
          onClick={() => setShowCalculator(true)}
          className={`w-full flex items-center justify-center space-x-2 py-2.5 px-3 rounded-lg text-xs font-bold uppercase tracking-wider text-white transition-all shadow-md ${
            isShort
              ? "bg-rose-500 hover:bg-rose-600 shadow-rose-500/20 active:scale-[0.99]"
              : "bg-sky-500 hover:bg-sky-600 shadow-sky-500/20 active:scale-[0.99]"
          }`}
        >
          <Play className="h-3.5 w-3.5 fill-white" />
          <span>Рассчитать объем и открыть {isShort ? "ШОРТ" : "ЛОНГ"}</span>
        </button>
      </div>

      {/* 2. SEGMENTED TABS SWITCHER */}
      <div className="flex border-b border-[#1E2638] bg-[#0A0E17] shrink-0 text-xs font-mono">
        <button
          onClick={() => setActiveTab("targets")}
          className={`flex-1 py-2.5 text-center font-medium border-b-2 transition-colors ${
            activeTab === "targets"
              ? "border-sky-500 text-sky-400 bg-[#141A29]/60 font-semibold"
              : "border-transparent text-[#7B849B] hover:text-white"
          }`}
        >
          <span>Цели</span>
          <span className="ml-1 text-[10px] opacity-70">({signal.takeProfitTargets.length})</span>
        </button>
        <button
          onClick={() => setActiveTab("telemetry")}
          className={`flex-1 py-2.5 text-center font-medium border-b-2 transition-colors ${
            activeTab === "telemetry"
              ? "border-sky-500 text-sky-400 bg-[#141A29]/60 font-semibold"
              : "border-transparent text-[#7B849B] hover:text-white"
          }`}
        >
          <span>Телеметрия</span>
        </button>
        <button
          onClick={() => setActiveTab("ai")}
          className={`flex-1 py-2.5 text-center font-medium border-b-2 transition-colors flex items-center justify-center space-x-1 ${
            activeTab === "ai"
              ? "border-sky-500 text-sky-400 bg-[#141A29]/60 font-semibold"
              : "border-transparent text-[#7B849B] hover:text-white"
          }`}
        >
          <Sparkles className="h-3 w-3" />
          <span>AI Тезис</span>
        </button>
      </div>

      {/* 3. TAB CONTENT AREA (Scrollable) */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
        {/* TAB 1: TARGETS & MILESTONES */}
        {activeTab === "targets" && (
          <div className="space-y-2.5">
            {isModelD && (
              <div className="p-2.5 rounded bg-sky-500/10 border border-sky-500/20 text-[11px] text-sky-300 flex items-start space-x-2">
                <span className="font-semibold shrink-0">Model D:</span>
                <span className="leading-relaxed">
                  Выход строго по структурному трейлинг-стопу (5 свечей). Рубежи +3R и +6R являются ориентирами (Milestones / R-multiples), а не фиксированными тейк-профитами.
                </span>
              </div>
            )}

            <div className="bg-[#141A29] rounded-lg border border-[#1E2638] divide-y divide-[#1E2638]/70 overflow-hidden text-xs">
              {signal.takeProfitTargets.map((tp) => (
                <div key={tp.level} className="p-2.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span
                        className={`font-mono text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                          isModelD
                            ? "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                            : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        }`}
                      >
                        {isModelD ? `Рубеж +${tp.rewardRisk}R` : `ТП${tp.level}`}
                      </span>
                      <span className="text-white font-mono font-semibold">
                        ${tp.price.toLocaleString()}
                      </span>
                    </div>
                    <div className="text-right font-mono">
                      <span className={`font-bold ${isModelD ? "text-sky-400" : "text-emerald-400"}`}>
                        +{tp.percentage}%
                      </span>
                      <span className="text-[10px] text-[#7B849B] ml-1">
                        ({tp.rewardRisk}R)
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-[#7B849B]">
                    <span>{tp.description}</span>
                    {tp.targetReason && (
                      <span className="text-sky-400/80 italic">{tp.targetReason}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 2: QUANT TELEMETRY & INVALIDATION */}
        {activeTab === "telemetry" && (
          <div className="space-y-3">
            {/* Quantitative Badges Grid */}
            <div className="grid grid-cols-2 gap-2">
              <div
                className={`p-2 rounded border text-xs font-mono flex items-center justify-between ${
                  signal.technicalSummary.adx14 >= 20
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                    : "bg-amber-500/10 border-amber-500/30 text-amber-400"
                }`}
                title="ADX >= 20 подтверждает наличие тренда"
              >
                <div className="flex items-center space-x-1.5">
                  <Gauge className="h-3 w-3" />
                  <span className="text-[#7B849B]">ADX(14):</span>
                </div>
                <span className="font-bold">{signal.technicalSummary.adx14}</span>
              </div>

              <div className="p-2 rounded border border-[#1E2638] bg-[#141A29] text-xs font-mono flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <Activity className="h-3 w-3 text-indigo-400" />
                  <span className="text-[#7B849B]">RSI:</span>
                </div>
                <span className="text-white font-bold">{signal.technicalSummary.rsi14}</span>
              </div>

              {signal.technicalSummary.ema200 > 0 && (
                <div className="p-2 rounded border border-[#1E2638] bg-[#141A29] text-xs font-mono col-span-2 flex items-center justify-between">
                  <span className="text-[#7B849B]">4H EMA200:</span>
                  <span className="text-white font-mono font-semibold">
                    ${signal.technicalSummary.ema200 > 1 ? signal.technicalSummary.ema200.toLocaleString(undefined, { maximumFractionDigits: 2 }) : signal.technicalSummary.ema200.toFixed(4)}
                  </span>
                </div>
              )}

              {signal.marketStructure.liquiditySweep && (
                <div className="p-2 rounded border border-amber-400/20 bg-amber-400/10 text-amber-300 text-xs font-mono col-span-2 flex items-center space-x-1.5">
                  <Waves className="h-3.5 w-3.5" />
                  <span>Ликвидность: {signal.marketStructure.liquiditySweep.type.replace(/_/g, " ")}</span>
                </div>
              )}
            </div>

            {/* Invalidation Conditions List */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-[#7B849B] flex items-center space-x-1 uppercase tracking-wider">
                <AlertTriangle className="h-3 w-3 text-amber-400" />
                <span>Условия отмены сетапа:</span>
              </div>
              <ul className="space-y-1.5">
                {signal.invalidationConditions.map((cond, idx) => (
                  <li
                    key={idx}
                    className="text-xs text-[#E2E8F0] flex items-start space-x-2 bg-[#141A29] p-2.5 rounded border border-[#1E2638]"
                  >
                    <span className="text-rose-400 font-bold mt-0.5">•</span>
                    <span className="leading-relaxed">{cond}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* TAB 3: INSTITUTIONAL AI THESIS */}
        {activeTab === "ai" && (
          <div className="space-y-2.5">
            {signal.aiExplanation ? (
              <div className="space-y-2.5 text-xs leading-relaxed text-[#CBD5E1]">
                <div className="bg-[#141A29] p-3 rounded-lg border border-[#1E2638] space-y-1">
                  <span className="text-[10px] font-semibold text-sky-400 uppercase tracking-wide block">
                    Главный тезис сетапа
                  </span>
                  <p>{signal.aiExplanation.thesis}</p>
                </div>

                <div className="bg-[#141A29] p-3 rounded-lg border border-[#1E2638] space-y-1">
                  <span className="text-[10px] font-semibold text-sky-400 uppercase tracking-wide block">
                    Почему сформирован сигнал
                  </span>
                  <p>{signal.aiExplanation.whySetupExists}</p>
                </div>

                <div className="bg-[#141A29] p-3 rounded-lg border border-[#1E2638] space-y-1">
                  <span className="text-[10px] font-semibold text-sky-400 uppercase tracking-wide block">
                    Тактический план исполнения
                  </span>
                  <p>{signal.aiExplanation.executionPlan}</p>
                </div>
              </div>
            ) : (
              <div className="p-4 text-center text-xs text-[#7B849B]">
                Анализ формируется на базе детерминированных метрик...
              </div>
            )}
          </div>
        )}
      </div>

      {/* Position Sizer Modal */}
      <PositionCalculatorModal
        signal={signal}
        isOpen={showCalculator}
        onClose={() => setShowCalculator(false)}
        onDeploy={onDeployPaperTrade}
      />
    </div>
  );
};
