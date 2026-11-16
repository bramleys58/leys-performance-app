import { epley, weekRange } from "./plan.ts";

export type SetPoint = { exerciseId: string; name: string; weight: number; reps: number; on: string };
export type WeightPoint = { day: string; kg: number };

const DAY = 86400000;
const t = (d: string) => Date.parse(d + "T12:00:00Z");
const addDays = (d: string, n: number) => new Date(t(d) + n * DAY).toISOString().slice(0, 10);

/** Rolling average over the last `days` days (inclusive) for every logged day. */
export function rollingAverage(points: WeightPoint[], days = 7): (WeightPoint & { avg: number })[] {
  const sorted = [...points].sort((a, b) => a.day.localeCompare(b.day));
  return sorted.map((p) => {
    const from = addDays(p.day, -(days - 1));
    const window = sorted.filter((q) => q.day >= from && q.day <= p.day);
    return { ...p, avg: Math.round((window.reduce((s, q) => s + q.kg, 0) / window.length) * 100) / 100 };
  });
}

/**
 * Change in bodyweight over a period, using the 7-day average so one salty dinner
 * doesn't count. Compares the latest average with the average closest to `days` ago.
 */
export function weightChange(points: WeightPoint[], days: number): number | null {
  const avg = rollingAverage(points);
  if (avg.length < 2) return null;
  const last = avg[avg.length - 1];
  const target = addDays(last.day, -days);
  const before = avg.filter((p) => p.day <= target);
  // No weigh-in that far back: the first one still counts when it is only a few days short.
  const ref = before.length ? before[before.length - 1] : t(avg[0].day) - t(target) <= 3 * DAY && avg[0] !== last ? avg[0] : null;
  if (!ref) return null;
  // Too far from the target day to mean anything.
  if (t(target) - t(ref.day) > Math.max(7, days / 2) * DAY) return null;
  return Math.round((last.avg - ref.avg) * 10) / 10;
}

export type WeekAverage = { monday: string; avg: number; count: number; change: number | null };

/** How many weeks with weigh-ins it takes before the weekly comparison shows. */
export const WEEKS_FOR_WEEKLY = 6;

/**
 * Average bodyweight per calendar week (Monday to Sunday), oldest first, for the
 * last `weeks` weeks that have weigh-ins. `change` is against the previous week
 * with weigh-ins, when that week is directly before it.
 */
export function weeklyAverages(points: WeightPoint[], weeks = 12): WeekAverage[] {
  const byWeek = new Map<string, number[]>();
  for (const p of points) {
    const m = weekRange(p.day).monday;
    byWeek.set(m, [...(byWeek.get(m) ?? []), p.kg]);
  }
  const all = [...byWeek.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([monday, kgs]) => ({ monday, avg: Math.round((kgs.reduce((x, y) => x + y, 0) / kgs.length) * 100) / 100, count: kgs.length }));
  return all
    .map((w, i) => {
      const prev = all[i - 1];
      const adjacent = prev && t(w.monday) - t(prev.monday) === 7 * DAY;
      return { ...w, change: adjacent ? Math.round((w.avg - prev.avg) * 100) / 100 : null };
    })
    .slice(-weeks);
}

/** Average change per week over the last `span` weeks of weekly averages (first to last), or null. */
export function weeklyRate(avgs: WeekAverage[], span = 4): number | null {
  const recent = avgs.slice(-(span + 1));
  if (recent.length < 2) return null;
  const first = recent[0];
  const last = recent[recent.length - 1];
  const weeksApart = (t(last.monday) - t(first.monday)) / (7 * DAY);
  return weeksApart > 0 ? Math.round(((last.avg - first.avg) / weeksApart) * 100) / 100 : null;
}

export type LiftSummary = {
  exerciseId: string;
  name: string;
  /** Best estimated max before the block started (all time), null when never done before. */
  before: number | null;
  /** Best estimated max during the block. */
  blockBest: number | null;
  /** The set behind blockBest. */
  blockBestSet: SetPoint | null;
  /** Best estimated max per block week, null for weeks without the lift. */
  weekly: { monday: string; e1rm: number | null }[];
  /** Days in the block with a record: a higher estimated max or the heaviest weight ever. */
  prDays: string[];
  /** Heaviest weight per rep count (1, 3, 5, 8, 10 and up), all time, with whether it was set in the block. */
  repBests: { reps: number; weight: number; on: string; inBlock: boolean }[];
};

const REP_TARGETS = [1, 3, 5, 8, 10];

/**
 * Per main lift of the block: where it started, where it is, week by week.
 * `sets` must hold every logged set of the athlete (any date) for these lifts.
 */
export function liftSummaries(liftIds: string[], names: Map<string, string>, sets: SetPoint[], blockStart: string, today: string, maxWeeks = 12): LiftSummary[] {
  const startMonday = weekRange(blockStart).monday;
  const endMonday = weekRange(today).monday;
  const span = Math.round((t(endMonday) - t(startMonday)) / (7 * DAY)) + 1;
  const count = Math.max(1, Math.min(span, maxWeeks));
  const firstMonday = addDays(endMonday, -7 * (count - 1));
  const mondays = Array.from({ length: count }, (_, i) => addDays(firstMonday, 7 * i));

  return liftIds.map((id) => {
    const mine = sets.filter((s) => s.exerciseId === id && s.weight > 0 && s.reps > 0).sort((a, b) => a.on.localeCompare(b.on));
    let before: number | null = null;
    let blockBest: number | null = null;
    let blockBestSet: SetPoint | null = null;
    let running: number | null = null;
    let heaviest: number | null = null;
    const prDays: string[] = [];
    for (const s of mine) {
      const raw = epley(s.weight, s.reps);
      if (!raw) continue;
      const e = Math.round(raw * 10) / 10;
      const heavier = heaviest != null && s.weight > heaviest;
      if (s.on < blockStart) {
        before = before == null ? e : Math.max(before, e);
      } else {
        if (blockBest == null || e > blockBest) {
          blockBest = e;
          blockBestSet = s;
        }
        if (((running != null && e > running + 0.01) || heavier) && !prDays.includes(s.on)) prDays.push(s.on);
      }
      running = running == null ? e : Math.max(running, e);
      heaviest = heaviest == null ? s.weight : Math.max(heaviest, s.weight);
    }
    // The first time ever is not a record, but beating the pre-block best is.
    const weekly = mondays.map((monday) => {
      const sunday = addDays(monday, 6);
      const vals = mine.filter((s) => s.on >= monday && s.on <= sunday).map((s) => Math.round((epley(s.weight, s.reps) ?? 0) * 10) / 10);
      return { monday, e1rm: vals.length ? Math.max(...vals) : null };
    });
    const repBests: LiftSummary["repBests"] = [];
    for (const r of REP_TARGETS) {
      const pool = mine.filter((s) => (r === 10 ? s.reps >= 10 : s.reps === r));
      if (pool.length === 0) continue;
      const top = pool.reduce((a, b) => (b.weight > a.weight || (b.weight === a.weight && b.on < a.on) ? b : a));
      repBests.push({ reps: r, weight: top.weight, on: top.on, inBlock: top.on >= blockStart });
    }
    return { exerciseId: id, name: names.get(id) ?? mine[0]?.name ?? "Lift", before, blockBest, blockBestSet, weekly, prDays, repBests };
  });
}
