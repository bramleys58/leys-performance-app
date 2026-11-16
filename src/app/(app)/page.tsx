import Link from "next/link";
import { AthleteHome, today } from "@/components/athlete-home";
import { isoWeekday, todayISO, weekFilter } from "@/lib/plan";
import { Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { type ClientPackage, packageState } from "@/lib/business";
import { getWorkoutsToReview } from "@/lib/review";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const user = await requireUser();
  const firstName = user.fullName.split(" ")[0];
  return user.role === "coach" ? <CoachHome firstName={firstName} userId={user.id} /> : <AthleteHome firstName={firstName} welcome={sp.welcome === "1"} />;
}

async function CoachHome({ firstName, userId }: { firstName: string; userId: string }) {
  const supabase = await createClient();
  const day = todayISO();
  const [athletes, exercises, review, programs, pending, unread, todays, todayLogs, checked, pkgs] = await Promise.all([
    supabase.from("athletes").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("exercises").select("id", { count: "exact", head: true }).eq("archived", false),
    supabase.from("exercises").select("id", { count: "exact", head: true }).eq("needs_review", true).eq("archived", false).or("review_note.is.null,review_note.not.ilike.*automatically*"),
    supabase.from("programs").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("exercises").select("id", { count: "exact", head: true }).eq("approved", false),
    supabase.from("weekly_check_ins").select("id", { count: "exact", head: true }).is("coach_seen_at", null),
    supabase
      .from("sessions")
      .select("id, name, kind, scheduled_date, weekday, week, program_id, programs!inner(status, athlete_id, start_date, created_at, athletes!inner(id, full_name, status))")
      .eq("programs.status", "active"),
    supabase.from("workout_logs").select("athlete_id, session_id, finished_at, duration_minutes").eq("performed_on", day),
    supabase.from("check_ins").select("id", { count: "exact", head: true }).eq("day", day),
    supabase.from("client_packages").select("*").eq("ended", false),
  ]);
  // Packages that need a look: unpaid, almost used up, ending soon.
  const openPkgs = (pkgs.data ?? []) as ClientPackage[];
  const toReview = await getWorkoutsToReview(userId);
  let business = 0;
  if (openPkgs.length > 0) {
    const ids = [...new Set(openPkgs.map((p) => p.athlete_id))];
    const { data: done } = await supabase.from("workout_logs").select("athlete_id, performed_on").in("athlete_id", ids).not("finished_at", "is", null);
    const by = new Map<string, string[]>();
    for (const l of (done ?? []) as { athlete_id: string; performed_on: string }[]) by.set(l.athlete_id, [...(by.get(l.athlete_id) ?? []), l.performed_on]);
    business = openPkgs.filter((p) => packageState(p, by.get(p.athlete_id) ?? [], day).alerts.length > 0).length;
  }

  type T = { id: string; name: string; kind: string; scheduled_date: string | null; weekday: number | null; week: number | null; program_id: string; programs: { athlete_id: string; start_date: string | null; created_at: string; athletes: { id: string; full_name: string; status: string } } };
  type TL = { athlete_id: string; session_id: string | null; finished_at: string | null; duration_minutes: number | null };
  const logsToday = (todayLogs.data ?? []) as TL[];
  const activeSessions = (todays.data ?? []) as unknown as T[];
  const runsThisWeek = weekFilter(activeSessions, (s) => s.programs.start_date ?? s.programs.created_at.slice(0, 10));
  const weekdayNow = isoWeekday();
  const training = activeSessions
    .filter((s) => s.programs.athletes.status === "active" && runsThisWeek(s, day) && (s.scheduled_date ? s.scheduled_date === day : s.weekday === weekdayNow))
    .map((s) => {
      const log = logsToday.find((l) => l.session_id === s.id && l.athlete_id === s.programs.athlete_id);
      return { key: s.id, athleteId: s.programs.athletes.id, athlete: s.programs.athletes.full_name, session: s.name, slot: s.kind === "slot", status: log?.finished_at ? `done${log.duration_minutes ? ` · ${log.duration_minutes} min` : ""}` : log ? "in progress" : s.kind === "slot" ? "with you" : "not started" };
    })
    .sort((a, b) => a.athlete.localeCompare(b.athlete));

  const tiles = [
    { label: "Active athletes", value: athletes.count ?? 0, href: "/athletes" },
    { label: "Active programs", value: programs.count ?? 0 },
    { label: "Exercises", value: exercises.count ?? 0, href: "/library" },
    { label: "Exercises to check", value: review.count ?? 0, href: "/library?review=check" },
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
      {toReview.length > 0 && (
        <Link href="/review" className="flex items-center justify-between rounded-2xl border border-accent bg-surface px-5 py-4">
          <span className="min-w-0">
            <span className="block font-semibold">
              {toReview.length} workout{toReview.length === 1 ? "" : "s"} to review
            </span>
            <span className="block truncate text-sm text-muted">{[...new Set(toReview.map((w) => w.athleteName.split(" ")[0]))].slice(0, 4).join(", ")}</span>
          </span>
          <span className="text-muted">→</span>
        </Link>
      )}
      {business > 0 && (
        <Link href="/business" className="flex items-center justify-between rounded-2xl border border-accent bg-surface px-5 py-4">
          <span>
            <span className="block font-semibold">
              {business} client package{business === 1 ? "" : "s"} to look at
            </span>
            <span className="block text-sm text-muted">Unpaid, almost used up or ending soon</span>
          </span>
          <span className="text-muted">→</span>
        </Link>
      )}
      {(unread.count ?? 0) > 0 && (
        <Link href="/follow-up" className="flex items-center justify-between rounded-2xl border border-accent bg-surface px-5 py-4">
          <span>
            <span className="block font-semibold">
              {unread.count} weekly check-in{unread.count === 1 ? "" : "s"} to read
            </span>
            <span className="block text-sm text-muted">Opens in follow-up</span>
          </span>
          <span className="text-muted">→</span>
        </Link>
      )}
      <Card>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-semibold">Training today</h2>
          <p className="text-sm text-muted">{checked.count ?? 0} checked in</p>
        </div>
        {training.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No sessions planned for today.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {training.map((t) => (
              <li key={t.key}>
                <Link href={`/athletes/${t.athleteId}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium">{t.athlete}</span>
                    <span className="ml-2 text-muted">{t.session}</span>
                  </span>
                  <span className={`shrink-0 ${t.status.startsWith("done") ? "text-ok" : "text-muted"}`}>{t.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {(pending.count ?? 0) > 0 && (
        <Link href="/library?pending=1" className="flex items-center justify-between rounded-2xl border border-accent bg-surface px-5 py-4">
          <span>
            <span className="block font-semibold">
              {pending.count} new exercise{pending.count === 1 ? "" : "s"} to approve
            </span>
            <span className="block text-sm text-muted">Added by athletes during a workout</span>
          </span>
          <span className="text-muted">→</span>
        </Link>
      )}
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

