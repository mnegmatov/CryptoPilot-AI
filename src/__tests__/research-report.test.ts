import { describe, it, expect } from "vitest";
import { executeFullValidationAndGenerateReport } from "../research/cli/run-validation";
import fs from "fs";
import path from "path";

describe("Phase 5 Synthesis: Final Multi-Year Validation Report Generation (T020–T021)", () => {
  it("compiles research/reports/model_d_multiyear_validation.md answering all 10 core questions", () => {
    const reportPath = executeFullValidationAndGenerateReport();

    expect(fs.existsSync(reportPath)).toBe(true);

    const content = fs.readFileSync(reportPath, "utf-8");
    expect(content.length).toBeGreaterThan(2000);

    // Key Governance & Methodology
    expect(content).toContain("Multi-Year Model D Research & Empirical Validation Report");
    expect(content).toContain("Model D Long-Only (Official Baseline)");
    expect(content).toContain("Model D Long-Only Baseline vs Long + Short Secondary Comparison");

    // Partitions
    expect(content).toContain("Development / In-Sample (2021-01-01 to 2023-06-30)");
    expect(content).toContain("Validation / Forward-Testing (2023-07-01 to 2024-09-30)");
    expect(content).toContain("Final Out-of-Sample Holdout (2024-10-01 to Present)");
    expect(content).toContain("Multi-Year Consolidated Performance (2020/2021 – Present)");

    // Assets
    expect(content).toContain("BTCUSDT");
    expect(content).toContain("ETHUSDT");
    expect(content).toContain("SOLUSDT");

    // Benchmarks
    expect(content).toContain("Buy & Hold");
    expect(content).toContain("EMA 20/50 Dual Trend");

    // Analyses
    expect(content).toContain("Market Regime Attribution");
    expect(content).toContain("Execution Cost Sensitivity & Friction Stress Matrix");
    expect(content).toContain("Parameter Neighborhood Stability");
    expect(content).toContain("Monte Carlo Resampling & Sequence Tail Risk");
    expect(content).toContain("Lookahead & Data Leakage Verification");

    // 10 Core Questions
    for (let q = 1; q <= 10; q++) {
      expect(content).toContain(`Question ${q}:`);
    }

    // Limitations & Reproducibility
    expect(content).toContain("Research Limitations & Reproducibility Manifest");
    expect(content).toContain("69326521f0a162dabd2a150a66ecc4bcb4f88b5af1db09351a8cb36d5bb2fc56");
  });
});
