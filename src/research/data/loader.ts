import fs from "fs";
import path from "path";
import type { RawHistoricalCandle, DatasetValidationResult } from "../types";

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

export const CSV_HEADER = "timestamp,open,high,low,close,volume,close_time,quote_volume,trades_count,taker_buy_volume,taker_buy_quote_volume";

/**
 * Serializes raw candles to CSV string
 */
export function candlesToCsv(candles: RawHistoricalCandle[]): string {
  const lines = [CSV_HEADER];
  for (const c of candles) {
    lines.push(
      [
        c.timestamp,
        c.open,
        c.high,
        c.low,
        c.close,
        c.volume,
        c.closeTime,
        c.quoteVolume,
        c.tradesCount,
        c.takerBuyVolume,
        c.takerBuyQuoteVolume,
      ].join(",")
    );
  }
  return lines.join("\n");
}

/**
 * Parses raw CSV into RawHistoricalCandle array
 */
export function parseCandlesFromCsv(csvContent: string): RawHistoricalCandle[] {
  const lines = csvContent.trim().split("\n");
  if (lines.length <= 1) {
    return [];
  }

  const candles: RawHistoricalCandle[] = [];
  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(",");
    if (parts.length < 6) continue;

    candles.push({
      timestamp: parseInt(parts[0], 10),
      open: parseFloat(parts[1]),
      high: parseFloat(parts[2]),
      low: parseFloat(parts[3]),
      close: parseFloat(parts[4]),
      volume: parseFloat(parts[5]),
      closeTime: parts[6] ? parseInt(parts[6], 10) : parseInt(parts[0], 10) + FOUR_HOURS_MS - 1,
      quoteVolume: parts[7] ? parseFloat(parts[7]) : 0,
      tradesCount: parts[8] ? parseInt(parts[8], 10) : 0,
      takerBuyVolume: parts[9] ? parseFloat(parts[9]) : 0,
      takerBuyQuoteVolume: parts[10] ? parseFloat(parts[10]) : 0,
    });
  }

  return candles;
}

/**
 * Validates dataset integrity:
 * - Timestamps strictly monotonic
 * - Timestamp continuity (detects gaps > 4h)
 * - No duplicate timestamps
 * - No zero volume
 * - Price invariants (Low <= Open, Close <= High; Low > 0)
 */
export function validateDatasetIntegrity(candles: RawHistoricalCandle[]): DatasetValidationResult {
  const issues: string[] = [];
  let gapsCount = 0;
  let duplicateCount = 0;
  let priceAnomaliesCount = 0;
  let zeroVolumeCount = 0;

  if (candles.length === 0) {
    return {
      isValid: false,
      totalBars: 0,
      gapsCount: 0,
      duplicateCount: 0,
      priceAnomaliesCount: 0,
      zeroVolumeCount: 0,
      issues: ["Dataset is empty"],
    };
  }

  const seenTimestamps = new Set<number>();

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];

    // Duplicate check
    if (seenTimestamps.has(c.timestamp)) {
      duplicateCount++;
      if (duplicateCount <= 5) {
        issues.push(`Duplicate timestamp detected: ${c.timestamp} (${new Date(c.timestamp).toISOString()})`);
      }
    }
    seenTimestamps.add(c.timestamp);

    // Monotonicity & gap check
    if (i > 0) {
      const prev = candles[i - 1];
      const diff = c.timestamp - prev.timestamp;
      if (diff <= 0) {
        issues.push(`Non-monotonic timestamp order at index ${i}: prev ${prev.timestamp}, current ${c.timestamp}`);
      } else if (diff > FOUR_HOURS_MS) {
        gapsCount++;
        const missingHours = diff / (3600 * 1000);
        if (gapsCount <= 5) {
          issues.push(
            `Data gap of ${missingHours}h between ${new Date(prev.timestamp).toISOString()} and ${new Date(
              c.timestamp
            ).toISOString()}`
          );
        }
      }
    }

    // Price invariants
    if (c.low > c.open || c.low > c.close || c.high < c.open || c.high < c.close || c.low <= 0) {
      priceAnomaliesCount++;
      if (priceAnomaliesCount <= 5) {
        issues.push(`Price invariant violation at ${c.timestamp}: O=${c.open}, H=${c.high}, L=${c.low}, C=${c.close}`);
      }
    }

    // Volume realism check
    if (c.volume <= 0) {
      zeroVolumeCount++;
    }
  }

  const isValid = duplicateCount === 0 && priceAnomaliesCount === 0 && gapsCount === 0;

  return {
    isValid,
    totalBars: candles.length,
    gapsCount,
    duplicateCount,
    priceAnomaliesCount,
    zeroVolumeCount,
    issues,
  };
}

/**
 * Loads and validates historical candles from disk.
 */
export function loadDatasetFromCsv(filePath: string): {
  candles: RawHistoricalCandle[];
  validation: DatasetValidationResult;
} {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Dataset file does not exist: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const candles = parseCandlesFromCsv(content);
  const validation = validateDatasetIntegrity(candles);

  return { candles, validation };
}

/**
 * Saves validated candles to CSV file.
 */
export function saveDatasetToCsv(filePath: string, candles: RawHistoricalCandle[]): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const csv = candlesToCsv(candles);
  fs.writeFileSync(filePath, csv, "utf-8");
}
