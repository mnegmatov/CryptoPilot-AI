import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { RawHistoricalCandle } from "../research/types";
import {
  candlesToCsv,
  parseCandlesFromCsv,
  validateDatasetIntegrity,
} from "../research/data/loader";
import { splitChronologicalDataset } from "../research/data/splitter";
import { recordDatasetInManifest, verifyDatasetChecksum } from "../research/data/manifest";

describe("Research Data Layer & Ingestion Integrity (Phase 1: T001–T007)", () => {
  const mockCandles: RawHistoricalCandle[] = [
    {
      timestamp: 1609459200000, // 2021-01-01 00:00:00
      open: 29000,
      high: 29500,
      low: 28800,
      close: 29200,
      volume: 100,
      closeTime: 1609473599999,
      quoteVolume: 2900000,
      tradesCount: 1500,
      takerBuyVolume: 50,
      takerBuyQuoteVolume: 1450000,
    },
    {
      timestamp: 1609473600000, // 2021-01-01 04:00:00 (+4h)
      open: 29200,
      high: 29800,
      low: 29100,
      close: 29600,
      volume: 120,
      closeTime: 1609487999999,
      quoteVolume: 3500000,
      tradesCount: 1800,
      takerBuyVolume: 60,
      takerBuyQuoteVolume: 1750000,
    },
    {
      timestamp: 1609488000000, // 2021-01-01 08:00:00 (+4h)
      open: 29600,
      high: 30000,
      low: 29400,
      close: 29900,
      volume: 150,
      closeTime: 1609502399999,
      quoteVolume: 4500000,
      tradesCount: 2000,
      takerBuyVolume: 80,
      takerBuyQuoteVolume: 2400000,
    },
  ];

  it("verifies CSV serialization and deserialization preserves all OHLCV metrics", () => {
    const csv = candlesToCsv(mockCandles);
    const parsed = parseCandlesFromCsv(csv);

    expect(parsed.length).toBe(mockCandles.length);
    expect(parsed[0].timestamp).toBe(mockCandles[0].timestamp);
    expect(parsed[0].open).toBe(mockCandles[0].open);
    expect(parsed[0].high).toBe(mockCandles[0].high);
    expect(parsed[0].low).toBe(mockCandles[0].low);
    expect(parsed[0].close).toBe(mockCandles[0].close);
    expect(parsed[0].volume).toBe(mockCandles[0].volume);
    expect(parsed[1].timestamp).toBe(mockCandles[1].timestamp);
  });

  it("passes validation on healthy continuous 4H series", () => {
    const result = validateDatasetIntegrity(mockCandles);
    expect(result.isValid).toBe(true);
    expect(result.gapsCount).toBe(0);
    expect(result.duplicateCount).toBe(0);
    expect(result.priceAnomaliesCount).toBe(0);
  });

  it("detects price anomalies where low > open or high < close", () => {
    const corruptCandle: RawHistoricalCandle = {
      ...mockCandles[0],
      low: 31000, // Low > Open and High!
    };
    const result = validateDatasetIntegrity([corruptCandle]);
    expect(result.isValid).toBe(false);
    expect(result.priceAnomaliesCount).toBeGreaterThan(0);
  });

  it("detects timestamp gaps greater than 4 hours", () => {
    const gappedCandles: RawHistoricalCandle[] = [
      mockCandles[0],
      {
        ...mockCandles[1],
        timestamp: mockCandles[0].timestamp + 8 * 3600 * 1000, // 8h gap
      },
    ];
    const result = validateDatasetIntegrity(gappedCandles);
    expect(result.isValid).toBe(false);
    expect(result.gapsCount).toBe(1);
  });

  it("detects duplicate timestamps", () => {
    const duplicateCandles: RawHistoricalCandle[] = [
      mockCandles[0],
      mockCandles[0], // Exact duplicate
    ];
    const result = validateDatasetIntegrity(duplicateCandles);
    expect(result.isValid).toBe(false);
    expect(result.duplicateCount).toBe(1);
  });

  it("strictly enforces chronological partitioning into Dev, Val, and OOS holdout", () => {
    const testSeries: RawHistoricalCandle[] = [
      { ...mockCandles[0], timestamp: new Date("2022-01-01T00:00:00Z").getTime() },
      { ...mockCandles[1], timestamp: new Date("2023-08-01T00:00:00Z").getTime() },
      { ...mockCandles[2], timestamp: new Date("2025-01-01T00:00:00Z").getTime() },
    ];

    const splits = splitChronologicalDataset(
      testSeries,
      "2023-07-01T00:00:00.000Z",
      "2024-10-01T00:00:00.000Z"
    );

    expect(splits.inSample.length).toBe(1);
    expect(splits.inSample[0].timestamp).toBe(testSeries[0].timestamp);

    expect(splits.validation.length).toBe(1);
    expect(splits.validation[0].timestamp).toBe(testSeries[1].timestamp);

    expect(splits.oosHoldout.length).toBe(1);
    expect(splits.oosHoldout[0].timestamp).toBe(testSeries[2].timestamp);
  });

  it("generates and verifies SHA-256 manifest records", () => {
    const testDir = path.resolve(process.cwd(), "data/historical");
    const testManifestPath = path.join(testDir, "test_manifest.json");
    const testCsvPath = path.join(testDir, "test_dataset.csv");

    // Write sample CSV
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(testCsvPath, candlesToCsv(mockCandles), "utf-8");

    // Record in test manifest
    recordDatasetInManifest(testManifestPath, {
      file: "test_dataset.csv",
      symbol: "TESTUSDT",
      timeframe: "4h",
      bars: mockCandles.length,
      sha256: "dummy",
      startDate: new Date(mockCandles[0].timestamp).toISOString(),
      endDate: new Date(mockCandles[2].timestamp).toISOString(),
      firstTimestamp: mockCandles[0].timestamp,
      lastTimestamp: mockCandles[2].timestamp,
      source: "unit-test",
      verifiedAt: new Date().toISOString(),
    });

    // Update with real hash
    const realCrypto = require("crypto");
    const realHash = realCrypto.createHash("sha256").update(fs.readFileSync(testCsvPath)).digest("hex");
    const manifestContent = JSON.parse(fs.readFileSync(testManifestPath, "utf-8"));
    manifestContent.datasets.TESTUSDT.sha256 = realHash;
    fs.writeFileSync(testManifestPath, JSON.stringify(manifestContent, null, 2), "utf-8");

    const checksumResult = verifyDatasetChecksum(testManifestPath, "TESTUSDT", testCsvPath);
    expect(checksumResult.matches).toBe(true);

    // Clean up temporary test files
    if (fs.existsSync(testManifestPath)) fs.unlinkSync(testManifestPath);
    if (fs.existsSync(testCsvPath)) fs.unlinkSync(testCsvPath);
  });
});
