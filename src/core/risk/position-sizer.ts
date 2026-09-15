import { PositionRiskCalculation, TradingSignal } from "../types";

export interface RiskGuardrailLimits {
  maxRiskPercentagePerTrade: number; // e.g. 2.0%
  maxCorrelatedPositions: number; // e.g. 3
  minimumRewardRisk: number; // e.g. 1.8
  maxLeveragePermitted: number; // e.g. 5x
}

export const DEFAULT_RISK_LIMITS: RiskGuardrailLimits = {
  maxRiskPercentagePerTrade: 2.0,
  maxCorrelatedPositions: 3,
  minimumRewardRisk: 1.8,
  maxLeveragePermitted: 5,
};

export interface RegimeRiskOptions {
  threshold?: number; // default: 25
  normalRiskPercent?: number; // default: 1.5%
  lowAdxRiskPercent?: number; // default: 0.75%
}

/**
 * Returns dynamic regime-specific risk percentage:
 * - ADX >= threshold (trending expansion): 1.5%
 * - ADX < threshold (weak / choppy): 0.75% (reduced risk)
 */
export function getRegimeRiskPercentage(
  adx: number,
  options?: RegimeRiskOptions
): number {
  const threshold = options?.threshold ?? 25;
  const normalRisk = options?.normalRiskPercent ?? 1.5;
  const lowRisk = options?.lowAdxRiskPercent ?? 0.75;
  return adx >= threshold ? normalRisk : lowRisk;
}

/**
 * Calculates strict institutional position size:
 * Position Size Units = (Portfolio Equity * Risk%) / |Entry Price - Stop Loss Price|
 */
export function calculatePositionSize(
  portfolioEquity: number,
  riskPercentage: number,
  entryPrice: number,
  stopLossPrice: number,
  limits: RiskGuardrailLimits = DEFAULT_RISK_LIMITS
): PositionRiskCalculation {
  const sanitizedRiskPct = Math.min(
    Math.max(riskPercentage, 0.25),
    limits.maxRiskPercentagePerTrade
  );

  const riskDollarAmount = portfolioEquity * (sanitizedRiskPct / 100);
  const stopDistance = Math.abs(entryPrice - stopLossPrice);

  if (stopDistance <= 0) {
    throw new Error("Invalid stop loss distance: entry and stop loss cannot be identical");
  }

  const positionUnits = riskDollarAmount / stopDistance;
  const positionNotionalValue = positionUnits * entryPrice;

  // Safe leverage recommendation
  const rawLeverage = positionNotionalValue / portfolioEquity;
  const leverageRecommended = Math.min(
    Math.max(Number(rawLeverage.toFixed(1)), 1.0),
    limits.maxLeveragePermitted
  );

  return {
    portfolioEquity,
    riskPercentage: sanitizedRiskPct,
    riskDollarAmount: Number(riskDollarAmount.toFixed(2)),
    entryPrice,
    stopLossPrice,
    positionUnits: Number(positionUnits.toFixed(4)),
    positionNotionalValue: Number(positionNotionalValue.toFixed(2)),
    leverageRecommended,
    type: entryPrice >= stopLossPrice ? "LONG" : "SHORT",
  };
}

/**
 * Evaluates whether a signal satisfies risk management guidelines
 */
export function evaluateRiskCompliance(
  signal: TradingSignal,
  limits: RiskGuardrailLimits = DEFAULT_RISK_LIMITS
): {
  compliant: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  if (signal.riskRewardRatio < limits.minimumRewardRisk) {
    warnings.push(
      `Risk-Reward ratio (${signal.riskRewardRatio}) is below required minimum threshold (${limits.minimumRewardRisk}R)`
    );
  }

  if (signal.stopLossPercentage > 12.0) {
    warnings.push(
      `Stop loss distance is wide (${signal.stopLossPercentage}%), requiring reduced position size`
    );
  }

  if (signal.marketContext.fundingRate !== null && signal.marketContext.fundingRate > 0.0003) {
    warnings.push("Funding rate is elevated (>0.03%), increasing carry cost for longs");
  }

  return {
    compliant: warnings.length === 0,
    warnings,
  };
}
