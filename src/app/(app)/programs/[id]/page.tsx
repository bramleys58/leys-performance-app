import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton, BackLink, Card, Field, Notice, SecondaryButton, Select, inputClass } from "@/components/ui";
import { requireCoach } from "@/lib/auth";
import { WEEKDAYS } from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";
import { createSession, updateProgram } from "../../coach-actions";

export default async function ProgramPage({ params, searchParams }: PageProps<"/programs/[id]">) {
  await requireCoach();
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const [{ data: program }, { data: sessions }] = await Promise.all([
    supabase.from("programs").select("*, athletes(id, full_name)").eq("id", id).maybeSingle(),
    supabase.from("sessions").select("id, name, kind, weekday, scheduled_date, is_optional, position, session_exercises(count)").eq("program_id", id).order("weekday", { nullsFirst: false }).order("position"),
  ]);
  if (!program) notFound();
  const athlete = program.athletes as unknown as { id: string; full_name: string } | null;

  return (
    <div className="space-y-5">
      {athlete && <BackLink href={`/athletes/${athlete.id}`}>{athlete.full_name}</BackLink>}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{program.name}</h1>
        <span className={`rounded-full border px-3 py-1 text-xs ${program.status === "active" ? "border-ok text-ok" : "border-border text-muted"}`}>
          {program.status}
        </span>
      </div>
      {sp.saved && <Notice kind="ok">Saved.</Notice>}
      {program.status !== "active" && (
        <Notice kind="error">The athlete cannot see this program until its status is Active.</Notice>
      )}

      <Card>
        <h2 className="font-semibold">Sessions</h2>
        {(sessions ?? []).length === 0 && <p className="mt-2 text-sm text-muted">No sessions yet. Add the first training day below.</p>}
        <ul className="mt-3 divide-y divide-border">
          {(sessions ?? []).map((s) => {
            const count = (s.session_exercises as unknown as { count: number }[])?.[0]?.count ?? 0;
            return (
              <li key={s.id}>
                <Link href={`/programs/${id}/sessions/${s.id}`} className="flex items-center justify-between py-2.5">
                  <span>
                    <span className="font-medium">{s.name}</span>
                    <span className="ml-2 text-sm text-muted">
                      {[s.weekday ? WEEKDAYS[s.weekday - 1] : s.scheduled_date, s.kind !== "workout" ? s.kind : null, s.is_optional ? "optional" : null]
                        .filter(Boolean)
                        .join(" · ") || "no day set"}
                    </span>
                  </span>
                  <span className="text-xs text-muted">{count} exercises</span>
                </Link>
              </li>
            );
          })}
        </ul>

        <form action={createSession} className="mt-4 space-y-3">
          <input type="hidden" name="program_id" value={id} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input name="name" placeholder="Session name, e.g. Lower 1" required className={inputClass} />
            <select name="weekday" defaultValue="" className={inputClass}>
              <option value="">No fixed day</option>
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i + 1}>
                  {d}
                </option>
              ))}
            </select>
            <select name="kind" defaultValue="workout" className={inputClass}>
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

      <Card>
        <h2 className="font-semibold">Program details</h2>
        <form action={updateProgram} className="mt-4 space-y-4">
          <input type="hidden" name="id" value={id} />
          <Field label="Name" name="name" defaultValue={program.name} required />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phase" name="phase" defaultValue={program.phase ?? ""} />
            <Field label="Start date" name="start_date" type="date" defaultValue={program.start_date ?? ""} />
          </div>
          <Select label="Status" name="status" defaultValue={program.status}>
            <option value="draft">Draft (hidden from the athlete)</option>
            <option value="active">Active (visible to the athlete)</option>
            <option value="archived">Archived</option>
          </Select>
          <SecondaryButton type="submit">Save details</SecondaryButton>
        </form>
      </Card>
    </div>
  );
}
