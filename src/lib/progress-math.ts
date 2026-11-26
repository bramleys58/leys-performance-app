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

/** Axis from round numbers, at least 2 kg (or lbs) tall, so a few close weigh-ins don't blow up into noise. */
export function weightAxis(values: number[]) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mid = (min + max) / 2;
  const span = Math.max(max - min, 2);
  // The smallest round step that fits everything in at most 4 gaps (5 lines).
  for (const step of [0.5, 1, 2, 5, 10, 20, 50]) {
    let lo = Math.floor(Math.min(min, mid - span / 2) / step) * step;
    let hi = Math.ceil(Math.max(max, mid + span / 2) / step) * step;
    // A point right on the edge line gets a little room.
    if (min - lo < step * 0.1) lo -= step;
    if (hi - max < step * 0.1) hi += step;
    if ((hi - lo) / step > 4.001) continue;
    const ticks: number[] = [];
    for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 10) / 10);
    return { lo, hi, ticks, step };
  }
  return { lo: min - 50, hi: max + 50, ticks: [min - 50, max + 50], step: 100 };
}

export type TrackedLift = {
  exerciseId: string;
  name: string;
  /** Best estimated max ever, with the set behind it. */
  best: { e1rm: number; set: SetPoint } | null;
  /** Best estimated max in the last `recentWeeks` weeks. */
  recent: { e1rm: number; set: SetPoint } | null;
  /** Best estimated max per week, oldest first, null for weeks without the lift. */
  weekly: { monday: string; e1rm: number | null }[];
};

/** The lifts an athlete follows: all-time best, recent best and a weekly line (half a year by default). */
export function trackedLifts(ids: string[], names: Map<string, string>, sets: SetPoint[], today: string, weeks = 26, recentWeeks = 6): TrackedLift[] {
  const endMonday = weekRange(today).monday;
  const mondays = Array.from({ length: weeks }, (_, i) => addDays(endMonday, -7 * (weeks - 1 - i)));
  const recentFrom = addDays(endMonday, -7 * (recentWeeks - 1));
  const e1 = (s: SetPoint) => Math.round((epley(s.weight, s.reps) ?? 0) * 10) / 10;
  return ids.map((id) => {
    const mine = sets.filter((s) => s.exerciseId === id && s.weight > 0 && s.reps > 0);
    let best: TrackedLift["best"] = null;
    let recent: TrackedLift["recent"] = null;
    for (const s of mine) {
      const e = e1(s);
      if (!e) continue;
      // Ties go to the earlier date: that is when it was first reached.
      if (!best || e > best.e1rm || (e === best.e1rm && s.on < best.set.on)) best = { e1rm: e, set: s };
      if (s.on >= recentFrom && (!recent || e > recent.e1rm)) recent = { e1rm: e, set: s };
    }
    const weekly = mondays.map((monday) => {
      const sunday = addDays(monday, 6);
      const vals = mine.filter((s) => s.on >= monday && s.on <= sunday).map(e1);
      return { monday, e1rm: vals.length ? Math.max(...vals) : null };
    });
    return { exerciseId: id, name: names.get(id) ?? mine[0]?.name ?? "Lift", best, recent, weekly };
  });
}

/** Lifts that can be followed: everything logged with a weight and reps, most-logged first. */
export function liftOptions(sets: SetPoint[]): { exerciseId: string; name: string; sets: number }[] {
  const count = new Map<string, { exerciseId: string; name: string; sets: number }>();
  for (const s of sets) {
    if (!(s.weight > 0 && s.reps > 0)) continue;
    const cur = count.get(s.exerciseId) ?? { exerciseId: s.exerciseId, name: s.name, sets: 0 };
    cur.sets++;
    count.set(s.exerciseId, cur);
  }
  return [...count.values()].sort((a, b) => b.sets - a.sets || a.name.localeCompare(b.name));
}
