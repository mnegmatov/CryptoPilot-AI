import { Candle, MarketContextData, Timeframe } from "../types";
import {
  fetchBinance24hrTicker,
  fetchBinanceBatchTickers,
  fetchBinanceFundingRate,
  fetchBinanceKlines,
} from "./binance";
import { fetchFearAndGreedIndex } from "./sentiment";

export interface WatchlistAsset {
  symbol: string;
  name: string;
  lastPrice: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volumeQuote: number;
}

export const DEFAULT_ASSETS = [
  { symbol: "BTCUSDT", name: "Bitcoin" },
  { symbol: "ETHUSDT", name: "Ethereum" },
  { symbol: "SOLUSDT", name: "Solana" },
  { symbol: "BNBUSDT", name: "BNB" },
  { symbol: "AVAXUSDT", name: "Avalanche" },
  { symbol: "LINKUSDT", name: "Chainlink" },
  { symbol: "NEARUSDT", name: "NEAR Protocol" },
  { symbol: "SUIUSDT", name: "Sui" },
];

/**
 * Validates candle data integrity
 */
export function validateCandles(candles: Candle[]): Candle[] {
  if (!candles || candles.length === 0) {
    throw new Error("No candles returned from data source");
  }

  // Filter out corrupted bars and ensure chronological order
  const valid = candles.filter(
    (c) =>
      Number.isFinite(c.timestamp) &&
      Number.isFinite(c.open) &&
      Number.isFinite(c.high) &&
      Number.isFinite(c.low) &&
      Number.isFinite(c.close) &&
      c.low <= c.high &&
      c.open > 0 &&
      c.close > 0
  );

  valid.sort((a, b) => a.timestamp - b.timestamp);
  return valid;
}

/**
 * Fetches real historical candles with validation
 */
export async function getMarketCandles(
  symbol: string,
  timeframe: Timeframe,
  limit: number = 200
): Promise<Candle[]> {
  try {
    const raw = await fetchBinanceKlines(symbol, timeframe, limit);
    return validateCandles(raw);
  } catch (error) {
    console.error(`Error fetching candles for ${symbol}:`, error);
    throw error;
  }
}

/**
 * Fetches watchlist overview data across major crypto assets using single batch query
 */
export async function getWatchlistOverview(): Promise<WatchlistAsset[]> {
  const symbols = DEFAULT_ASSETS.map((a) => a.symbol);
  const batchTickers = await fetchBinanceBatchTickers(symbols);
  const tickerMap = new Map(batchTickers.map((t) => [t.symbol, t]));

  return DEFAULT_ASSETS.map((asset) => {
    const ticker = tickerMap.get(asset.symbol);
    return {
      symbol: asset.symbol,
      name: asset.name,
      lastPrice: ticker ? ticker.lastPrice : 0,
      change24h: ticker ? ticker.priceChangePercent : 0,
      high24h: ticker ? ticker.highPrice : 0,
      low24h: ticker ? ticker.lowPrice : 0,
      volumeQuote: ticker ? ticker.quoteVolume : 0,
    };
  });
}


/**
 * Collects complete real-time market context
 */
export async function getMarketContext(symbol: string): Promise<MarketContextData> {
  const [fng, fundingRate] = await Promise.all([
    fetchFearAndGreedIndex(),
    fetchBinanceFundingRate(symbol),
  ]);

  let regime: MarketContextData["marketRegime"] = "CHOPPY_RANGE";
  if (fundingRate !== null && fundingRate > 0.0003) {
    regime = "HIGH_VOLATILITY_EXPANSION"; // Aggressive long leverage
  } else if (fng.score !== null && fng.score > 65) {
    regime = "TRENDING_BULL";
  } else if (fng.score !== null && fng.score < 35) {
    regime = "TRENDING_BEAR";
  }

  return {
    fearGreedIndex: fng.score,
    fearGreedSentiment: fng.sentiment,
    fundingRate: fundingRate,
    marketRegime: regime,
  };
}
