import { Candle, Timeframe } from "../types";

const BINANCE_BASE_URL = "https://api.binance.com";
const BINANCE_FUTURES_URL = "https://fapi.binance.com";

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
 * Fetches real OHLCV historical candlestick data from Binance public API
 * Zero authentication required.
 */
export async function fetchBinanceKlines(
  symbol: string,
  timeframe: Timeframe,
  limit: number = 200
): Promise<Candle[]> {
  const formattedSymbol = formatBinanceSymbol(symbol);
  const interval = TIMEFRAME_MAP[timeframe] || "1h";
  const url = `${BINANCE_BASE_URL}/api/v3/klines?symbol=${formattedSymbol}&interval=${interval}&limit=${Math.min(limit, 1000)}`;

  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    next: { revalidate: 30 }, // Next.js cache 30s
  });

  if (!response.ok) {
    throw new Error(`Binance klines error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

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
 * Supports pulling thousands of bars (e.g. 4,000–8,000 bars = 6–12 months of 1H data).
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
    let url = `${BINANCE_BASE_URL}/api/v3/klines?symbol=${formattedSymbol}&interval=${interval}&limit=${fetchLimit}`;
    if (currentEndTime) {
      url += `&endTime=${currentEndTime}`;
    }

    const response = await fetch(url, {
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Binance klines range error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
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

    // If chunk returned fewer candles than requested, we reached the beginning of history
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
 * Fetches 24-hour ticker statistics from Binance
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
  const url = `${BINANCE_BASE_URL}/api/v3/ticker/24hr?symbol=${formattedSymbol}`;

  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    next: { revalidate: 10 },
  });

  if (!response.ok) {
    throw new Error(`Binance ticker error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

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
 * Fetches 24-hour ticker statistics for multiple symbols in a single batch request
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
  const url = `${BINANCE_BASE_URL}/api/v3/ticker/24hr?symbols=${encodeURIComponent(formattedSymbols)}`;

  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    next: { revalidate: 10 },
  });

  if (!response.ok) {
    throw new Error(`Binance batch ticker error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
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
 * Fetches the latest perpetual funding rate from Binance Futures public API
 */
export async function fetchBinanceFundingRate(symbol: string): Promise<number> {
  try {
    const formattedSymbol = formatBinanceSymbol(symbol);
    const url = `${BINANCE_FUTURES_URL}/fapi/v1/fundingRate?symbol=${formattedSymbol}&limit=1`;
    const response = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 60 },
    });

    if (!response.ok) return 0.0001; // Neutral baseline (0.01%)

    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      return parseFloat(data[0].fundingRate);
    }
    return 0.0001;
  } catch (err) {
    // Graceful fallback for symbols not on futures
    return 0.0001;
  }
}
