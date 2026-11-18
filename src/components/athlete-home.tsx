import Link from "next/link";
import { redirect } from "next/navigation";
import { HabitsCard } from "@/components/habits-card";
import { weekDays } from "@/lib/habits";
import { Card, SecondaryButton } from "@/components/ui";
import { startFreeWorkout } from "@/app/(app)/athlete-actions";
import { getMyAthlete } from "@/lib/athlete";
import { readiness, type CheckIn } from "@/lib/checkin";
import { weekLabel, weeklyTarget } from "@/lib/weekly";
import { WeeklyPrompt } from "@/components/weekly-prompt";
import { WEEKDAYS, isoWeekday, todayISO, weekFilter, weekRange } from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";
import { WorkoutSaved } from "@/components/workout-saved";

export function today() {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Brussels",
  }).format(new Date());
}

/** The athlete's Today screen. Also used for a coach who has their own athlete profile. */
export async function AthleteHome({ firstName, welcome = false, isCoach = false, done, needsPassword = false }: { firstName: string; welcome?: boolean; isCoach?: boolean; done?: string; needsPassword?: boolean }) {
  const supabase = await createClient();
  const athlete = await getMyAthlete();
  const name = firstName || athlete?.full_name?.split(" ")[0] || "";

  const heading = (
    <div>
      <p className="text-sm text-muted">{today()}</p>
      <h1 className="mt-1 text-2xl font-bold">{name ? `Today, ${name}` : "Today"}</h1>
    </div>
  );

  if (!athlete) {
    return (
      <div className="space-y-5">
        {heading}
        <Card>
          <h2 className="font-semibold">Almost ready</h2>
          <p className="mt-2 text-sm text-muted">Your login is not linked to an athlete profile yet. Let your coach know.</p>
        </Card>
      </div>
    );
  }

  // First login: privacy notice and basics before anything else.
  if (!isCoach && !athlete.privacy_accepted_at) redirect("/welcome");

  const day = todayISO();
  const weekday = isoWeekday();
  const { monday, sunday } = weekRange(day);

  const weekly = weeklyTarget(day, weekday);
  const [{ data: sessionData }, { data: logData }, { data: checkData }, { data: weeklyData }, { data: replyData }] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, name, kind, weekday, scheduled_date, is_optional, estimated_minutes, position, week, program_id, programs!inner(status, athlete_id, start_date, created_at), session_exercises(count)")
      .eq("programs.status", "active")
      .eq("programs.athlete_id", athlete.id),
    supabase.from("workout_logs").select("id, session_id, session_name, performed_on, finished_at").eq("athlete_id", athlete.id).gte("performed_on", monday).lte("performed_on", sunday),
    supabase.from("check_ins").select("*").eq("athlete_id", athlete.id).eq("day", day).maybeSingle(),
  supabase.from("weekly_check_ins").select("id").eq("athlete_id", athlete.id).eq("week_start", weekly.weekStart).maybeSingle(),
    supabase
      .from("workout_reviews")
      .select("workout_log_id, reply, workout_logs(session_name, performed_on)")
      .eq("athlete_id", athlete.id)
      .not("reply", "is", null)
      .is("reply_seen_at", null)
      .order("reviewed_at", { ascending: false })
      .limit(3),
  ]);
  // Habits the coach set, with this week's ticks.
  const habitWeek = weekDays(day);
  const [{ data: habitData }, { data: habitLogData }] = await Promise.all([
    supabase.from("habits").select("id, name, target_per_week, position").eq("athlete_id", athlete.id).eq("archived", false).order("position"),
    supabase.from("habit_logs").select("habit_id, day").eq("athlete_id", athlete.id).gte("day", habitWeek[0]).lte("day", habitWeek[6]),
  ]);
  const habits = (habitData ?? []) as { id: string; name: string; target_per_week: number }[];
  const habitDone: Record<string, string[]> = {};
  for (const l of (habitLogData ?? []) as { habit_id: string; day: string }[]) (habitDone[l.habit_id] ??= []).push(l.day);

  type Reply = { workout_log_id: string; reply: string; workout_logs: { session_name: string | null; performed_on: string } | null };
  const replies = (replyData ?? []) as unknown as Reply[];

  type S = { id: string; name: string; kind: string; weekday: number | null; scheduled_date: string | null; is_optional: boolean; estimated_minutes: number | null; position: number; week: number | null; program_id: string; programs: { start_date: string | null; created_at: string }; session_exercises: { count: number }[] };
  const everySession = (sessionData ?? []) as unknown as S[];
  // Only this week of a multi-week block, plus everything that repeats every week.
  const runsThisWeek = weekFilter(everySession, (s) => s.programs.start_date ?? s.programs.created_at.slice(0, 10));
  const sessions = everySession.filter((s) => runsThisWeek(s, day) && (!s.scheduled_date || (s.scheduled_date >= monday && s.scheduled_date <= sunday)));
  const logs = (logData ?? []) as { id: string; session_id: string | null; session_name: string | null; performed_on: string; finished_at: string | null }[];
  const openFree = logs.filter((l) => !l.session_id && !l.finished_at && l.performed_on === day);

  // If the check-in table is not there yet, checkData is simply empty and the card invites a check-in.
  const checkIn = (checkData ?? null) as CheckIn | null;
  const ready = checkIn ? readiness(checkIn) : null;
  const checkInCard = (
    <Link href="/check-in" className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Daily check-in</p>
        <p className="truncate text-sm text-muted">
          {checkIn
            ? [checkIn.sleep_hours != null ? `${checkIn.sleep_hours} h sleep` : null, checkIn.bodyweight != null ? "weight logged" : null, "tap to change"].filter(Boolean).join(" · ")
            : "Sleep, energy, soreness. 20 seconds."}
        </p>
      </div>
      {checkIn ? (
        <span className="shrink-0 text-right">
          <span className="block text-lg font-bold tabular-nums">{ready == null ? "✓" : `${ready}%`}</span>
          {ready != null && <span className="block text-xs text-muted">readiness</span>}
        </span>
      ) : (
        <span className="shrink-0 text-sm font-medium text-accent">Check in →</span>
      )}
    </Link>
  );

  const weeklyDone = Boolean(weeklyData);
  const weeklyCard =
    weekly.due && !weeklyDone ? (
      <Link href="/weekly" className="flex items-center gap-3 rounded-2xl border border-accent bg-accent/10 px-4 py-4">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Weekly check-in</p>
          <p className="truncate text-sm text-muted">Week of {weekLabel(weekly.weekStart)} · 2 minutes</p>
        </div>
        <span className="shrink-0 text-sm font-medium text-accent">Start →</span>
      </Link>
    ) : null;

  const freeWorkout = (
    <div className="space-y-3">
      {openFree.map((l) => (
        <Link key={l.id} href={`/workout/${l.id}`} className="flex items-center justify-between rounded-2xl border border-accent bg-surface px-4 py-4">
          <span className="font-semibold">{l.session_name ?? "Free workout"}</span>
          <span className="text-sm font-medium text-muted">Continue →</span>
        </Link>
      ))}
      <form action={startFreeWorkout}>
        <input type="hidden" name="athlete_id" value={athlete.id} />
        <SecondaryButton type="submit" pendingLabel="Starting…">
          + Start a free workout
        </SecondaryButton>
      </form>
    </div>
  );

  // The weekday a session falls on this week (a fixed date wins over the repeating day).
  const dayOf = (s: S) => (s.scheduled_date ? ((new Date(s.scheduled_date + "T12:00:00Z").getUTCDay() + 6) % 7) + 1 : s.weekday);
  const logOf = (s: S) => logs.find((l) => l.session_id === s.id);
  const sorted = [...sessions].sort((a, b) => (dayOf(a) ?? 8) - (dayOf(b) ?? 8) || a.position - b.position);
  const todays = sorted.filter((s) => dayOf(s) === weekday);
  const anyDay = sorted.filter((s) => dayOf(s) == null);

  const item = (s: S, big = false) => {
    const log = logOf(s);
    const d = dayOf(s);
    const status = log?.finished_at ? "done" : log ? "started" : s.kind !== "slot" && d != null && d < weekday && !s.is_optional ? "catch up" : null;
    const href = log ? `/workout/${log.id}` : `/session/${s.id}`;
    const count = s.session_exercises?.[0]?.count ?? 0;
    return (
      <Link key={s.id} href={href} className={`flex items-center gap-3 rounded-2xl border bg-surface px-4 ${big ? "border-accent py-5" : "border-border py-3"}`}>
        <div className="min-w-0 flex-1">
          {!big && <p className="text-xs uppercase tracking-wide text-muted">{d ? WEEKDAYS[d - 1] : "Any day"}</p>}
          <p className={`truncate font-semibold ${big ? "text-xl" : ""}`}>{s.name}</p>
          <p className="truncate text-sm text-muted">
            {[s.kind === "slot" ? "with your coach" : `${count} exercises`, s.estimated_minutes ? `about ${s.estimated_minutes} min` : null, s.is_optional ? "optional" : null].filter(Boolean).join(" · ")}
          </p>
        </div>
        <span className={`shrink-0 text-sm font-medium ${status === "done" ? "text-ok" : status === "catch up" ? "text-accent" : "text-muted"}`}>
          {status === "done" ? "✓ Done" : status === "started" ? "Continue →" : status === "catch up" ? "Catch up →" : big ? "Start →" : "→"}
        </span>
      </Link>
    );
  };

  return (
    <div className="space-y-6">
      {heading}
      <WorkoutSaved logId={done} />
      {needsPassword && (
        <Link href="/account" className="flex items-center justify-between rounded-2xl border border-accent bg-accent/10 px-4 py-3">
          <span>
            <span className="block font-semibold">Choose a password</span>
            <span className="block text-sm text-muted">So you can log in without waiting for an email next time</span>
          </span>
          <span className="text-accent">→</span>
        </Link>
      )}
      {welcome && (
        <Card>
          <h2 className="font-semibold">You&apos;re in. One last tip:</h2>
          <p className="mt-1 text-sm text-muted">Put the app on your home screen so it opens like a normal app.</p>
          <ul className="mt-2 space-y-1 text-sm">
            <li>
              <b>iPhone:</b> in Safari tap Share, then &quot;Add to Home Screen&quot;.
            </li>
            <li>
              <b>Android:</b> in Chrome tap the ⋮ menu, then &quot;Install app&quot; or &quot;Add to Home screen&quot;.
            </li>
          </ul>
        </Card>
      )}
      {replies.map((r) => (
        <Link key={r.workout_log_id} href={`/workout/${r.workout_log_id}`} className="block rounded-2xl border border-accent bg-surface px-5 py-4">
          <span className="block text-sm text-accent">Your coach replied · {r.workout_logs?.session_name ?? "Workout"}</span>
          <span className="mt-1 line-clamp-2 block">{r.reply}</span>
        </Link>
      ))}
      {/* An open weekly check-in (Sunday, or missed) always leads. */}
      {!athlete.tracking_only && (
        <>
          {weekly.isSunday && !weeklyDone && <WeeklyPrompt weekLabel={weekLabel(weekly.weekStart)} />}
          {weeklyCard}
        </>
      )}

      {sessions.length === 0 ? (
        <>
          {freeWorkout}
          {!athlete.tracking_only && <p className="-mt-3 text-center text-sm text-muted">No program from your coach yet.</p>}
        </>
      ) : (
        <>
          <section className="space-y-3">
            {todays.length > 0 ? todays.map((s) => item(s, true)) : (
              <Card>
                <h2 className="font-semibold">Nothing planned today</h2>
                <p className="mt-2 text-sm text-muted">Recover well, or catch up on a session from this week below.</p>
              </Card>
            )}
          </section>
          {freeWorkout}
        </>
      )}

      {!athlete.tracking_only && checkInCard}
      {habits.length > 0 && <HabitsCard habits={habits} done={habitDone} week={habitWeek} today={day} />}

      {sessions.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold tracking-[0.2em] text-muted">THIS WEEK</h2>
          {[...sorted.filter((s) => dayOf(s) != null), ...anyDay].map((s) => item(s))}
        </section>
      )}

      <div className="flex justify-center gap-6 text-sm text-muted">
        <Link href="/calendar" className="underline">
          Calendar
        </Link>
        <Link href="/progress" className="underline">
          My progress
        </Link>
        <Link href="/history" className="underline">
          Workout history
        </Link>
      </div>
    </div>
  );
}
