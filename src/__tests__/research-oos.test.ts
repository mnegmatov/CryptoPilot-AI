import { describe, it, expect } from "vitest";
import { runFinalOosEvaluations } from "../research/simulation/runner";
import fs from "fs";
import path from "path";

describe("Phase 4 Execution: Final Out-of-Sample (OOS) & Multi-Year Evaluation (T017–T019)", () => {
  it("unseals and evaluates OOS holdout and full multi-year series for BTC, ETH, and SOL", () => {
    const telemetry = runFinalOosEvaluations();

    expect(telemetry).toBeDefined();
    expect(telemetry.oosResults).toBeDefined();
    expect(telemetry.fullMultiYearResults).toBeDefined();

    const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

    for (const sym of symbols) {
      // 1. OOS Checks
      const oos = telemetry.oosResults[sym];
      expect(oos).toBeDefined();
      expect(oos.partitionName).toBe("OOS");
      expect(oos.startDate).toBe("2024-10-01");
      expect(oos.candleCount).toBeGreaterThan(3000);
      expect(oos.longOnlyBaseline.metrics.totalTrades).toBeGreaterThanOrEqual(0);
      expect(oos.longOnlyBaseline.metrics.direction).toBe("LONG_ONLY");
      expect(oos.longShortComparison.metrics.direction).toBe("LONG_SHORT");
      expect(oos.longOnlyBaseline.costSensitivity.tiers.length).toBe(3);
      expect(oos.longOnlyBaseline.parameterNeighborhood.grid.length).toBe(100);
      expect(oos.longOnlyBaseline.monteCarlo.iterations).toBe(5000);

      // 2. Full Multi-Year Checks (T019)
      const full = telemetry.fullMultiYearResults[sym];
      expect(full).toBeDefined();
      expect(full.partitionName).toBe("FULL_MULTI_YEAR");
      expect(full.candleCount).toBeGreaterThan(12000);
      expect(full.longOnlyBaseline.metrics.totalTrades).toBeGreaterThanOrEqual(0);
      expect(full.longOnlyBaseline.monteCarlo.iterations).toBe(5000);
      expect(full.benchmarks.buyAndHoldReturnPercent).toBeDefined();
      expect(full.benchmarks.emaDualTrendReturnPercent).toBeDefined();
    }

    const telemetryFile = path.resolve(process.cwd(), "data/research_final_oos_telemetry.json");
    expect(fs.existsSync(telemetryFile)).toBe(true);
  }, 120000);
});
