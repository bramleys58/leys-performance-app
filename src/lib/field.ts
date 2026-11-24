/** Speed and field exercises: which columns they log and what their best result is. */

export type LogField = "weight" | "reps" | "seconds" | "distance";
export type Best = "fastest" | "farthest" | "heaviest";

export type FieldPreset = { key: string; label: string; fields: LogField[]; best: Best; unit: "m" | "cm"; example: string };

/** The choices in the library. Drills use the existing "tick when done". */
export const FIELD_PRESETS: FieldPreset[] = [
  { key: "sprint", label: "Sprint: distance + time", fields: ["distance", "seconds"], best: "fastest", unit: "m", example: "10 m, 20 m, flying 10" },
  { key: "sled", label: "Sled or carry: kg + distance", fields: ["weight", "distance"], best: "heaviest", unit: "m", example: "sled push, farmer carry" },
  { key: "sled_time", label: "Sled timed: kg + distance + time", fields: ["weight", "distance", "seconds"], best: "fastest", unit: "m", example: "resisted sprint" },
  { key: "jump_cm", label: "Jump: reps + result (cm)", fields: ["reps", "distance"], best: "farthest", unit: "cm", example: "broad jump, vertical" },
  { key: "jump_weighted", label: "Weighted jump: kg + reps + result (cm)", fields: ["weight", "reps", "distance"], best: "farthest", unit: "cm", example: "broad jump with a med ball" },
  { key: "jump_m", label: "Bounds: reps + result (m)", fields: ["reps", "distance"], best: "farthest", unit: "m", example: "triple jump, bounds" },
  { key: "throw", label: "Throw: kg + result (m)", fields: ["weight", "distance"], best: "farthest", unit: "m", example: "med ball throw, shot put" },
];

export const presetFor = (fields: string[] | null | undefined, best: string | null | undefined, unit: string | null | undefined) =>
  fields?.length ? FIELD_PRESETS.find((p) => p.best === best && p.unit === (unit ?? "m") && p.fields.join() === fields.join()) ?? null : null;

/** A distance planned in the program's reps text: "20m", "20 m", "40 cm". */
export function plannedDistance(reps: string | null | undefined): number | null {
  const m = (reps ?? "").match(/(\d+(?:[.,]\d+)?)\s*(m|cm)\b/i);
  return m ? Number(m[1].replace(",", ".")) : null;
}

/**
 * Distances per set, for sprints over several distances in one row:
 *   "10, 15, 20m"          -> [10, 15, 20]
 *   "2x10, 2x15, 2x20 m"   -> [10, 10, 15, 15, 20, 20]
 *   "20m"                  -> [20]   (every set the same)
 * Only when the text ends in m or cm (or each part has it); otherwise null.
 */
export function plannedDistances(reps: string | null | undefined): number[] | null {
  const text = (reps ?? "").trim();
  if (!/\d\s*(m|cm)\b/i.test(text)) return null;
  const out: number[] = [];
  for (const part of text.split(/[,;+/]|\s(?=\d+\s*[x×*])/).filter((p) => p.trim())) {
    const m = part.trim().match(/^(?:(\d+)\s*[x×*]\s*)?(\d+(?:[.,]\d+)?)\s*(?:m|cm)?$/i);
    if (!m) return out.length ? out : null;
    const times = m[1] ? Math.min(Number(m[1]), 20) : 1;
    for (let i = 0; i < times; i++) out.push(Number(m[2].replace(",", ".")));
  }
  return out.length ? out : null;
}

/** The planned distance for one set (1-based); the last distance repeats for extra sets. */
export const distanceForSet = (reps: string | null | undefined, setNumber: number): number | null => {
  const list = plannedDistances(reps);
  return list ? list[Math.min(setNumber, list.length) - 1] : null;
};

/** The field the athlete has to measure (never prefilled): the time for "fastest", the distance for "farthest". */
export const resultField = (best: Best | null | undefined): LogField | null => (best === "fastest" ? "seconds" : best === "farthest" ? "distance" : null);

/** Is result a better than b? Lower is better for time, higher for the rest. */
export const better = (best: Best, a: number, b: number) => (best === "fastest" ? a < b : a > b);

export type FieldSet = { exerciseId: string; weight: number | null; reps: number | null; seconds: number | null; distance: number | null };

/**
 * Best result per exercise (and per distance for timed work): the lowest time, the farthest
 * distance or the heaviest weight. Sets without the measured value are ignored.
 */
export function fieldBests(sets: FieldSet[], bestOf: Map<string, Best>) {
  const out = new Map<string, { exerciseId: string; best: Best; value: number; distance: number | null; set: FieldSet }>();
  for (const s of sets) {
    const best = bestOf.get(s.exerciseId);
    if (!best) continue;
    const value = best === "fastest" ? s.seconds : best === "farthest" ? s.distance : s.weight;
    if (value == null || !(Number(value) > 0)) continue;
    // A 10 m and a 20 m sprint are different records.
    const key = best === "fastest" ? `${s.exerciseId}|${s.distance ?? ""}` : s.exerciseId;
    const cur = out.get(key);
    if (!cur || better(best, Number(value), cur.value)) out.set(key, { exerciseId: s.exerciseId, best, value: Number(value), distance: best === "fastest" ? s.distance : null, set: s });
  }
  return out;
}

/** Records broken today: today's best beats the best from before. A first attempt is not a record. */
export function fieldRecords(today: FieldSet[], before: FieldSet[], bestOf: Map<string, Best>) {
  const now = fieldBests(today, bestOf);
  const then = fieldBests(before, bestOf);
  return [...now.entries()].filter(([k, b]) => then.has(k) && better(b.best, b.value, (then.get(k) as { value: number }).value)).map(([, b]) => b);
}
