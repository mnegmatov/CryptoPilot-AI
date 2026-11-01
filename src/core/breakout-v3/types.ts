/**
 * Breakout V3 Types — re-exports and extends the V2-AD base types.
 *
 * V3 uses the same position, trade, account, and snapshot types.
 * This module centralizes imports so V3 code never references
 * the V2-AD types module directly in consuming files.
 */
export type {
  BreakoutAssetState,
  BreakoutSignal,
  BreakoutPosition,
  BreakoutClosedTrade,
  BreakoutAccountStats,
  BreakoutAccount,
  BreakoutSnapshot,
  BreakoutTelemetry,
  BreakoutCycleReport,
} from "../breakout-paper/types";
