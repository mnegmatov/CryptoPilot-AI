import { RawHistoricalCandle, ResearchTrade, MarketRegimeClassification } from "../types";
import { calculateEMA, calculateATR, calculateADX } from "../../core/quant/indicators";

export interface RegimeAttributionRecord {
  regime: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  netPnl: number;
  profitFactor: number;
  averageR: number;
  expectancyDollar: number;
}

export interface MarketRegimeAttribution {
  trendBreakdown: {
    bull: RegimeAttributionRecord;
    bear: RegimeAttributionRecord;
    chop: RegimeAttributionRecord;
  };
  volatilityBreakdown: {
    high: RegimeAttributionRecord;
    normal: RegimeAttributionRecord;
    low: RegimeAttributionRecord;
  };
  combinedMatrix: Record<string, RegimeAttributionRecord>;
}

/**
 * Classifies every candle in the historical dataset into macro trend and volatility regimes.
 *
 * Regimes:
 * 1. Trend:
 *    - BULL: Sustained period where 4H Close > EMA200 and ADX14 >= 20.
 *    - BEAR: Sustained period where 4H Close < EMA200 and ADX14 >= 20.
 *    - CHOP: ADX14 < 20 or >= 2 crossings of EMA200 within last 20 bars.
 * 2. Volatility:
 *    - HIGH: ATR14 / Close in top 20th percentile (>= 80th percentile) of dataset.
 *    - LOW: ATR14 / Close in bottom 20th percentile (<= 20th percentile) of dataset.
 *    - NORMAL: 20th to 80th percentile.
 */
export function classifyCandleRegimes(
  candles: RawHistoricalCandle[]
): MarketRegimeClassification[] {
  const n = candles.length;
  if (n === 0) return [];

  const closes = candles.map((c) => c.close);
  const ema200 = calculateEMA(closes, 200);
  const atr14 = calculateATR(candles, 14);
  const adxResult = calculateADX(candles, 14);
  const adx14 = adxResult.adx;

  // Compute normalized ATR ratios for percentile calculation
  const atrPcts: number[] = [];
  for (let i = 200; i < n; i++) {
    const c = candles[i].close;
    const a = atr14[i];
    if (!isNaN(a) && c > 0) {
      atrPcts.push(a / c);
    }
  }

  atrPcts.sort((a, b) => a - b);
  const p20 = atrPcts.length > 0 ? atrPcts[Math.floor(atrPcts.length * 0.2)] : 0.015;
  const p80 = atrPcts.length > 0 ? atrPcts[Math.floor(atrPcts.length * 0.8)] : 0.035;

  const classifications: MarketRegimeClassification[] = [];

  for (let i = 0; i < n; i++) {
    if (i < 200) {
      // Warmup fallback
      classifications.push({
        trend: "CHOP",
        volatility: "NORMAL",
        adx14: 20,
        ema200DistancePercent: 0,
      });
      continue;
    }

    const close = closes[i];
    const e200 = ema200[i] || close;
    const adx = isNaN(adx14[i]) ? 20 : adx14[i];
    const atr = atr14[i] || close * 0.02;
    const atrPct = atr / close;

    // Detect EMA200 crossings in the last 20 bars (bars i-19 .. i)
    let crossings = 0;
    const windowStart = Math.max(1, i - 19);
    for (let k = windowStart; k <= i; k++) {
      const prevDiff = closes[k - 1] - ema200[k - 1];
      const currDiff = closes[k] - ema200[k];
      if (prevDiff * currDiff < 0) {
        crossings++;
      }
    }

    // Trend classification
    let trend: "BULL" | "BEAR" | "CHOP" = "CHOP";
    if (crossings >= 2 || adx < 20) {
      trend = "CHOP";
    } else if (close > e200 && adx >= 20) {
      trend = "BULL";
    } else if (close < e200 && adx >= 20) {
      trend = "BEAR";
    }

    // Volatility classification
    let volatility: "HIGH" | "NORMAL" | "LOW" = "NORMAL";
    if (atrPct >= p80) {
      volatility = "HIGH";
    } else if (atrPct <= p20) {
      volatility = "LOW";
    }

    const ema200DistancePercent = Number((Math.abs((close - e200) / e200) * 100).toFixed(2));

    classifications.push({
      trend,
      volatility,
      adx14: Number(adx.toFixed(1)),
      ema200DistancePercent,
    });
  }

  return classifications;
}

