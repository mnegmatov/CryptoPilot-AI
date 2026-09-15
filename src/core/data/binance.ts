import { Candle, Timeframe } from "../types";

export const BINANCE_PUBLIC_ENDPOINTS = [
  "https://data-api.binance.vision", // Dedicated public market data gateway (no geo-restriction)
  "https://api1.binance.com",        // Mirror cluster 1
  "https://api2.binance.com",        // Mirror cluster 2
  "https://api3.binance.com",        // Mirror cluster 3
  "https://api.binance.com",         // Standard base gateway
];

export const BINANCE_FUTURES_URL = "https://fapi.binance.com";

export const REQUEST_TIMEOUT_MS = 8000;

export const BINANCE_DEFAULT_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
};

const TIMEFRAME_MAP: Record<Timeframe, string> = {
  "15m": "15m",
  "1h": "1h",
  "4h": "4h",
  "1d": "1d",
};

export function formatBinanceSymbol(symbol: string): string {
  // Converts "BTC/USDT" or "BTC-USDT" to "BTCUSDT"
  return symbol.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

/**
 * Resilient multi-endpoint fetcher that iterates across official Binance public gateways.
 * Prioritizes data-api.binance.vision to circumvent regional datacenter restrictions.
 */
export async function fetchBinanceWithFallback<T>(
  pathAndQuery: string,
  options: RequestInit = {}
): Promise<T> {
  const errors: string[] = [];

  for (const baseEndpoint of BINANCE_PUBLIC_ENDPOINTS) {
    const url = `${baseEndpoint}${pathAndQuery}`;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          ...BINANCE_DEFAULT_HEADERS,
          ...(options.headers || {}),
        },
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        return await res.json();
      }

      errors.push(`${baseEndpoint}: HTTP ${res.status} ${res.statusText}`);
    } catch (err: any) {
      const msg = err.name === "AbortError" ? `Timeout after ${REQUEST_TIMEOUT_MS}ms` : err.message;
      errors.push(`${baseEndpoint}: ${msg}`);
    }
  }

  throw new Error(`All Binance endpoints failed: ${errors.join(" | ")}`);
}

/**
 * Fetches real OHLCV historical candlestick data from Binance public API
 * Uses multi-endpoint fallback. Zero authentication required.
 */
export async function fetchBinanceKlines(
  symbol: string,
  timeframe: Timeframe,
  limit: number = 200
): Promise<Candle[]> {
  const formattedSymbol = formatBinanceSymbol(symbol);
  const interval = TIMEFRAME_MAP[timeframe] || "1h";
  const path = `/api/v3/klines?symbol=${formattedSymbol}&interval=${interval}&limit=${Math.min(limit, 1000)}`;

  const data = await fetchBinanceWithFallback<any[]>(path, {
    next: { revalidate: 30 } as any,
  });

  if (!Array.isArray(data)) {
    throw new Error("Invalid Binance klines response format");
  }

  // Binance kline format:
  // [0: openTime, 1: open, 2: high, 3: low, 4: close, 5: volume, 6: closeTime, ...]
  return data.map((item: any[]) => ({
    timestamp: item[0],
    open: parseFloat(item[1]),
    high: parseFloat(item[2]),
    low: parseFloat(item[3]),
    close: parseFloat(item[4]),
    volume: parseFloat(item[5]),
  }));
}

/**
 * Fetches an extended historical range of real Binance candles using backward pagination.
 * Uses resilient multi-endpoint fallback.
 */
