"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SUPERSET_COLORS, buildSteps, firstNumber, looksLikeTime, supersetLabels, type PlanRow, type TrackingType } from "@/lib/plan";
import { finishWorkout, saveSet, type SetInput } from "../../athlete-actions";

const KG_PER_LB = 0.45359237;

export type LoggerRow = {
  id: string;
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
  last: { weight: number | null; reps: number | null; seconds: number | null; distance: number | null; on: string } | null;
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

type Props = {
  workoutLogId: string;
  athleteId: string;
  unit: "kg" | "lbs";
  sessionName: string;
  athleteName: string | null;
  startedAt: string | null;
  rows: LoggerRow[];
  initialLogged: LoggedSet[];
  backHref: string;
};

const keyOf = (rowId: string, setNumber: number) => `${rowId}:${setNumber}`;
const round = (n: number, to = 0.5) => Math.round(n / to) * to;
const trim = (n: number) => String(Math.round(n * 100) / 100);

function Stepper({ label, value, onChange, step, suffix }: { label: string; value: string; onChange: (v: string) => void; step: number; suffix?: string }) {
  const bump = (dir: 1 | -1) => {
    const current = Number(value.replace(",", ".")) || 0;
    onChange(trim(Math.max(0, current + dir * step)));
  };
  return (
    <div>
      <p className="mb-1.5 text-center text-sm text-muted">{label}</p>
      <div className="flex items-stretch gap-2">
        <button type="button" onClick={() => bump(-1)} aria-label={`Less ${label}`} className="w-14 rounded-xl border border-border bg-surface-2 text-2xl active:opacity-70">
          −
        </button>
        <div className="relative flex-1">
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            inputMode="decimal"
            aria-label={label}
            className="h-16 w-full rounded-xl border border-border bg-surface-2 text-center text-3xl font-bold tabular-nums outline-none focus:border-accent"
          />
          {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">{suffix}</span>}
        </div>
        <button type="button" onClick={() => bump(1)} aria-label={`More ${label}`} className="w-14 rounded-xl border border-border bg-surface-2 text-2xl active:opacity-70">
          +
        </button>
      </div>
    </div>
  );
}

type SetValues = { weight: number | null; reps: number | null; seconds: number | null; distance: number | null; rpe: number | null };

type SetFormProps = {
  initial: { weight: string; reps: string; seconds: string; distance: string; rpe: number | null };
  plan: { weight: string; reps: string; seconds: string };
  isUpdate: boolean;
  show: { weight: boolean; reps: boolean; seconds: boolean; distance: boolean; rpe: boolean };
  labels: { weight: string; distance: string };
  steps: { weight: number; distance: number };
  exerciseName: string;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onDone: (v: SetValues) => void;
  onSkip: () => void;
};

const parse = (v: string) => {
  const n = Number(v.replace(",", "."));
  return v.trim() !== "" && Number.isFinite(n) ? n : null;
};

/** The inputs and buttons for one set. Remounted for every set, so it always starts from the plan. */
function SetForm(p: SetFormProps) {
  const [weight, setWeight] = useState(p.initial.weight);
  const [reps, setReps] = useState(p.initial.reps);
  const [seconds, setSeconds] = useState(p.initial.seconds);
  const [distance, setDistance] = useState(p.initial.distance);
  const [rpe, setRpe] = useState<number | null>(p.initial.rpe);
  const [skipOpen, setSkipOpen] = useState(false);

  const hasPlan = p.plan.weight !== "" || p.plan.reps !== "" || p.plan.seconds !== "";
  const asPlanned = !p.isUpdate && hasPlan && weight === p.plan.weight && reps === p.plan.reps && seconds === p.plan.seconds;

  return (
    <>
      <div className="space-y-4">
        {p.show.weight && <Stepper label={p.labels.weight} value={weight} onChange={setWeight} step={p.steps.weight} />}
        {p.show.reps && <Stepper label="Reps" value={reps} onChange={setReps} step={1} />}
        {p.show.seconds && <Stepper label="Seconds" value={seconds} onChange={setSeconds} step={5} />}
        {p.show.distance && <Stepper label={p.labels.distance} value={distance} onChange={setDistance} step={p.steps.distance} />}

        {p.show.rpe && (
          <div>
            <p className="mb-1.5 text-center text-sm text-muted">RPE for this set</p>
            <div className="grid grid-cols-5 gap-2">
              {[6, 7, 8, 9, 10].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRpe(rpe === n ? null : n)}
                  className={`rounded-xl border py-2.5 font-semibold ${rpe === n ? "border-accent bg-accent text-accent-text" : "border-border bg-surface-2"}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() =>
          p.onDone({
            weight: p.show.weight ? parse(weight) : null,
            reps: p.show.reps ? parse(reps) : null,
            seconds: p.show.seconds ? parse(seconds) : null,
            distance: p.show.distance ? parse(distance) : null,
            rpe: p.show.rpe ? rpe : null,
          })
        }
        className="w-full rounded-2xl bg-accent px-4 py-5 text-xl font-bold text-accent-text active:opacity-80"
      >
        {p.isUpdate ? "Update set" : asPlanned ? "Done as planned" : "Done"}
      </button>

      <div className="flex items-center justify-between text-sm text-muted">
        <button type="button" disabled={!p.canPrev} onClick={p.onPrev} className="px-2 py-2 disabled:opacity-30">
          ← Previous
        </button>
        <button type="button" onClick={() => setSkipOpen(!skipOpen)} className="px-2 py-2 underline">
          Can&apos;t do this today
        </button>
        <button type="button" disabled={!p.canNext} onClick={p.onNext} className="px-2 py-2 disabled:opacity-30">
          Next →
        </button>
      </div>

      {skipOpen && (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-sm">Skip the remaining sets of {p.exerciseName}? Your coach will see it as skipped.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setSkipOpen(false)} className="rounded-xl border border-border bg-surface-2 py-2.5">
              Keep it
            </button>
            <button type="button" onClick={p.onSkip} className="rounded-xl border border-accent/60 py-2.5 text-accent">
              Skip exercise
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function Logger(props: Props) {
  const { rows, unit } = props;
  const toDisplay = useCallback((kg: number) => (unit === "lbs" ? round(kg / KG_PER_LB, 0.5) : round(kg, 0.25)), [unit]);
  const toKg = useCallback((shown: number) => (unit === "lbs" ? shown * KG_PER_LB : shown), [unit]);

  const planRows = useMemo(
    () => rows.map((r) => ({ id: r.id, section: r.section, superset_group: r.supersetGroup, position: r.position, sets: r.sets }) as unknown as PlanRow),
    [rows],
  );
  const steps = useMemo(() => buildSteps(planRows), [planRows]);
  const labels = useMemo(() => supersetLabels(planRows), [planRows]);
  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  const [logged, setLogged] = useState(() => new Map(props.initialLogged.map((s) => [keyOf(s.rowId, s.setNumber), s])));
  const [unsaved, setUnsaved] = useState<SetInput[]>([]);
  const firstOpen = useCallback((m: Map<string, LoggedSet>) => steps.findIndex((s) => !m.has(keyOf(s.rowId, s.setNumber))), [steps]);
  const [index, setIndex] = useState(() => firstOpen(logged)); // -1 = everything logged
  const [view, setView] = useState<"set" | "list" | "finish">(() => (firstOpen(logged) === -1 ? "finish" : "set"));

  const step = index >= 0 ? steps[index] : null;
  const row = step ? rowById.get(step.rowId)! : null;

  // ------------------------------------------------------------------ plan
  const plan = useMemo(() => {
    if (!row || !step) return null;
    // Within one exercise, carry the weight from the previous set forward.
    const prev = step.setNumber > 1 ? logged.get(keyOf(row.id, step.setNumber - 1)) : undefined;
    const kg = prev?.weight ?? row.plannedKg;
    const n = firstNumber(row.reps);
    const timeLike = row.tracking === "time" || looksLikeTime(row.reps);
    return {
      weight: kg == null ? "" : trim(toDisplay(kg)),
      // No reps or time in the plan: repeat what was done on the previous set.
      reps: timeLike ? "" : n != null ? trim(n) : prev?.reps != null ? String(prev.reps) : "",
      seconds: !timeLike ? "" : n != null ? trim(n) : prev?.seconds != null ? trim(prev.seconds) : "",
    };
  }, [row, step, logged, toDisplay]);

  const stepKey = step ? keyOf(step.rowId, step.setNumber) : "";

  // ---------------------------------------------------------------- saving
  const send = useCallback(async (input: SetInput) => {
    try {
      const res = await saveSet(input);
      if (!res.ok) throw new Error("not saved");
      setUnsaved((q) => q.filter((i) => keyOf(i.sessionExerciseId, i.setNumber) !== keyOf(input.sessionExerciseId, input.setNumber)));
    } catch {
      setUnsaved((q) => [...q.filter((i) => keyOf(i.sessionExerciseId, i.setNumber) !== keyOf(input.sessionExerciseId, input.setNumber)), input]);
    }
  }, []);

  const retryAll = useCallback(() => unsaved.forEach((i) => void send(i)), [unsaved, send]);
  useEffect(() => {
    window.addEventListener("online", retryAll);
    return () => window.removeEventListener("online", retryAll);
  }, [retryAll]);

  // Keep the screen on while logging, where the browser supports it.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    const acquire = () => nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    void acquire();
    const onVisible = () => document.visibilityState === "visible" && void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
    };
  }, []);

  /** Sends one set to the server. The caller updates the on-screen state. */
  const persist = (entry: LoggedSet, r: LoggerRow) => {
    void send({
      workoutLogId: props.workoutLogId,
      athleteId: props.athleteId,
      sessionExerciseId: r.id,
      exerciseId: r.exerciseId,
      exerciseName: r.name,
      setNumber: entry.setNumber,
      weight: entry.weight,
      reps: entry.reps,
      seconds: entry.seconds,
      distance: entry.distance,
      rpe: entry.rpe,
      plannedWeight: r.plannedKg,
      plannedReps: r.reps,
      skipped: entry.skipped,
      skipReason: null,
    });
  };

  const advance = (m: Map<string, LoggedSet>) => {
    // Next open set after the current one, otherwise the first open set anywhere.
    let nextIndex = steps.findIndex((s, i) => i > index && !m.has(keyOf(s.rowId, s.setNumber)));
    if (nextIndex === -1) nextIndex = firstOpen(m);
    setIndex(nextIndex);
    setView(nextIndex === -1 ? "finish" : "set");
    window.scrollTo({ top: 0 });
  };

  const done = (v: SetValues) => {
    if (!row || !step) return;
    const entry: LoggedSet = {
      rowId: row.id,
      setNumber: step.setNumber,
      weight: v.weight == null ? null : Math.round(toKg(v.weight) * 100) / 100,
      reps: v.reps == null ? null : Math.round(v.reps),
      seconds: v.seconds,
      distance: v.distance,
      rpe: v.rpe,
      skipped: false,
    };
    const next = new Map(logged);
    next.set(keyOf(entry.rowId, entry.setNumber), entry);
    setLogged(next);
    persist(entry, row);
    advance(next);
  };

  const skipExercise = () => {
    if (!row) return;
    const next = new Map(logged);
    for (let s = 1; s <= row.sets; s++) {
      if (next.has(keyOf(row.id, s))) continue;
      const entry: LoggedSet = { rowId: row.id, setNumber: s, weight: null, reps: null, seconds: null, distance: null, rpe: null, skipped: true };
      next.set(keyOf(row.id, s), entry);
      persist(entry, row);
    }
    setLogged(next);
    advance(next);
  };

  // ----------------------------------------------------------------- timer
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const every = setInterval(tick, 15000);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, []);
  const minutes = props.startedAt && now ? Math.max(0, Math.floor((now - new Date(props.startedAt).getTime()) / 60000)) : null;

  const doneCount = steps.filter((s) => logged.has(keyOf(s.rowId, s.setNumber))).length;
  const pct = steps.length ? Math.round((doneCount / steps.length) * 100) : 0;
  const exerciseNumber = row ? rows.findIndex((r) => r.id === row.id) + 1 : 0;

  const header = (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm text-muted">
        <a href={props.backHref}>← Leave</a>
        <span className="tabular-nums">
          {doneCount}/{steps.length} sets{minutes != null ? ` · ${minutes} min` : ""}
        </span>
        <button type="button" onClick={() => setView(view === "list" ? (index === -1 ? "finish" : "set") : "list")} className="underline">
          {view === "list" ? "Back" : "All exercises"}
        </button>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
      {props.athleteName && <p className="text-xs text-muted">Logging for {props.athleteName}</p>}
      {unsaved.length > 0 && (
        <button type="button" onClick={retryAll} className="w-full rounded-xl border border-accent/50 bg-surface-2 px-3 py-2 text-sm text-accent">
          {unsaved.length} set{unsaved.length > 1 ? "s" : ""} not saved yet. Tap to retry.
        </button>
      )}
    </div>
  );

  // ------------------------------------------------------------- list view
  if (view === "list") {
    return (
      <div className="space-y-4">
        {header}
        <h1 className="text-xl font-bold">{props.sessionName}</h1>
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {rows.map((r, i) => {
            const count = Array.from({ length: r.sets }, (_, s) => logged.get(keyOf(r.id, s + 1))).filter(Boolean).length;
            const target = steps.findIndex((s) => s.rowId === r.id && !logged.has(keyOf(s.rowId, s.setNumber)));
            const jump = target === -1 ? steps.findIndex((s) => s.rowId === r.id) : target;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => {
                    setIndex(jump);
                    setView("set");
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <span className="w-7 text-sm font-bold text-muted">{labels[r.id] ?? i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{r.name}</span>
                  <span className={`text-sm tabular-nums ${count >= r.sets ? "text-ok" : "text-muted"}`}>
                    {count}/{r.sets}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <button type="button" onClick={() => setView("finish")} className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 font-medium">
          Finish workout
        </button>
      </div>
    );
  }

  // ----------------------------------------------------------- finish view
  if (view === "finish" || !row || !step || !plan) {
    const open = steps.length - doneCount;
    return (
      <div className="space-y-5">
        {header}
        <div>
          <h1 className="text-2xl font-bold">Finish workout</h1>
          <p className="mt-1 text-sm text-muted">{open > 0 ? `${open} set${open > 1 ? "s" : ""} not logged. You can still finish.` : "All sets logged. Nice work."}</p>
        </div>
        <form action={finishWorkout} className="space-y-5">
          <input type="hidden" name="workout_log_id" value={props.workoutLogId} />
          <div>
            <p className="mb-2 text-sm text-muted">How hard was the session? (1 easy, 10 maximal)</p>
            <div className="grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <label key={n} className="cursor-pointer">
                  <input type="radio" name="session_rpe" value={n} className="peer sr-only" />
                  <span className="block rounded-xl border border-border bg-surface-2 py-3 text-center text-lg font-semibold peer-checked:border-accent peer-checked:bg-accent peer-checked:text-accent-text">
                    {n}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-sm text-muted">Anything your coach should know? (optional)</span>
            <textarea name="comment" rows={3} className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 outline-none focus:border-accent" />
          </label>
          <button disabled={unsaved.length > 0} className="w-full rounded-xl bg-accent px-4 py-4 text-lg font-semibold text-accent-text disabled:opacity-50">
            Finish
          </button>
          {unsaved.length > 0 && <p className="text-center text-sm text-accent">Waiting for unsaved sets before finishing.</p>}
        </form>
      </div>
    );
  }

  // -------------------------------------------------------------- set view
  const group = (row.supersetGroup ?? "").toUpperCase();
  const color = SUPERSET_COLORS[group[0]];
  const timeLike = row.tracking === "time" || looksLikeTime(row.reps);
  const showWeight = !timeLike && (row.tracking === "load" || row.tracking === "bodyweight_reps");
  const showReps = !timeLike && row.tracking !== "completion" && row.tracking !== "distance" && row.tracking !== "distance_height";
  const showSeconds = timeLike;
  const showDistance = row.tracking === "distance" || row.tracking === "distance_height";
  const existing = logged.get(stepKey);
  const unitStep = unit === "lbs" ? (row.weightStep >= 2.5 ? 5 : 2.5) : row.weightStep;
  const targetLine =
    row.targetType === "percent" && row.targetValue != null
      ? `${row.targetValue}% of max${row.plannedKg != null ? ` = ${trim(toDisplay(row.plannedKg))} ${unit}` : " (no max set yet)"}`
      : row.targetType === "rpe" && row.targetValue != null
        ? `Target RPE ${row.targetValue}`
        : null;
  const lastLine = row.last
    ? [
        row.last.weight != null ? `${trim(toDisplay(row.last.weight))} ${unit}` : null,
        row.last.reps != null ? `${row.last.reps} reps` : null,
        row.last.seconds != null ? `${trim(row.last.seconds)} s` : null,
        row.last.distance != null ? `${trim(row.last.distance)} m` : null,
      ]
        .filter(Boolean)
        .join(" × ")
    : "";

  return (
    <div className="space-y-4">
      {header}

      <div className="rounded-2xl border border-border bg-surface p-5" style={color ? { borderTop: `4px solid ${color}` } : undefined}>
        <p className="text-sm text-muted">
          {row.section === "prep" ? "Prep circuit · " : ""}Exercise {exerciseNumber} of {rows.length}
        </p>
        <h1 className="mt-1 text-2xl font-bold leading-tight">
          {labels[row.id] && <span style={{ color }}>{labels[row.id]} </span>}
          {row.name}
        </h1>
        <p className="mt-2 text-lg">
          Set <span className="font-bold">{step.setNumber}</span> of {row.sets}
          {row.reps ? <span className="text-muted"> · {row.reps}</span> : null}
          {row.tempo ? <span className="text-muted"> · tempo {row.tempo}</span> : null}
        </p>
        {targetLine && <p className="mt-1 text-sm text-muted">{targetLine}</p>}
        {row.note && <p className="mt-3 whitespace-pre-line rounded-xl bg-surface-2 px-3 py-2 text-sm">{row.note}</p>}
        <div className="mt-3 flex items-center justify-between gap-3 text-sm">
          <span className="text-muted">{lastLine ? `Last time: ${lastLine}` : ""}</span>
          {row.videoUrl && (
            <a href={row.videoUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-lg border border-border bg-surface-2 px-3 py-2">
              ▶ Watch
            </a>
          )}
        </div>
      </div>

      {/* The key gives every set its own fresh inputs. */}
      <SetForm
        key={stepKey}
        initial={{
          weight: existing?.weight != null ? trim(toDisplay(existing.weight)) : plan.weight,
          reps: existing?.reps != null ? String(existing.reps) : plan.reps,
          seconds: existing?.seconds != null ? trim(existing.seconds) : plan.seconds,
          distance: existing?.distance != null ? trim(existing.distance) : "",
          rpe: existing?.rpe ?? null,
        }}
        plan={plan}
        isUpdate={Boolean(existing)}
        show={{ weight: showWeight, reps: showReps, seconds: showSeconds, distance: showDistance, rpe: row.askRpe }}
        labels={{
          weight: row.tracking === "bodyweight_reps" ? `Added weight (${unit})` : `Weight (${unit})`,
          distance: row.tracking === "distance_height" ? "Result (m or cm)" : "Distance (m)",
        }}
        steps={{ weight: unitStep, distance: row.tracking === "distance_height" ? 0.05 : 5 }}
        exerciseName={row.name}
        canPrev={index > 0}
        canNext={index < steps.length - 1}
        onPrev={() => setIndex(index - 1)}
        onNext={() => setIndex(index + 1)}
        onDone={done}
        onSkip={skipExercise}
      />
    </div>
  );
}