/**
 * Builds an aggregated attribution record from an array of trades.
 */
function buildRegimeRecord(name: string, trades: ResearchTrade[]): RegimeAttributionRecord {
  const totalTrades = trades.length;
  const winningTrades = trades.filter((t) => t.pnlNet > 0);
  const losingTrades = trades.filter((t) => t.pnlNet < 0);
  const winRate = totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0;

  const netPnl = trades.reduce((sum, t) => sum + t.pnlNet, 0);
  const grossProfit = winningTrades.reduce((sum, t) => sum + t.pnlNet, 0);
  const grossLoss = losingTrades.reduce((sum, t) => sum + Math.abs(t.pnlNet), 0);
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999.99 : 0;

  const averageR = totalTrades > 0 ? trades.reduce((sum, t) => sum + t.rMultiple, 0) / totalTrades : 0;
  const expectancyDollar = totalTrades > 0 ? netPnl / totalTrades : 0;

  return {
    regime: name,
    totalTrades,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    winRate: Number(winRate.toFixed(1)),
    netPnl: Number(netPnl.toFixed(2)),
    profitFactor: Number(profitFactor.toFixed(2)),
    averageR: Number(averageR.toFixed(2)),
    expectancyDollar: Number(expectancyDollar.toFixed(2)),
  };
}

/**
 * Computes performance attribution partitioned by market regime at trade entry.
 */
export function attributePerformanceByRegime(
  trades: ResearchTrade[],
  candleRegimes?: MarketRegimeClassification[]
): MarketRegimeAttribution {
  // Group trades by trend
  const bullTrades: ResearchTrade[] = [];
  const bearTrades: ResearchTrade[] = [];
  const chopTrades: ResearchTrade[] = [];

  // Group trades by volatility
  const highVolTrades: ResearchTrade[] = [];
  const normalVolTrades: ResearchTrade[] = [];
  const lowVolTrades: ResearchTrade[] = [];

  // Combined matrix
  const matrixGroups = new Map<string, ResearchTrade[]>();

  for (const trade of trades) {
    // If candleRegimes provided and entryBarIndex is valid, use precise regime; else fallback to trade.regimeAtEntry
    let regime = trade.regimeAtEntry;
    if (candleRegimes && candleRegimes[trade.entryBarIndex]) {
      regime = candleRegimes[trade.entryBarIndex];
    }

    if (regime.trend === "BULL") bullTrades.push(trade);
    else if (regime.trend === "BEAR") bearTrades.push(trade);
    else chopTrades.push(trade);

    if (regime.volatility === "HIGH") highVolTrades.push(trade);
    else if (regime.volatility === "LOW") lowVolTrades.push(trade);
    else normalVolTrades.push(trade);

    const comboKey = `${regime.trend}_${regime.volatility}`;
    if (!matrixGroups.has(comboKey)) {
      matrixGroups.set(comboKey, []);
    }
    matrixGroups.get(comboKey)!.push(trade);
  }

  const combinedMatrix: Record<string, RegimeAttributionRecord> = {};
  for (const [key, group] of matrixGroups.entries()) {
    combinedMatrix[key] = buildRegimeRecord(key, group);
  }

  return {
    trendBreakdown: {
      bull: buildRegimeRecord("BULL", bullTrades),
      bear: buildRegimeRecord("BEAR", bearTrades),
      chop: buildRegimeRecord("CHOP", chopTrades),
    },
    volatilityBreakdown: {
      high: buildRegimeRecord("HIGH", highVolTrades),
      normal: buildRegimeRecord("NORMAL", normalVolTrades),
      low: buildRegimeRecord("LOW", lowVolTrades),
    },
    combinedMatrix,
  };
}
