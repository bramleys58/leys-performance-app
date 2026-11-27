import Link from "next/link";
import { WorkoutSaved } from "@/components/workout-saved";
import { notFound } from "next/navigation";
import { ActionButton, BackLink, Card, Field, Notice, SecondaryButton, Select, inputClass } from "@/components/ui";
import { WeeklyAnswers } from "@/components/weekly-answers";
import { requireCoach } from "@/lib/auth";
import { HABIT_SUGGESTIONS, weekDays, weeksOnTarget } from "@/lib/habits";
import { todayISO, weekFilter } from "@/lib/plan";
import type { WeeklyCheckIn } from "@/lib/weekly";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { addHabit, addSuggestedHabit, copyProgram, createProgram, inviteAthlete, stopHabit, updateAthlete } from "../../coach-actions";
import { startFreeWorkout } from "../../athlete-actions";

export default async function AthletePage({ params, searchParams }: PageProps<"/athletes/[id]">) {
  await requireCoach();
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const habitSince = new Date(Date.parse(todayISO() + "T12:00:00Z") - 42 * 86400000).toISOString().slice(0, 10);
  const [{ data: athlete }, { data: programs }, { data: others }, { data: habitData }, { data: habitLogData }] = await Promise.all([
    supabase.from("athletes").select("*").eq("id", id).maybeSingle(),
    supabase.from("programs").select("id, name, phase, status, start_date, created_at").eq("athlete_id", id).order("created_at", { ascending: false }),
    supabase.from("programs").select("id, name, athlete_id, athletes(full_name)").neq("status", "archived").order("created_at", { ascending: false }).limit(200),
    supabase.from("habits").select("id, name, target_per_week, created_at").eq("athlete_id", id).eq("archived", false).order("position"),
    supabase.from("habit_logs").select("habit_id, day").eq("athlete_id", id).gte("day", habitSince),
  ]);
  if (!athlete) notFound();
  // Invited but never logged in: the invite can be sent again.
  let waitingForLogin = false;
  if (athlete.user_id) {
    const admin = adminClient();
    const { data: auth } = admin ? await admin.auth.admin.getUserById(athlete.user_id) : { data: { user: null } };
    waitingForLogin = !!auth.user && !auth.user.email_confirmed_at && !auth.user.last_sign_in_at;
  }

  const activeIds = (programs ?? []).filter((p) => p.status === "active").map((p) => p.id);
  const [{ data: liveSessions }, { data: recentLogs }, { data: weeklies }] = await Promise.all([
    activeIds.length
      ? supabase.from("sessions").select("id, name, kind, weekday, week, program_id").in("program_id", activeIds).order("weekday", { nullsFirst: false }).order("position")
      : Promise.resolve({ data: [] as { id: string; name: string; kind: string; weekday: number | null; week: number | null; program_id: string }[] }),
    supabase.from("workout_logs").select("id, session_name, performed_on, finished_at, session_rpe, duration_minutes").eq("athlete_id", id).order("performed_on", { ascending: false }).limit(8),
    supabase.from("weekly_check_ins").select("*").eq("athlete_id", id).order("week_start", { ascending: false }).limit(4),
  ]);

  const today0 = todayISO();
  const thisWeekDays = weekDays(today0);
  const habitRows = ((habitData ?? []) as { id: string; name: string; target_per_week: number; created_at: string }[]).map((h) => {
    const days = ((habitLogData ?? []) as { habit_id: string; day: string }[]).filter((l) => l.habit_id === h.id).map((l) => l.day);
    return { ...h, thisWeek: days.filter((d) => thisWeekDays.includes(d)).length, record: weeksOnTarget(days, h.target_per_week, h.created_at.slice(0, 10), today0) };
  });

  // In a multi-week block only this week's sessions are offered for logging.
  const startOf = new Map((programs ?? []).map((p) => [p.id, p.start_date ?? String(p.created_at).slice(0, 10)]));
  const everyLive = (liveSessions ?? []) as { id: string; name: string; kind: string; weekday: number | null; week: number | null; program_id: string }[];
  const runsThisWeek = weekFilter(everyLive, (s) => startOf.get(s.program_id) ?? null);
  const today = todayISO();
  const live = everyLive.filter((s) => s.kind !== "slot" && runsThisWeek(s, today));
  const templates = (others ?? []).filter((o) => !o.athlete_id);
  const otherPrograms = (others ?? []).filter((o) => o.athlete_id && o.athlete_id !== id);

  return (
    <div className="space-y-5">
      <BackLink href="/athletes">Athletes</BackLink>
      <h1 className="text-2xl font-bold">{athlete.full_name}</h1>
      <WorkoutSaved logId={typeof sp.done === "string" ? sp.done : undefined} />
      {sp.saved && <Notice kind="ok">Saved.</Notice>}
      {sp.invited && <Notice kind="ok">Invite sent. The athlete gets an email with a link to set a password.</Notice>}
      {typeof sp.error === "string" && <Notice kind="error">{sp.error}</Notice>}

      <Card>
        <h2 className="font-semibold">Log a session for {athlete.full_name.split(" ")[0]}</h2>
        <p className="mt-1 text-sm text-muted">Opens the same logging screen the athlete uses, with you entering the numbers.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {live.map((s) => (
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Link href={`/chat/${athlete.id}`} className="rounded-2xl border border-border bg-surface px-4 py-4">
          <span className="block font-semibold">Chat</span>
          <span className="block text-sm text-muted">Messages and videos</span>
        </Link>
        <Link href={`/athletes/${athlete.id}/calendar`} className="rounded-2xl border border-border bg-surface px-4 py-4">
          <span className="block font-semibold">Calendar</span>
          <span className="block text-sm text-muted">Planned and done</span>
        </Link>
        <Link href={`/athletes/${athlete.id}/progress`} className="rounded-2xl border border-border bg-surface px-4 py-4">
          <span className="block font-semibold">Progress</span>
          <span className="block text-sm text-muted">Volume, records, tests</span>
        </Link>
        <Link href={`/athletes/${athlete.id}/maxes`} className="rounded-2xl border border-border bg-surface px-4 py-4">
          <span className="block font-semibold">Maxes</span>
          <span className="block text-sm text-muted">For % based weights</span>
        </Link>
        <Link href={`/athletes/${athlete.id}/injuries`} className="rounded-2xl border border-border bg-surface px-4 py-4">
          <span className="block font-semibold">Injury log</span>
          <span className="block text-sm text-muted">Pain and injuries</span>
        </Link>
        <a href="#habits" className="rounded-2xl border border-border bg-surface px-4 py-4">
          <span className="block font-semibold">Habits</span>
          <span className="block text-sm text-muted">{habitRows.length ? `${habitRows.length} active` : "Set daily habits"}</span>
        </a>
        {!athlete.tracking_only && (
          <Link href={`/athletes/${athlete.id}/client`} className="rounded-2xl border border-border bg-surface px-4 py-4">
            <span className="block font-semibold">Client</span>
            <span className="block text-sm text-muted">Packages and payments</span>
          </Link>
        )}
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
                  {l.finished_at ? `done${l.duration_minutes ? ` · ${l.duration_minutes} min` : ""}${l.session_rpe ? ` · RPE ${l.session_rpe}` : ""}` : "in progress"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      {((weeklies ?? []) as WeeklyCheckIn[]).length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold tracking-[0.2em] text-muted">WEEKLY CHECK-INS</h2>
          {((weeklies ?? []) as WeeklyCheckIn[]).map((w) => (
            <WeeklyAnswers key={w.id} c={w} />
          ))}
        </section>
      )}

      <Card>
        <h2 id="habits" className="scroll-mt-20 font-semibold">
          Habits
        </h2>
        {habitRows.length === 0 ? (
          <p className="mt-1 text-sm text-muted">No habits yet. They show up on {athlete.full_name.split(" ")[0]}&apos;s Today screen to tick off.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {habitRows.map((h) => (
              <li key={h.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{h.name}</p>
                  <p className="text-sm text-muted">
                    {h.target_per_week === 7 ? "every day" : `${h.target_per_week}× a week`} · this week {h.thisWeek}/{h.target_per_week}
                    {h.record.of > 0 ? ` · on target ${h.record.hit} of last ${h.record.of} weeks` : ""}
                  </p>
                </div>
                <form action={stopHabit.bind(null, id, h.id)}>
                  <ActionButton aria-label={`Stop ${h.name}`} className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted">
                    Stop
                  </ActionButton>
                </form>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {HABIT_SUGGESTIONS.filter(([n]) => !habitRows.some((h) => h.name.toLowerCase() === n.toLowerCase())).map(([n, t]) => (
            <form key={n} action={addSuggestedHabit.bind(null, id, n, t)}>
              <ActionButton className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-sm">+ {n}</ActionButton>
            </form>
          ))}
        </div>
        <form action={addHabit.bind(null, id)} className="mt-3 grid grid-cols-[1fr_auto_auto] gap-2">
          <input name="habit_name" required maxLength={80} placeholder="Own habit, e.g. Stretch before bed" className={inputClass} />
          <select name="target" defaultValue="7" aria-label="Times per week" className={inputClass}>
            {[7, 6, 5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n === 7 ? "Daily" : `${n}× / week`}
              </option>
            ))}
          </select>
          <ActionButton className="rounded-xl bg-accent px-4 py-2.5 font-semibold text-accent-text">Add</ActionButton>
        </form>
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
          <form action={copyProgram} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
            <input type="hidden" name="athlete_id" value={athlete.id} />
            <select name="source_id" required className={inputClass} defaultValue="" aria-label="Template or program to copy">
              <option value="" disabled>
                Or start from a template or another program…
              </option>
              {templates.length > 0 && (
                <optgroup label="Templates">
                  {templates.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {otherPrograms.length > 0 && (
                <optgroup label="Programs of other athletes">
                  {otherPrograms.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} ({(o.athletes as unknown as { full_name: string } | null)?.full_name})
                    </option>
                  ))}
                </optgroup>
              )}
              {(programs ?? []).length > 0 && (
                <optgroup label={`Earlier programs of ${athlete.full_name.split(" ")[0]}`}>
                  {(programs ?? []).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <input name="start_date" type="date" aria-label="Start date" className={inputClass} />
            <ActionButton className="rounded-xl border border-border bg-surface-2 px-5 py-2.5 font-medium" pendingLabel="Copying…">Copy</ActionButton>
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
          <Select label="Group" name="group" defaultValue={athlete.tracking_only ? "logging" : athlete.is_in_person ? "in_person" : "online"}>
            <option value="online">Online client</option>
            <option value="in_person">In-person client</option>
            <option value="logging">Logging only (independent, no check-ins)</option>
          </Select>
          {!athlete.tracking_only && (
            <Select label="Payment" name="billing" defaultValue={athlete.billing ?? "package"}>
              <option value="package">Pays me with packages</option>
              <option value="peak">Through Peak (no package needed)</option>
              <option value="free">Unpaid (no package needed)</option>
            </Select>
          )}
          <label className="block">
            <span className="mb-1.5 block text-sm text-muted">Private notes</span>
            <textarea name="notes" rows={3} defaultValue={athlete.notes ?? ""} className={inputClass} />
          </label>
          <p className="text-xs text-muted">
            {athlete.user_id
              ? athlete.privacy_accepted_at
                ? `This athlete has a login and agreed to the privacy notice on ${new Date(athlete.privacy_accepted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.`
                : "This athlete has a login but has not agreed to the privacy notice yet. They are asked on their next visit."
              : athlete.email
                ? "No login yet. Send an invite with the button below."
                : "No login. Add an email address first if they should log in themselves."}
          </p>
          <SecondaryButton type="submit">Save profile</SecondaryButton>
        </form>
        {athlete.email && (!athlete.user_id || waitingForLogin) && (
          <form action={inviteAthlete.bind(null, athlete.id)} className="mt-3">
            {waitingForLogin && <p className="mb-2 text-sm text-muted">Invited, but no login made yet. Invite links expire, so send a fresh one if the first did not work.</p>}
            <ActionButton pendingLabel="Sending…" className="w-full rounded-xl border border-accent/60 px-4 py-3 text-base font-medium text-accent">
              {waitingForLogin ? `Resend the invite to ${athlete.email}` : `Email an invite to ${athlete.email}`}
            </ActionButton>
          </form>
        )}
      </Card>
    </div>
  );
}
