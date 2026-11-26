// Quick checks for src/lib/plan.ts. Run: node --experimental-strip-types tools/plan.test.mjs
import assert from "node:assert/strict";
import { buildSteps, epley, firstNumber, looksLikeTime, programWeek, roundToStep, supersetLabels, weekFilter, weekRange } from "../src/lib/plan.ts";

const row = (id, group, sets, section = "workout", position = 0) => ({ id, superset_group: group, sets, section, position });
// A1 has 3 sets, A2 has 4: alternate, then finish the longer one.
const steps = buildSteps([row("a1", "A", 3, "workout", 1), row("a2", "A", 4, "workout", 2), row("b", null, 2, "workout", 3), row("p", null, 1, "prep", 1)]);
assert.deepEqual(steps.map((s) => s.rowId + s.setNumber), ["p1", "a11", "a21", "a12", "a22", "a13", "a23", "a24", "b1", "b2"]);
assert.deepEqual(supersetLabels([row("x", "A", 1), row("y", "a", 1), row("z", null, 1), row("w", "B", 1)]), { x: "A1", y: "A2", w: "B1" });
assert.equal(firstNumber("8 ea"), 8); assert.equal(firstNumber("6-8ea"), 6); assert.equal(firstNumber("30s each"), 30); assert.equal(firstNumber("FAST"), null);
assert.equal(looksLikeTime("30s each"), true); assert.equal(looksLikeTime("8 ea"), false); assert.equal(looksLikeTime("20s"), true);
assert.equal(roundToStep(84, 2.5), 85); assert.equal(roundToStep(80, 2.5), 80); assert.equal(roundToStep(33, 2), 34);
assert.equal(Math.round(epley(85, 5) * 100) / 100, 99.17); assert.equal(epley(100, 1), 100); assert.equal(epley(50, 15), null);
assert.deepEqual(weekRange("2026-11-12"), { monday: "2026-11-09", sunday: "2026-11-15" });
assert.deepEqual(weekRange("2026-11-15"), { monday: "2026-11-09", sunday: "2026-11-15" });
assert.deepEqual(weekRange("2026-11-09"), { monday: "2026-11-09", sunday: "2026-11-15" });
// Blocks: start Wed 4 Nov 2026, 3 weeks. Week 1 is the week of the start date.
assert.equal(programWeek("2026-11-04", "2026-11-02", 3), 1); assert.equal(programWeek("2026-11-04", "2026-11-08", 3), 1);
assert.equal(programWeek("2026-11-04", "2026-11-09", 3), 2); assert.equal(programWeek("2026-11-04", "2026-11-22", 3), 3);
assert.equal(programWeek("2026-11-04", "2026-12-25", 3), 3); assert.equal(programWeek("2026-11-04", "2026-10-01", 3), 1);
assert.equal(programWeek(null, "2026-11-09", 3), 1); assert.equal(programWeek("2026-11-04", "2026-11-20", 1), 1);
// Clock change week (25 Oct 2026) still counts as one week.
assert.equal(programWeek("2026-10-19", "2026-10-26", 4), 2);
{
  const ss = [{ id: "a", week: 1, program_id: "p" }, { id: "b", week: 2, program_id: "p" }, { id: "c", week: null, program_id: "p" }, { id: "d", week: null, program_id: "q" }];
  const runs = weekFilter(ss, () => "2026-11-02");
  assert.deepEqual(ss.filter((s) => runs(s, "2026-11-05")).map((s) => s.id), ["a", "c", "d"]);
  assert.deepEqual(ss.filter((s) => runs(s, "2026-11-12")).map((s) => s.id), ["b", "c", "d"]);
  assert.deepEqual(ss.filter((s) => runs(s, "2026-12-12")).map((s) => s.id), ["b", "c", "d"]);
}
{
  const { warmupSets } = await import("../src/lib/plan.ts");
  const w = (kg, step) => warmupSets(kg, step).map((s) => `${s.weight}x${s.reps}`).join(" ");
  assert.equal(w(100, 2.5), "40x8 60x5 80x3 90x1");
  assert.equal(w(60, 2.5), "25x8 35x5 47.5x3");
  assert.equal(w(15, 2.5), "");
  assert.equal(w(225, 5), "90x8 135x5 180x3 205x1");
  assert.equal(w(NaN, 2.5), "");
}
console.log("plan.ts: all checks passed");

