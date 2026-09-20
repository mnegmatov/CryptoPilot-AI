import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { PaperTradingService } from "../core/paper/service";
import {
  getPaperAccount,
  getPaperStoreBackend,
  getRedisClient,
  mutatePaperAccount,
  setCustomRedisClient,
  PAPER_STORAGE_KEY,
  PersistentPaperAccount,
} from "../core/paper/storage";
import { Candle, MarketContextData, TradingSignal } from "../core/types";
import { GET as getCronModelD } from "../app/api/cron/model-d/route";
import * as marketFeed from "../core/data/market-feed";

describe("Production Paper Trading Persistence & Vercel Readiness (Part 11)", () => {
  const stateFilePath = path.join(process.cwd(), "data", "paper_trading_state.json");
  let originalFileContent: string | null = null;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    if (fs.existsSync(stateFilePath)) {
      originalFileContent = fs.readFileSync(stateFilePath, "utf-8");
    } else {
      originalFileContent = null;
    }
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    setCustomRedisClient(undefined);
    if (originalFileContent !== null) {
      fs.writeFileSync(stateFilePath, originalFileContent, "utf-8");
    } else if (fs.existsSync(stateFilePath)) {
      fs.unlinkSync(stateFilePath);
    }
  });

  const mockContext: MarketContextData = {
    fearAndGreedIndex: 65,
    fearAndGreedSentiment: "Greed",
    dominanceBTC: 58.2,
    totalMarketCap: 2.8e12,
    volume24h: 9.5e10,
    marketRegime: "TRENDING_BULL",
  };

  const createMockCandles = (basePrice: number = 80000, count: number = 60): Candle[] => {
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

  const mockSignal: TradingSignal = {
    id: "sig_prod_test_btc",
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
    marketContext: mockContext,
  };

  // =========================================================================
  // 1 & 2: Redis State Read/Write & Initial Account Setup
  // =========================================================================
  it("1 & 2: initializes new production account once and performs Redis read/write", async () => {
    const fakeRedisMap = new Map<string, string>();
    const mockRedis = {
      get: vi.fn(async (key: string) => fakeRedisMap.get(key) || null),
      set: vi.fn(async (key: string, val: string) => {
        fakeRedisMap.set(key, val);
        return "OK";
      }),
      del: vi.fn(async (key: string) => {
        fakeRedisMap.delete(key);
        return 1;
      }),
    };

    // Simulate configured Upstash Redis
    process.env.UPSTASH_REDIS_REST_URL = "https://mock-redis.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "mock_token";

    setCustomRedisClient(mockRedis as any);

    const initial = await getPaperAccount();
    expect(initial.balance).toBe(10000);
    expect(initial.equity).toBe(10000);
    expect(initial.version).toBe(1);
    expect(mockRedis.set).toHaveBeenCalledWith(PAPER_STORAGE_KEY, expect.any(String));

    // Verify subsequent read returns the saved account without recreating
    const secondRead = await getPaperAccount();
    expect(secondRead.balance).toBe(10000);
    expect(secondRead.version).toBe(1);
  });

  // =========================================================================
  // 3 & 4 & 5: State survives new instances, cold starts, and different route calls
  // =========================================================================
  it("3 & 4 & 5: state persists across cold starts and route invocations", async () => {
    await PaperTradingService.resetAccount(10000);

    // Route A opens position
    const { position } = await PaperTradingService.openPosition(mockSignal, 1.0, "MARKET");
    expect(position.status).toBe("OPEN");

    // Simulate cold start: re-read through fresh Service call
    const coldStartAccount = await PaperTradingService.getAccount();
    expect(coldStartAccount.positions.length).toBe(1);
    expect(coldStartAccount.positions[0].id).toBe(position.id);
    expect(coldStartAccount.positions[0].entryPrice).toBe(position.entryPrice);
    expect(coldStartAccount.balance).toBe(Number((10000 - position.openFee!).toFixed(2)));

    // Route B updates market price
    const { account: updatedAcct } = await PaperTradingService.updateMarketPrices("BTCUSDT", 82000);
    expect(updatedAcct.positions[0].currentPrice).toBe(82000);
    expect(updatedAcct.positions[0].unrealizedPnl).toBeGreaterThan(0);

    // Route C inspects state and confirms update
    const routeCAccount = await PaperTradingService.getAccount();
    expect(routeCAccount.positions[0].currentPrice).toBe(82000);
  });

  // =========================================================================
  // 6: Concurrent updates do not lose state (atomic locking)
  // =========================================================================
  it("6: concurrent operations are safely serialized under atomic lock with zero lost updates", async () => {
    await PaperTradingService.resetAccount(10000);
    await PaperTradingService.openPosition(mockSignal, 1.0, "MARKET");

    // Launch 5 parallel market price updates simultaneously
    const prices = [80500, 81000, 81500, 82000, 82500];
    const promises = prices.map((p) => PaperTradingService.updateMarketPrices("BTCUSDT", p));

    await Promise.all(promises);

    const finalAcct = await PaperTradingService.getAccount();
    expect(finalAcct.positions.length).toBe(1);
    // Version incremented safely for each update
    expect(finalAcct.version).toBeGreaterThanOrEqual(6);
  });

  // =========================================================================
  // 7 & 8: Duplicate signal and same 4H candle cannot trigger twice
  // =========================================================================
  it("7 & 8: same 4H candle cannot trigger duplicate position", async () => {
    await PaperTradingService.resetAccount(10000);
    const candles = createMockCandles(80000, 60);

    // Cycle 1: Process 4H candles
    const report1 = await PaperTradingService.executeModelDAutoCycle("BTCUSDT", candles, mockContext, true);

    // If stance was BUY and position opened, running cycle again on the SAME candle should be skipped
    if (report1.openedPosition) {
      const report2 = await PaperTradingService.executeModelDAutoCycle("BTCUSDT", candles, mockContext, true);
      expect(report2.openedPosition).toBeUndefined();
      expect(report2.skippedDuplicateCandle).toBe(true);

      const acct = await PaperTradingService.getAccount();
      expect(acct.positions.length).toBe(1);
    }
  });

  // =========================================================================
  // 9, 10, 11: Stop cannot execute twice, trade history persists, balance/equity identity
  // =========================================================================
  it("9, 10, 11: stop executes only once, history persists with exact PnL and equity identity", async () => {
    await PaperTradingService.resetAccount(10000);
    const { position } = await PaperTradingService.openPosition(mockSignal, 1.0, "MARKET");
    const entryPrice = position.entryPrice;

    // Trigger stop loss exit
    const stopPrice = 77500;
    const { closed } = await PaperTradingService.updateMarketPrices("BTCUSDT", stopPrice);
    expect(closed.length).toBe(1);
    expect(closed[0].status).toBe("CLOSED");
    expect(closed[0].exitPrice).toBe(stopPrice);

    // Calling price update again on stopped symbol does NOT close twice
    const { closed: secondClosed } = await PaperTradingService.updateMarketPrices("BTCUSDT", stopPrice);
    expect(secondClosed.length).toBe(0);

    // Verify trade history and balance/equity consistency
    const acct = await PaperTradingService.getAccount();
    expect(acct.positions.length).toBe(0);
    expect(acct.tradeHistory.length).toBe(1);

    const trade = acct.tradeHistory[0];
    expect(trade.closeReason).toBe("STOP_LOSS_HIT");
    expect(acct.realizedPnl).toBe(trade.realizedPnl);
    expect(acct.balance).toBe(Number((10000 + trade.realizedPnl).toFixed(2)));
    expect(acct.equity).toBe(acct.balance);
    expect(acct.unrealizedPnl).toBe(0);
  });

  // =========================================================================
  // 12: Reset only happens explicitly
  // =========================================================================
  it("12: resetAccount only happens when explicitly requested, never on query or mount", async () => {
    await PaperTradingService.resetAccount(10000);
    await PaperTradingService.openPosition(mockSignal, 1.0, "MARKET");

    // Repeated getAccount calls never wipe state
    for (let i = 0; i < 5; i++) {
      const current = await PaperTradingService.getAccount();
      expect(current.positions.length).toBe(1);
    }

    // Explicit reset
    const resetAcct = await PaperTradingService.resetAccount(10000);
    expect(resetAcct.positions.length).toBe(0);
    expect(resetAcct.balance).toBe(10000);
  });

  // =========================================================================
  // 13: Redis unavailable -> safe explicit error, NEVER silent reset
  // =========================================================================
  it("13: throws explicit error when Redis fails in production, NEVER silent reset", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://mock-redis.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "mock_token";

    const brokenRedis = {
      get: vi.fn(async () => {
        throw new Error("Connection refused: 503 Upstream Error");
      }),
      set: vi.fn(),
      del: vi.fn(),
    };

    setCustomRedisClient(brokenRedis as any);

    // Must throw an explicit error rather than silently returning a new $10,000 portfolio
    await expect(getPaperAccount()).rejects.toThrow(/Upstash Redis error reading paper account/);
  });

  // =========================================================================
  // 14: Protected Cron Execution Endpoint (/api/cron/model-d)
  // =========================================================================
  it("14: protected cron endpoint executes successfully with valid CRON_SECRET", async () => {
    process.env.CRON_SECRET = "super_secret_cron_token_123";

    vi.spyOn(marketFeed, "getMarketCandles").mockResolvedValue(createMockCandles(80000, 60));
    vi.spyOn(marketFeed, "getMarketContext").mockResolvedValue(mockContext);

    // 14a: Unauthorized call rejected with 401
    const unauthReq = new NextRequest("http://localhost:3000/api/cron/model-d");
    const unauthRes = await getCronModelD(unauthReq);
    expect(unauthRes.status).toBe(401);

    // 14b: Authorized call with Bearer token succeeds with 200
    const authReq = new NextRequest("http://localhost:3000/api/cron/model-d", {
      headers: { authorization: "Bearer super_secret_cron_token_123" },
    });
    const authRes = await getCronModelD(authReq);
    expect(authRes.status).toBe(200);

    const json = await authRes.json();
    expect(json.success).toBe(true);
    expect(json.accountSummary).toBeDefined();
    expect(json.results.BTCUSDT).toBeDefined();
    expect(json.results.ETHUSDT).toBeDefined();
    expect(json.results.SOLUSDT).toBeDefined();
  });

  // =========================================================================
  // 15: UI receives persistent state after remount
  // =========================================================================
  it("15: UI receives exact persistent state from /api/paper after simulated remount", async () => {
    await PaperTradingService.resetAccount(10000);
    const { position } = await PaperTradingService.openPosition(mockSignal, 1.0, "MARKET");

    // Simulate client route GET /api/paper
    const { GET: getPaperRoute } = await import("../app/api/paper/route");
    const response = await getPaperRoute();
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.account.positions.length).toBe(1);
    expect(json.account.positions[0].id).toBe(position.id);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  // =========================================================================
  // 16: Model D continues using only CLOSED 4H candles
  // =========================================================================
  it("16: trailing stop and telemetry use strictly completed closed bars", async () => {
    const candles = createMockCandles(80000, 60);
    const activeFormingCandle = candles[candles.length - 1];
    // Manipulate forming candle with an extreme low
    activeFormingCandle.low = 10000;

    const { computeModelDTelemetry } = await import("../core/paper/model-d-tracker");
    const tele = computeModelDTelemetry("BTCUSDT", candles);

    // Trailing level MUST NOT use the forming candle's extreme low of 10000!
    // It must use candles.slice(-6, -1) which are strictly closed bars
    expect(tele.swingTrailingLevelLong).toBeGreaterThan(70000);
  });
});
