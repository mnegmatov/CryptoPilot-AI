import { describe, expect, it } from "vitest";
import { PaperTradingWallet } from "../core/paper/wallet";
import { processModelDAutoCycle } from "../core/paper/model-d-tracker";
import { Candle, MarketContextData, TradingSignal } from "../core/types";

describe("Model D Paper Trading Complete Lifecycle Verification", () => {
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

  const mockModelDSignal: TradingSignal = {
    id: "sig_model_d_test_btc",
    asset: "BTCUSDT",
    timestamp: Date.now(),
    stance: "BUY",
    type: "LONG",
    strategyVersion: "MODEL_D",
    currentPrice: 80000,
    entryRange: { min: 79800, max: 80200, ideal: 80000 },
    stopLoss: 78000, // 2000 stop distance
    stopLossPercentage: 2.5,
    takeProfitTargets: [],
    riskRewardRatio: 3.0,
    confidenceScore: 85,
    invalidationConditions: ["Close below 4H EMA20"],
    technicalSummary: {} as any,
    marketStructure: {} as any,
    marketContext: mockContext,
  };

  it("A & B: opens automatic position with 1% risk and sets initial stop (2.5×ATR)", () => {
    const wallet = new PaperTradingWallet(10000, false);
    const initialAcct = wallet.getAccount();
    expect(initialAcct.balance).toBe(10000);
    expect(initialAcct.positions.length).toBe(0);

    // Open from Model D signal with 1.0% institutional risk
    const pos = wallet.openPositionFromSignal(mockModelDSignal, 1.0, "MARKET", {
      trailingStopType: "STRUCTURAL_SWING",
      swingTrailingBars: 5,
    });

    expect(pos.status).toBe("OPEN");
    expect(pos.type).toBe("LONG");
    expect(pos.asset).toBe("BTCUSDT");
    expect(pos.initialStopLoss).toBe(78000);
    expect(pos.stopLoss).toBe(78000);
    expect(pos.trailingStopType).toBe("STRUCTURAL_SWING");
    expect(pos.trailingStopPrice).toBe(78000);

    // Verify 1% risk sizing: 1% of 10000 = $100 risk dollar.
    // Entry price with 0.05% slippage = 80000 * 1.0005 = 80040.
    // Stop distance = 80040 - 78000 = 2040.
    // Expected units = 100 / 2040 = 0.0490.
    const expectedRiskDollar = 10000 * 0.01;
    const stopDist = Math.abs(pos.entryPrice - pos.stopLoss);
    const expectedUnits = Number((expectedRiskDollar / stopDist).toFixed(4));
    expect(pos.sizeUnits).toBe(expectedUnits);

    // Fees deducted
    expect(pos.openFee).toBeGreaterThan(0);
    expect(wallet.getAccount().balance).toBe(Number((10000 - pos.openFee!).toFixed(2)));
  });

  it("C: closed 4H candle ratchets trailing stop to 5-bar structural swing low", () => {
    const wallet = new PaperTradingWallet(10000, false);
    const pos = wallet.openPositionFromSignal(mockModelDSignal, 1.0, "MARKET");

    expect(pos.stopLoss).toBe(78000);

    // Provide 5 closed candles that rallied significantly
    // Lowest low of the last 5 bars is 82,000 (well above 78,000)
    const closedCandles = [
      { low: 82000, high: 83500 },
      { low: 82500, high: 84000 },
      { low: 83000, high: 84500 },
      { low: 82200, high: 85000 },
      { low: 83800, high: 85500 },
    ];

    const updated = wallet.updateStructuralTrailingStop("BTCUSDT", closedCandles);
    expect(updated.length).toBe(1);

    const acct = wallet.getAccount();
    const updatedPos = acct.positions[0];
    expect(updatedPos.stopLoss).toBe(82000);
    expect(updatedPos.trailingStopPrice).toBe(82000);
  });

  it("D: trailing stop never moves backwards even if subsequent swing lows are lower", () => {
    const wallet = new PaperTradingWallet(10000, false);
    wallet.openPositionFromSignal(mockModelDSignal, 1.0, "MARKET");

    // Bar 1-5 low = 83,000 -> Stop moves to 83,000
    wallet.updateStructuralTrailingStop("BTCUSDT", [
      { low: 83000, high: 84000 },
      { low: 83200, high: 84500 },
      { low: 83500, high: 85000 },
      { low: 83100, high: 85000 },
      { low: 84000, high: 86000 },
    ]);

    expect(wallet.getAccount().positions[0].stopLoss).toBe(83000);

    // Now a pullback occurs where the new 5-bar swing low is 81,500 (lower than 83,000)
    wallet.updateStructuralTrailingStop("BTCUSDT", [
      { low: 81500, high: 83000 },
      { low: 81800, high: 83200 },
      { low: 82000, high: 83500 },
      { low: 82500, high: 84000 },
      { low: 82200, high: 83800 },
    ]);

    // Invariant check: Stop loss MUST remain 83,000 (monotonic ratchet)
    expect(wallet.getAccount().positions[0].stopLoss).toBe(83000);
    expect(wallet.getAccount().positions[0].trailingStopPrice).toBe(83000);
  });

  it("E & F & G: price drops to trailing stop -> automatic exit with TRAILING_STOP_HIT, accurate PnL & fees", () => {
    const wallet = new PaperTradingWallet(10000, false);
    const pos = wallet.openPositionFromSignal(mockModelDSignal, 1.0, "MARKET");
    const entryPrice = pos.entryPrice;
    const openFee = pos.openFee!;

    // Ratchet trailing stop to 82,000
    wallet.updateStructuralTrailingStop("BTCUSDT", [
      { low: 82000, high: 83500 },
      { low: 82500, high: 84000 },
      { low: 83000, high: 84500 },
      { low: 82200, high: 85000 },
      { low: 83800, high: 85500 },
    ]);

    // Market price drops to 81,950 (hits the 82,000 stop)
    const exitPrice = 81950;
    const closed = wallet.updateMarketPrices("BTCUSDT", exitPrice);

    expect(closed.length).toBe(1);
    const closedPos = closed[0];

    // Status and reason
    expect(closedPos.status).toBe("CLOSED");
    expect(closedPos.closeReason).toBe("TRAILING_STOP_HIT");
    expect(closedPos.exitPrice).toBe(exitPrice);
    expect(closedPos.closedAt).toBeDefined();

    // Verify fee & PnL accounting
    const grossPnl = (exitPrice - entryPrice) * closedPos.sizeUnits;
    const expectedExitFee = Number((exitPrice * closedPos.sizeUnits * 0.0005).toFixed(2));
    const expectedNetPnl = Number((grossPnl - openFee - expectedExitFee).toFixed(2));

    expect(closedPos.exitFee).toBe(expectedExitFee);
    expect(closedPos.realizedPnl).toBe(expectedNetPnl);
    expect(closedPos.realizedPnl).toBeGreaterThan(0); // Profitable trailing exit

    // Account level verification
    const acct = wallet.getAccount();
    expect(acct.positions.length).toBe(0);
    expect(acct.tradeHistory.length).toBe(1);
    expect(acct.tradeHistory[0].id).toBe(closedPos.id);

    // Equity and balance consistency
    expect(acct.realizedPnl).toBe(expectedNetPnl);
    expect(acct.balance).toBe(Number((10000 + expectedNetPnl).toFixed(2)));
    expect(acct.equity).toBe(acct.balance);
    expect(acct.unrealizedPnl).toBe(0);
  });

  it("E (Initial Stop): price drops to initial stop -> automatic exit with STOP_LOSS_HIT", () => {
    const wallet = new PaperTradingWallet(10000, false);
    const pos = wallet.openPositionFromSignal(mockModelDSignal, 1.0, "MARKET");

    // Price immediately drops below initial stop (78,000)
    const exitPrice = 77900;
    const closed = wallet.updateMarketPrices("BTCUSDT", exitPrice);

    expect(closed.length).toBe(1);
    expect(closed[0].status).toBe("CLOSED");
    expect(closed[0].closeReason).toBe("STOP_LOSS_HIT");
    expect(closed[0].exitPrice).toBe(exitPrice);
    expect(closed[0].realizedPnl).toBeLessThan(0); // Loss
  });

  it("H: refuses to open duplicate position on the same asset", () => {
    const wallet = new PaperTradingWallet(10000, false);
    wallet.openPositionFromSignal(mockModelDSignal, 1.0, "MARKET");

    // Attempting to open a second position for BTCUSDT should throw
    expect(() => {
      wallet.openPositionFromSignal(mockModelDSignal, 1.0, "MARKET");
    }).toThrow(/already open/i);

    // Also prevents duplicate with BTC/USDT format
    expect(() => {
      wallet.openPositionFromSignal(
        { ...mockModelDSignal, asset: "BTC/USDT" },
        1.0,
        "MARKET"
      );
    }).toThrow(/already open/i);

    expect(wallet.getAccount().positions.length).toBe(1);
  });

  it("I: rigorous mathematical consistency of balance, equity, and realized PnL across multiple cycles", () => {
    const wallet = new PaperTradingWallet(10000, false);
    const initialBalance = 10000;

    // Cycle 1: Open BTC, take partial profit / trailing exit
    const pos1 = wallet.openPositionFromSignal(mockModelDSignal, 1.0, "MARKET");
    wallet.updateStructuralTrailingStop("BTCUSDT", [
      { low: 81000, high: 82000 },
      { low: 81500, high: 82500 },
      { low: 81800, high: 83000 },
      { low: 82000, high: 83500 },
      { low: 82200, high: 84000 },
    ]);
    wallet.updateMarketPrices("BTCUSDT", 80900); // Exits at 80900
    const trade1Pnl = wallet.getAccount().tradeHistory[0].realizedPnl;

    // Balance check after cycle 1
    const acct1 = wallet.getAccount();
    expect(acct1.balance).toBe(Number((initialBalance + trade1Pnl).toFixed(2)));
    expect(acct1.equity).toBe(acct1.balance);

    // Cycle 2: Open ETH trade
    const ethSignal: TradingSignal = {
      ...mockModelDSignal,
      id: "sig_eth_test",
      asset: "ETHUSDT",
      currentPrice: 3000,
      stopLoss: 2850,
    };
    const pos2 = wallet.openPositionFromSignal(ethSignal, 1.0, "MARKET");
    const openFee2 = pos2.openFee!;

    // Mid-trade price update (unrealized PnL)
    wallet.updateMarketPrices("ETHUSDT", 3100);
    const acct2Mid = wallet.getAccount();
    const unrealized = acct2Mid.positions[0].unrealizedPnl;
    expect(acct2Mid.equity).toBe(Number((acct2Mid.balance + unrealized).toFixed(2)));

    // Exit ETH trade at initial stop
    wallet.updateMarketPrices("ETHUSDT", 2800);
    const acct2Final = wallet.getAccount();
    const trade2Pnl = acct2Final.tradeHistory[0].realizedPnl;

    const totalRealizedPnl = Number((trade1Pnl + trade2Pnl).toFixed(2));
    expect(acct2Final.realizedPnl).toBe(totalRealizedPnl);
    expect(acct2Final.balance).toBe(Number((initialBalance + totalRealizedPnl).toFixed(2)));
    expect(acct2Final.equity).toBe(acct2Final.balance);
    expect(acct2Final.positions.length).toBe(0);
    expect(acct2Final.tradeHistory.length).toBe(2);
  });

  it("J: manual close remains separate from automatic Model D exits", () => {
    const wallet = new PaperTradingWallet(10000, false);
    const pos = wallet.openPositionFromSignal(mockModelDSignal, 1.0, "MARKET");

    // Manually close position
    const manualClosed = wallet.closePosition(pos.id, 81000);

    expect(manualClosed.status).toBe("CLOSED");
    expect(manualClosed.closeReason).toBe("MANUAL_CLOSE");
    expect(manualClosed.exitPrice).toBe(81000);

    const history = wallet.getAccount().tradeHistory;
    expect(history.length).toBe(1);
    expect(history[0].closeReason).toBe("MANUAL_CLOSE");
  });

  it("End-to-End processModelDAutoCycle: executes complete auto-cycle seamlessly", () => {
    const wallet = new PaperTradingWallet(10000, false);
    const candles = createMockCandles(80000, 100);

    // Initial cycle: Evaluate with real 4H candles
    const result1 = processModelDAutoCycle("BTCUSDT", candles, mockContext, true, wallet);

    expect(result1.telemetry).toBeDefined();
    expect(result1.telemetry.symbol).toBe("BTCUSDT");
    expect(result1.signal).toBeDefined();
    expect(result1.closedPositions).toEqual([]);

    // If stance is BUY, verify auto-entry occurred; if WAIT, verify no spurious entry
    if (result1.signal.stance === "BUY") {
      expect(result1.openedPosition).toBeDefined();
      expect(wallet.getAccount().positions.length).toBe(1);

      // Running cycle again does not create duplicate position
      const result2 = processModelDAutoCycle("BTCUSDT", candles, mockContext, true, wallet);
      expect(result2.openedPosition).toBeUndefined();
      expect(wallet.getAccount().positions.length).toBe(1);
    } else {
      expect(result1.openedPosition).toBeUndefined();
      expect(wallet.getAccount().positions.length).toBe(0);
    }
  });
});
