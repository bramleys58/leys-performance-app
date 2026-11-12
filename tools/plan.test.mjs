// Quick checks for src/lib/plan.ts. Run: node --experimental-strip-types tools/plan.test.mjs
import assert from "node:assert/strict";
import { buildSteps, epley, firstNumber, looksLikeTime, roundToStep, supersetLabels, weekRange } from "../src/lib/plan.ts";

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
console.log("plan.ts: all checks passed");
