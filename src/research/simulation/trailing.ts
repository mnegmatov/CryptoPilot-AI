import { RawHistoricalCandle } from "../types";

/**
 * 5-bar structural swing trailing stop evaluator.
 * Strict zero-lookahead rule:
 * For bar T, the trailing stop is computed strictly using completed historical bars
 * from index T-5 through T-1 (window of 5 bars).
 *
 * For Long positions:
 * - Trailing level = min(Low_{T-5}, Low_{T-4}, Low_{T-3}, Low_{T-2}, Low_{T-1})
 * - Ratchet rule: Stop loss only moves UPWARD, never downward.
 *
 * For Short positions:
 * - Trailing level = max(High_{T-5}, High_{T-4}, High_{T-3}, High_{T-2}, High_{T-1})
 * - Ratchet rule: Stop loss only moves DOWNWARD, never upward.
 */

export function calculateStructuralSwingTrailing(
  candles: RawHistoricalCandle[],
  currentBarIndex: number,
  direction: "LONG" | "SHORT",
  windowBars: number = 5
): number | null {
  // Need at least `windowBars` closed bars before currentBarIndex
  const startIdx = currentBarIndex - windowBars;
  const endIdx = currentBarIndex - 1;

  if (startIdx < 0 || endIdx < startIdx) {
    return null;
  }

  const slice = candles.slice(startIdx, endIdx + 1);
  if (slice.length < windowBars) {
    return null;
  }

  if (direction === "LONG") {
    let minLow = Infinity;
    for (let i = 0; i < slice.length; i++) {
      if (slice[i].low < minLow) {
        minLow = slice[i].low;
      }
    }
    return minLow === Infinity ? null : minLow;
  } else {
    let maxHigh = -Infinity;
    for (let i = 0; i < slice.length; i++) {
      if (slice[i].high > maxHigh) {
        maxHigh = slice[i].high;
      }
    }
    return maxHigh === -Infinity ? null : maxHigh;
  }
}
