import Link from "next/link";
import { Card } from "@/components/ui";
import { requireCoach } from "@/lib/auth";
import { WEEKDAYS, isoWeekday, todayISO, weekRange } from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Follow-up | Leys Performance" };

export default async function FollowUpPage() {
  await requireCoach();
  const supabase = await createClient();
  const day = todayISO();
  const weekday = isoWeekday();
  const { monday, sunday } = weekRange(day);
  const twoWeeksAgo = new Date(new Date(day + "T12:00:00Z").getTime() - 14 * 86400000).toISOString().slice(0, 10);

  const [{ data: athletes }, { data: sessions }, { data: logs }] = await Promise.all([
    supabase.from("athletes").select("id, full_name, sport").eq("status", "active").order("full_name"),
    supabase.from("sessions").select("id, name, weekday, kind, is_optional, programs!inner(athlete_id, status)").eq("programs.status", "active"),
    supabase.from("workout_logs").select("id, athlete_id, session_id, session_name, performed_on, finished_at, session_rpe, comment, set_logs(count)").gte("performed_on", twoWeeksAgo).order("performed_on", { ascending: false }),
  ]);

  type S = { id: string; name: string; weekday: number | null; kind: string; is_optional: boolean; programs: { athlete_id: string } };
  type L = { id: string; athlete_id: string; session_id: string | null; session_name: string | null; performed_on: string; finished_at: string | null; session_rpe: number | null; comment: string | null; set_logs: { count: number }[] };
  const allSessions = (sessions ?? []) as unknown as S[];
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
    if (planned.length > 0 && mine.length === 0) flags.push("nothing logged in 14 days");
    const comment = thisWeek.find((l) => l.comment)?.comment ?? null;
    return { a, planned: planned.length, done, missed, last, flags, comment };
  });

  const active = rows.filter((r) => r.planned > 0);
  const trained = active.filter((r) => r.done > 0).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Follow-up</h1>
        <p className="mt-1 text-sm text-muted">
          This week, {monday} to {sunday}. {trained} of {active.length} athletes with a program have trained.
        </p>
      </div>

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
                {r.last ? `Last: ${r.last.session_name ?? "workout"} on ${r.last.performed_on}${r.last.session_rpe ? `, RPE ${r.last.session_rpe}` : ""}` : "No workouts in the last 14 days"}
              </p>
              {r.missed.length > 0 && (
                <p className="mt-1 text-sm text-muted">
                  Not done yet: {r.missed.map((s) => `${s.name} (${WEEKDAYS[(s.weekday ?? 1) - 1].slice(0, 3)})`).join(", ")}
                </p>
              )}
              {r.flags.length > 0 && <p className="mt-1 text-sm text-accent">{r.flags.join(" · ")}</p>}
              {r.comment && <p className="mt-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">“{r.comment}”</p>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
