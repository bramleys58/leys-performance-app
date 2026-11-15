import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton, BackLink, Card, Field, Notice, SecondaryButton, Select, inputClass } from "@/components/ui";
import { requireCoach } from "@/lib/auth";
import { WEEKDAYS, programWeek, todayISO, weekNumbers } from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";
import { copyProgram, copyWeek, createSession, deleteProgram, deleteWeek, duplicateSession, updateProgram } from "../../coach-actions";

const small = inputClass + " px-2 py-2 text-sm";

export default async function ProgramPage({ params, searchParams }: PageProps<"/programs/[id]">) {
  await requireCoach();
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const [{ data: program }, { data: sessionData }, { data: athletes }, { data: percentRows }] = await Promise.all([
    supabase.from("programs").select("*, athletes(id, full_name)").eq("id", id).maybeSingle(),
    supabase.from("sessions").select("id, name, kind, weekday, scheduled_date, is_optional, position, week, session_exercises(count)").eq("program_id", id).order("weekday", { nullsFirst: false }).order("position"),
    supabase.from("athletes").select("id, full_name").eq("status", "active").order("full_name"),
    supabase.from("session_exercises").select("exercise_id, max_exercise_id, display_name, sessions!inner(program_id)").eq("sessions.program_id", id).eq("target_type", "percent"),
  ]);
  if (!program) notFound();
  const athlete = program.athletes as unknown as { id: string; full_name: string } | null;
  const isTemplate = !athlete;

  type S = { id: string; name: string; kind: string; weekday: number | null; scheduled_date: string | null; is_optional: boolean; position: number; week: number | null; session_exercises: { count: number }[] };
  const sessions = (sessionData ?? []) as unknown as S[];
  const weeks = weekNumbers(sessions);
  const lastWeek = weeks[weeks.length - 1] ?? 0;
  const multiWeek = weeks.length > 0;
  const thisWeek = !isTemplate && multiWeek ? programWeek(program.start_date ?? String(program.created_at).slice(0, 10), todayISO(), lastWeek) : null;

  // Lifts that are programmed as a percent, but have no max to calculate from.
  type P = { exercise_id: string | null; max_exercise_id: string | null; display_name: string };
  const percent = (percentRows ?? []) as unknown as P[];
  let missingMax: string[] = [];
  if (athlete && percent.length > 0) {
    const ids = [...new Set(percent.map((r) => r.max_exercise_id ?? r.exercise_id).filter(Boolean))] as string[];
    const [{ data: maxes }, { data: names }] = await Promise.all([
      supabase.from("maxes").select("exercise_id").eq("athlete_id", athlete.id).eq("is_active", true).in("exercise_id", ids),
      supabase.from("exercises").select("id, name").in("id", ids),
    ]);
    const have = new Set((maxes ?? []).map((m) => m.exercise_id));
    missingMax = (names ?? []).filter((n) => !have.has(n.id)).map((n) => n.name);
  }

  const groups: { key: string; week: number | null; title: string; list: S[] }[] = multiWeek
    ? [
        ...weeks.map((w) => ({ key: `week-${w}`, week: w as number | null, title: `Week ${w}`, list: sessions.filter((s) => s.week === w) })),
        { key: "every", week: null, title: "Every week", list: sessions.filter((s) => s.week == null) },
      ].filter((g) => g.list.length > 0)
    : [{ key: "all", week: null, title: "", list: sessions }];

  return (
    <div className="space-y-5">
      {athlete ? <BackLink href={`/athletes/${athlete.id}`}>{athlete.full_name}</BackLink> : <BackLink href="/templates">Templates</BackLink>}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{program.name}</h1>
        <span className={`rounded-full border px-3 py-1 text-xs ${!isTemplate && program.status === "active" ? "border-ok text-ok" : "border-border text-muted"}`}>
          {isTemplate ? "template" : program.status}
        </span>
      </div>
      {sp.saved && <Notice kind="ok">Saved.</Notice>}
      {sp.copied && <Notice kind="ok">{isTemplate ? "Template created. Change anything you like, the original stays as it was." : "Copied. Check the details, then set the status to Active."}</Notice>}
      {typeof sp.error === "string" && <Notice kind="error">{sp.error}</Notice>}
      {!isTemplate && program.status !== "active" && <Notice kind="error">The athlete cannot see this program until its status is Active.</Notice>}
      {!isTemplate && multiWeek && !program.start_date && (
        <Notice kind="error">Set a start date below. Week 1 is the week of the start date, so the athlete sees the right week.</Notice>
      )}
      {missingMax.length > 0 && athlete && (
        <Notice kind="error">
          No max yet for {missingMax.join(", ")}. Until you{" "}
          <Link href={`/athletes/${athlete.id}/maxes`} className="underline">
            set it
          </Link>
          , the athlete sees the percent without a weight.
        </Notice>
      )}

      <Card>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-semibold">Sessions</h2>
          {multiWeek && <span className="text-xs text-muted">{lastWeek} week block</span>}
        </div>
        {sessions.length === 0 && <p className="mt-2 text-sm text-muted">No sessions yet. Add the first training day below.</p>}

        {groups.map((g) => (
          <div key={g.key} id={g.key} className={multiWeek ? "mt-4 scroll-mt-20" : "mt-1"}>
            {multiWeek && (
              <div className="flex items-center justify-between gap-3 border-b border-border pb-1.5">
                <h3 className="text-xs font-semibold tracking-[0.2em] text-muted">
                  {g.title.toUpperCase()}
                  {g.week != null && g.week === thisWeek && <span className="ml-2 rounded-full border border-ok px-2 py-0.5 text-[10px] tracking-normal text-ok">this week</span>}
                </h3>
                {g.week != null && (
                  <details className="text-right text-xs text-muted">
                    <summary className="cursor-pointer list-none">Remove week</summary>
                    <form action={deleteWeek.bind(null, id, g.week)} className="mt-2 flex items-center gap-2">
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" required /> Delete week {g.week} and its sessions
                      </label>
                      <ActionButton className="rounded-lg border border-border px-2.5 py-1.5 text-accent">Delete</ActionButton>
                    </form>
                  </details>
                )}
              </div>
            )}
            <ul className="divide-y divide-border">
              {g.list.map((s) => {
                const count = s.session_exercises?.[0]?.count ?? 0;
                return (
                  <li key={s.id} className="flex items-center gap-2">
                    <Link href={`/programs/${id}/sessions/${s.id}`} className="flex min-w-0 flex-1 items-center justify-between gap-2 py-2.5">
                      <span className="min-w-0">
                        <span className="font-medium">{s.name}</span>
                        <span className="ml-2 text-sm text-muted">
                          {[s.weekday ? WEEKDAYS[s.weekday - 1] : s.scheduled_date, s.kind !== "workout" ? s.kind : null, s.is_optional ? "optional" : null].filter(Boolean).join(" · ") || "no day set"}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted">{count} exercises</span>
                    </Link>
                    <form action={duplicateSession.bind(null, id, s.id)}>
                      <ActionButton aria-label={`Copy ${s.name}`} title="Copy this session" className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted">
                        Copy
                      </ActionButton>
                    </form>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        <form action={createSession} className="mt-5 space-y-3 border-t border-border pt-4">
          <input type="hidden" name="program_id" value={id} />
          <div className={`grid grid-cols-1 gap-3 ${multiWeek ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
            <input name="name" placeholder="Session name, e.g. Lower 1" required className={inputClass} />
            <select name="weekday" defaultValue="" aria-label="Day" className={inputClass}>
              <option value="">No fixed day</option>
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i + 1}>
                  {d}
                </option>
              ))}
            </select>
            {multiWeek && (
              <select name="week" defaultValue={thisWeek ?? 1} aria-label="Week" className={inputClass}>
                {weeks.map((w) => (
                  <option key={w} value={w}>
                    Week {w}
                  </option>
                ))}
                <option value="">Every week</option>
              </select>
            )}
            <select name="kind" defaultValue="workout" aria-label="Kind" className={inputClass}>
              <option value="workout">Workout (logged set by set)</option>
              <option value="routine">Routine (ticked off)</option>
              <option value="slot">Slot (in the schedule only)</option>
            </select>
          </div>
          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" name="is_optional" /> Optional session
            </label>
            <ActionButton className="rounded-xl bg-accent px-5 py-2.5 font-semibold text-accent-text">Add session</ActionButton>
          </div>
        </form>
      </Card>

      {sessions.length > 0 && (
        <Card>
          <h2 className="font-semibold">{multiWeek ? "Add weeks" : "Make it a multi-week block"}</h2>
          <p className="mt-1 text-sm text-muted">
            {multiWeek
              ? "New weeks are added at the end as a copy, exercises included. Fill in a step and the targets go up week after week."
              : "Right now these sessions repeat every week. Add weeks and they become week 1, with a copy for every next week that you can then adjust."}
          </p>
          <form action={copyWeek.bind(null, id)} className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {multiWeek ? (
                <label className="text-xs text-muted">
                  Copy from
                  <select name="from_week" defaultValue={lastWeek} className={small}>
                    {weeks.map((w) => (
                      <option key={w} value={w}>
                        Week {w}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="self-end pb-2 text-xs text-muted">Copy from: the current week</p>
              )}
              <label className="text-xs text-muted">
                New weeks
                <input name="times" defaultValue={1} inputMode="numeric" className={small} />
              </label>
              <label className="text-xs text-muted">
                % of max, step per week
                <input name="percent_delta" placeholder="e.g. 2.5" inputMode="decimal" className={small} />
              </label>
              <label className="text-xs text-muted">
                Fixed weights, step per week
                <input name="weight_delta" placeholder="e.g. 2.5" inputMode="decimal" className={small} />
              </label>
            </div>
            <p className="text-xs text-muted">Leave the steps empty for an exact copy. A minus number works too, for a deload.</p>
            <ActionButton className="rounded-xl bg-accent px-5 py-2.5 font-semibold text-accent-text" pendingLabel="Copying…">
              {multiWeek ? "Add weeks" : "Add weeks"}
            </ActionButton>
          </form>
        </Card>
      )}

      {sessions.length > 0 && (
        <Card>
          <h2 className="font-semibold">Use this {isTemplate ? "template" : "program"}</h2>
          {(athletes ?? []).length > 0 && (
            <form action={copyProgram} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
              <input type="hidden" name="source_id" value={id} />
              <select name="athlete_id" required defaultValue="" aria-label="Athlete" className={inputClass}>
                <option value="" disabled>
                  {isTemplate ? "Give it to…" : "Copy to another athlete…"}
                </option>
                {(athletes ?? [])
                  .filter((a) => a.id !== athlete?.id || !isTemplate)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.full_name}
                    </option>
                  ))}
              </select>
              <input name="start_date" type="date" aria-label="Start date" className={inputClass} />
              <ActionButton className="rounded-xl bg-accent px-5 py-2.5 font-semibold text-accent-text" pendingLabel="Copying…">
                {isTemplate ? "Use for athlete" : "Copy"}
              </ActionButton>
            </form>
          )}
          <form action={copyProgram} className="mt-3">
            <input type="hidden" name="source_id" value={id} />
            <SecondaryButton type="submit" pendingLabel="Saving…">
              {isTemplate ? "Duplicate this template" : "Save as template"}
            </SecondaryButton>
          </form>
          <p className="mt-2 text-xs text-muted">A copy is its own program. Changing it never changes the original, and the other way around.</p>
        </Card>
      )}

      <Card>
        <h2 className="font-semibold">{isTemplate ? "Template details" : "Program details"}</h2>
        <form action={updateProgram} className="mt-4 space-y-4">
          <input type="hidden" name="id" value={id} />
          <Field label="Name" name="name" defaultValue={program.name} required />
          {isTemplate ? (
            <Field label="Phase or goal" name="phase" defaultValue={program.phase ?? ""} />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Phase" name="phase" defaultValue={program.phase ?? ""} />
                <Field label={multiWeek ? "Start date (week 1)" : "Start date"} name="start_date" type="date" defaultValue={program.start_date ?? ""} />
              </div>
              <Select label="Status" name="status" defaultValue={program.status}>
                <option value="draft">Draft (hidden from the athlete)</option>
                <option value="active">Active (visible to the athlete)</option>
                <option value="archived">Archived</option>
              </Select>
            </>
          )}
          <SecondaryButton type="submit">Save details</SecondaryButton>
        </form>
        <form action={deleteProgram} className="mt-6 space-y-2 border-t border-border pt-4">
          <input type="hidden" name="id" value={id} />
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" name="confirm" required /> Yes, delete this {isTemplate ? "template" : "program"} and all its sessions
          </label>
          <ActionButton className="w-full rounded-xl border border-border px-4 py-3 text-sm text-accent">Delete this {isTemplate ? "template" : "program"}</ActionButton>
          {!isTemplate && <p className="text-xs text-muted">Workouts that were already logged stay in the athlete&apos;s history. To only hide it, set the status to Archived.</p>}
        </form>
      </Card>
    </div>
  );
}
