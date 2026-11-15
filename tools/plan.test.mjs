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
