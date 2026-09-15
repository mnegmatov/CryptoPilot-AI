import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  BINANCE_PUBLIC_ENDPOINTS,
  fetchBinanceWithFallback,
  fetchBinanceKlines,
  fetchBinanceBatchTickers,
  REQUEST_TIMEOUT_MS,
} from "../core/data/binance";

describe("Binance Network Resilience & Multi-Endpoint Fallback", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("prioritizes https://data-api.binance.vision as the primary endpoint", () => {
    expect(BINANCE_PUBLIC_ENDPOINTS[0]).toBe("https://data-api.binance.vision");
    expect(BINANCE_PUBLIC_ENDPOINTS).toContain("https://api1.binance.com");
    expect(BINANCE_PUBLIC_ENDPOINTS).toContain("https://api.binance.com");
  });

  it("succeeds on first attempt if primary endpoint is responsive", async () => {
    const mockData = [{ symbol: "BTCUSDT", lastPrice: "65000.00" }];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockData,
    });
    globalThis.fetch = fetchMock;

    const result = await fetchBinanceWithFallback<any>("/api/v3/ticker/24hr?symbol=BTCUSDT");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://data-api.binance.vision/api/v3/ticker/24hr?symbol=BTCUSDT");
    expect(result).toEqual(mockData);
  });

  it("falls back to secondary endpoint if primary endpoint returns HTTP error", async () => {
    const mockData = [{ symbol: "ETHUSDT", lastPrice: "3500.00" }];
    const fetchMock = vi
      .fn()
      // First endpoint fails with 451 (geoblocked/restricted)
      .mockResolvedValueOnce({
        ok: false,
        status: 451,
        statusText: "Unavailable For Legal Reasons",
      })
      // Second endpoint succeeds
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockData,
      });

    globalThis.fetch = fetchMock;

    const result = await fetchBinanceWithFallback<any>("/api/v3/ticker/24hr?symbol=ETHUSDT");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain("https://data-api.binance.vision");
    expect(fetchMock.mock.calls[1][0]).toContain(BINANCE_PUBLIC_ENDPOINTS[1]);
    expect(result).toEqual(mockData);
  });

  it("falls back when an endpoint encounters network timeout", async () => {
    const mockData = { symbol: "SOLUSDT", lastPrice: "180.00" };
    const fetchMock = vi
      .fn()
      // First attempt times out
      .mockRejectedValueOnce(new Error("Network timeout"))
      // Second attempt succeeds
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockData,
      });

    globalThis.fetch = fetchMock;

    const result = await fetchBinanceWithFallback<any>("/api/v3/ticker/24hr?symbol=SOLUSDT");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual(mockData);
  });

  it("throws descriptive error when all endpoints fail without returning synthetic data", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    });

    globalThis.fetch = fetchMock;

    await expect(
      fetchBinanceWithFallback("/api/v3/ticker/24hr?symbol=BTCUSDT")
    ).rejects.toThrow(/All Binance endpoints failed/);

    expect(fetchMock).toHaveBeenCalledTimes(BINANCE_PUBLIC_ENDPOINTS.length);
  });

  it("includes browser User-Agent header and timeout signal in requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    });
    globalThis.fetch = fetchMock;

    await fetchBinanceWithFallback("/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=5");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestOptions = fetchMock.mock.calls[0][1];
    expect(requestOptions.headers["User-Agent"]).toBeDefined();
    expect(requestOptions.headers["User-Agent"]).toContain("Mozilla/5.0");
    expect(requestOptions.signal).toBeDefined();
    expect(REQUEST_TIMEOUT_MS).toBe(8000);
  });

  it("fetchBinanceBatchTickers returns parsed tickers or throws without fake quotes", async () => {
    const rawTickerResponse = [
      {
        symbol: "BTCUSDT",
        lastPrice: "67500.50",
        priceChange: "1200.00",
        priceChangePercent: "1.81",
        highPrice: "68000.00",
        lowPrice: "66000.00",
        volume: "15000.12",
        quoteVolume: "1012508100.00",
      },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => rawTickerResponse,
    });

    const tickers = await fetchBinanceBatchTickers(["BTCUSDT"]);

    expect(tickers).toHaveLength(1);
    expect(tickers[0].symbol).toBe("BTCUSDT");
    expect(tickers[0].lastPrice).toBe(67500.5);
    expect(tickers[0].priceChangePercent).toBe(1.81);
  });
});
