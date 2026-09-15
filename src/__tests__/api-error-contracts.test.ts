import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as marketFeed from "../core/data/market-feed";
import { GET as getMarket } from "../app/api/market/route";
import { GET as getCandles } from "../app/api/candles/route";
import { GET as getSignal } from "../app/api/signal/route";
import { GET as getSignalModelD } from "../app/api/signal-model-d/route";

describe("API Error Contracts & Status Code Enforcement", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("GET /api/market", () => {
    it("returns typed ApiErrorResponse with 502/504 when upstream fails", async () => {
      vi.spyOn(marketFeed, "getWatchlistOverview").mockRejectedValue(
        new Error("All Binance endpoints failed: Connection refused")
      );

      const response = await getMarket();
      expect(response.status).toBe(502);

      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.code).toBe("UPSTREAM_UNAVAILABLE");
      expect(json.error).toContain("All Binance endpoints failed");
      expect(typeof json.timestamp).toBe("number");
    });

    it("returns 504 when upstream encounters timeout", async () => {
      vi.spyOn(marketFeed, "getWatchlistOverview").mockRejectedValue(
        new Error("Timeout after 8000ms")
      );

      const response = await getMarket();
      expect(response.status).toBe(504);

      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.code).toBe("UPSTREAM_TIMEOUT");
    });
  });

  describe("GET /api/candles", () => {
    it("returns typed ApiErrorResponse with 502/504 when candle fetching fails", async () => {
      vi.spyOn(marketFeed, "getMarketCandles").mockRejectedValue(
        new Error("All Binance endpoints failed: HTTP 451")
      );

      const req = new NextRequest("http://localhost:3000/api/candles?symbol=BTCUSDT&timeframe=1h");
      const response = await getCandles(req);

      expect(response.status).toBe(502);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.code).toBe("UPSTREAM_UNAVAILABLE");
      expect(json.error).toContain("All Binance endpoints failed");
      expect(typeof json.timestamp).toBe("number");
    });
  });

  describe("GET /api/signal", () => {
    it("returns typed ApiErrorResponse with 502/504 when signal generation fails", async () => {
      vi.spyOn(marketFeed, "getMarketCandles").mockRejectedValue(
        new Error("Timeout after 8000ms")
      );

      const req = new NextRequest("http://localhost:3000/api/signal?symbol=BTCUSDT");
      const response = await getSignal(req);

      expect(response.status).toBe(504);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.code).toBe("UPSTREAM_TIMEOUT");
      expect(typeof json.timestamp).toBe("number");
    });
  });

  describe("GET /api/signal-model-d", () => {
    it("returns typed ApiErrorResponse with 502/504 when Model D 4H candles fail", async () => {
      vi.spyOn(marketFeed, "getMarketCandles").mockRejectedValue(
        new Error("All Binance endpoints failed: HTTP 503")
      );

      const req = new NextRequest("http://localhost:3000/api/signal-model-d?symbol=BTCUSDT");
      const response = await getSignalModelD(req);

      expect(response.status).toBe(502);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.code).toBe("UPSTREAM_UNAVAILABLE");
      expect(typeof json.timestamp).toBe("number");
    });
  });
});
