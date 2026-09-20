import fs from "fs";
import path from "path";
import { runDevAndValidationEvaluations, runFinalOosEvaluations, Phase3Telemetry, Phase4OosTelemetry } from "../simulation/runner";
import { generateComprehensiveMarkdownReport } from "../reports/generator";

export function executeFullValidationAndGenerateReport(): string {
  const dataDir = path.resolve(process.cwd(), "data");
  const devValPath = path.join(dataDir, "research_dev_val_telemetry.json");
  const oosPath = path.join(dataDir, "research_final_oos_telemetry.json");

  let devValData: Phase3Telemetry;
  let oosData: Phase4OosTelemetry;

  if (fs.existsSync(devValPath)) {
    devValData = JSON.parse(fs.readFileSync(devValPath, "utf-8"));
  } else {
    devValData = runDevAndValidationEvaluations();
  }

  if (fs.existsSync(oosPath)) {
    oosData = JSON.parse(fs.readFileSync(oosPath, "utf-8"));
  } else {
    oosData = runFinalOosEvaluations();
  }

  const reportMarkdown = generateComprehensiveMarkdownReport(devValData, oosData);

  const reportDir = path.resolve(process.cwd(), "research/reports");
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const reportFilePath = path.join(reportDir, "model_d_multiyear_validation.md");
  fs.writeFileSync(reportFilePath, reportMarkdown, "utf-8");

  return reportFilePath;
}

if (typeof require !== "undefined" && require.main === module) {
  const file = executeFullValidationAndGenerateReport();
  console.log(`\n[SUCCESS] Multi-Year Validation Report generated at: ${file}`);
}
