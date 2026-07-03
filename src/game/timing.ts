/** Phase durations — the GAME.md timing table, as code. Fixed per tier; no settings menu. */

import type { Tier } from "./protocol";

export const BRIEFING_MS = 4_000;
export const SUSPENSE_MS = 2_000;

export const TIER_TIMING: Record<
  Tier,
  { evidenceMs: number; investigationMs: number }
> = {
  rookie: { evidenceMs: 45_000, investigationMs: 75_000 },
  detective: { evidenceMs: 60_000, investigationMs: 90_000 },
  inspector: { evidenceMs: 75_000, investigationMs: 120_000 },
};
