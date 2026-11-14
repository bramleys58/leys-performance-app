export type CheckIn = {
  day: string;
  sleep_hours: number | null;
  sleep_quality: number | null;
  energy: number | null;
  soreness: number | null;
  stress: number | null;
  bodyweight: number | null;
  note: string | null;
};

/**
 * Readiness from 0 to 100: the average of sleep quality, energy, and the
 * reverse of soreness and stress. Null when none of the four was answered.
 */
export function readiness(c: Pick<CheckIn, "sleep_quality" | "energy" | "soreness" | "stress">): number | null {
  const parts = [c.sleep_quality, c.energy, c.soreness == null ? null : 6 - c.soreness, c.stress == null ? null : 6 - c.stress].filter(
    (v): v is number => v != null,
  );
  if (parts.length === 0) return null;
  const avg = parts.reduce((a, b) => a + b, 0) / parts.length;
  return Math.round(((avg - 1) / 4) * 100);
}

/** Things a coach should look at. Written out, never colour alone. */
export function flags(c: CheckIn): string[] {
  const out: string[] = [];
  if (c.sleep_hours != null && c.sleep_hours < 6) out.push(`slept ${c.sleep_hours} h`);
  if (c.soreness != null && c.soreness >= 4) out.push("very sore");
  if (c.stress != null && c.stress >= 4) out.push("high stress");
  if (c.energy != null && c.energy <= 2) out.push("low energy");
  return out;
}

export const SCALES = [
  { name: "sleep_quality", label: "Sleep quality", low: "Terrible", high: "Great" },
  { name: "energy", label: "Energy", low: "Empty", high: "Full" },
  { name: "soreness", label: "Muscle soreness", low: "Fresh", high: "Very sore" },
  { name: "stress", label: "Stress", low: "Relaxed", high: "Very stressed" },
] as const;
