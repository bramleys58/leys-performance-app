import { readiness, type CheckIn } from "@/lib/checkin";
import { epley, todayISO, weekRange } from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";
import { best, type Test } from "@/lib/testing";

export type WeekPoint = { monday: string; tonnage: number; sessions: number };
export type PR = { exerciseId: string; name: string; weight: number; reps: number; e1rm: number; on: string };
export type TestSummary = { test: Test; latest: number; latestOn: string; previous: number | null; best: number; history: { on: string; value: number }[] };

const WEEKS = 8;

/** Everything the progress page shows for one athlete. Weights are in kg. */
export async function getProgress(athleteId: string) {
  const supabase = await createClient();
  const { monday } = weekRange(todayISO());
  const start = new Date(monday + "T12:00:00Z");
  start.setUTCDate(start.getUTCDate() - 7 * (WEEKS - 1));
  const from = start.toISOString().slice(0, 10);

  const twoWeeksAgo = new Date(new Date(todayISO() + "T12:00:00Z").getTime() - 13 * 86400000).toISOString().slice(0, 10);
  const [{ data: logs }, { data: sets }, { data: maxes }, { data: results }, { data: tests }, { data: checkRows }] = await Promise.all([
    supabase.from("workout_logs").select("id, performed_on, finished_at").eq("athlete_id", athleteId).gte("performed_on", from),
    supabase
      .from("set_logs")
      .select("exercise_id, exercise_name, weight, reps, workout_logs!inner(performed_on), exercises(tracking_type, name)")
      .eq("athlete_id", athleteId)
      .eq("skipped", false)
      .not("weight", "is", null)
      .not("reps", "is", null)
      .limit(10000),
    supabase.from("maxes").select("value, source, set_on, exercises(name)").eq("athlete_id", athleteId).eq("is_active", true),
    supabase.from("test_results").select("test_id, value, test_events(held_on)").eq("athlete_id", athleteId),
    supabase.from("tests").select("*"),
    supabase.from("check_ins").select("*").eq("athlete_id", athleteId).gte("day", twoWeeksAgo).order("day", { ascending: false }),
  ]);

  // ---- weekly volume (kg lifted) and sessions, last 8 weeks
  const weeks: WeekPoint[] = Array.from({ length: WEEKS }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + 7 * i);
    return { monday: d.toISOString().slice(0, 10), tonnage: 0, sessions: 0 };
  });
  const weekOf = (day: string) => {
    const idx = Math.floor((new Date(day + "T12:00:00Z").getTime() - start.getTime()) / (7 * 86400000));
    return idx >= 0 && idx < WEEKS ? weeks[idx] : null;
  };

  type SetRow = { exercise_id: string | null; exercise_name: string; weight: number; reps: number; workout_logs: { performed_on: string }; exercises: { tracking_type: string; name: string } | null };
  const allSets = ((sets ?? []) as unknown as SetRow[]).sort((a, b) => a.workout_logs.performed_on.localeCompare(b.workout_logs.performed_on));
  for (const s of allSets) {
    const w = weekOf(s.workout_logs.performed_on);
    if (w && (s.exercises?.tracking_type ?? "load") === "load") w.tonnage += Number(s.weight) * s.reps;
  }
  for (const l of (logs ?? []) as { performed_on: string; finished_at: string | null }[]) {
    const w = weekOf(l.performed_on);
    if (w) w.sessions += 1;
  }

  // ---- personal records: each time a lift's best estimated 1RM went up (not the first time it was logged)
  const bestSoFar = new Map<string, number>();
  const lastPr = new Map<string, PR>();
  for (const s of allSets) {
    if (!s.exercise_id || (s.exercises?.tracking_type ?? "load") !== "load") continue;
    const e = epley(Number(s.weight), s.reps);
    if (!e) continue;
    const prev = bestSoFar.get(s.exercise_id);
    if (prev === undefined || e > prev + 0.01) {
      if (prev !== undefined) {
        lastPr.set(s.exercise_id, { exerciseId: s.exercise_id, name: s.exercises?.name ?? s.exercise_name, weight: Number(s.weight), reps: s.reps, e1rm: e, on: s.workout_logs.performed_on });
      }
      bestSoFar.set(s.exercise_id, e);
    }
  }
  const prs = [...lastPr.values()].sort((a, b) => b.on.localeCompare(a.on)).slice(0, 10);

  // ---- tests: best per test day, latest vs the day before it
  const testList = (tests ?? []) as Test[];
  type Res = { test_id: string; value: number; test_events: { held_on: string } | null };
  const byTest = new Map<string, Map<string, number[]>>();
  for (const r of (results ?? []) as unknown as Res[]) {
    const on = r.test_events?.held_on;
    if (!on) continue;
    const days = byTest.get(r.test_id) ?? new Map<string, number[]>();
    days.set(on, [...(days.get(on) ?? []), Number(r.value)]);
    byTest.set(r.test_id, days);
  }
  const testSummaries: TestSummary[] = [];
  for (const [testId, days] of byTest) {
    const t = testList.find((x) => x.id === testId);
    if (!t) continue;
    const history = [...days.entries()]
      .map(([on, vals]) => ({ on, value: best(vals, t.higher_is_better) as number }))
      .sort((a, b) => a.on.localeCompare(b.on));
    const latest = history[history.length - 1];
    testSummaries.push({
      test: t,
      latest: latest.value,
      latestOn: latest.on,
      previous: history.length > 1 ? history[history.length - 2].value : null,
      best: best(history.map((h) => h.value), t.higher_is_better) as number,
      history,
    });
  }
  testSummaries.sort((a, b) => a.test.position - b.test.position);

  type MaxRow = { value: number; source: string; set_on: string; exercises: { name: string } | null };
  const maxList = ((maxes ?? []) as unknown as MaxRow[])
    .map((m) => ({ name: m.exercises?.name ?? "Exercise", value: Number(m.value), source: m.source, on: m.set_on }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // ---- check-ins, last 14 days
  const checkIns = ((checkRows ?? []) as CheckIn[]).map((c) => ({ ...c, readiness: readiness(c) }));
  const scores = checkIns.map((c) => c.readiness).filter((v): v is number => v != null);
  const slept = checkIns.map((c) => (c.sleep_hours == null ? null : Number(c.sleep_hours))).filter((v): v is number => v != null);
  const weights = checkIns.filter((c) => c.bodyweight != null).map((c) => ({ day: c.day, kg: Number(c.bodyweight) }));
  const wellness = {
    days: checkIns,
    avgReadiness: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    avgSleep: slept.length ? Math.round((slept.reduce((a, b) => a + b, 0) / slept.length) * 10) / 10 : null,
    latestWeight: weights[0] ?? null,
    firstWeight: weights.length > 1 ? weights[weights.length - 1] : null,
  };

  return { weeks, prs, maxes: maxList, tests: testSummaries, wellness };
}
