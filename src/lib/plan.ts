// Small helpers shared by the program builder and the logging screens.

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export const SUPERSET_COLORS: Record<string, string> = {
  A: "#3b82f6", // blue
  B: "#22c55e", // green
  C: "#f97316", // orange
  D: "#a855f7", // purple
  E: "#ef4444", // red
};

export type TrackingType =
  | "load"
  | "bodyweight_reps"
  | "time"
  | "distance"
  | "distance_height"
  | "reps_only"
  | "completion";

export type PlanRow = {
  id: string;
  exercise_id: string | null;
  display_name: string;
  section: "prep" | "workout";
  superset_group: string | null;
  position: number;
  sets: number | null;
  reps: string | null;
  tempo: string | null;
  target_type: "none" | "weight" | "percent" | "rpe";
  target_value: number | null;
  ask_rpe: boolean;
  coaching_note: string | null;
  video_url: string | null;
  video_start_seconds: number | null;
};

/** Monday = 1 ... Sunday = 7, in Belgian time. */
export function isoWeekday(date = new Date()): number {
  const name = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "Europe/Brussels" }).format(date);
  return WEEKDAYS.indexOf(name) + 1;
}

/** Today's date as YYYY-MM-DD in Belgian time. */
export function todayISO(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(date);
}

/** Monday and Sunday (YYYY-MM-DD) of the week that contains the given day. */
export function weekRange(day = todayISO()): { monday: string; sunday: string } {
  const d = new Date(day + "T12:00:00Z");
  const wd = (d.getUTCDay() + 6) % 7; // 0 = Monday
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - wd);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { monday: monday.toISOString().slice(0, 10), sunday: sunday.toISOString().slice(0, 10) };
}

/** Rows in display order: prep first, then workout, each by position. */
export function sortRows<T extends { section: string; position: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    a.section === b.section ? a.position - b.position : a.section === "prep" ? -1 : 1,
  );
}

/**
 * Labels like A1, A2, B1 for superset rows. Rows that share a letter and sit
 * next to each other form one group. Rows without a letter get no label.
 */
export function supersetLabels<T extends { id: string; section: string; superset_group: string | null }>(
  rows: T[],
): Record<string, string> {
  const labels: Record<string, string> = {};
  const counters: Record<string, number> = {};
  for (const r of rows) {
    const g = (r.superset_group ?? "").trim().toUpperCase();
    if (!g) continue;
    const key = r.section + ":" + g;
    counters[key] = (counters[key] ?? 0) + 1;
    labels[r.id] = g + counters[key];
  }
  return labels;
}

/** "8 ea" -> 8, "6-8" -> 6, "30s each" -> 30. Null when there is no number. */
export function firstNumber(text: string | null | undefined): number | null {
  const m = (text ?? "").match(/\d+(?:[.,]\d+)?/);
  return m ? Number(m[0].replace(",", ".")) : null;
}

/** True when the reps text describes time ("30s", "20 sec", "1 min"). */
export function looksLikeTime(text: string | null | undefined): boolean {
  return /\d\s*(s|sec|secs|seconds|min)\b/i.test(text ?? "");
}

export type Step = { rowId: string; setNumber: number };

/**
 * The order in which sets are done. Straight sets run one exercise at a time.
 * A superset alternates: A1 set 1, A2 set 1, A1 set 2 ... until the longest
 * exercise in the group is finished.
 */
export function buildSteps(rows: PlanRow[]): Step[] {
  const ordered = sortRows(rows);
  const steps: Step[] = [];
  let i = 0;
  while (i < ordered.length) {
    const g = (ordered[i].superset_group ?? "").trim().toUpperCase();
    let j = i + 1;
    if (g) {
      while (
        j < ordered.length &&
        ordered[j].section === ordered[i].section &&
        (ordered[j].superset_group ?? "").trim().toUpperCase() === g
      )
        j++;
    }
    const group = ordered.slice(i, j);
    const maxSets = Math.max(...group.map((r) => r.sets ?? 1));
    for (let s = 1; s <= maxSets; s++) {
      for (const r of group) if ((r.sets ?? 1) >= s) steps.push({ rowId: r.id, setNumber: s });
    }
    i = j;
  }
  return steps;
}

/** Round to the nearest weight step (2.5 kg by default). */
export function roundToStep(value: number, step = 2.5): number {
  const s = step > 0 ? step : 2.5;
  return Math.round(value / s) * s;
}

/** Estimated 1RM (Epley). Only meaningful for 1 to 10 reps. */
export function epley(weight: number, reps: number): number | null {
  if (!(weight > 0) || reps < 1 || reps > 10) return null;
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

export function formatTarget(row: Pick<PlanRow, "target_type" | "target_value">, unit = "kg"): string {
  if (row.target_value == null || row.target_type === "none") return "";
  if (row.target_type === "weight") return `${row.target_value} ${unit}`;
  if (row.target_type === "percent") return `${row.target_value}%`;
  return `RPE ${row.target_value}`;
}
