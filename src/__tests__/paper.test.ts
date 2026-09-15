import { describe, expect, it } from "vitest";
import { PaperTradingWallet } from "../core/paper/wallet";
import { TradingSignal } from "../core/types";

describe("Paper Trading Engine", () => {
  const mockLongSignal: TradingSignal = {
    id: "test_sig_long",
    asset: "BTCUSDT",
    timestamp: Date.now(),
    stance: "BUY",
    type: "LONG",
    currentPrice: 60000,
    entryRange: { min: 59800, max: 60200, ideal: 60000 },
    stopLoss: 58000,
    stopLossPercentage: 3.33,
    takeProfitTargets: [
      { level: 1, price: 63000, percentage: 5, rewardRisk: 1.5, description: "TP1" },
      { level: 2, price: 66000, percentage: 10, rewardRisk: 3.0, description: "TP2" },
    ],
    riskRewardRatio: 3.0,
    confidenceScore: 85,
    invalidationConditions: ["Close below 58k"],
    technicalSummary: {} as any,
    marketStructure: {} as any,
    marketContext: {} as any,
  };

  const mockShortSignal: TradingSignal = {
    id: "test_sig_short",
    asset: "ETHUSDT",
    timestamp: Date.now(),
    stance: "SHORT",
    type: "SHORT",
    currentPrice: 3000,
    entryRange: { min: 2980, max: 3020, ideal: 3000 },
    stopLoss: 3150,
    stopLossPercentage: 5.0,
    takeProfitTargets: [
      { level: 1, price: 2850, percentage: 5, rewardRisk: 1.0, description: "TP1" },
      { level: 2, price: 2700, percentage: 10, rewardRisk: 2.0, description: "TP2" },
    ],
    riskRewardRatio: 2.0,
    confidenceScore: 80,
    invalidationConditions: ["Close above 3150"],
    technicalSummary: {} as any,
    marketStructure: {} as any,
    marketContext: {} as any,
  };

  it("handles paper LONG trade: open, breakeven ratcheting, and TP exit", () => {
    const wallet = new PaperTradingWallet(10000);
    const pos = wallet.openPositionFromSignal(mockLongSignal, 1.5, "MARKET");

    expect(pos.status).toBe("OPEN");
    expect(pos.type).toBe("LONG");
    expect(pos.breakevenMoved).toBe(false);

    // Update with +1.5R profit (price rises to 63,500)
    wallet.updateMarketPrices("BTCUSDT", 63500);
    const acctMid = wallet.getAccount();
    const updatedPos = acctMid.positions[0];

    expect(updatedPos.breakevenMoved).toBe(true);
    expect(updatedPos.stopLoss).toBe(pos.entryPrice); // Stop moved to breakeven

    // Price reaches TP2 ($66,500)
    const closed = wallet.updateMarketPrices("BTCUSDT", 66500);
    expect(closed.length).toBe(1);
    expect(closed[0].status).toBe("CLOSED");
    expect(closed[0].closeReason).toBe("TAKE_PROFIT_HIT");
    expect(closed[0].realizedPnl).toBeGreaterThan(0);
  });

  it("handles paper SHORT trade: open, price drop profit, and TP exit", () => {
    const wallet = new PaperTradingWallet(10000);
    const pos = wallet.openPositionFromSignal(mockShortSignal, 1.5, "MARKET");

    expect(pos.status).toBe("OPEN");
    expect(pos.type).toBe("SHORT");

    // For short: price dropping to 2800 should be in profit
    wallet.updateMarketPrices("ETHUSDT", 2800);
    const acctMid = wallet.getAccount();
    expect(acctMid.positions[0].unrealizedPnl).toBeGreaterThan(0);

    // Price hits TP ($2690)
    const closed = wallet.updateMarketPrices("ETHUSDT", 2690);
    expect(closed.length).toBe(1);
    expect(closed[0].status).toBe("CLOSED");
    expect(closed[0].closeReason).toBe("TAKE_PROFIT_HIT");
    expect(closed[0].realizedPnl).toBeGreaterThan(0);
  });

  it("handles paper LONG trade with Chandelier ATR trailing stop ratcheting", () => {
    const wallet = new PaperTradingWallet(10000);
    // Open with Chandelier ATR trailing stop (2.5 multiplier)
    const pos = wallet.openPositionFromSignal(mockLongSignal, 1.5, "MARKET", {
      trailingStopType: "CHANDELIER_ATR",
      chandelierMultiplier: 2.5,
    });

    expect(pos.status).toBe("OPEN");
    expect(pos.stopLoss).toBe(58000); // initial stop

    const atr = 800; // ATR = 800 -> 2.5 * 800 = 2000 buffer

    // Price rallies to $64,000 -> highestHigh = 64,000
    // Chandelier stop = 64,000 - 2,000 = 62,000 (> 58,000) -> Stop ratchets up to 62,000!
    wallet.updateMarketPrices("BTCUSDT", 64000, atr);
    const midAcct = wallet.getAccount();
    const updatedPos = midAcct.positions[0];

    expect(updatedPos.stopLoss).toBe(62000);
    expect(updatedPos.trailingStopPrice).toBe(62000);

    // Price then pulls back to 61,500 (below 62,000 stop)
    const closed = wallet.updateMarketPrices("BTCUSDT", 61500, atr);
    expect(closed.length).toBe(1);
    expect(closed[0].status).toBe("CLOSED");
    expect(closed[0].closeReason).toBe("TRAILING_STOP_HIT");
    // Exited above entry (60,000) -> locked in profit!
    expect(closed[0].realizedPnl).toBeGreaterThan(0);
  });

  it("applies regime-specific recommended risk from signal when opening position", () => {
    const wallet = new PaperTradingWallet(10000);
    const signalLowRisk: TradingSignal = {
      ...mockLongSignal,
      recommendedRiskPercent: 0.75, // low ADX chop
    };

    // Open without overriding riskPercentage
    const pos = wallet.openPositionFromSignal(signalLowRisk);
    const stopDistance = Math.abs(pos.entryPrice - pos.stopLoss); // 2000
    const expectedRiskDollar = 10000 * 0.0075; // $75
    const expectedUnits = expectedRiskDollar / stopDistance; // 75 / 2000 = 0.0375

    expect(pos.sizeUnits).toBeCloseTo(expectedUnits, 3);
  });
});
