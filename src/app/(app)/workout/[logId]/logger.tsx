"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LoggedSet, LoggerRow } from "@/lib/logger-types";
import { SUPERSET_COLORS, firstNumber, looksLikeTime, supersetLabels } from "@/lib/plan";
import { createClient } from "@/lib/supabase/client";
import { addWorkoutExercise, deleteSet, discardWorkout, finishWorkout, removeWorkoutExercise, saveSet, type SetInput } from "../../athlete-actions";

const KG_PER_LB = 0.45359237;

export type { LoggedSet, LoggerRow } from "@/lib/logger-types";

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
  isFree: boolean;
};

type Field = "weight" | "reps" | "seconds" | "distance" | "rpe";
type Draft = Partial<Record<Field, string>>;

const keyOf = (rowId: string, setNumber: number) => `${rowId}:${setNumber}`;
const rowKey = (i: SetInput) => i.sessionExerciseId ?? i.workoutExerciseId;
const sameSet = (a: SetInput, b: SetInput) => rowKey(a) === rowKey(b) && a.setNumber === b.setNumber;
const trim = (n: number) => String(Math.round(n * 100) / 100);
const parse = (v: string | undefined) => {
  if (v == null || v.trim() === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** Which columns an exercise needs. */
function columns(row: LoggerRow) {
  const timeLike = row.tracking === "time" || looksLikeTime(row.reps);
  const distance = row.tracking === "distance" || row.tracking === "distance_height";
  return {
    weight: !timeLike && !distance && (row.tracking === "load" || row.tracking === "bodyweight_reps"),
    reps: !timeLike && !distance && row.tracking !== "completion",
    seconds: timeLike,
    distance,
    rpe: row.askRpe,
  };
}

export function Logger(props: Props) {
  const { unit } = props;
  const [rows, setRows] = useState<LoggerRow[]>(props.rows);
  const toDisplay = useCallback((kg: number) => (unit === "lbs" ? Math.round((kg / KG_PER_LB) * 2) / 2 : Math.round(kg * 4) / 4), [unit]);
  const toKg = useCallback((shown: number) => (unit === "lbs" ? shown * KG_PER_LB : shown), [unit]);

  const labels = useMemo(
    () => supersetLabels(rows.map((r) => ({ id: r.id, section: r.section, superset_group: r.supersetGroup }))),
    [rows],
  );

  const [logged, setLogged] = useState(() => new Map(props.initialLogged.map((s) => [keyOf(s.rowId, s.setNumber), s])));
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [extra, setExtra] = useState<Record<string, number>>({});
  const [unsaved, setUnsaved] = useState<SetInput[]>([]);
  const [skipAsk, setSkipAsk] = useState<string | null>(null);
  const [view, setView] = useState<"log" | "finish">("log");

  /** Number of set rows shown for an exercise: the plan, plus added sets, never fewer than what is logged. */
  const setCount = useCallback(
    (row: LoggerRow) => {
      let highest = 0;
      for (const s of logged.values()) if (s.rowId === row.id && s.setNumber > highest) highest = s.setNumber;
      return Math.max(row.sets + (extra[row.id] ?? 0), highest, 1);
    },
    [logged, extra],
  );

  // ---------------------------------------------------------------- saving
  const send = useCallback(async (input: SetInput) => {
    try {
      const res = await saveSet(input);
      if (!res.ok) throw new Error("not saved");
      setUnsaved((q) => q.filter((i) => !sameSet(i, input)));
    } catch {
      setUnsaved((q) => [...q.filter((i) => !sameSet(i, input)), input]);
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

  const persist = (entry: LoggedSet, r: LoggerRow) => {
    void send({
      workoutLogId: props.workoutLogId,
      athleteId: props.athleteId,
      sessionExerciseId: r.source === "plan" ? r.id : null,
      workoutExerciseId: r.source === "extra" ? r.id : null,
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

  // ------------------------------------------------------- values per cell
  /** What a cell suggests before anything is typed: the plan, the set before it, or last time. */
  const suggestion = (row: LoggerRow, setNumber: number, field: Field): string => {
    if (field === "rpe") return "";
    const prevSame = row.previous.find((p) => p.setNumber === setNumber) ?? row.previous[row.previous.length - 1];
    // The closest earlier set of this exercise that is already ticked off today.
    let earlier: LoggedSet | undefined;
    for (let s = setNumber - 1; s >= 1 && !earlier; s--) {
      const e = logged.get(keyOf(row.id, s));
      if (e && !e.skipped) earlier = e;
    }
    const planned = firstNumber(row.reps);
    if (field === "weight") {
      const kg = earlier?.weight ?? row.plannedKg ?? prevSame?.weight ?? null;
      return kg == null ? "" : trim(toDisplay(kg));
    }
    if (field === "reps") {
      const n = planned ?? earlier?.reps ?? prevSame?.reps ?? null;
      return n == null ? "" : trim(n);
    }
    if (field === "seconds") {
      const n = planned ?? earlier?.seconds ?? prevSame?.seconds ?? null;
      return n == null ? "" : trim(n);
    }
    const n = earlier?.distance ?? prevSame?.distance ?? null;
    return n == null ? "" : trim(n);
  };

  /** What a cell shows: what was typed, otherwise the saved value. */
  const shown = (row: LoggerRow, setNumber: number, field: Field): string => {
    const k = keyOf(row.id, setNumber);
    const typed = drafts[k]?.[field];
    if (typed !== undefined) return typed;
    const saved = logged.get(k);
    if (!saved || saved.skipped) return "";
    if (field === "weight") return saved.weight == null ? "" : trim(toDisplay(saved.weight));
    const v = saved[field];
    return v == null ? "" : trim(v);
  };

  const entryFor = (row: LoggerRow, setNumber: number): LoggedSet => {
    const cols = columns(row);
    const read = (f: Field) => parse(shown(row, setNumber, f) || suggestion(row, setNumber, f));
    const w = cols.weight ? read("weight") : null;
    const r = cols.reps ? read("reps") : null;
    return {
      rowId: row.id,
      setNumber,
      weight: w == null ? null : Math.round(toKg(w) * 100) / 100,
      reps: r == null ? null : Math.round(r),
      seconds: cols.seconds ? read("seconds") : null,
      distance: cols.distance ? read("distance") : null,
      rpe: cols.rpe ? parse(shown(row, setNumber, "rpe")) : null,
      skipped: false,
    };
  };

  const clearDraft = (k: string) =>
    setDrafts((d) => {
      const next = { ...d };
      delete next[k];
      return next;
    });

  const tick = (row: LoggerRow, setNumber: number) => {
    const k = keyOf(row.id, setNumber);
    const next = new Map(logged);
    if (next.has(k)) {
      // Un-tick: remove the saved set, keep the numbers on screen for editing.
      const saved = next.get(k)!;
      next.delete(k);
      setLogged(next);
      if (!saved.skipped) {
        setDrafts((d) => ({
          ...d,
          [k]: {
            weight: saved.weight == null ? undefined : trim(toDisplay(saved.weight)),
            reps: saved.reps == null ? undefined : String(saved.reps),
            seconds: saved.seconds == null ? undefined : trim(saved.seconds),
            distance: saved.distance == null ? undefined : trim(saved.distance),
            rpe: saved.rpe == null ? undefined : trim(saved.rpe),
          },
        }));
      }
      setUnsaved((q) => q.filter((i) => !(rowKey(i) === row.id && i.setNumber === setNumber)));
      void deleteSet(props.workoutLogId, row.id, row.source, setNumber);
      return;
    }
    const entry = entryFor(row, setNumber);
    next.set(k, entry);
    setLogged(next);
    clearDraft(k);
    persist(entry, row);
  };

  const edit = (row: LoggerRow, setNumber: number, field: Field, value: string) =>
    setDrafts((d) => ({ ...d, [keyOf(row.id, setNumber)]: { ...d[keyOf(row.id, setNumber)], [field]: value } }));

  /** Leaving a field of a set that is already ticked saves the change. */
  const commit = (row: LoggerRow, setNumber: number) => {
    const k = keyOf(row.id, setNumber);
    if (!logged.has(k) || !drafts[k]) return;
    const entry = entryFor(row, setNumber);
    const next = new Map(logged);
    next.set(k, entry);
    setLogged(next);
    clearDraft(k);
    persist(entry, row);
  };

  const skipExercise = (row: LoggerRow) => {
    const next = new Map(logged);
    for (let s = 1; s <= setCount(row); s++) {
      if (next.has(keyOf(row.id, s))) continue;
      const entry: LoggedSet = { rowId: row.id, setNumber: s, weight: null, reps: null, seconds: null, distance: null, rpe: null, skipped: true };
      next.set(keyOf(row.id, s), entry);
      persist(entry, row);
    }
    setLogged(next);
    setSkipAsk(null);
  };

  const removeExercise = (row: LoggerRow) => {
    setRows((rs) => rs.filter((r) => r.id !== row.id));
    setLogged((m) => new Map([...m].filter(([, v]) => v.rowId !== row.id)));
    setUnsaved((q) => q.filter((i) => rowKey(i) !== row.id));
    setSkipAsk(null);
    void removeWorkoutExercise(row.id);
  };

  const added = (row: LoggerRow) => {
    setRows((rs) => [...rs, row]);
    setTimeout(() => document.getElementById(`ex-${row.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  // ----------------------------------------------------------------- timer
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const first = setTimeout(update, 0);
    const every = setInterval(update, 15000);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, []);
  const minutes = props.startedAt && now ? Math.max(0, Math.floor((now - new Date(props.startedAt).getTime()) / 60000)) : null;

  const total = rows.reduce((t, r) => t + setCount(r), 0);
  const doneCount = logged.size;
  const pct = total ? Math.min(100, Math.round((doneCount / total) * 100)) : 0;

  const header = (
    <div className="sticky top-[49px] z-10 -mx-5 space-y-2 border-b border-border bg-bg/95 px-5 py-3 backdrop-blur">
      <div className="flex items-center justify-between text-sm text-muted">
        <a href={props.backHref}>← Leave</a>
        <span className="tabular-nums">
          {doneCount}/{total} sets{minutes != null ? ` · ${minutes} min` : ""}
        </span>
        <button type="button" onClick={() => setView(view === "finish" ? "log" : "finish")} className="rounded-lg bg-ok px-3 py-1.5 font-semibold text-white">
          {view === "finish" ? "Back" : "Finish"}
        </button>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
      {unsaved.length > 0 && (
        <button type="button" onClick={retryAll} className="w-full rounded-xl border border-accent/50 bg-surface-2 px-3 py-2 text-sm text-accent">
          {unsaved.length} set{unsaved.length > 1 ? "s" : ""} not saved yet. Tap to retry.
        </button>
      )}
    </div>
  );

  // ----------------------------------------------------------- finish view
  if (view === "finish") {
    const open = Math.max(0, total - doneCount);
    return (
      <div className="space-y-5">
        {header}
        <div>
          <h1 className="text-2xl font-bold">Finish workout</h1>
          <p className="mt-1 text-sm text-muted">{open > 0 ? `${open} set${open > 1 ? "s" : ""} not ticked off. You can still finish.` : "All sets logged. Nice work."}</p>
        </div>
        <form action={finishWorkout} className="space-y-5">
          <input type="hidden" name="workout_log_id" value={props.workoutLogId} />
          {props.isFree && (
            <label className="block">
              <span className="mb-1.5 block text-sm text-muted">Name this workout</span>
              <input name="session_name" defaultValue={props.sessionName} maxLength={80} className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 outline-none focus:border-accent" />
            </label>
          )}
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
        <form action={discardWorkout} className="space-y-2 border-t border-border pt-4">
          <input type="hidden" name="workout_log_id" value={props.workoutLogId} />
          <input type="hidden" name="back" value={props.backHref} />
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" required /> Yes, delete this workout and everything logged in it
          </label>
          <button className="w-full rounded-xl border border-border px-4 py-3 text-sm text-accent">Discard workout</button>
        </form>
      </div>
    );
  }

  // -------------------------------------------------------------- log view
  const cellClass = (ticked: boolean) =>
    `h-10 w-full min-w-0 rounded-lg border text-center text-base font-semibold tabular-nums outline-none placeholder:font-normal placeholder:text-muted/70 focus:border-accent ${
      ticked ? "border-ok/40 bg-ok/15" : "border-border bg-surface-2"
    }`;

  const exerciseCard = (row: LoggerRow) => {
    const cols = columns(row);
    const group = (row.supersetGroup ?? "").toUpperCase();
    const color = SUPERSET_COLORS[group[0]];
    const count = setCount(row);
    const inputs: { field: Field; head: string }[] = [
      ...(cols.weight ? [{ field: "weight" as Field, head: row.tracking === "bodyweight_reps" ? `+${unit}` : unit }] : []),
      ...(cols.reps ? [{ field: "reps" as Field, head: "Reps" }] : []),
      ...(cols.seconds ? [{ field: "seconds" as Field, head: "Sec" }] : []),
      ...(cols.distance ? [{ field: "distance" as Field, head: row.tracking === "distance_height" ? "Result" : "m" }] : []),
      ...(cols.rpe ? [{ field: "rpe" as Field, head: "RPE" }] : []),
    ];
    const grid = { gridTemplateColumns: `1.75rem minmax(0,1.3fr) ${inputs.map(() => "minmax(0,1fr)").join(" ")} 2.5rem` };
    const targetLine =
      row.targetType === "percent" && row.targetValue != null
        ? `${row.targetValue}% of max${row.plannedKg != null ? ` = ${trim(toDisplay(row.plannedKg))} ${unit}` : " (no max set yet)"}`
        : row.targetType === "rpe" && row.targetValue != null
          ? `target RPE ${row.targetValue}`
          : null;
    const planLine = [row.sets && row.reps ? `${row.sets} × ${row.reps}` : row.reps, row.tempo ? `tempo ${row.tempo}` : null, targetLine].filter(Boolean).join(" · ");

    return (
      <section key={row.id} id={`ex-${row.id}`} className="scroll-mt-32 rounded-2xl border border-border bg-surface p-3" style={color ? { borderLeft: `4px solid ${color}` } : undefined}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold leading-snug">
              {labels[row.id] && <span style={{ color }}>{labels[row.id]} </span>}
              {row.name}
            </h2>
            {planLine && <p className="text-sm text-muted">{planLine}</p>}
          </div>
          {row.videoUrl && (
            <a href={row.videoUrl} target="_blank" rel="noopener noreferrer" aria-label={`Watch ${row.name}`} className="shrink-0 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-sm">
              ▶
            </a>
          )}
          <button type="button" onClick={() => setSkipAsk(skipAsk === row.id ? null : row.id)} aria-label={`Options for ${row.name}`} className="shrink-0 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-sm">
            ···
          </button>
        </div>

        {row.note && <p className="mt-2 whitespace-pre-line rounded-lg bg-[#3a3320] px-3 py-2 text-sm text-[#f5e6b3]">{row.note}</p>}

        {skipAsk === row.id && row.source === "extra" && (
          <div className="mt-2 rounded-xl border border-border bg-surface-2 p-3">
            <p className="text-sm">Remove {row.name} and its sets from this workout?</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setSkipAsk(null)} className="rounded-lg border border-border py-2 text-sm">
                Keep it
              </button>
              <button type="button" onClick={() => removeExercise(row)} className="rounded-lg border border-accent/60 py-2 text-sm text-accent">
                Remove exercise
              </button>
            </div>
          </div>
        )}

        {skipAsk === row.id && row.source === "plan" && (
          <div className="mt-2 rounded-xl border border-border bg-surface-2 p-3">
            <p className="text-sm">Can&apos;t do {row.name} today? The open sets are marked as skipped for your coach.</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setSkipAsk(null)} className="rounded-lg border border-border py-2 text-sm">
                Keep it
              </button>
              <button type="button" onClick={() => skipExercise(row)} className="rounded-lg border border-accent/60 py-2 text-sm text-accent">
                Skip exercise
              </button>
            </div>
          </div>
        )}

        <div className="mt-3 grid items-center gap-x-2 gap-y-1.5 text-center" style={grid}>
          <span className="text-xs text-muted">Set</span>
          <span className="text-xs text-muted">Previous</span>
          {inputs.map((i) => (
            <span key={i.field} className="text-xs text-muted">
              {i.head}
            </span>
          ))}
          <span className="text-xs text-muted">✓</span>

          {Array.from({ length: count }, (_, idx) => {
            const n = idx + 1;
            const k = keyOf(row.id, n);
            const saved = logged.get(k);
            const ticked = Boolean(saved);
            const prev = row.previous.find((p) => p.setNumber === n);
            const prevText = prev
              ? [
                  prev.weight != null ? `${trim(toDisplay(prev.weight))} ${unit}` : null,
                  prev.reps != null ? `${prev.reps}` : null,
                  prev.seconds != null ? `${trim(prev.seconds)} s` : null,
                  prev.distance != null ? `${trim(prev.distance)} m` : null,
                ]
                  .filter(Boolean)
                  .join(" × ") || "✓"
              : "–";
            return (
              <div key={k} className="contents">
                <span className={`flex h-10 items-center justify-center rounded-lg text-sm font-bold ${ticked && !saved?.skipped ? "bg-ok/15 text-ok" : "bg-surface-2"}`}>{n}</span>
                <span className="truncate text-sm text-muted">{saved?.skipped ? "skipped" : prevText}</span>
                {inputs.map((i) =>
                  saved?.skipped ? (
                    <span key={i.field} className="text-sm text-muted">
                      –
                    </span>
                  ) : (
                    <input
                      key={i.field}
                      value={shown(row, n, i.field)}
                      placeholder={suggestion(row, n, i.field)}
                      onChange={(e) => edit(row, n, i.field, e.target.value)}
                      onBlur={() => commit(row, n)}
                      onFocus={(e) => e.target.select()}
                      inputMode="decimal"
                      aria-label={`${row.name} set ${n} ${i.field}`}
                      className={cellClass(ticked)}
                    />
                  ),
                )}
                <button
                  type="button"
                  onClick={() => tick(row, n)}
                  aria-label={`${ticked ? "Undo" : "Done"}: ${row.name} set ${n}`}
                  aria-pressed={ticked}
                  className={`flex h-10 items-center justify-center rounded-lg border text-lg font-bold ${ticked && !saved?.skipped ? "border-ok bg-ok text-white" : "border-border bg-surface-2 text-muted"}`}
                >
                  {saved?.skipped ? "↺" : "✓"}
                </button>
              </div>
            );
          })}
        </div>

        <button type="button" onClick={() => setExtra((x) => ({ ...x, [row.id]: (x[row.id] ?? 0) + 1 }))} className="mt-2 w-full rounded-lg bg-surface-2 py-2 text-sm text-muted">
          + Add set
        </button>
      </section>
    );
  };

  const prep = rows.filter((r) => r.section === "prep");
  const work = rows.filter((r) => r.section === "workout");

  return (
    <div className="space-y-4">
      {header}
      <div>
        <h1 className="text-2xl font-bold">{props.sessionName}</h1>
        {props.athleteName && <p className="mt-0.5 text-sm text-muted">Logging for {props.athleteName}</p>}
        <p className="mt-1 text-sm text-muted">
          {props.isFree ? "Add exercises as you go. Grey numbers are from last time." : "Grey numbers are the plan. Tap ✓ to log a set as planned, or type what you did first."}
        </p>
      </div>

      {prep.length > 0 && <h2 className="text-xs font-semibold tracking-[0.2em] text-muted">PREP CIRCUIT</h2>}
      {prep.map(exerciseCard)}
      {work.length > 0 && prep.length > 0 && <h2 className="pt-2 text-xs font-semibold tracking-[0.2em] text-muted">WORKOUT</h2>}
      {work.map(exerciseCard)}

      {rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
          No exercises yet. Search for your first one below.
        </div>
      )}

      <AddExercise workoutLogId={props.workoutLogId} onAdded={added} />

      <button type="button" onClick={() => setView("finish")} className="w-full rounded-2xl bg-accent px-4 py-4 text-lg font-bold text-accent-text">
        Finish workout
      </button>
    </div>
  );
}

type Hit = { id: string; name: string; movement_pattern: string | null; equipment: string | null };

/** Search the library while typing and add the exercise to the workout in one tap. */
function AddExercise({ workoutLogId, onAdded }: { workoutLogId: string; onAdded: (row: LoggerRow) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const ticket = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const mine = ++ticket.current;
    const t = setTimeout(async () => {
      const { data } = await createClient().rpc("search_exercises", { q: term });
      if (mine === ticket.current) setHits((data ?? []) as Hit[]);
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  const add = async (id: string | null, name: string) => {
    setBusy(id ?? "new");
    setError(false);
    const row = await addWorkoutExercise(workoutLogId, id, name).catch(() => null);
    setBusy(null);
    if (!row) return setError(true);
    onAdded(row);
    setQ("");
    setHits([]);
    setOpen(false);
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="w-full rounded-2xl border border-dashed border-accent/60 px-4 py-4 font-semibold text-accent active:opacity-70">
        + Add exercise
      </button>
    );
  }

  const term = q.trim();
  const exact = hits.some((h) => h.name.toLowerCase() === term.toLowerCase());
  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <div className="flex gap-2">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search exercise, e.g. bench"
          autoComplete="off"
          className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 outline-none placeholder:text-muted focus:border-accent"
        />
        <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-border px-3 text-sm text-muted">
          Cancel
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-accent">Could not add that exercise. Try again.</p>}
      {term.length >= 2 && (
        <ul className="mt-2 divide-y divide-border">
          {hits.map((h) => (
            <li key={h.id}>
              <button type="button" disabled={busy !== null} onClick={() => add(h.id, h.name)} className="flex w-full items-center gap-3 py-2.5 text-left disabled:opacity-50">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{h.name}</span>
                  <span className="block truncate text-xs text-muted">{[h.movement_pattern, h.equipment].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="text-sm text-accent">{busy === h.id ? "Adding…" : "Add"}</span>
              </button>
            </li>
          ))}
          {!exact && (
            <li>
              <button type="button" disabled={busy !== null} onClick={() => add(null, term)} className="flex w-full items-center gap-3 py-2.5 text-left disabled:opacity-50">
                <span className="min-w-0 flex-1 truncate">
                  Add &ldquo;{term}&rdquo; as a new exercise
                </span>
                <span className="text-sm text-accent">{busy === "new" ? "Adding…" : "Add"}</span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