{
  const { complianceFor, fallingBehind, isRealPain, lastMondays } = await import("../src/lib/compliance.ts");
  assert.deepEqual(lastMondays("2026-11-15", 3), ["2026-10-26", "2026-11-02", "2026-11-09"]);
  const prog = { athlete_id: "a", start_date: "2026-11-02", created_at: "2026-10-01T00:00:00Z" };
  const ss = [
    { id: "s1", kind: "workout", is_optional: false, week: 1, program_id: "p", programs: prog },
    { id: "s2", kind: "workout", is_optional: false, week: 2, program_id: "p", programs: prog },
    { id: "s3", kind: "workout", is_optional: false, week: 2, program_id: "p", programs: prog },
    { id: "s4", kind: "workout", is_optional: true, week: 2, program_id: "p", programs: prog },
    { id: "s5", kind: "workout", is_optional: false, week: null, program_id: "q", programs: { ...prog, athlete_id: "b" } },
  ];
  const logs = [
    { athlete_id: "a", session_id: "s1", performed_on: "2026-11-04" },
    { athlete_id: "a", session_id: null, performed_on: "2026-11-05" },
    { athlete_id: "a", session_id: "s2", performed_on: "2026-11-10" },
    { athlete_id: "a", session_id: null, performed_on: "2026-10-28" },
    { athlete_id: "b", session_id: "s5", performed_on: "2026-11-10" },
  ];
  const cells = complianceFor("a", ss, logs, lastMondays("2026-11-15", 3));
  assert.deepEqual(cells.map((c) => `${c.done}/${c.planned}+${c.free}`), ["0/0+1", "1/1+1", "1/2+0"]);
  assert.equal(fallingBehind([{ planned: 4, done: 1 }, { planned: 4, done: 1 }, { planned: 4, done: 0 }]), true);
  assert.equal(fallingBehind([{ planned: 4, done: 1 }, { planned: 4, done: 2 }, { planned: 4, done: 0 }]), false);
  assert.equal(fallingBehind([{ planned: 0, done: 0 }, { planned: 0, done: 0 }, { planned: 4, done: 0 }]), false);
  for (const t of ["no", "None.", "nee", "Geen", "-", "", null, "n/a"]) assert.equal(isRealPain(t), false, String(t));
  for (const t of ["left knee after sprints", "No pain but tight hamstring", "knie"]) assert.equal(isRealPain(t), true, t);
  console.log("compliance.ts: all checks passed");
}

// check-in readiness
const { readiness, flags } = await import("../src/lib/checkin.ts");
assert.equal(readiness({ sleep_quality: 5, energy: 5, soreness: 1, stress: 1 }), 100);
assert.equal(readiness({ sleep_quality: 1, energy: 1, soreness: 5, stress: 5 }), 0);
assert.equal(readiness({ sleep_quality: 3, energy: 3, soreness: 3, stress: 3 }), 50);
assert.equal(readiness({ sleep_quality: 4, energy: null, soreness: null, stress: null }), 75);
assert.equal(readiness({ sleep_quality: null, energy: null, soreness: null, stress: null }), null);
assert.deepEqual(flags({ day: "x", sleep_hours: 5.5, sleep_quality: 3, energy: 2, soreness: 4, stress: 2, bodyweight: null, note: null }), ["slept 5.5 h", "very sore", "low energy"]);
console.log("checkin.ts: all checks passed");

