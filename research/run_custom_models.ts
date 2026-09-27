import path from "path";
import fs from "fs";
import { loadDatasetFromCsv } from "../src/research/data/loader";
import { splitChronologicalDataset } from "../src/research/data/splitter";
import { runBacktest, BacktestOptions } from "../src/core/backtest/engine";
import { generateModelEMomentumSignal } from "./models/model-e-momentum";
import { generateModelFMeanReversionSignal } from "./models/model-f-mean-reversion";
import { generateModelGRegimeSignal } from "./models/model-g-regime";
import { runBuyAndHoldBenchmark, runEmaTrendBenchmark } from "../src/research/simulation/benchmarks";

function main() {
  const dataDir = path.resolve(process.cwd(), "data/historical");
  const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

  const models = [
    { name: "MODEL_E_LONG", generator: generateModelEMomentumSignal, enableShorts: false },
    { name: "MODEL_E_LS", generator: generateModelEMomentumSignal, enableShorts: true },
    { name: "MODEL_F_LONG", generator: generateModelFMeanReversionSignal, enableShorts: false },
    { name: "MODEL_F_LS", generator: generateModelFMeanReversionSignal, enableShorts: true },
    { name: "MODEL_G_LONG", generator: generateModelGRegimeSignal, enableShorts: false },
    { name: "MODEL_G_LS", generator: generateModelGRegimeSignal, enableShorts: true },
  ];

  const results: any[] = [];

  for (const symbol of symbols) {
    const csvPath = path.join(dataDir, `${symbol}_4h_2021_present.csv`);
    if (!fs.existsSync(csvPath)) continue;

    const { candles } = loadDatasetFromCsv(csvPath);
    const splits = splitChronologicalDataset(candles);

    const bh = runBuyAndHoldBenchmark(splits.oosHoldout, 10000);
    const emaTrend = runEmaTrendBenchmark(splits.oosHoldout, 10000);

    results.push({
      symbol,
      model: "BENCHMARKS",
      partition: "OOS",
      bhReturn: bh.returnPercent,
      bhMaxDD: bh.maxDrawdownPercent,
      emaReturn: emaTrend.returnPercent,
      emaMaxDD: emaTrend.maxDrawdownPercent
    });

    for (const model of models) {
      for (const [partitionName, partitionData] of Object.entries({
        DEV: splits.inSample,
        VAL: splits.validation,
        OOS: splits.oosHoldout
      })) {
        const options: any = {
          initialBalance: 10000,
          riskPerTradePercent: 1.0,
          enableShorts: model.enableShorts,
          signalGenerator: model.generator,
          trailingStopType: "CHANDELIER_ATR", // Model E/F uses trailing or fixed exits inside engine
          strategyVersion: "V2" // default behavior for partials etc
        };

        const summary = runBacktest(symbol, "4h", partitionData, options);

        results.push({
          symbol,
          model: model.name,
          partition: partitionName,
          trades: summary.totalTrades,
          winRate: summary.winRatePercent,
          returnPercent: summary.netProfitPercent,
          maxDrawdown: summary.maxDrawdownPercent,
          profitFactor: summary.profitFactor,
          expectancyR: summary.expectancyR,
          sharpe: summary.sharpeRatio,
          duration: summary.averageTradeDurationHours
        });
      }
    }
  }

  console.log(JSON.stringify(results, null, 2));
}

main();
