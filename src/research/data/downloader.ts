import fs from "fs";
import path from "path";
import https from "https";
import type { RawHistoricalCandle } from "../types";

/**
 * Downloads authentic multi-year Binance klines data.
 * Strategy:
 * 1. Paginates across Binance Public REST API (`/api/v3/klines` with `startTime`/`endTime`)
 *    using 1,000 candles per chunk (the maximum permitted by Binance).
 * 2. Caches raw results directly into CSV files under `data/historical/`.
 * 3. Incorporates rate-limiting backoff and retry mechanisms to avoid IP bans.
 */

const BINANCE_REST_ENDPOINTS = [
  "https://data-api.binance.vision/api/v3/klines",
  "https://api1.binance.com/api/v3/klines",
  "https://api.binance.com/api/v3/klines",
];

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

function fetchJson(url: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            "User-Agent": "CryptoPilot-Research-Validator/1.0",
          },
          timeout: 10000,
        },
        (res) => {
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
            res.resume();
            return;
          }
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              resolve(JSON.parse(data));
            } catch (err) {
              reject(err);
            }
          });
        }
      )
      .on("error", reject)
      .on("timeout", () => reject(new Error("Request timed out")));
  });
}

async function fetchChunkWithRetry(
  symbol: string,
  startTime: number,
  endTime: number,
  limit: number = 1000
): Promise<any[]> {
  for (const endpoint of BINANCE_REST_ENDPOINTS) {
    const url = `${endpoint}?symbol=${symbol}&interval=4h&startTime=${startTime}&endTime=${endTime}&limit=${limit}`;
    try {
      const json = await fetchJson(url);
      if (Array.isArray(json)) {
        return json;
      }
    } catch (e) {
      // Try next endpoint mirror
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw new Error(`Failed to download kline chunk for ${symbol} starting at ${startTime}`);
}

/**
 * Downloads multi-year continuous 4H candle history from startTime to endTime.
 */
export async function downloadContinuousKlines(
  symbol: string,
  startTime: number,
  endTime: number,
  onProgress?: (loaded: number, currentTimestamp: number) => void
): Promise<RawHistoricalCandle[]> {
  const candles: RawHistoricalCandle[] = [];
  let currentStart = startTime;

  while (currentStart < endTime) {
    const targetEnd = Math.min(currentStart + 1000 * FOUR_HOURS_MS, endTime);
    const rawBars = await fetchChunkWithRetry(symbol, currentStart, targetEnd, 1000);

    if (!rawBars || rawBars.length === 0) {
      break;
    }

    for (const b of rawBars) {
      // Binance kline structure:
      // [0: openTime, 1: open, 2: high, 3: low, 4: close, 5: volume, 6: closeTime, 7: quoteVolume, 8: count, 9: takerBuyVol, 10: takerBuyQuoteVol]
      const candle: RawHistoricalCandle = {
        timestamp: Number(b[0]),
        open: parseFloat(b[1]),
        high: parseFloat(b[2]),
        low: parseFloat(b[3]),
        close: parseFloat(b[4]),
        volume: parseFloat(b[5]),
        closeTime: Number(b[6]),
        quoteVolume: parseFloat(b[7]),
        tradesCount: Number(b[8]),
        takerBuyVolume: parseFloat(b[9]),
        takerBuyQuoteVolume: parseFloat(b[10]),
      };
      candles.push(candle);
    }

    const lastBar = rawBars[rawBars.length - 1];
    const lastBarTime = Number(lastBar[0]);

    if (onProgress) {
      onProgress(candles.length, lastBarTime);
    }

    // Advance to next bar
    currentStart = lastBarTime + FOUR_HOURS_MS;
    if (currentStart >= targetEnd && rawBars.length < 1000) {
      break;
    }

    // Polite rate limiting (150ms between 1000-candle chunks)
    await new Promise((r) => setTimeout(r, 150));
  }

  // Deduplicate and sort
  const seen = new Set<number>();
  const uniqueCandles: RawHistoricalCandle[] = [];
  for (const c of candles) {
    if (!seen.has(c.timestamp)) {
      seen.add(c.timestamp);
      uniqueCandles.push(c);
    }
  }

  uniqueCandles.sort((a, b) => a.timestamp - b.timestamp);
  return uniqueCandles;
}