// weekly check-in target week (15 Nov 2026 is a Sunday)
const { weeklyTarget } = await import("../src/lib/weekly.ts");
assert.deepEqual(weeklyTarget("2026-11-15", 7), { weekStart: "2026-11-09", weekEnd: "2026-11-15", due: true, isSunday: true });
assert.deepEqual(weeklyTarget("2026-11-16", 1), { weekStart: "2026-11-09", weekEnd: "2026-11-15", due: true, isSunday: false });
assert.deepEqual(weeklyTarget("2026-11-17", 2), { weekStart: "2026-11-09", weekEnd: "2026-11-15", due: true, isSunday: false });
assert.deepEqual(weeklyTarget("2026-11-18", 3), { weekStart: "2026-11-16", weekEnd: "2026-11-22", due: false, isSunday: false });
console.log("weekly.ts: all checks passed");

{
  const { incomeByMonth, packageState } = await import("../src/lib/business.ts");
  const base = { id: "p", athlete_id: "a", name: "10 PT", kind: "sessions", sessions_total: 10, sessions_used_before: 2, price: 500, start_date: "2026-10-01", end_date: null, paid_on: "2026-10-01", notes: null, ended: false };
  const dates = ["2026-09-20", "2026-10-02", "2026-10-09", "2026-10-16", "2026-10-23", "2026-10-30", "2026-11-06"];
  let s = packageState(base, dates, "2026-11-16");
  assert.deepEqual([s.used, s.left, s.running, s.alerts.join("|")], [8, 2, true, "2 sessions left"]);
  s = packageState({ ...base, sessions_used_before: 4, paid_on: null }, dates, "2026-11-16");
  assert.deepEqual([s.left, s.running, s.alerts.join("|")], [0, false, "not paid|all sessions used"]);
  s = packageState({ ...base, kind: "subscription", sessions_total: null, end_date: "2026-11-20" }, dates, "2026-11-16");
  assert.deepEqual([s.used, s.daysLeft, s.alerts.join("|")], [null, 4, "ends in 4 days"]);
  s = packageState({ ...base, kind: "subscription", sessions_total: null, end_date: "2026-11-15" }, dates, "2026-11-16");
  assert.deepEqual([s.running, s.alerts.join("|")], [false, "renewal was due 1 day ago"]);
  assert.deepEqual(packageState({ ...base, ended: true, paid_on: null }, dates, "2026-11-16").alerts, []);
  const inc = incomeByMonth([base, { ...base, price: 120.5, paid_on: "2026-11-03" }, { ...base, paid_on: null }], "2026-11-16", 3);
  assert.deepEqual(inc, [{ month: "2026-09", total: 0 }, { month: "2026-10", total: 500 }, { month: "2026-11", total: 120.5 }]);
  assert.equal(incomeByMonth([], "2026-01-10", 2)[0].month, "2025-12");
  console.log("business.ts: all checks passed");
}

