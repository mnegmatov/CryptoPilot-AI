import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { DatasetManifest, DatasetManifestEntry, RawHistoricalCandle } from "../types";

export function calculateSha256(filePath: string): string {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash("sha256");
  hashSum.update(fileBuffer);
  return hashSum.digest("hex");
}

/**
 * Creates or updates manifest.json in data/historical/
 */
export function recordDatasetInManifest(
  manifestPath: string,
  entry: DatasetManifestEntry
): DatasetManifest {
  let manifest: DatasetManifest = {
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    sourceArchive: "https://data.binance.vision / Binance REST",
    datasets: {},
  };

  if (fs.existsSync(manifestPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      if (existing && existing.datasets) {
        manifest = existing;
      }
    } catch (e) {
      // Create new manifest if corrupt
    }
  }

  manifest.generatedAt = new Date().toISOString();
  manifest.datasets[entry.symbol] = entry;

  const dir = path.dirname(manifestPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  return manifest;
}

/**
 * Verifies that a local CSV file matches the SHA-256 hash registered in manifest.json
 */
export function verifyDatasetChecksum(
  manifestPath: string,
  symbol: string,
  csvFilePath: string
): { matches: boolean; expectedHash: string; actualHash: string } {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest file does not exist: ${manifestPath}`);
  }

  const manifest: DatasetManifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  const entry = manifest.datasets[symbol];

  if (!entry) {
    throw new Error(`Symbol ${symbol} not registered in manifest`);
  }

  const actualHash = calculateSha256(csvFilePath);
  return {
    matches: actualHash === entry.sha256,
    expectedHash: entry.sha256,
    actualHash,
  };
}
