import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton, BackLink, Card, Field, Notice, SecondaryButton, Select, inputClass } from "@/components/ui";
import { requireCoach } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { copyProgram, createProgram, updateAthlete } from "../../coach-actions";
import { startFreeWorkout } from "../../athlete-actions";

export default async function AthletePage({ params, searchParams }: PageProps<"/athletes/[id]">) {
  await requireCoach();
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const [{ data: athlete }, { data: programs }, { data: others }] = await Promise.all([
    supabase.from("athletes").select("*").eq("id", id).maybeSingle(),
    supabase.from("programs").select("id, name, phase, status, start_date").eq("athlete_id", id).order("created_at", { ascending: false }),
    supabase.from("programs").select("id, name, athletes(full_name)").neq("status", "archived").order("created_at", { ascending: false }).limit(60),
  ]);
  if (!athlete) notFound();

  const activeIds = (programs ?? []).filter((p) => p.status === "active").map((p) => p.id);
  const [{ data: liveSessions }, { data: recentLogs }] = await Promise.all([
    activeIds.length
      ? supabase.from("sessions").select("id, name, kind, weekday").in("program_id", activeIds).neq("kind", "slot").order("weekday", { nullsFirst: false }).order("position")
      : Promise.resolve({ data: [] as { id: string; name: string; kind: string; weekday: number | null }[] }),
    supabase.from("workout_logs").select("id, session_name, performed_on, finished_at, session_rpe").eq("athlete_id", id).order("performed_on", { ascending: false }).limit(8),
  ]);

  return (
    <div className="space-y-5">
      <BackLink href="/athletes">Athletes</BackLink>
      <h1 className="text-2xl font-bold">{athlete.full_name}</h1>
      {sp.saved && <Notice kind="ok">Saved.</Notice>}
      {typeof sp.error === "string" && <Notice kind="error">{sp.error}</Notice>}

      <Card>
        <h2 className="font-semibold">Log a session for {athlete.full_name.split(" ")[0]}</h2>
        <p className="mt-1 text-sm text-muted">Opens the same logging screen the athlete uses, with you entering the numbers.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(liveSessions ?? []).map((s) => (
            <Link key={s.id} href={`/session/${s.id}?athlete=${athlete.id}`} className="rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium">
              {s.name}
            </Link>
          ))}
          <form action={startFreeWorkout}>
            <input type="hidden" name="athlete_id" value={athlete.id} />
            <ActionButton className="rounded-xl border border-dashed border-accent/60 px-4 py-2.5 text-sm font-medium text-accent" pendingLabel="Starting…">
              + Free workout
            </ActionButton>
          </form>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Link href={`/athletes/${athlete.id}/progress`} className="rounded-2xl border border-border bg-surface px-4 py-4">
          <span className="block font-semibold">Progress</span>
          <span className="block text-sm text-muted">Volume, records, tests</span>
        </Link>
        <Link href={`/athletes/${athlete.id}/maxes`} className="rounded-2xl border border-border bg-surface px-4 py-4">
          <span className="block font-semibold">Maxes</span>
          <span className="block text-sm text-muted">For % based weights</span>
        </Link>
      </div>

      <Card>
        <h2 className="font-semibold">Recent workouts</h2>
        {(recentLogs ?? []).length === 0 && <p className="mt-2 text-sm text-muted">Nothing logged yet.</p>}
        <ul className="mt-2 divide-y divide-border">
          {(recentLogs ?? []).map((l) => (
            <li key={l.id}>
              <Link href={`/workout/${l.id}`} className="flex items-center justify-between py-2.5 text-sm">
                <span>
                  <span className="font-medium">{l.session_name ?? "Workout"}</span>
                  <span className="ml-2 text-muted">{l.performed_on}</span>
                </span>
                <span className={l.finished_at ? "text-ok" : "text-muted"}>
                  {l.finished_at ? `done${l.session_rpe ? ` · RPE ${l.session_rpe}` : ""}` : "in progress"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="font-semibold">Programs</h2>
        {(programs ?? []).length === 0 && <p className="mt-2 text-sm text-muted">No programs yet.</p>}
        <ul className="mt-3 divide-y divide-border">
          {(programs ?? []).map((p) => (
            <li key={p.id}>
              <Link href={`/programs/${p.id}`} className="flex items-center justify-between py-2.5">
                <span>
                  <span className="font-medium">{p.name}</span>
                  {p.phase && <span className="ml-2 text-sm text-muted">{p.phase}</span>}
                </span>
                <span className={`text-xs ${p.status === "active" ? "text-ok" : "text-muted"}`}>{p.status}</span>
              </Link>
            </li>
          ))}
        </ul>

        <form action={createProgram} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <input type="hidden" name="athlete_id" value={athlete.id} />
          <input name="name" placeholder="New block name" required className={inputClass} />
          <input name="phase" placeholder="Phase (optional)" className={inputClass} />
          <ActionButton className="rounded-xl bg-accent px-5 py-2.5 font-semibold text-accent-text">New program</ActionButton>
        </form>

        {(others ?? []).length > 0 && (
          <form action={copyProgram} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
            <input type="hidden" name="athlete_id" value={athlete.id} />
            <select name="source_id" className={inputClass} defaultValue="">
              <option value="" disabled>
                Or copy an existing program…
              </option>
              {(others ?? []).map((o) => {
                const owner = (o.athletes as unknown as { full_name: string } | null)?.full_name;
                return (
                  <option key={o.id} value={o.id}>
                    {o.name}
                    {owner ? ` (${owner})` : ""}
                  </option>
                );
              })}
            </select>
            <ActionButton className="rounded-xl border border-border bg-surface-2 px-5 py-2.5 font-medium">Copy</ActionButton>
          </form>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold">Profile</h2>
        <form action={updateAthlete} className="mt-4 space-y-4">
          <input type="hidden" name="id" value={athlete.id} />
          <Field label="Full name" name="full_name" defaultValue={athlete.full_name} required />
          <Field label="Email" name="email" type="email" defaultValue={athlete.email ?? ""} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sport" name="sport" defaultValue={athlete.sport ?? ""} />
            <Field label="Phase" name="phase" defaultValue={athlete.phase ?? ""} />
            <Select label="Unit" name="unit" defaultValue={athlete.unit}>
              <option value="kg">kg</option>
              <option value="lbs">lbs</option>
            </Select>
            <Select label="Coaching notes in" name="notes_language" defaultValue={athlete.notes_language}>
              <option value="en">English</option>
              <option value="nl">Dutch</option>
            </Select>
            <Select label="Status" name="status" defaultValue={athlete.status}>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="archived">Archived</option>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" name="is_in_person" defaultChecked={athlete.is_in_person} /> In-person client
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-muted">Private notes</span>
            <textarea name="notes" rows={3} defaultValue={athlete.notes ?? ""} className={inputClass} />
          </label>
          <p className="text-xs text-muted">
            {athlete.user_id
              ? "This athlete has a login."
              : athlete.email
                ? "No login yet. Invite this email address from Supabase (Authentication, Users, Invite) and it links automatically."
                : "No login. Add an email address first if they should log in themselves."}
          </p>
          <SecondaryButton type="submit">Save profile</SecondaryButton>
        </form>
      </Card>
    </div>
  );
}
