import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PaperTradingWallet, getGlobalPaperWallet } from "../core/paper/wallet";
import { processModelDAutoCycle } from "../core/paper/model-d-tracker";
import { Candle, MarketContextData, TradingSignal } from "../core/types";

describe("Paper Trading Persistence & State Rehydration Verification", () => {
  const stateFilePath = path.join(process.cwd(), "data", "paper_trading_state.json");
  let originalFileContent: string | null = null;

  beforeEach(() => {
    if (fs.existsSync(stateFilePath)) {
      originalFileContent = fs.readFileSync(stateFilePath, "utf-8");
    } else {
      originalFileContent = null;
    }
  });

  afterEach(() => {
    if (originalFileContent !== null) {
      fs.writeFileSync(stateFilePath, originalFileContent, "utf-8");
    } else if (fs.existsSync(stateFilePath)) {
      fs.unlinkSync(stateFilePath);
    }
  });

  const mockSignal: TradingSignal = {
    id: "test_sig_persist_btc",
    asset: "BTCUSDT",
    timestamp: Date.now(),
    stance: "BUY",
    type: "LONG",
    strategyVersion: "MODEL_D",
    currentPrice: 80000,
    entryRange: { min: 79900, max: 80100, ideal: 80000 },
    stopLoss: 78000,
    stopLossPercentage: 2.5,
    takeProfitTargets: [],
    riskRewardRatio: 3.0,
    confidenceScore: 85,
    invalidationConditions: [],
    technicalSummary: {} as any,
    marketStructure: {} as any,
    marketContext: {} as any,
  };

  const mockContext: MarketContextData = {
    fearAndGreedIndex: 65,
    fearAndGreedSentiment: "Greed",
    dominanceBTC: 58.2,
    totalMarketCap: 2.8e12,
    volume24h: 9.5e10,
    marketRegime: "TRENDING_BULL",
  };

  const createMockCandles = (basePrice: number = 80000, count: number = 100): Candle[] => {
    const candles: Candle[] = [];
    const intervalMs = 4 * 60 * 60 * 1000;
    const startTime = 1700000000000;
    for (let i = 0; i < count; i++) {
      const price = basePrice + i * 50;
      candles.push({
        timestamp: startTime + i * intervalMs,
        open: price - 20,
        high: price + 100,
        low: price - 80,
        close: price,
        volume: 1000,
      });
    }
    return candles;
  };

  it("A & C: create paper trade -> reload state -> trade/position still exists with exact values", () => {
    const wallet1 = new PaperTradingWallet(10000, true);
    wallet1.resetAccount(10000);

    const pos = wallet1.openPositionFromSignal(mockSignal, 1.0, "MARKET");
    expect(pos.status).toBe("OPEN");
    expect(pos.entryPrice).toBe(80040); // 80000 + 0.05% slippage

    // Verify written to disk
    expect(fs.existsSync(stateFilePath)).toBe(true);

    // Simulate page reload or component remount with a brand new wallet instance
    const wallet2 = new PaperTradingWallet(10000, true);
    const acct2 = wallet2.getAccount();

    expect(acct2.positions.length).toBe(1);
    expect(acct2.positions[0].id).toBe(pos.id);
    expect(acct2.positions[0].asset).toBe("BTCUSDT");
    expect(acct2.positions[0].entryPrice).toBe(pos.entryPrice);
    expect(acct2.positions[0].stopLoss).toBe(pos.stopLoss);
    expect(acct2.positions[0].sizeUnits).toBe(pos.sizeUnits);
    expect(acct2.balance).toBe(wallet1.getAccount().balance);
    expect(acct2.equity).toBe(wallet1.getAccount().equity);
  });

  it("B & I: close trade -> reload state -> history exists with correct reason, exit price, and fees", () => {
    const wallet1 = new PaperTradingWallet(10000, true);
    wallet1.resetAccount(10000);
    const pos = wallet1.openPositionFromSignal(mockSignal, 1.0, "MARKET");

    // Close via trailing stop / market drop
    wallet1.updateStructuralTrailingStop("BTCUSDT", [
      { low: 82000, high: 83500 },
      { low: 82500, high: 84000 },
      { low: 83000, high: 84500 },
      { low: 82200, high: 85000 },
      { low: 83800, high: 85500 },
    ]);
    const closed = wallet1.updateMarketPrices("BTCUSDT", 81900);
    expect(closed.length).toBe(1);
    expect(closed[0].closeReason).toBe("TRAILING_STOP_HIT");

    // Recreate/reload wallet from disk
    const wallet2 = new PaperTradingWallet(10000, true);
    const acct2 = wallet2.getAccount();

    expect(acct2.positions.length).toBe(0);
    expect(acct2.tradeHistory.length).toBe(1);
    const savedTrade = acct2.tradeHistory[0];
    expect(savedTrade.id).toBe(pos.id);
    expect(savedTrade.closeReason).toBe("TRAILING_STOP_HIT");
    expect(savedTrade.exitPrice).toBe(81900);
    expect(savedTrade.openFee).toBeDefined();
    expect(savedTrade.exitFee).toBeDefined();
    expect(savedTrade.realizedPnl).toBeGreaterThan(0);

    // Also verify manual close remains distinct
    const pos2 = wallet1.openPositionFromSignal(
      { ...mockSignal, id: "manual_test_sig", asset: "ETHUSDT", currentPrice: 3000, stopLoss: 2850 },
      1.0,
      "MARKET"
    );
    wallet1.closePosition(pos2.id, 3100);

    const wallet3 = new PaperTradingWallet(10000, true);
    const history3 = wallet3.getAccount().tradeHistory;
    expect(history3.length).toBe(2);
    expect(history3[0].closeReason).toBe("MANUAL_CLOSE");
    expect(history3[1].closeReason).toBe("TRAILING_STOP_HIT");
  });

  it("D & F: multiple API calls share single authoritative wallet and sync live", () => {
    // Both call getGlobalPaperWallet() like /api/paper and /api/signal-model-d do
    const globalWalletA = getGlobalPaperWallet();
    const globalWalletB = getGlobalPaperWallet();

    expect(globalWalletA).toBe(globalWalletB);

    // Reset cleanly
    globalWalletA.resetAccount(10000);

    // Worker A opens a position
    globalWalletA.openPositionFromSignal(mockSignal, 1.0, "MARKET");

    // Worker B immediately sees it
    expect(globalWalletB.getAccount().positions.length).toBe(1);
    expect(globalWalletB.getAccount().positions[0].asset).toBe("BTCUSDT");

    // Worker B updates price
    globalWalletB.updateMarketPrices("BTCUSDT", 82500);

    // Worker A immediately reflects new price and unrealized PnL
    expect(globalWalletA.getAccount().positions[0].currentPrice).toBe(82500);
    expect(globalWalletA.getAccount().positions[0].unrealizedPnl).toBeGreaterThan(0);
  });

  it("E: mathematical consistency of balance, equity, and realized PnL survives disk reload", () => {
    const wallet1 = new PaperTradingWallet(10000, true);
    wallet1.resetAccount(10000);
    const initialBalance = 10000;

    const pos = wallet1.openPositionFromSignal(mockSignal, 1.0, "MARKET");
    wallet1.updateMarketPrices("BTCUSDT", 81500);

    // Mid-trade reload
    const walletMid = new PaperTradingWallet(10000, true);
    const midAcct = walletMid.getAccount();
    expect(midAcct.equity).toBe(Number((midAcct.balance + midAcct.unrealizedPnl).toFixed(2)));

    // Close trade
    wallet1.updateMarketPrices("BTCUSDT", 77900); // Stop hit

    // Post-trade reload
    const walletFinal = new PaperTradingWallet(10000, true);
    const finalAcct = walletFinal.getAccount();
    const tradePnl = finalAcct.tradeHistory[0].realizedPnl;

    expect(finalAcct.realizedPnl).toBe(tradePnl);
    expect(finalAcct.balance).toBe(Number((initialBalance + tradePnl).toFixed(2)));
    expect(finalAcct.equity).toBe(finalAcct.balance);
    expect(finalAcct.unrealizedPnl).toBe(0);
  });

  it("G: Model D automatic cycle interacts with the persistent wallet seamlessly", () => {
    const wallet = getGlobalPaperWallet();
    wallet.resetAccount(10000);
    const candles = createMockCandles(80000, 100);

    const result = processModelDAutoCycle("BTCUSDT", candles, mockContext, true, wallet);
    expect(result.telemetry).toBeDefined();

    // Verify that whatever state resulted from the cycle is synced
    const reloaded = new PaperTradingWallet(10000, true);
    expect(reloaded.getAccount().positions.length).toBe(wallet.getAccount().positions.length);
    expect(reloaded.getAccount().tradeHistory.length).toBe(wallet.getAccount().tradeHistory.length);
  });

  it("H: resetAccount only happens when explicitly invoked, never on remount", () => {
    const wallet = new PaperTradingWallet(10000, true);
    wallet.resetAccount(10000);
    wallet.openPositionFromSignal(mockSignal, 1.0, "MARKET");

    // Instantiating 5 subsequent wallet instances (simulating 5 page tab switches)
    for (let i = 0; i < 5; i++) {
      const remountWallet = new PaperTradingWallet(10000, true);
      const acct = remountWallet.getAccount();
      expect(acct.positions.length).toBe(1);
      expect(acct.positions[0].asset).toBe("BTCUSDT");
    }

    // Only resets when explicitly called
    wallet.resetAccount(10000);
    const postReset = new PaperTradingWallet(10000, true);
    expect(postReset.getAccount().positions.length).toBe(0);
  });
});