export async function fetchBinanceKlinesRange(
  symbol: string,
  timeframe: Timeframe,
  totalBars: number = 2000
): Promise<Candle[]> {
  const formattedSymbol = formatBinanceSymbol(symbol);
  const interval = TIMEFRAME_MAP[timeframe] || "1h";
  const allCandles: Candle[] = [];
  let currentEndTime: number | undefined = undefined;

  while (allCandles.length < totalBars) {
    const fetchLimit = Math.min(1000, totalBars - allCandles.length);
    let path = `/api/v3/klines?symbol=${formattedSymbol}&interval=${interval}&limit=${fetchLimit}`;
    if (currentEndTime) {
      path += `&endTime=${currentEndTime}`;
    }

    const data = await fetchBinanceWithFallback<any[]>(path);
    if (!Array.isArray(data) || data.length === 0) {
      break;
    }

    const chunk: Candle[] = data.map((item: any[]) => ({
      timestamp: item[0],
      open: parseFloat(item[1]),
      high: parseFloat(item[2]),
      low: parseFloat(item[3]),
      close: parseFloat(item[4]),
      volume: parseFloat(item[5]),
    }));

    // Prepend older candles
    allCandles.unshift(...chunk);

    // Set endTime to 1ms before the earliest fetched candle in this chunk
    currentEndTime = chunk[0].timestamp - 1;

    if (chunk.length < fetchLimit) {
      break;
    }

    // Small delay between requests to be polite to Binance rate limits
    await new Promise((r) => setTimeout(r, 60));
  }

  // Deduplicate and ensure strict chronological order
  const seen = new Set<number>();
  const uniqueCandles: Candle[] = [];
  for (const c of allCandles) {
    if (!seen.has(c.timestamp)) {
      seen.add(c.timestamp);
      uniqueCandles.push(c);
    }
  }

  uniqueCandles.sort((a, b) => a.timestamp - b.timestamp);
  return uniqueCandles;
}

/**
 * Fetches 24-hour ticker statistics from Binance via resilient endpoint pool
 */
export async function fetchBinance24hrTicker(symbol: string): Promise<{
  symbol: string;
  lastPrice: number;
  priceChange: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  quoteVolume: number;
}> {
  const formattedSymbol = formatBinanceSymbol(symbol);
  const path = `/api/v3/ticker/24hr?symbol=${formattedSymbol}`;

  const data = await fetchBinanceWithFallback<any>(path, {
    next: { revalidate: 10 } as any,
  });

  return {
    symbol: data.symbol,
    lastPrice: parseFloat(data.lastPrice),
    priceChange: parseFloat(data.priceChange),
    priceChangePercent: parseFloat(data.priceChangePercent),
    highPrice: parseFloat(data.highPrice),
    lowPrice: parseFloat(data.lowPrice),
    volume: parseFloat(data.volume),
    quoteVolume: parseFloat(data.quoteVolume),
  };
}

/**
 * Fetches 24-hour ticker statistics for multiple symbols via resilient endpoint pool
 */
export async function fetchBinanceBatchTickers(symbols: string[]): Promise<
  Array<{
    symbol: string;
    lastPrice: number;
    priceChange: number;
    priceChangePercent: number;
    highPrice: number;
    lowPrice: number;
    volume: number;
    quoteVolume: number;
  }>
> {
  const formattedSymbols = JSON.stringify(symbols.map(formatBinanceSymbol));
  const path = `/api/v3/ticker/24hr?symbols=${encodeURIComponent(formattedSymbols)}`;

  const data = await fetchBinanceWithFallback<any[]>(path, {
    next: { revalidate: 10 } as any,
  });

  if (!Array.isArray(data)) return [];

  return data.map((item: any) => ({
    symbol: item.symbol,
    lastPrice: parseFloat(item.lastPrice),
    priceChange: parseFloat(item.priceChange),
    priceChangePercent: parseFloat(item.priceChangePercent),
    highPrice: parseFloat(item.highPrice),
    lowPrice: parseFloat(item.lowPrice),
    volume: parseFloat(item.volume),
    quoteVolume: parseFloat(item.quoteVolume),
  }));
}

/**
 * Fetches the latest perpetual funding rate from Binance Futures public API.
 * Returns null if unavailable or if the asset has no futures market.
 */
export async function fetchBinanceFundingRate(symbol: string): Promise<number | null> {
  try {
    const formattedSymbol = formatBinanceSymbol(symbol);
    const url = `${BINANCE_FUTURES_URL}/fapi/v1/fundingRate?symbol=${formattedSymbol}&limit=1`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: BINANCE_DEFAULT_HEADERS,
      next: { revalidate: 60 } as any,
    });
    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      const parsed = parseFloat(data[0].fundingRate);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  } catch (err) {
    return null;
  }
}
