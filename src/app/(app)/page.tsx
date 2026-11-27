import Link from "next/link";
import { AthleteHome, today } from "@/components/athlete-home";
import { isoWeekday, todayISO, weekFilter } from "@/lib/plan";
import { Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { type ClientPackage, packageState } from "@/lib/business";
import { getWorkoutsToReview } from "@/lib/review";
import { getVideoTodo } from "@/lib/video-todo";
import { blocksToWrite, type BlockProgram } from "@/lib/blocks";
import { createClient } from "@/lib/supabase/server";
import { markPaidFromHome, renewFromHome } from "./coach-actions";
import { PushSetup } from "@/components/push-setup";
import { unreadCount } from "@/lib/chat";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const user = await requireUser();
  const firstName = user.fullName.split(" ")[0];
  return user.role === "coach" ? <CoachHome firstName={firstName} userId={user.id} /> : <AthleteHome firstName={firstName} welcome={sp.welcome === "1"} done={typeof sp.done === "string" ? sp.done : undefined} needsPassword={!user.passwordSet} />;
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
  const { data: inPerson } = await supabase.from("athletes").select("id, full_name, user_id").eq("status", "active").eq("is_in_person", true).eq("tracking_only", false).eq("billing", "package");
  // Packages that need a look: unpaid, almost used up, ending soon.
  const openPkgs = (pkgs.data ?? []) as ClientPackage[];
  const [toReview, videoTodo, coached, blockPrograms, unreadMsgs] = await Promise.all([
    getWorkoutsToReview(userId),
    getVideoTodo(supabase),
    // Athletes you write programs for: active, not logging-only.
    supabase.from("athletes").select("id, full_name, user_id").eq("status", "active").eq("tracking_only", false),
    supabase.from("programs").select("id, athlete_id, name, status, start_date, created_at, sessions(week)").eq("is_template", false).in("status", ["active", "draft"]),
    unreadCount("coach", null),
  ]);
  const toWrite = blocksToWrite(
    (coached.data ?? []).filter((a) => a.user_id !== userId), // not your own training
    ((blockPrograms.data ?? []) as { id: string; athlete_id: string; name: string; status: string; start_date: string | null; created_at: string; sessions: { week: number | null }[] }[]).map(
      (p): BlockProgram => ({ ...p, weeks: Math.max(0, ...p.sessions.map((s) => s.week ?? 0)) }),
    ),
    day,
  );
  const shortDay = (d: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
  // Needs attention: packages with an alert, and in-person clients without a package.
  type Attn = { key: string; athleteId: string; athlete: string; what: string; pkgId?: string; canPay?: boolean; canRenew?: boolean };
  const attention: Attn[] = [];
  const names = new Map((inPerson ?? []).map((a) => [a.id, a.full_name]));
  if (openPkgs.length > 0) {
    const ids = [...new Set(openPkgs.map((p) => p.athlete_id))];
    const { data: done } = await supabase.from("workout_logs").select("athlete_id, performed_on").in("athlete_id", ids).not("finished_at", "is", null);
    const by = new Map<string, string[]>();
    for (const l of (done ?? []) as { athlete_id: string; performed_on: string }[]) by.set(l.athlete_id, [...(by.get(l.athlete_id) ?? []), l.performed_on]);
    const { data: who } = await supabase.from("athletes").select("id, full_name").in("id", ids);
    for (const a of who ?? []) names.set(a.id, a.full_name);
    for (const p of openPkgs) {
      const st = packageState(p, by.get(p.athlete_id) ?? [], day);
      if (st.alerts.length === 0) continue;
      attention.push({ key: p.id, athleteId: p.athlete_id, athlete: names.get(p.athlete_id) ?? "Client", what: `${p.name}: ${st.alerts.join(", ")}`, pkgId: p.id, canPay: !p.paid_on && (p.price ?? 0) > 0, canRenew: !st.running });
    }
  }
  const withPkg = new Set(openPkgs.map((p) => p.athlete_id));
  for (const a of inPerson ?? []) if (a.user_id !== userId && !withPkg.has(a.id)) attention.push({ key: "none-" + a.id, athleteId: a.id, athlete: a.full_name, what: "no package" });
  attention.sort((a, b) => a.athlete.localeCompare(b.athlete));

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
    { label: "Videos to film", value: videoTodo.length, href: "/library?todo=1" },
    // Only while there is something to check.
    ...((review.count ?? 0) > 0 ? [{ label: "Exercises to check", value: review.count ?? 0, href: "/library?review=check" }] : []),
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
      <PushSetup dismissable />
      {unreadMsgs > 0 && (
        <Link href="/chat" className="flex items-center justify-between rounded-2xl border border-accent bg-surface px-5 py-4">
          <span>
            <span className="block font-semibold">
              {unreadMsgs} unread message{unreadMsgs === 1 ? "" : "s"}
            </span>
            <span className="block text-sm text-muted">Opens Messages</span>
          </span>
          <span className="text-muted">→</span>
        </Link>
      )}
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
      {attention.length > 0 && (
        <Card>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-semibold">Needs attention</h2>
            <Link href="/business" className="text-sm text-muted">Packages →</Link>
          </div>
          <ul className="mt-2 divide-y divide-border">
            {attention.map((a) => (
              <li key={a.key} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <Link href={`/athletes/${a.athleteId}/client`} className="min-w-0">
                  <span className="block font-medium">{a.athlete}</span>
                  <span className="block text-accent">{a.what}</span>
                </Link>
                <span className="flex shrink-0 gap-2">
                  {a.pkgId && a.canPay && (
                    <form action={markPaidFromHome.bind(null, a.athleteId, a.pkgId)}>
                      <button className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium">Mark paid</button>
                    </form>
                  )}
                  {a.pkgId && a.canRenew && (
                    <form action={renewFromHome.bind(null, a.athleteId, a.pkgId)}>
                      <button className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium">Renew</button>
                    </form>
                  )}
                  {!a.pkgId && (
                    <Link href={`/athletes/${a.athleteId}/client`} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium">Add</Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>
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
      {toWrite.length > 0 && (
        <Card>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-semibold">Blocks to write</h2>
            <p className="text-sm text-muted">ending within 7 days</p>
          </div>
          <ul className="mt-2 divide-y divide-border">
            {toWrite.map((b) => (
              <li key={b.athleteId}>
                <Link href={`/athletes/${b.athleteId}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{b.athlete}</span>
                    {b.program && <span className="ml-2 text-muted">{b.program}</span>}
                  </span>
                  <span className={`shrink-0 ${b.kind === "ending" && (b.daysLeft ?? 0) > 2 ? "text-muted" : "text-accent"}`}>
                    {b.kind === "none"
                      ? "no program"
                      : b.kind === "draft"
                        ? "draft, not published"
                        : b.kind === "ended"
                          ? `ended ${-(b.daysLeft as number)} day${b.daysLeft === -1 ? "" : "s"} ago`
                          : b.daysLeft === 0
                            ? "ends today"
                            : `ends ${shortDay(b.end as string)}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
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

