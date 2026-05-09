// Protocol constants — mirror programs/conexple-protocol/src/state.rs.

export const LEVEL_COUNT = 5;
export const SPLIT_PARTS = 7;
export const MAX_MARGIN_BPS = 5_000; // 50% cap

// Default V1 parameters from CLAUDE.md §5
export const DEFAULT_MULTIPLIER = 10;
export const DEFAULT_POOL_SPLIT_BPS = 9_000; // 90% social / 10% operator
export const DEFAULT_INFINITY_MIN_SPEND_MULTIPLE = 10;
export const DEFAULT_INFINITY_MIN_CONSECUTIVE_CYCLES = 3;
export const DEFAULT_VOID_AUTO_THRESHOLD = 3; // 3 voids in 3 rounds

export type SettlementCycle = "Daily" | "Weekly" | "Monthly" | "Quarterly" | "Yearly";

export const CYCLE_SECONDS: Record<SettlementCycle, number> = {
  Daily: 24 * 60 * 60,
  Weekly: 7 * 24 * 60 * 60,
  Monthly: 30 * 24 * 60 * 60,
  Quarterly: 90 * 24 * 60 * 60,
  Yearly: 365 * 24 * 60 * 60,
};
