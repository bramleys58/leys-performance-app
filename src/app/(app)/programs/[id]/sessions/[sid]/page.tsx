import { notFound } from "next/navigation";
import { ExercisePicker } from "@/components/exercise-picker";
import { TargetFields } from "@/components/target-fields";
import { ActionButton, BackLink, Card, Field, Notice, PrimaryButton, SecondaryButton, Select, inputClass } from "@/components/ui";
import { requireCoach } from "@/lib/auth";
import { SUPERSET_COLORS, WEEKDAYS, looksLikeTime, sortRows, supersetLabels, weekNumbers, type PlanRow } from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";
import { addRow, deleteSession, rowOp, saveRows, updateSession } from "../../../../coach-actions";
import { CarryRows } from "@/components/carry-rows";

const small = inputClass + " px-2 py-2 text-sm";

export default async function SessionEditorPage({ params, searchParams }: PageProps<"/programs/[id]/sessions/[sid]">) {
  await requireCoach();
  const { id: programId, sid } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const [{ data: session }, { data: rowData }] = await Promise.all([
    supabase.from("sessions").select("*, programs(name, athlete_id, athletes(unit))").eq("id", sid).eq("program_id", programId).maybeSingle(),
    supabase.from("session_exercises").select("*").eq("session_id", sid),
  ]);
  if (!session) notFound();

  const rows = sortRows((rowData ?? []) as PlanRow[]);
  const labels = supersetLabels(rows);
  const program = session.programs as unknown as { name: string; athlete_id: string | null; athletes: { unit: "kg" | "lbs" } | null } | null;
  const programName = program?.name ?? "Program";
  const athleteId = program?.athlete_id ?? null;
  const unit = program?.athletes?.unit ?? "kg";

  // For "% of max": the main lifts, the athlete's working maxes and each lift's plate step.
  const rowExerciseIds = [...new Set(rows.map((r) => r.exercise_id).filter(Boolean))] as string[];
  const [{ data: liftData }, { data: maxData }, { data: stepData }, { data: weekData }] = await Promise.all([
    supabase.from("exercises").select("id, name").eq("counts_for_maxes", true).eq("archived", false).order("name"),
    athleteId ? supabase.from("maxes").select("exercise_id, value").eq("athlete_id", athleteId).eq("is_active", true) : Promise.resolve({ data: null }),
    rowExerciseIds.length ? supabase.from("exercises").select("id, weight_step, tracking_type").in("id", rowExerciseIds) : Promise.resolve({ data: [] }),
    supabase.from("sessions").select("week").eq("program_id", programId),
  ]);
  const lifts = (liftData ?? []) as { id: string; name: string }[];
  const maxes = maxData ? Object.fromEntries((maxData as { exercise_id: string; value: number }[]).map((m) => [m.exercise_id, Number(m.value)])) : null;
  const stepOf = new Map(((stepData ?? []) as { id: string; weight_step: number }[]).map((e) => [e.id, Number(e.weight_step)]));
  const trackingOf = new Map(((stepData ?? []) as { id: string; tracking_type: string }[]).map((e) => [e.id, e.tracking_type]));
  // Shown as Sec when the row has a time ("30s") or the exercise is a time exercise.
  const isTimed = (r: { reps: string | null; exercise_id: string | null }) => looksLikeTime(r.reps) || (!r.reps && trackingOf.get(r.exercise_id ?? "") === "time");
  const isMetres = (r: { reps: string | null }) => /\d\s*m\b/i.test(r.reps ?? "");
  const repsShown = (reps: string | null) => (reps ?? "").replace(/(\d)\s*(s|sec|secs|seconds|m)\b/gi, "$1");
  const weeks = weekNumbers((weekData ?? []) as { week: number | null }[]);
  const isSlot = session.kind === "slot";
  const rowsKey = rows
    .map((r) => [r.id, r.position, r.display_name, r.superset_group, r.sets, r.reps, r.tempo, r.target_type, r.target_value, r.max_exercise_id, r.ask_rpe, r.coaching_note, r.video_url].join("|"))
    .join("~");

  const section = (key: "prep" | "workout", title: string) => {
    const list = rows.filter((r) => r.section === key);
    return (
      <div className="space-y-3">
        <h2 className="text-xs font-semibold tracking-[0.2em] text-muted">{title}</h2>
        {list.length === 0 && <p className="text-sm text-muted">Nothing here yet.</p>}
        {list.map((r, i) => {
          const group = (r.superset_group ?? "").toUpperCase();
          const color = SUPERSET_COLORS[group[0]] ?? "var(--border)";
          return (
            <div key={r.id} className="rounded-2xl border border-border bg-surface p-3 lg:flex lg:flex-wrap lg:items-end lg:gap-x-3" style={{ borderLeft: `4px solid ${color}` }}>
              <div className="flex items-center gap-2 lg:w-[36%] lg:pb-0.5">
                <span className="w-8 shrink-0 text-center text-sm font-bold" style={{ color: group ? color : undefined }}>
                  {labels[r.id] ?? i + 1}
                </span>
                <input name={`display_name__${r.id}`} defaultValue={r.display_name} aria-label="Exercise name" className={small + " font-medium"} />
                <ActionButton formAction={rowOp.bind(null, "up", r.id)} aria-label="Move up" className="rounded-lg border border-border px-2.5 py-2 text-sm">↑</ActionButton>
                <ActionButton formAction={rowOp.bind(null, "down", r.id)} aria-label="Move down" className="rounded-lg border border-border px-2.5 py-2 text-sm">↓</ActionButton>
                <ActionButton formAction={rowOp.bind(null, "delete", r.id)} aria-label="Remove exercise" className="rounded-lg border border-border px-2.5 py-2 text-sm text-accent">✕</ActionButton>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-2 lg:mt-0 lg:w-[27%]">
                <label className="text-xs text-muted">
                  Superset
                  <input name={`superset_group__${r.id}`} defaultValue={r.superset_group ?? ""} maxLength={2} placeholder="A" className={small} />
                </label>
                <label className="text-xs text-muted">
                  Sets
                  <input name={`sets__${r.id}`} defaultValue={r.sets ?? ""} inputMode="numeric" className={small} />
                </label>
                <div className="text-xs text-muted">
                  <select name={`reps_unit__${r.id}`} defaultValue={isTimed(r) ? "sec" : isMetres(r) ? "m" : "reps"} aria-label="Reps, seconds or metres" className="-ml-0.5 bg-transparent text-xs text-muted">
                    <option value="reps">Reps</option>
                    <option value="sec">Sec</option>
                    <option value="m">Metres</option>
                  </select>
                  <input name={`reps__${r.id}`} defaultValue={isTimed(r) || isMetres(r) ? repsShown(r.reps) : (r.reps ?? "")} placeholder="8 ea" aria-label="Reps or seconds" className={small} />
                </div>
                <label className="text-xs text-muted">
                  Tempo
                  <input name={`tempo__${r.id}`} defaultValue={r.tempo ?? ""} className={small} />
                </label>
              </div>
              <TargetFields
                rowId={r.id}
                type={r.target_type}
                value={r.target_value == null ? null : Number(r.target_value)}
                askRpe={r.ask_rpe}
                exerciseId={r.exercise_id}
                maxExerciseId={r.max_exercise_id ?? null}
                lifts={lifts}
                maxes={maxes}
                step={stepOf.get(r.exercise_id ?? "") ?? 2.5}
                unit={unit}
                maxesHref={athleteId ? `/athletes/${athleteId}/maxes` : null}
              />
              <label className="mt-2 block text-xs text-muted lg:w-[62%]">
                Coaching note
                <textarea name={`coaching_note__${r.id}`} defaultValue={r.coaching_note ?? ""} rows={2} className={small} />
              </label>
              <label className="mt-2 block text-xs text-muted lg:min-w-0 lg:flex-1">
                Video link (leave empty to use the library video)
                <input name={`video_url__${r.id}`} defaultValue={r.video_url ?? ""} inputMode="url" className={small} />
              </label>
            </div>
          );
        })}
      </div>
    );
  };

  const addForm = (key: "prep" | "workout", label: string) => (
    <Card>
      <h3 id={`add-${key}`} className="font-semibold">{label}</h3>
      {/* The key resets the form (and the picker) after every added row. */}
      <form key={rows.length} action={addRow} className="mt-3 space-y-3">
        <input type="hidden" name="session_id" value={sid} />
        <input type="hidden" name="program_id" value={programId} />
        <input type="hidden" name="section" value={key} />
        <CarryRows />
        <ExercisePicker />
        <div className="grid grid-cols-4 gap-2">
          <input name="superset_group" placeholder="A" maxLength={2} aria-label="Superset letter" className={small} />
          <input name="sets" placeholder="Sets" inputMode="numeric" aria-label="Sets" className={small} />
          <div className="flex">
            <input name="reps" placeholder="Reps" aria-label="Reps or seconds" className={small + " rounded-r-none"} />
            <select name="reps_unit" aria-label="Reps or seconds" defaultValue="reps" className="rounded-r-lg border border-l-0 border-border bg-surface-2 px-1 text-xs text-muted">
              <option value="reps">reps</option>
              <option value="sec">sec</option>
              <option value="m">m</option>
            </select>
          </div>
          <input name="tempo" placeholder="Tempo" aria-label="Tempo" className={small} />
        </div>
        <p className="text-xs text-muted">Leave sets, reps and tempo empty to use the defaults from the library.</p>
        <SecondaryButton type="submit">Add</SecondaryButton>
      </form>
    </Card>
  );

  return (
    <div className="page-wide space-y-5">
      <BackLink href={`/programs/${programId}`}>{programName}</BackLink>
      <h1 className="text-2xl font-bold">
        {session.name}
        {session.week ? <span className="ml-2 text-base font-normal text-muted">week {session.week}</span> : null}
      </h1>
      {sp.saved && <Notice kind="ok">Saved.</Notice>}

      {isSlot ? (
        <Card>
          <p className="text-sm text-muted">A slot only shows in the athlete&apos;s schedule. It has no exercises.</p>
        </Card>
      ) : (
        <>
          {/* The key remounts the form whenever saved data changes, so inputs never show stale values. */}
          <form id="rows" key={rowsKey} action={saveRows.bind(null, "stay")} className="space-y-5">
            <input type="hidden" name="session_id" value={sid} />
            <input type="hidden" name="program_id" value={programId} />
            <input type="hidden" name="row_ids" value={rows.map((r) => r.id).join(",")} />
            {section("prep", "PREP CIRCUIT")}
            {section("workout", session.kind === "routine" ? "ROUTINE" : "WORKOUT")}
          </form>
          <div className="grid gap-5 lg:grid-cols-2">
            {addForm("prep", "Add to prep circuit")}
            {addForm("workout", session.kind === "routine" ? "Add to routine" : "Add to workout")}
          </div>
        </>
      )}

      <Card>
        <h2 className="font-semibold">Session details</h2>
        <form action={updateSession} className="mt-4 space-y-4">
          <CarryRows />
          <input type="hidden" name="id" value={sid} />
          <input type="hidden" name="program_id" value={programId} />
          <Field label="Name" name="name" defaultValue={session.name} required />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Repeats every" name="weekday" defaultValue={session.weekday ?? ""}>
              <option value="">No fixed day</option>
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i + 1}>
                  {d}
                </option>
              ))}
            </Select>
            <Field label="Or one fixed date" name="scheduled_date" type="date" defaultValue={session.scheduled_date ?? ""} />
            {weeks.length > 0 && (
              <Select label="Week of the block" name="week" defaultValue={session.week ?? ""}>
                {weeks.map((w) => (
                  <option key={w} value={w}>
                    Week {w}
                  </option>
                ))}
                <option value="">Every week</option>
              </Select>
            )}
            <Select label="Kind" name="kind" defaultValue={session.kind}>
              <option value="workout">Workout</option>
              <option value="routine">Routine</option>
              <option value="slot">Slot</option>
            </Select>
            <Field label="Minutes (estimate)" name="estimated_minutes" inputMode="numeric" defaultValue={session.estimated_minutes ?? ""} />
          </div>
          <Field label="Type (Strength, Speed, Recovery…)" name="session_type" defaultValue={session.session_type ?? ""} />
          <label className="block">
            <span className="mb-1.5 block text-sm text-muted">Instructions for the athlete</span>
            <textarea name="instructions" rows={3} defaultValue={session.instructions ?? ""} className={inputClass} />
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" name="is_optional" defaultChecked={session.is_optional} /> Optional (not counted as missed)
          </label>
          <SecondaryButton type="submit">Save details</SecondaryButton>
        </form>
        <form action={deleteSession} className="mt-6 space-y-2 border-t border-border pt-4">
          <input type="hidden" name="id" value={sid} />
          <input type="hidden" name="program_id" value={programId} />
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" name="confirm" required /> Yes, delete this session and its exercises
          </label>
          <ActionButton className="w-full rounded-xl border border-border px-4 py-3 text-sm text-accent">Delete this session</ActionButton>
        </form>
      </Card>

      {/* Always in reach at the bottom of the screen. Saves the rows above and returns to the program. */}
      <div className="sticky bottom-3 z-10 grid grid-cols-[1fr_auto] gap-2">
        {isSlot || rows.length === 0 ? (
          <a href={`/programs/${programId}`} className="col-span-2 rounded-xl bg-accent px-4 py-3 text-center text-base font-semibold text-accent-text">
            Back to program
          </a>
        ) : (
          <>
            <PrimaryButton form="rows" formAction={saveRows.bind(null, "back")} pendingLabel="Saving…" className="shadow-lg shadow-black/40">
              Save session
            </PrimaryButton>
            <SecondaryButton form="rows" formAction={saveRows.bind(null, "stay")} pendingLabel="Saving…" className="!w-auto shadow-lg shadow-black/40">
              Save
            </SecondaryButton>
          </>
        )}
      </div>
    </div>
  );
}
