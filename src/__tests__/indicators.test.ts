import { describe, expect, it } from "vitest";
import {
  calculateATR,
  calculateBollingerBands,
  calculateEMA,
  calculateMACD,
  calculateRSI,
  calculateSMA,
  extractTechnicalIndicators,
} from "../core/quant/indicators";
import { Candle } from "../core/types";

describe("Quantitative Indicator Engine", () => {
  it("calculates SMA correctly", () => {
    const values = [1, 2, 3, 4, 5];
    const sma = calculateSMA(values, 3);
    expect(isNaN(sma[0])).toBe(true);
    expect(isNaN(sma[1])).toBe(true);
    expect(sma[2]).toBe(2); // (1+2+3)/3
    expect(sma[3]).toBe(3); // (2+3+4)/3
    expect(sma[4]).toBe(4); // (3+4+5)/3
  });

  it("calculates EMA without NaN in tail", () => {
    const values = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    const ema = calculateEMA(values, 5);
    expect(ema.length).toBe(values.length);
    expect(ema[ema.length - 1]).toBeGreaterThan(17);
  });

  it("calculates RSI between 0 and 100", () => {
    const values = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 5 + i * 0.5);
    const rsi = calculateRSI(values, 14);
    const validRsi = rsi.filter((v) => !isNaN(v));
    expect(validRsi.length).toBeGreaterThan(0);
    validRsi.forEach((val) => {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(100);
    });
  });

  it("calculates ATR for realistic volatility", () => {
    const mockCandles: Candle[] = Array.from({ length: 30 }, (_, i) => ({
      timestamp: 1700000000000 + i * 3600000,
      open: 100 + i,
      high: 105 + i,
      low: 98 + i,
      close: 102 + i,
      volume: 1000,
    }));

    const atr = calculateATR(mockCandles, 14);
    const lastAtr = atr[atr.length - 1];
    expect(lastAtr).toBeGreaterThan(0);
    expect(lastAtr).toBeCloseTo(7, 0); // High - Low is around 7
  });

  it("extracts full technical indicators suite including ADX", () => {
    const mockCandles: Candle[] = Array.from({ length: 60 }, (_, i) => ({
      timestamp: 1700000000000 + i * 3600000,
      open: 50000 + i * 50,
      high: 50200 + i * 50,
      low: 49800 + i * 50,
      close: 50100 + i * 50,
      volume: 2500,
    }));

    const indicators = extractTechnicalIndicators(mockCandles);
    expect(indicators.currentPrice).toBe(mockCandles[mockCandles.length - 1].close);
    expect(indicators.rsi14).toBeGreaterThan(0);
    expect(indicators.rsi14).toBeLessThanOrEqual(100);
    expect(indicators.atr14).toBeGreaterThan(0);
    expect(indicators.bollingerBands.upper).toBeGreaterThan(indicators.bollingerBands.lower);
    expect(typeof indicators.adx14).toBe("number");
    expect(indicators.adx14).toBeGreaterThanOrEqual(0);
    expect(indicators.adx14).toBeLessThanOrEqual(100);
    expect(indicators.plusDI).toBeGreaterThanOrEqual(0);
    expect(indicators.minusDI).toBeGreaterThanOrEqual(0);
  });
});
