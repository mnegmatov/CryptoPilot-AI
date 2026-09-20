import { RawHistoricalCandle } from "../types";

export interface ChronologicalSplits {
  inSample: RawHistoricalCandle[];   // Dev: 50%
  validation: RawHistoricalCandle[]; // Val: 25%
  oosHoldout: RawHistoricalCandle[]; // Sealed OOS: 25%
  boundaries: {
    devStart: string;
    devEnd: string;
    valStart: string;
    valEnd: string;
    oosStart: string;
    oosEnd: string;
  };
}

/**
 * Strictly partitions continuous candle series into In-Sample, Validation, and Out-of-Sample.
 * Chronological order is strictly preserved. No random shuffling.
 * Default boundary milestones:
 * - In-Sample (Dev): 2021-01-01 to 2023-06-30
 * - Validation: 2023-07-01 to 2024-09-30
 * - OOS Holdout: 2024-10-01 to present
 */
export function splitChronologicalDataset(
  candles: RawHistoricalCandle[],
  devEndIso: string = "2023-07-01T00:00:00.000Z",
  valEndIso: string = "2024-10-01T00:00:00.000Z"
): ChronologicalSplits {
  if (candles.length === 0) {
    throw new Error("Cannot partition an empty dataset");
  }

  const devEndTs = new Date(devEndIso).getTime();
  const valEndTs = new Date(valEndIso).getTime();

  if (valEndTs <= devEndTs) {
    throw new Error("Validation end timestamp must be strictly after Dev end timestamp");
  }

  const inSample: RawHistoricalCandle[] = [];
  const validation: RawHistoricalCandle[] = [];
  const oosHoldout: RawHistoricalCandle[] = [];

  for (const c of candles) {
    if (c.timestamp < devEndTs) {
      inSample.push(c);
    } else if (c.timestamp < valEndTs) {
      validation.push(c);
    } else {
      oosHoldout.push(c);
    }
  }

  const formatDate = (ts?: number) => (ts ? new Date(ts).toISOString().split("T")[0] : "—");

  return {
    inSample,
    validation,
    oosHoldout,
    boundaries: {
      devStart: formatDate(inSample[0]?.timestamp),
      devEnd: formatDate(inSample[inSample.length - 1]?.timestamp),
      valStart: formatDate(validation[0]?.timestamp),
      valEnd: formatDate(validation[validation.length - 1]?.timestamp),
      oosStart: formatDate(oosHoldout[0]?.timestamp),
      oosEnd: formatDate(oosHoldout[oosHoldout.length - 1]?.timestamp),
    },
  };
}
