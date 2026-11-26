/**
 * Main lifts: the big compound and Olympic lifts an athlete can follow on the progress page.
 * Decided by movement pattern and name, unless the coach set it on the exercise.
 */
const COMPOUND_PATTERNS = ["squat", "hinge", "lunge", "push", "pull", "olympic"];
const ISOLATION = /curl|raise|fly\b|flye|flies|kickback|push ?down|extension|crunch|calf|shrug|face pull|pull ?apart|pullover|wrist|rear delt|lateral|abduct|adduct|clamshell|neck|tib\b|isometric|\biso\b|y-?t-?w|external rotation|internal rotation/i;

export function isMainLift(name: string, pattern: string | null | undefined, override: boolean | null | undefined): boolean {
  if (override != null) return override;
  const p = (pattern ?? "").toLowerCase();
  if (p === "hip") return /hip thrust/i.test(name);
  return COMPOUND_PATTERNS.includes(p) && !ISOLATION.test(name);
}
