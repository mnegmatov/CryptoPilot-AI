import path from "path";
import { downloadContinuousKlines } from "../data/downloader";
import { saveDatasetToCsv, validateDatasetIntegrity } from "../data/loader";
import { recordDatasetInManifest, calculateSha256 } from "../data/manifest";

const SYMBOLS_TO_INGEST = [
  { symbol: "BTCUSDT", startIso: "2021-01-01T00:00:00.000Z" },
  { symbol: "ETHUSDT", startIso: "2021-01-01T00:00:00.000Z" },
  { symbol: "SOLUSDT", startIso: "2020-09-01T00:00:00.000Z" }, // SOL listed on Binance in late 2020
];

async function main() {
  console.log("===============================================================");
  console.log(" Multi-Year Model D Research: Historical Data Ingestion Pipeline");
  console.log("===============================================================");

  const dataDir = path.resolve(process.cwd(), "data/historical");
  const manifestPath = path.join(dataDir, "manifest.json");
  const now = Date.now();

  for (const item of SYMBOLS_TO_INGEST) {
    const startTime = new Date(item.startIso).getTime();
    console.log(`\n[INGEST] Fetching continuous 4H candles for ${item.symbol} from ${item.startIso}...`);

    const candles = await downloadContinuousKlines(
      item.symbol,
      startTime,
      now,
      (loaded, currentTs) => {
        const dateStr = new Date(currentTs).toISOString().split("T")[0];
        process.stdout.write(`\r  --> Loaded ${loaded} candles (progress up to ${dateStr})...`);
      }
    );

    console.log(`\n  --> Finished download: ${candles.length} raw bars.`);

    // 1. Integrity validation
    const validation = validateDatasetIntegrity(candles);
    console.log(`  --> Integrity check: Valid=${validation.isValid}, Gaps=${validation.gapsCount}, Duplicates=${validation.duplicateCount}, Anomalies=${validation.priceAnomaliesCount}`);

    if (!validation.isValid) {
      console.warn("  --> [WARN] Integrity issues detected:", validation.issues.slice(0, 5));
    }

    // 2. Save to data/historical/<SYMBOL>_4h_2021_present.csv
    const csvFileName = `${item.symbol}_4h_2021_present.csv`;
    const csvFilePath = path.join(dataDir, csvFileName);
    saveDatasetToCsv(csvFilePath, candles);
    console.log(`  --> Saved CSV to ${csvFilePath}`);

    // 3. Compute SHA-256 and register in manifest.json
    const sha256 = calculateSha256(csvFilePath);
    console.log(`  --> SHA-256: ${sha256}`);

    recordDatasetInManifest(manifestPath, {
      file: csvFileName,
      symbol: item.symbol,
      timeframe: "4h",
      bars: candles.length,
      sha256,
      startDate: new Date(candles[0].timestamp).toISOString(),
      endDate: new Date(candles[candles.length - 1].timestamp).toISOString(),
      firstTimestamp: candles[0].timestamp,
      lastTimestamp: candles[candles.length - 1].timestamp,
      source: "https://data-api.binance.vision / Binance REST",
      verifiedAt: new Date().toISOString(),
    });

    console.log(`  --> Recorded in ${manifestPath}`);
  }

  console.log("\n===============================================================");
  console.log(" Historical Data Ingestion Complete. Manifest updated.");
  console.log("===============================================================");
}

main().catch((err) => {
  console.error("\n[FATAL] Data ingestion failed:", err);
  process.exit(1);
});