{
  const { liftSummaries, rollingAverage, weightChange } = await import("../src/lib/progress-math.ts");
  const w = [
    { day: "2026-10-01", kg: 80 }, { day: "2026-10-02", kg: 81 }, { day: "2026-10-03", kg: 79 },
    { day: "2026-10-20", kg: 82 }, { day: "2026-11-01", kg: 83 }, { day: "2026-11-02", kg: 83.4 },
  ];
  const r = rollingAverage(w);
  assert.equal(r[2].avg, 80);
  assert.equal(r[5].avg, 83.2);
  assert.equal(weightChange(w, 30), 3.2);
  assert.equal(weightChange(w, 7), 1.2); // closest to 26 Oct is 20 Oct, 6 days off: allowed
  assert.equal(weightChange([{ day: "2026-09-01", kg: 70 }, { day: "2026-11-01", kg: 80 }], 7), null); // 2 months off: no comparison
  assert.equal(weightChange([{ day: "2026-11-01", kg: 80 }], 7), null);

  const sets = [
    { exerciseId: "sq", name: "Squat", weight: 100, reps: 5, on: "2026-09-10" },
    { exerciseId: "sq", name: "Squat", weight: 100, reps: 3, on: "2026-11-03" },
    { exerciseId: "sq", name: "Squat", weight: 110, reps: 5, on: "2026-11-05" },
    { exerciseId: "sq", name: "Squat", weight: 120, reps: 1, on: "2026-11-12" },
    { exerciseId: "bp", name: "Bench", weight: 60, reps: 8, on: "2026-11-04" },
    { exerciseId: "bp", name: "Bench", weight: 65, reps: 8, on: "2026-11-11" },
  ];
  const [sq, bp, none] = liftSummaries(["sq", "bp", "dl"], new Map([["dl", "Deadlift"]]), sets, "2026-11-02", "2026-11-16");
  assert.equal(sq.before, 116.7);
  assert.equal(sq.blockBest, 128.3);
  assert.deepEqual(sq.prDays, ["2026-11-05", "2026-11-12"]);
  assert.deepEqual(sq.weekly.map((x) => x.e1rm), [128.3, 120, null]); // a single counts as its own weight
  assert.deepEqual(sq.repBests.map((x) => `${x.reps}:${x.weight}:${x.inBlock}`), ["1:120:true", "3:100:true", "5:110:true"]);
  assert.equal(bp.before, null);
  assert.deepEqual(bp.prDays, ["2026-11-11"]);
  assert.equal(none.name, "Deadlift");
  assert.equal(none.blockBest, null);
    assert.equal(weightChange([{ day: "2026-10-17", kg: 84 }, { day: "2026-11-15", kg: 81.5 }], 30), -2.5); // first weigh-in 1 day short of 30
  assert.equal(weightChange([{ day: "2026-11-15", kg: 81.5 }, { day: "2026-11-16", kg: 81 }], 30), null);
  {
    const { weeklyAverages, weeklyRate } = await import("../src/lib/progress-math.ts");
    const pts = [
      { day: "2026-10-05", kg: 84 }, { day: "2026-10-06", kg: 83 }, // week of 5 Oct: 83.5
      { day: "2026-10-12", kg: 83 },                                // 12 Oct: 83
      { day: "2026-10-27", kg: 82 }, { day: "2026-10-29", kg: 81 }, // 26 Oct: 81.5 (19 Oct skipped)
      { day: "2026-11-02", kg: 81 },                                // 2 Nov: 81
    ];
    const wk = weeklyAverages(pts);
    assert.deepEqual(wk.map((x) => `${x.monday}:${x.avg}:${x.count}:${x.change}`), ["2026-10-05:83.5:2:null", "2026-10-12:83:1:-0.5", "2026-10-26:81.5:2:null", "2026-11-02:81:1:-0.5"]);
    assert.equal(weeklyRate(wk, 4), -0.62); // 83.5 to 81 over 4 weeks
    assert.equal(weeklyRate(wk.slice(0, 1)), null);
    assert.equal(weeklyAverages(pts, 2).length, 2);
  }
  {
    const { weightAxis } = await import("../src/lib/progress-math.ts");
    for (const vals of [[96.7, 96.8], [96.8, 96.8], [80, 80.4, 81.2], [84.6, 83.1, 81.5], [70, 78], [100.2, 97.5], [180, 182], [55.3]]) {
      const a = weightAxis(vals);
      const span = a.hi - a.lo;
      assert.ok(span >= 2 - 1e-9, `at least 2 tall for ${vals}`);
      assert.ok(a.ticks.length >= 3 && a.ticks.length <= 5, `3 to 5 lines for ${vals}: ${a.ticks}`);
      assert.equal(new Set(a.ticks.map((v) => v.toFixed(1))).size, a.ticks.length, `distinct labels for ${vals}`);
      assert.ok(Math.min(...vals) > a.lo && Math.max(...vals) < a.hi, `points inside for ${vals}`);
    }
    console.log(JSON.stringify(weightAxis([96.7, 96.8])));
  }
  console.log("progress-math.ts: all checks passed");
}

