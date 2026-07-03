/**
 * The one scoring formula (GAME.md → Scoring). Small, round, human numbers:
 * a case pays at most 10 points (20 on the double-points final case).
 *
 *   attemptBase: 7 (1st attempt) / 5 (2nd) / 3 (3rd)
 *   speedBonus:  +2 solved in the first half of the window, +1 in the
 *                third quarter, +0 after that
 *   streakBonus: +1 when this solve makes it 2+ cases in a row
 *   final case:  everything ×2
 */

export const ATTEMPT_BASE: Record<1 | 2 | 3, number> = {
  1: 7,
  2: 5,
  3: 3,
};

export function scoreForSolve(
  attempt: 1 | 2 | 3,
  remainingMs: number,
  windowMs: number,
  streakAfterSolve: number,
  doublePoints: boolean,
): number {
  if (windowMs <= 0) {
    throw new Error(`Invalid investigation window: ${windowMs}ms`);
  }
  if (remainingMs < 0 || remainingMs > windowMs) {
    throw new Error(
      `remainingMs ${remainingMs} outside window 0..${windowMs}`,
    );
  }
  if (streakAfterSolve < 1) {
    throw new Error(
      `streakAfterSolve must be >= 1 at the moment of a solve, got ${streakAfterSolve}`,
    );
  }
  const base = ATTEMPT_BASE[attempt];
  const remainingFraction = remainingMs / windowMs;
  const speedBonus = remainingFraction >= 0.5 ? 2 : remainingFraction >= 0.25 ? 1 : 0;
  const streakBonus = streakAfterSolve >= 2 ? 1 : 0;
  const total = base + speedBonus + streakBonus;
  return doublePoints ? total * 2 : total;
}
