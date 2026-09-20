import { describe, it, expect } from "vitest";
import { runDevAndValidationEvaluations } from "../research/simulation/runner";
import fs from "fs";
import path from "path";

describe("Phase 3 Execution: In-Sample & Validation Evaluation (T016)", () => {
  it("runs simulation and analytics for BTC, ETH, and SOL on In-Sample and Validation", () => {
    const telemetry = runDevAndValidationEvaluations();

    expect(telemetry).toBeDefined();
    expect(telemetry.inSampleResults).toBeDefined();
    expect(telemetry.validationResults).toBeDefined();

    const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

    for (const sym of symbols) {
      // In-Sample Checks
      const dev = telemetry.inSampleResults[sym];
      expect(dev).toBeDefined();
      expect(dev.partitionName).toBe("IN_SAMPLE");
      expect(dev.candleCount).toBeGreaterThan(3000);
      expect(dev.longOnlyBaseline.metrics.totalTrades).toBeGreaterThanOrEqual(0);
      expect(dev.longOnlyBaseline.costSensitivity.tiers.length).toBe(3);
      expect(dev.longOnlyBaseline.parameterNeighborhood.grid.length).toBe(100);
      expect(dev.longOnlyBaseline.monteCarlo.iterations).toBe(5000);

      // Validation Checks
      const val = telemetry.validationResults[sym];
      expect(val).toBeDefined();
      expect(val.partitionName).toBe("VALIDATION");
      expect(val.candleCount).toBeGreaterThan(1500);
      expect(val.longOnlyBaseline.metrics.totalTrades).toBeGreaterThanOrEqual(0);
      expect(val.longOnlyBaseline.costSensitivity.tiers.length).toBe(3);
      expect(val.longOnlyBaseline.parameterNeighborhood.grid.length).toBe(100);
      expect(val.longOnlyBaseline.monteCarlo.iterations).toBe(5000);

      // Verify Long-Only and Long+Short are separate
      expect(dev.longOnlyBaseline.metrics.direction).toBe("LONG_ONLY");
      expect(dev.longShortComparison.metrics.direction).toBe("LONG_SHORT");

      // Verify Benchmarks
      expect(dev.benchmarks.buyAndHoldReturnPercent).toBeDefined();
      expect(dev.benchmarks.emaDualTrendReturnPercent).toBeDefined();
    }

    const telemetryFile = path.resolve(process.cwd(), "data/research_dev_val_telemetry.json");
    expect(fs.existsSync(telemetryFile)).toBe(true);
  }, 60000);
});