{
  const { weekDays, weeksOnTarget } = await import("../src/lib/habits.ts");
  assert.deepEqual(weekDays("2026-11-18"), ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
  // today Tue 17 Nov: last full weeks are 9-15 Nov, 2-8 Nov, 26 Oct-1 Nov, 19-25 Oct
  const done = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-03", "2026-10-27", "2026-10-28", "2026-10-29", "2026-11-16"];
  assert.deepEqual(weeksOnTarget(done, 3, "2026-10-01", "2026-11-17"), { hit: 2, of: 4 });
  assert.deepEqual(weeksOnTarget(done, 3, "2026-11-04", "2026-11-17"), { hit: 1, of: 2 }); // created in week of 2 Nov
  assert.deepEqual(weeksOnTarget([], 3, "2026-11-16", "2026-11-17"), { hit: 0, of: 0 }); // brand new this week
  console.log("habits.ts: all checks passed");
}

{
  const { blockEnd, blocksToWrite } = await import("../src/lib/blocks.ts");
  // Starts Wed 4 Nov 2026 (week of Mon 2 Nov), 4 weeks -> ends Sun 29 Nov.
  assert.equal(blockEnd("2026-11-04", 4), "2026-11-29");
  assert.equal(blockEnd("2026-11-02", 1), "2026-11-08");
  const A = [
    { id: "a", full_name: "Ann" }, // ends in 5 days
    { id: "b", full_name: "Bob" }, // ends in 5 days, next block drafted
    { id: "c", full_name: "Cas" }, // no program
    { id: "d", full_name: "Dre" }, // ended Sunday, 2 days ago
    { id: "e", full_name: "Eva" }, // ends in 3 weeks
    { id: "f", full_name: "Fay" }, // block without week numbers: repeats, never ends
    { id: "g", full_name: "Gus" }, // only a draft
    { id: "h", full_name: "Hal" }, // ended 2 months ago: dropped
  ];
  const P = (id, athlete_id, status, start_date, weeks, created_at = "2026-10-01T00:00:00Z") => ({ id, athlete_id, name: id, status, start_date, created_at, weeks });
  const today = "2026-11-24"; // Tue
  const list = blocksToWrite(
    A,
    [
      P("a1", "a", "active", "2026-11-02", 4),
      P("b1", "b", "active", "2026-11-02", 4),
      P("b2", "b", "draft", "2026-11-30", 4),
      P("d1", "d", "active", "2026-10-26", 4),
      P("e1", "e", "active", "2026-11-23", 3),
      P("f1", "f", "active", "2026-11-02", 0),
      P("g1", "g", "draft", null, 4),
      P("h1", "h", "active", "2026-08-03", 4),
    ],
    today,
  );
  assert.deepEqual(list.map((x) => `${x.athlete}:${x.kind}:${x.daysLeft}`), ["Cas:none:null", "Gus:draft:null", "Dre:ended:-2", "Ann:ending:5"]);
  console.log("blocks.ts: all checks passed");
}

{
  const { fieldRecords, fieldBests, plannedDistance } = await import("../src/lib/field.ts");
  assert.equal(plannedDistance("6 x 20m"), 20);
  assert.equal(plannedDistance("20m"), 20);
  assert.equal(plannedDistance("30 cm"), 30);
  assert.equal(plannedDistance("8 ea"), null);
  const bestOf = new Map([["spr", "fastest"], ["bj", "farthest"], ["sled", "heaviest"]]);
  const S = (exerciseId, o) => ({ exerciseId, weight: null, reps: null, seconds: null, distance: null, ...o });
  const before = [S("spr", { distance: 10, seconds: 1.8 }), S("spr", { distance: 20, seconds: 3.1 }), S("bj", { reps: 3, distance: 240 }), S("sled", { weight: 80, distance: 20 })];
  const today = [
    S("spr", { distance: 10, seconds: 1.75 }), // faster 10 m: record
    S("spr", { distance: 20, seconds: 3.2 }), // slower 20 m
    S("spr", { distance: 30, seconds: 4.2 }), // first 30 m: not a record
    S("bj", { reps: 3, distance: 239 }),
    S("bj", { reps: 3, distance: 251 }), // farther: record
    S("sled", { weight: 80, distance: 20 }), // same weight: not a record
    S("spr", { distance: 10, seconds: null }), // no time entered: ignored
  ];
  const rec = fieldRecords(today, before, bestOf).map((r) => `${r.exerciseId}:${r.value}`).sort();
  assert.deepEqual(rec, ["bj:251", "spr:1.75"]);
  assert.equal(fieldBests(today, bestOf).get("spr|10").value, 1.75);
  const { plannedDistances, distanceForSet } = await import("../src/lib/field.ts");
  assert.deepEqual(plannedDistances("10, 15, 20m"), [10, 15, 20]);
  assert.deepEqual(plannedDistances("2x10, 2x15, 2x20 m"), [10, 10, 15, 15, 20, 20]);
  assert.deepEqual(plannedDistances("2×10m, 1×30m"), [10, 10, 30]);
  assert.deepEqual(plannedDistances("20m"), [20]);
  assert.equal(plannedDistances("8 ea"), null);
  assert.equal(distanceForSet("10, 15, 20m", 2), 15);
  assert.equal(distanceForSet("10, 15, 20m", 5), 20);
  console.log("field.ts: all checks passed");
}

{
  const { trackedLifts, liftOptions } = await import("../src/lib/progress-math.ts");
  const P = (exerciseId, name, weight, reps, on) => ({ exerciseId, name, weight, reps, on });
  const sets = [
    P("sq", "Back Squat", 100, 5, "2026-06-01"), // e1RM 116.7 (old best, outside 6 weeks)
    P("sq", "Back Squat", 110, 1, "2026-11-10"), // a single counts as itself: 110
    P("sq", "Back Squat", 100, 3, "2026-11-24"), // 110
    P("bp", "Bench Press", 80, 5, "2026-11-20"),
    P("bp", "Bench Press", 80, 5, "2026-11-21"),
    P("bp", "Bench Press", 80, 5, "2026-11-22"),
    P("cu", "Curl", 0, 10, "2026-11-22"), // no weight: not an option
  ];
  const [sq, bp] = trackedLifts(["sq", "bp"], new Map(), sets, "2026-11-26", 26, 6);
  assert.equal(sq.best.e1rm, 116.7);
  assert.equal(sq.best.set.on, "2026-06-01");
  assert.equal(sq.recent.e1rm, 110);
  assert.equal(sq.recent.set.on, "2026-11-10");
  assert.equal(sq.weekly.length, 26);
  assert.equal(sq.weekly[25].e1rm, 110); // this week
  assert.equal(bp.best.set.on, "2026-11-20"); // a tie keeps the first date
  assert.deepEqual(liftOptions(sets).map((o) => `${o.name}:${o.sets}`), ["Back Squat:3", "Bench Press:3"]);
  console.log("tracked lifts: all checks passed");
}

{
  const { isMainLift } = await import("../src/lib/main-lift.ts");
  const yes = [["Back Squat", "Squat"], ["Barbell Bench Press", "Push"], ["Romanian Deadlift", "Hinge"], ["Chin Up", "Pull"], ["Barbell Row", "Pull"], ["Power Clean", "Olympic"], ["Push Jerk", "Olympic"], ["Bulgarian Split Squats (Dumbells)", "Lunge"], ["Barbell Hip Thrust", "Hip"], ["Weighted Dip", "Push"], ["Overhead Press", "Push"]];
  const no = [["Bicep Curl", "Pull"], ["Cable Lateral Raise", "Push"], ["Leg Curl", "Hinge"], ["Tricep Rope Pushdown", "Push"], ["Leg Extension", "Squat"], ["45° Back Extension", "Hinge"], ["Face Pull", "Pull"], ["Glute Bridge", "Hip"], ["Seated Calf Raise", "Foot-Calf"], ["Plank", "Core"]];
  for (const [n, p] of yes) assert.equal(isMainLift(n, p, null), true, n);
  for (const [n, p] of no) assert.equal(isMainLift(n, p, null), false, n);
  assert.equal(isMainLift("Bicep Curl", "Pull", true), true); // coach override
  assert.equal(isMainLift("Back Squat", "Squat", false), false);
  console.log("main-lift.ts: all checks passed");
}
