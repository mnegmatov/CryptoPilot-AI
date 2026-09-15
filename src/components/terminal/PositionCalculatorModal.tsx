"use client";

import React, { useState } from "react";
import { AlertCircle, Check, DollarSign, ShieldAlert, X } from "lucide-react";
import { calculatePositionSize } from "@/core/risk/position-sizer";
import { TradingSignal } from "@/core/types";

interface PositionCalculatorModalProps {
  signal: TradingSignal;
  isOpen: boolean;
  onClose: () => void;
  onDeploy: (riskPct: number, orderType: "MARKET" | "LIMIT") => void;
}

export const PositionCalculatorModal: React.FC<PositionCalculatorModalProps> = ({
  signal,
  isOpen,
  onClose,
  onDeploy,
}) => {
  const [equity, setEquity] = useState<number>(10000);
  const [riskPercentage, setRiskPercentage] = useState<number>(1.5);
  const [orderType, setOrderType] = useState<"MARKET" | "LIMIT">("MARKET");

  if (!isOpen) return null;

  const isShort = signal.stance === "SHORT" || signal.type === "SHORT";
  const entryPrice = orderType === "MARKET" ? signal.currentPrice : signal.entryRange.ideal;
  const sizing = calculatePositionSize(equity, riskPercentage, entryPrice, signal.stopLoss);

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#141A29] border border-[#1E2638] rounded-xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 border-b border-[#1E2638] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <ShieldAlert className={`h-4 w-4 ${isShort ? "text-rose-400" : "text-sky-400"}`} />
              <span>Калькулятор риск-менеджмента ({isShort ? "ШОРТ / ПРОДАЖА" : "ЛОНГ / ПОКУПКА"})</span>
            </h3>
            <p className="text-xs text-[#7B849B]">
              Институциональное распределение капитала для {signal.asset}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[#7B849B] hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Order Type Selector */}
          <div>
            <label className="text-xs text-[#7B849B] block mb-1.5 font-medium">
              Тип ордера
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOrderType("MARKET")}
                className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-all ${
                  orderType === "MARKET"
                    ? isShort
                      ? "bg-rose-500/20 border-rose-500 text-rose-300"
                      : "bg-sky-500/20 border-sky-500 text-sky-300"
                    : "bg-[#0B0E14] border-[#1E2638] text-[#7B849B] hover:text-white"
                }`}
              >
                По рынку (${signal.currentPrice.toLocaleString()})
              </button>
              <button
                type="button"
                onClick={() => setOrderType("LIMIT")}
                className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-all ${
                  orderType === "LIMIT"
                    ? isShort
                      ? "bg-rose-500/20 border-rose-500 text-rose-300"
                      : "bg-sky-500/20 border-sky-500 text-sky-300"
                    : "bg-[#0B0E14] border-[#1E2638] text-[#7B849B] hover:text-white"
                }`}
              >
                Лимитный откат (${signal.entryRange.ideal.toLocaleString()})
              </button>
            </div>
          </div>

          {/* Equity & Risk % Inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#7B849B] block mb-1 font-medium">
                Баланс депозита ($)
              </label>
              <input
                type="number"
                value={equity}
                onChange={(e) => setEquity(Math.max(100, Number(e.target.value)))}
                className="w-full bg-[#0B0E14] border border-[#1E2638] rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="text-xs text-[#7B849B] block mb-1 font-medium">
                Риск на сделку (%)
              </label>
              <select
                value={riskPercentage}
                onChange={(e) => setRiskPercentage(Number(e.target.value))}
                className="w-full bg-[#0B0E14] border border-[#1E2638] rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-sky-500"
              >
                <option value={0.5}>0.5% (Консервативный)</option>
                <option value={1.0}>1.0% (Стандартный)</option>
                <option value={1.5}>1.5% (Профессиональный)</option>
                <option value={2.0}>2.0% (Агрессивный максимум)</option>
              </select>
            </div>
          </div>

          {/* Calculated Output Telemetry */}
          <div className="bg-[#0B0E14] p-4 rounded-xl border border-[#1E2638] space-y-2.5 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-[#7B849B]">Сторона / Направление:</span>
              <span className={`font-bold ${isShort ? "text-rose-400" : "text-emerald-400"}`}>
                {isShort ? "ШОРТ (ПРОДАЖА)" : "ЛОНГ (ПОКУПКА)"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#7B849B]">Риск в $ на стопе:</span>
              <span className="text-rose-400 font-bold">
                -${sizing.riskDollarAmount} ({sizing.riskPercentage}%)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#7B849B]">Цена стоп-лосса:</span>
              <span className="text-white">
                ${signal.stopLoss.toLocaleString()} ({signal.stopLossPercentage}%)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#7B849B]">Размер позиции:</span>
              <span className="text-sky-400 font-bold">
                {sizing.positionUnits} {signal.asset.replace("USDT", "")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#7B849B]">Номинальная стоимость:</span>
              <span className="text-white">
                ${sizing.positionNotionalValue.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between pt-1 border-t border-[#1E2638]">
              <span className="text-[#7B849B]">Эффективное плечо:</span>
              <span className="text-emerald-400 font-bold">
                {sizing.leverageRecommended}x
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2 text-[11px] text-amber-400/90 bg-amber-400/10 p-2.5 rounded-lg border border-amber-400/20">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              Ордера исполняются в симуляторе демо-торговли. Торговля на реальные средства отключена.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#0E131F] border-t border-[#1E2638] flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium text-[#7B849B] hover:text-white transition-colors"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => {
              onDeploy(riskPercentage, orderType);
              onClose();
            }}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-all shadow-lg ${
              isShort
                ? "bg-rose-600 hover:bg-rose-500 shadow-rose-600/20"
                : "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20"
            }`}
          >
            <Check className="h-4 w-4" />
            <span>Разместить в демо-трейдер</span>
          </button>
        </div>
      </div>
    </div>
  );
};
