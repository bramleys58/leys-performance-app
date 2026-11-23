import { readiness, type CheckIn } from "@/lib/checkin";
import { epley, todayISO, weekRange } from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";
import { WEEKS_FOR_WEEKLY, liftSummaries, rollingAverage, weeklyAverages, weeklyRate, weightChange, type SetPoint } from "@/lib/progress-math";
import { best, type Test } from "@/lib/testing";
import { better, type Best } from "@/lib/field";

export type WeekPoint = { monday: string; tonnage: number; sessions: number };
export type PR = { exerciseId: string; name: string; weight: number; reps: number; e1rm: number; on: string };
/** One speed/field record: an exercise, or one distance of a sprint. */
export type FieldProgress = { key: string; name: string; best: Best; unit: string; distance: number | null; bestValue: number; bestOn: string; latest: number; latestOn: string; history: number[] };
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
  const yearAgo = new Date(new Date(todayISO() + "T12:00:00Z").getTime() - 365 * 86400000).toISOString().slice(0, 10);
  const [{ data: logs }, { data: sets }, { data: maxes }, { data: results }, { data: tests }, { data: checkRows }, { data: bwRows }, { data: bwCheckRows }, { data: programRows }, { data: fieldRows }] = await Promise.all([
    supabase.from("workout_logs").select("id, performed_on, finished_at, duration_minutes").eq("athlete_id", athleteId).gte("performed_on", from),
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
    supabase.from("bodyweights").select("day, kg").eq("athlete_id", athleteId).gte("day", yearAgo),
    supabase.from("check_ins").select("day, bodyweight").eq("athlete_id", athleteId).gte("day", yearAgo).not("bodyweight", "is", null),
    supabase
      .from("programs")
      .select("id, name, start_date, created_at, sessions(session_exercises(exercise_id, section, position, target_type, max_exercise_id, exercises!session_exercises_exercise_id_fkey(name, tracking_type, counts_for_maxes)))")
      .eq("athlete_id", athleteId)
      .eq("status", "active"),
    // Speed and field work: exercises with a best result (fastest, farthest, heaviest).
    supabase
      .from("set_logs")
      .select("exercise_id, weight, reps, seconds, distance, workout_logs!inner(performed_on), exercises!inner(name, best, distance_unit)")
      .eq("athlete_id", athleteId)
      .eq("skipped", false)
      .not("exercises.best", "is", null)
      .limit(10000),
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

  const times = ((logs ?? []) as { duration_minutes: number | null }[]).map((l) => l.duration_minutes).filter((v): v is number => v != null && v > 0);
  const avgMinutes = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;

  // ---- bodyweight: own log, plus what was entered in daily check-ins (the log wins on the same day)
  const byDay = new Map<string, number>();
  for (const c of (bwCheckRows ?? []) as { day: string; bodyweight: number }[]) byDay.set(c.day, Number(c.bodyweight));
  for (const b of (bwRows ?? []) as { day: string; kg: number }[]) byDay.set(b.day, Number(b.kg));
  const bwPoints = [...byDay.entries()].map(([day, kg]) => ({ day, kg })).sort((a, b) => a.day.localeCompare(b.day));
  const bodyweight = {
    points: rollingAverage(bwPoints),
    latest: bwPoints[bwPoints.length - 1] ?? null,
    change7: weightChange(bwPoints, 7),
    change30: weightChange(bwPoints, 30),
    loggedToday: bwPoints.some((p) => p.day === todayISO()),
    // Weekly comparison once there are enough weeks with weigh-ins.
    weeksLogged: weeklyAverages(bwPoints, 1000).length,
    weeksNeeded: WEEKS_FOR_WEEKLY,
    weekly: weeklyAverages(bwPoints, 12),
    ratePerWeek: weeklyRate(weeklyAverages(bwPoints, 12), 4),
  };

  // ---- main lifts of the current block: strength lifts that carry a max, a % target,
  // or open a session. Compared with where they were before the block started.
  type SE = { exercise_id: string | null; section: string; position: number; target_type: string; max_exercise_id: string | null; exercises: { name: string; tracking_type: string; counts_for_maxes: boolean } | null };
  type Prog = { id: string; name: string; start_date: string | null; created_at: string; sessions: { session_exercises: SE[] }[] };
  const programs = (programRows ?? []) as unknown as Prog[];
  const liftCount = new Map<string, number>();
  const liftNames = new Map<string, string>();
  for (const prog of programs) {
    for (const session of prog.sessions ?? []) {
      const strength = (session.session_exercises ?? []).filter((r) => r.exercise_id && r.section === "workout" && (r.exercises?.tracking_type ?? "load") === "load");
      const opener = strength.reduce<SE | null>((a, b) => (a == null || b.position < a.position ? b : a), null);
      for (const r of strength) {
        if (r === opener || r.exercises?.counts_for_maxes || r.target_type === "percent") {
          liftCount.set(r.exercise_id as string, (liftCount.get(r.exercise_id as string) ?? 0) + 1);
          liftNames.set(r.exercise_id as string, r.exercises?.name ?? "Lift");
        }
      }
    }
  }
  const liftIds = [...liftCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => id);
  const blockStart = programs.length ? programs.map((p) => p.start_date ?? p.created_at.slice(0, 10)).sort()[0] : null;
  const setPoints: SetPoint[] = allSets
    .filter((x) => x.exercise_id && liftIds.includes(x.exercise_id))
    .map((x) => ({ exerciseId: x.exercise_id as string, name: x.exercises?.name ?? x.exercise_name, weight: Number(x.weight), reps: x.reps, on: x.workout_logs.performed_on }));
  const block = blockStart
    ? { name: programs.length === 1 ? programs[0].name : `${programs.length} programs`, start: blockStart, lifts: liftSummaries(liftIds, liftNames, setPoints, blockStart, todayISO()) }
    : null;

  // ---- speed and field records, best per exercise (per distance for timed work)
  type FieldRow = { exercise_id: string; weight: number | null; reps: number | null; seconds: number | null; distance: number | null; workout_logs: { performed_on: string }; exercises: { name: string; best: Best; distance_unit: string } };
  const fieldByKey = new Map<string, FieldProgress & { days: Map<string, number> }>();
  for (const r of (fieldRows ?? []) as unknown as FieldRow[]) {
    const kind = r.exercises.best;
    const raw = kind === "fastest" ? r.seconds : kind === "farthest" ? r.distance : r.weight;
    if (raw == null || !(Number(raw) > 0)) continue;
    const v = Number(raw);
    const dist = kind === "fastest" && r.distance != null ? Number(r.distance) : null;
    const key = `${r.exercise_id}|${dist ?? ""}`;
    const on = r.workout_logs.performed_on;
    const unit = kind === "fastest" ? "s" : kind === "farthest" ? r.exercises.distance_unit : "kg";
    const cur = fieldByKey.get(key) ?? { key, name: r.exercises.name, best: kind, unit, distance: dist, bestValue: v, bestOn: on, latest: v, latestOn: on, history: [], days: new Map<string, number>() };
    if (better(kind, v, cur.bestValue) || (v === cur.bestValue && on < cur.bestOn)) {
      cur.bestValue = v;
      cur.bestOn = on;
    }
    // Best of each day, for the line and "latest".
    const day = cur.days.get(on);
    if (day == null || better(kind, v, day)) cur.days.set(on, v);
    fieldByKey.set(key, cur);
  }
  const field: FieldProgress[] = [...fieldByKey.values()]
    .map(({ days, ...f }) => {
      const ordered = [...days.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      const [latestOn, latest] = ordered[ordered.length - 1];
      return { ...f, latest, latestOn, history: ordered.slice(-10).map(([, v]) => v) };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || (a.distance ?? 0) - (b.distance ?? 0));

  return { weeks, prs, maxes: maxList, tests: testSummaries, wellness, avgMinutes, bodyweight, block, field };
}
