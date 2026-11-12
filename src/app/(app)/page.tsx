import Link from "next/link";
import { Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getMyAthlete } from "@/lib/athlete";
import { WEEKDAYS, isoWeekday, todayISO, weekRange } from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";

function today() {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Brussels",
  }).format(new Date());
}

export default async function HomePage() {
  const user = await requireUser();
  const firstName = user.fullName.split(" ")[0];
  return user.role === "coach" ? <CoachHome firstName={firstName} /> : <AthleteHome firstName={firstName} />;
}

async function CoachHome({ firstName }: { firstName: string }) {
  const supabase = await createClient();
  const [athletes, exercises, review, programs] = await Promise.all([
    supabase.from("athletes").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("exercises").select("id", { count: "exact", head: true }).eq("archived", false),
    supabase.from("exercises").select("id", { count: "exact", head: true }).eq("needs_review", true),
    supabase.from("programs").select("id", { count: "exact", head: true }).eq("status", "active"),
  ]);

  const tiles = [
    { label: "Active athletes", value: athletes.count ?? 0, href: "/athletes" },
    { label: "Active programs", value: programs.count ?? 0 },
    { label: "Exercises", value: exercises.count ?? 0, href: "/library" },
    { label: "Exercises to review", value: review.count ?? 0, href: "/library?review=1" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted">{today()}</p>
        <h1 className="mt-1 text-2xl font-bold">{firstName ? `Hi ${firstName}` : "Coach home"}</h1>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {tiles.map((t) => {
          const body = (
            <Card className="h-full">
              <p className="text-3xl font-bold tabular-nums">{t.value}</p>
              <p className="mt-1 text-sm text-muted">{t.label}</p>
            </Card>
          );
          return t.href ? (
            <Link key={t.label} href={t.href}>
              {body}
            </Link>
          ) : (
            <div key={t.label}>{body}</div>
          );
        })}
      </div>
      <Link href="/follow-up" className="flex items-center justify-between rounded-2xl border border-border bg-surface px-5 py-4">
        <span>
          <span className="block font-semibold">Follow-up</span>
          <span className="block text-sm text-muted">Who trained this week, what was missed, comments</span>
        </span>
        <span className="text-muted">→</span>
      </Link>
    </div>
  );
}

async function AthleteHome({ firstName }: { firstName: string }) {
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

  const day = todayISO();
  const weekday = isoWeekday();
  const { monday, sunday } = weekRange(day);

  const [{ data: sessionData }, { data: logData }] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, name, kind, weekday, scheduled_date, is_optional, estimated_minutes, position, programs!inner(status, athlete_id), session_exercises(count)")
      .eq("programs.status", "active")
      .eq("programs.athlete_id", athlete.id),
    supabase.from("workout_logs").select("id, session_id, performed_on, finished_at").eq("athlete_id", athlete.id).gte("performed_on", monday).lte("performed_on", sunday),
  ]);

  type S = { id: string; name: string; kind: string; weekday: number | null; scheduled_date: string | null; is_optional: boolean; estimated_minutes: number | null; position: number; session_exercises: { count: number }[] };
  const sessions = ((sessionData ?? []) as unknown as S[]).filter((s) => !s.scheduled_date || (s.scheduled_date >= monday && s.scheduled_date <= sunday));
  const logs = (logData ?? []) as { id: string; session_id: string | null; performed_on: string; finished_at: string | null }[];

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

      {sessions.length === 0 ? (
        <Card>
          <h2 className="font-semibold">No session yet</h2>
          <p className="mt-2 text-sm text-muted">Your coach has not published a program for you yet. It will show up here.</p>
        </Card>
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
          <section className="space-y-3">
            <h2 className="text-xs font-semibold tracking-[0.2em] text-muted">THIS WEEK</h2>
            {[...sorted.filter((s) => dayOf(s) != null), ...anyDay].map((s) => item(s))}
          </section>
        </>
      )}

      <Link href="/history" className="block text-center text-sm text-muted underline">
        Workout history
      </Link>
    </div>
  );
}
