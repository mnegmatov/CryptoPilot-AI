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
}

export const SignalDossier: React.FC<SignalDossierProps> = ({
  signal,
  loading,
  error,
  onRetry,
  onDeployPaperTrade,
}) => {
  const [showCalculator, setShowCalculator] = useState(false);

  if (loading) {
    return (
      <div className="w-full lg:w-[460px] bg-[#0E131F] lg:border-l border-[#1E2638] p-6 flex flex-col items-center justify-center space-y-4 h-full lg:h-[calc(100vh-4rem)]">
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
      <div className="w-full lg:w-[460px] bg-[#0E131F] lg:border-l border-[#1E2638] p-6 flex flex-col items-center justify-center space-y-4 h-full lg:h-[calc(100vh-4rem)] text-center">
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
      <div className="w-full lg:w-[460px] bg-[#0E131F] lg:border-l border-[#1E2638] p-6 flex flex-col items-center justify-center space-y-3 h-full lg:h-[calc(100vh-4rem)] text-center">
        <div className="text-xs text-[#7B849B]">Выберите торговую пару для расчёта сигнала</div>
      </div>
    );
  }


  const stanceColors: Record<string, { bg: string; pill: string; border: string }> = {
    BUY: {
      bg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
      pill: "bg-emerald-500 text-black",
      border: "border-emerald-500/20",
    },
    SHORT: {
      bg: "bg-rose-500/10 text-rose-400 border-rose-500/30",
      pill: "bg-rose-500 text-white",
      border: "border-rose-500/20",
    },
    WAIT: {
      bg: "bg-amber-500/10 text-amber-400 border-amber-500/30",
      pill: "bg-amber-500 text-black",
      border: "border-amber-500/20",
    },
    AVOID: {
      bg: "bg-slate-500/10 text-slate-400 border-slate-500/30",
      pill: "bg-slate-600 text-white",
      border: "border-slate-500/20",
    },
  };

  const currentStance = stanceColors[signal.stance] || stanceColors.WAIT;
  const isShort = signal.stance === "SHORT" || signal.type === "SHORT";
  const stanceLabel =
    signal.stance === "BUY"
      ? "СЕТАП: ПОКУПКА"
      : signal.stance === "SHORT"
      ? "СЕТАП: ШОРТ"
      : signal.stance === "WAIT"
      ? "СЕТАП: ОЖИДАНИЕ"
      : "СЕТАП: ИЗБЕГАТЬ";

  return (
    <div className="w-full lg:w-[460px] bg-[#0E131F] lg:border-l border-[#1E2638] flex flex-col h-full lg:h-[calc(100vh-4rem)] overflow-y-auto">
      {/* Setup Top Header */}
      <div className="p-5 border-b border-[#1E2638] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <span
              className={`px-3 py-1 rounded-md text-xs font-bold font-mono tracking-wider uppercase border shadow-sm ${currentStance.bg}`}
            >
              {stanceLabel}
            </span>
            <span className="text-xs font-mono text-[#7B849B]">
              R:R {signal.riskRewardRatio}R
            </span>
          </div>

          {/* Confidence Score Pill */}
          <div className="flex items-center space-x-2 bg-[#141A29] px-2.5 py-1 rounded-full border border-[#1E2638]">
            <span className="text-[11px] text-[#7B849B]">Уверенность:</span>
            <span
              className={`text-xs font-mono font-bold ${
                signal.confidenceScore >= 70
                  ? "text-emerald-400"
                  : signal.confidenceScore >= 50
                  ? "text-amber-400"
                  : "text-rose-400"
              }`}
            >
              {signal.confidenceScore}%
            </span>
          </div>
        </div>

        {/* Current Asset & Price */}
        <div className="flex items-baseline justify-between pt-1">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              {signal.asset.replace("USDT", "")}
              <span className="text-[#7B849B] text-sm ml-1 font-normal">/USDT</span>
            </h2>
            <p className="text-[11px] text-[#7B849B]">
              Старший ТФ: <span className="text-white font-medium">{signal.marketStructure.trendHTF}</span> • Младший ТФ: <span className="text-white font-medium">{signal.marketStructure.trendLTF}</span>
            </p>
          </div>
          <div className="text-right">
            <div className="text-xl font-mono font-bold text-white">
              ${signal.currentPrice > 1 ? signal.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : signal.currentPrice.toFixed(4)}
            </div>
            <p className="text-[11px] font-mono text-[#7B849B]">Текущая рыночная цена</p>
          </div>
        </div>

        {/* Quant Telemetry Badges (ADX & Liquidity) */}
        <div className="flex flex-wrap gap-2 pt-1">
          <div className="flex items-center space-x-1.5 bg-[#141A29] px-2 py-1 rounded text-[11px] font-mono border border-[#1E2638]">
            <Gauge className="h-3 w-3 text-sky-400" />
            <span className="text-[#7B849B]">ADX(14):</span>
            <span className={signal.technicalSummary.adx14 >= 20 ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
              {signal.technicalSummary.adx14}
            </span>
          </div>

          <div className="flex items-center space-x-1.5 bg-[#141A29] px-2 py-1 rounded text-[11px] font-mono border border-[#1E2638]">
            <Activity className="h-3 w-3 text-indigo-400" />
            <span className="text-[#7B849B]">RSI:</span>
            <span className="text-white">{signal.technicalSummary.rsi14}</span>
          </div>

          {signal.marketStructure.liquiditySweep && (
            <div className="flex items-center space-x-1.5 bg-amber-400/10 text-amber-300 px-2 py-1 rounded text-[10px] font-mono border border-amber-400/20">
              <Waves className="h-3 w-3" />
              <span>{signal.marketStructure.liquiditySweep.type.replace(/_/g, " ")}</span>
            </div>
          )}
        </div>
      </div>

      {/* Trade Execution Levels Matrix */}
      <div className="p-5 border-b border-[#1E2638] space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7B849B] flex items-center space-x-1.5">
          <Target className="h-3.5 w-3.5 text-sky-400" />
          <span>Параметры исполнения ({isShort ? "ШОРТ / ПРОДАЖА" : "ЛОНГ / ПОКУПКА"})</span>
        </h3>

        <div className="grid grid-cols-2 gap-3">
          {/* Entry Range */}
          <div className="bg-[#141A29] p-3 rounded-lg border border-[#1E2638]">
            <div className="text-[11px] text-[#7B849B]">Зона входа</div>
            <div className="text-xs font-mono font-bold text-sky-400 mt-0.5">
              ${signal.entryRange.min.toLocaleString()} - ${signal.entryRange.max.toLocaleString()}
            </div>
            <div className="text-[10px] text-[#7B849B] mt-0.5">
              Оптимально: ${signal.entryRange.ideal.toLocaleString()}
            </div>
          </div>

          {/* Stop Loss */}
          <div className="bg-[#141A29] p-3 rounded-lg border border-[#1E2638]">
            <div className="text-[11px] text-[#7B849B]">
              Стоп-лосс ({isShort ? "Выше сопротивления" : "Ниже поддержки"})
            </div>
            <div className="text-xs font-mono font-bold text-rose-400 mt-0.5">
              ${signal.stopLoss.toLocaleString()}
            </div>
            <div className="text-[10px] text-rose-400/80 mt-0.5">
              {signal.stopLossPercentage}% дистанция риска
            </div>
          </div>
        </div>

        {/* Take Profit Target Ladder with Rationale */}
        <div className="bg-[#141A29] rounded-lg border border-[#1E2638] divide-y divide-[#1E2638]/70 overflow-hidden text-xs">
          {signal.takeProfitTargets.map((tp) => (
            <div key={tp.level} className="p-3 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-[11px] px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 rounded font-semibold">
                    ТП{tp.level}
                  </span>
                  <span className="text-white font-mono font-semibold">
                    ${tp.price.toLocaleString()}
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-mono font-bold text-emerald-400">
                    +{tp.percentage}%
                  </span>
                  <span className="text-[10px] text-[#7B849B] ml-1.5 font-mono">
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

      {/* Invalidation Conditions */}
      <div className="p-5 border-b border-[#1E2638] space-y-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7B849B] flex items-center space-x-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
          <span>Условия отмены сетапа</span>
        </h3>
        <ul className="space-y-1.5">
          {signal.invalidationConditions.map((cond, idx) => (
            <li
              key={idx}
              className="text-xs text-[#E2E8F0] flex items-start space-x-2 bg-[#141A29]/60 p-2 rounded border border-[#1E2638]"
            >
              <span className="text-rose-400 font-bold mt-0.5">•</span>
              <span className="leading-relaxed">{cond}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* AI Analyst Institutional Commentary */}
      <div className="p-5 space-y-3.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7B849B] flex items-center space-x-1.5">
            <Bot className="h-3.5 w-3.5 text-indigo-400" />
            <span>Институциональный тезис AI</span>
          </h3>
          <span className="text-[10px] text-indigo-300/80 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 flex items-center space-x-1">
            <Sparkles className="h-3 w-3" />
            <span>Обоснованный анализ</span>
          </span>
        </div>

        {signal.aiExplanation && (
          <div className="space-y-3 text-xs leading-relaxed text-[#CBD5E1]">
            <div className="bg-[#141A29] p-3.5 rounded-lg border border-[#1E2638] space-y-1.5">
              <span className="text-[11px] font-semibold text-sky-400 uppercase tracking-wide block">
                Главный тезис сетапа
              </span>
              <p>{signal.aiExplanation.thesis}</p>
            </div>

            <div className="bg-[#141A29] p-3.5 rounded-lg border border-[#1E2638] space-y-1.5">
              <span className="text-[11px] font-semibold text-sky-400 uppercase tracking-wide block">
                Почему сформирован сигнал
              </span>
              <p>{signal.aiExplanation.whySetupExists}</p>
            </div>

            <div className="bg-[#141A29] p-3.5 rounded-lg border border-[#1E2638] space-y-1.5">
              <span className="text-[11px] font-semibold text-sky-400 uppercase tracking-wide block">
                План тактического исполнения
              </span>
              <p>{signal.aiExplanation.executionPlan}</p>
            </div>
          </div>
        )}

        {/* Action Button */}
        <div className="pt-2">
          <button
            onClick={() => setShowCalculator(true)}
            className={`w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-xl text-xs font-bold uppercase tracking-wider text-white transition-all shadow-lg ${
              isShort
                ? "bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-400 hover:to-red-500 shadow-rose-500/25"
                : "bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 shadow-sky-500/25"
            }`}
          >
            <Play className="h-4 w-4 fill-white" />
            <span>Рассчитать объем и открыть {isShort ? "ШОРТ" : "ЛОНГ"}</span>
          </button>
        </div>
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
