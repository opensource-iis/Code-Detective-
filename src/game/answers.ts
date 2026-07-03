/**
 * Free-text fix grading (GAME.md → Free-text rules):
 * tolerant on formatting, strict on meaning.
 * Normalization: unify quotes to ', then ignore ALL whitespace.
 * Python identifiers stay case-sensitive.
 */

export function normalizeFix(text: string): string {
  return text
    .replace(/[“”"]/g, "'")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, "");
}

export function matchesAccepted(accepted: string[], submitted: string): boolean {
  const norm = normalizeFix(submitted);
  if (norm.length === 0) return false;
  return accepted.some((a) => normalizeFix(a) === norm);
}
