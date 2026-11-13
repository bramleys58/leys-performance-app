import type { TrackingType } from "@/lib/plan";

/** One exercise on the logging screen: from the program ("plan") or added during the workout ("extra"). */
export type LoggerRow = {
  id: string;
  source: "plan" | "extra";
  exerciseId: string | null;
  name: string;
  section: "prep" | "workout";
  supersetGroup: string | null;
  position: number;
  sets: number;
  reps: string | null;
  tempo: string | null;
  targetType: "none" | "weight" | "percent" | "rpe";
  targetValue: number | null;
  askRpe: boolean;
  note: string | null;
  videoUrl: string | null;
  tracking: TrackingType;
  weightStep: number;
  plannedKg: number | null;
  previous: { setNumber: number; weight: number | null; reps: number | null; seconds: number | null; distance: number | null }[];
};

export type LoggedSet = {
  rowId: string;
  setNumber: number;
  weight: number | null; // kg
  reps: number | null;
  seconds: number | null;
  distance: number | null;
  rpe: number | null;
  skipped: boolean;
};

type ExerciseInfo = { tracking_type: TrackingType; weight_step: number | string; video_url: string | null } | null;
type PrevRow = { set_number: number; weight: number | string | null; reps: number | null; seconds: number | string | null; distance: number | string | null };

/** Builds the row for an exercise added during a workout. */
export function extraRow(
  r: { id: string; exercise_id: string | null; display_name: string; position: number; superset_group?: string | null },
  info: ExerciseInfo,
  previous: PrevRow[],
  setCount = 1,
): LoggerRow {
  const n = (v: number | string | null) => (v == null ? null : Number(v));
  return {
    id: r.id,
    source: "extra",
    exerciseId: r.exercise_id,
    name: r.display_name,
    section: "workout",
    supersetGroup: r.superset_group ?? null,
    position: 1000 + r.position,
    sets: setCount,
    reps: null,
    tempo: null,
    targetType: "none",
    targetValue: null,
    askRpe: false,
    note: null,
    videoUrl: info?.video_url ?? null,
    tracking: info?.tracking_type ?? "load",
    weightStep: Number(info?.weight_step ?? 2.5),
    plannedKg: null,
    previous: previous.map((p) => ({ setNumber: p.set_number, weight: n(p.weight), reps: p.reps, seconds: n(p.seconds), distance: n(p.distance) })),
  };
}

/**
 * Display order on the logging screen: the program's order, with every added
 * exercise that joined a superset moved right behind the rest of its group.
 */
export function displayOrder(rows: LoggerRow[]): LoggerRow[] {
  const out: LoggerRow[] = [];
  for (const r of rows) {
    const g = (r.supersetGroup ?? "").toUpperCase();
    let at = -1;
    if (r.source === "extra" && g) {
      for (let i = out.length - 1; i >= 0; i--) {
        if (out[i].section === r.section && (out[i].supersetGroup ?? "").toUpperCase() === g) {
          at = i;
          break;
        }
      }
    }
    if (at === -1) out.push(r);
    else out.splice(at + 1, 0, r);
  }
  return out;
}

/** The first superset letter not used yet in this workout. */
export function nextGroupLetter(rows: LoggerRow[]): string {
  const used = new Set(rows.map((r) => (r.supersetGroup ?? "").toUpperCase()).filter(Boolean));
  for (const l of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") if (!used.has(l)) return l;
  return "Z";
}
