import Link from "next/link";
import { Card } from "@/components/ui";
import { WeeklyAnswers } from "@/components/weekly-answers";
import { requireCoach } from "@/lib/auth";
import { weekLabel, weeklyTarget, type WeeklyCheckIn } from "@/lib/weekly";
import { flags as checkFlags, readiness, type CheckIn } from "@/lib/checkin";
import { complianceFor, fallingBehind, isRealPain, lastMondays } from "@/lib/compliance";
import { WEEKDAYS, isoWeekday, todayISO, weekFilter, weekRange } from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Follow-up | Leys Performance" };

export default async function FollowUpPage() {
  await requireCoach();
  const supabase = await createClient();
  const day = todayISO();
  const weekday = isoWeekday();
  const { monday, sunday } = weekRange(day);
  const twoWeeksAgo = new Date(new Date(day + "T12:00:00Z").getTime() - 14 * 86400000).toISOString().slice(0, 10);
  const WEEKS = 6;
  const mondays = lastMondays(day, WEEKS);

  // The most recent finished week from Monday to Tuesday, the current week after that.
  const target = weeklyTarget(day, weekday);
  const [{ data: athletes }, { data: sessions }, { data: logs }, { data: checks }, { data: weeklies }, { data: injuries }] = await Promise.all([
    supabase.from("athletes").select("id, full_name, sport").eq("status", "active").order("full_name"),
    supabase.from("sessions").select("id, name, weekday, kind, is_optional, week, program_id, programs!inner(athlete_id, status, start_date, created_at)").eq("programs.status", "active"),
    supabase.from("workout_logs").select("id, athlete_id, session_id, session_name, performed_on, finished_at, session_rpe, duration_minutes, comment, set_logs(count)").gte("performed_on", mondays[0] < twoWeeksAgo ? mondays[0] : twoWeeksAgo).order("performed_on", { ascending: false }),
    supabase.from("check_ins").select("*").eq("day", day),
    supabase.from("weekly_check_ins").select("*").eq("week_start", target.weekStart).order("created_at", { ascending: false }),
    supabase.from("injury_notes").select("athlete_id, area").eq("status", "open"),
  ]);
  const openInjuries = (injuries ?? []) as { athlete_id: string; area: string | null }[];

  // Opening follow-up counts as reading the weekly check-ins shown on it.
  const unreadIds = ((weeklies ?? []) as (WeeklyCheckIn & { coach_seen_at: string | null })[]).filter((w) => !w.coach_seen_at).map((w) => w.id);
  if (unreadIds.length > 0) await supabase.from("weekly_check_ins").update({ coach_seen_at: new Date().toISOString() }).in("id", unreadIds);
  // Older unread ones (from weeks no longer shown here) are marked as read too, so the home card clears.
  await supabase.from("weekly_check_ins").update({ coach_seen_at: new Date().toISOString() }).is("coach_seen_at", null).lt("week_start", target.weekStart);

  type S = { id: string; name: string; weekday: number | null; kind: string; is_optional: boolean; week: number | null; program_id: string; programs: { athlete_id: string; start_date: string | null; created_at: string } };
  type L = { id: string; athlete_id: string; session_id: string | null; session_name: string | null; performed_on: string; finished_at: string | null; session_rpe: number | null; duration_minutes: number | null; comment: string | null; set_logs: { count: number }[] };
  const everySession = (sessions ?? []) as unknown as S[];
  const runsThisWeek = weekFilter(everySession, (s) => s.programs.start_date ?? s.programs.created_at.slice(0, 10));
  const allSessions = everySession.filter((s) => runsThisWeek(s, day));
  const allLogs = ((logs ?? []) as unknown as L[]).filter((l) => l.finished_at || (l.set_logs?.[0]?.count ?? 0) > 0);

  const rows = (athletes ?? []).map((a) => {
    const planned = allSessions.filter((s) => s.programs.athlete_id === a.id && s.kind !== "slot" && !s.is_optional);
    const mine = allLogs.filter((l) => l.athlete_id === a.id);
    const thisWeek = mine.filter((l) => l.performed_on >= monday && l.performed_on <= sunday);
    const doneIds = new Set(thisWeek.map((l) => l.session_id));
    const done = planned.filter((s) => doneIds.has(s.id)).length;
    const missed = planned.filter((s) => s.weekday != null && s.weekday < weekday && !doneIds.has(s.id));
    const last = mine[0];
    const flags: string[] = [];
    if (missed.length >= 2) flags.push(`${missed.length} missed this week`);
    if (last?.session_rpe != null && last.session_rpe >= 9) flags.push(`last session RPE ${last.session_rpe}`);
    if (planned.length > 0 && !mine.some((l) => l.performed_on >= twoWeeksAgo)) flags.push("nothing logged in 14 days");
    const weeks = complianceFor(a.id, everySession, allLogs, mondays);
    if (fallingBehind(weeks)) flags.push("under half of the plan two weeks in a row");
    const hurt = openInjuries.filter((i) => i.athlete_id === a.id);
    if (hurt.length > 0) flags.push(`open injury: ${hurt.map((i) => i.area ?? "note").join(", ")}`);
    const weekly = ((weeklies ?? []) as WeeklyCheckIn[]).find((w) => w.athlete_id === a.id);
    if (weekly && isRealPain(weekly.pain)) flags.push("pain reported in weekly check-in");
    const comment = thisWeek.find((l) => l.comment)?.comment ?? null;
    const check = ((checks ?? []) as (CheckIn & { athlete_id: string })[]).find((c) => c.athlete_id === a.id) ?? null;
    if (check) flags.push(...checkFlags(check));
    return { a, planned: planned.length, done, missed, last, flags, comment, check, weeks };
  });

  const active = rows.filter((r) => r.planned > 0);
  const trained = active.filter((r) => r.done > 0).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Follow-up</h1>
        <p className="mt-1 text-sm text-muted">
          This week, {monday} to {sunday}. {trained} of {active.length} athletes with a program have trained. {(checks ?? []).length} checked in today.
        </p>
      </div>

      {((weeklies ?? []) as WeeklyCheckIn[]).length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold tracking-[0.2em] text-muted">WEEKLY CHECK-INS · {weekLabel(target.weekStart).toUpperCase()}</h2>
          {((weeklies ?? []) as WeeklyCheckIn[]).map((w) => (
            <WeeklyAnswers key={w.id} c={w} name={(athletes ?? []).find((a) => a.id === w.athlete_id)?.full_name ?? "Athlete"} />
          ))}
          <h2 className="pt-2 text-xs font-semibold tracking-[0.2em] text-muted">TRAINING THIS WEEK</h2>
        </section>
      )}

      {rows.length === 0 && (
        <Card>
          <p className="text-sm text-muted">No active athletes yet.</p>
        </Card>
      )}

      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.a.id}>
            <Link href={`/athletes/${r.a.id}`} className="block rounded-2xl border border-border bg-surface px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate font-semibold">{r.a.full_name}</p>
                <p className={`shrink-0 text-sm tabular-nums ${r.planned > 0 && r.done >= r.planned ? "text-ok" : "text-muted"}`}>
                  {r.planned > 0 ? `${r.done} of ${r.planned} done` : "no active program"}
                </p>
              </div>
              <p className="mt-1 text-sm text-muted">
                {r.last ? `Last: ${r.last.session_name ?? "workout"} on ${r.last.performed_on}${r.last.duration_minutes ? `, ${r.last.duration_minutes} min` : ""}${r.last.session_rpe ? `, RPE ${r.last.session_rpe}` : ""}` : "No workouts in the last 14 days"}
              </p>
              {r.missed.length > 0 && (
                <p className="mt-1 text-sm text-muted">
                  Not done yet: {r.missed.map((s) => `${s.name} (${WEEKDAYS[(s.weekday ?? 1) - 1].slice(0, 3)})`).join(", ")}
                </p>
              )}
              {r.check && (
                <p className="mt-1 text-sm text-muted">
                  Check-in today:{" "}
                  {[
                    readiness(r.check) != null ? `readiness ${readiness(r.check)}%` : null,
                    r.check.sleep_hours != null ? `${r.check.sleep_hours} h sleep` : null,
                    r.check.soreness != null ? `soreness ${r.check.soreness}/5` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "done"}
                </p>
              )}
              {r.check?.note && <p className="mt-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">Check-in note: {r.check.note}</p>}
              {r.flags.length > 0 && <p className="mt-1 text-sm text-accent">{r.flags.join(" · ")}</p>}
              {r.comment && <p className="mt-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">“{r.comment}”</p>}
            </Link>
          </li>
        ))}
      </ul>

      {rows.some((r) => r.weeks.some((c) => c.planned > 0 || c.free > 0)) && (
        <section className="space-y-3">
          <h2 className="pt-2 text-xs font-semibold tracking-[0.2em] text-muted">PLANNED VS DONE · LAST {WEEKS} WEEKS</h2>
          <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
            <table className="w-full min-w-[30rem] text-sm">
              <thead>
                <tr className="text-xs text-muted">
                  <th className="px-4 py-2.5 text-left font-medium">Athlete</th>
                  {mondays.map((m, i) => (
                    <th key={m} className="px-2 py-2.5 text-center font-medium">
                      {i === mondays.length - 1 ? "now" : weekLabel(m).split(" to ")[0]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows
                  .filter((r) => r.weeks.some((c) => c.planned > 0 || c.free > 0))
                  .map((r) => (
                    <tr key={r.a.id}>
                      <td className="max-w-40 truncate px-4 py-2.5">
                        <Link href={`/athletes/${r.a.id}/calendar`} className="hover:underline">
                          {r.a.full_name}
                        </Link>
                      </td>
                      {r.weeks.map((c, i) => {
                        const current = i === r.weeks.length - 1;
                        const ratio = c.planned > 0 ? c.done / c.planned : null;
                        const tone = ratio == null || current ? "text-muted" : ratio >= 1 ? "text-ok" : ratio >= 0.5 ? "text-text" : "text-accent";
                        return (
                          <td key={c.monday} className={`px-2 py-2.5 text-center tabular-nums ${tone}`}>
                            {c.planned > 0 ? `${c.done}/${c.planned}` : c.free > 0 ? "" : "–"}
                            {c.free > 0 && <span className="text-xs text-muted">{c.planned > 0 ? " " : ""}+{c.free}</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">Done of planned sessions per week. +1 is a free workout or a session outside that week&apos;s plan. Green is everything done, red is under half. Weeks before a program started only show what was logged.</p>
        </section>
      )}
    </div>
  );
}
