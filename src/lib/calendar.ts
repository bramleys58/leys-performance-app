import { todayISO, weekFilter } from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";

export type CalItem =
  | { kind: "done"; id: string; name: string; minutes: number | null; href: string }
  | { kind: "started"; id: string; name: string; href: string }
  | { kind: "planned" | "missed"; id: string; name: string; optional: boolean; slot: boolean; href: string }
  | { kind: "test"; id: string; name: string };

export type CalDay = { date: string; inMonth: boolean; isToday: boolean; items: CalItem[]; checkedIn: boolean };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const at = (day: string) => new Date(day + "T12:00:00Z");
const mondayOf = (day: string) => {
  const d = at(day);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return iso(d);
};

/** "2026-11" for the month that contains the given day (today by default). */
export function monthOf(day = todayISO()): string {
  return day.slice(0, 7);
}

export function shiftMonth(month: string, by: number): string {
  const d = new Date(month + "-15T12:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + by);
  return iso(d).slice(0, 7);
}

/**
 * One month for one athlete, as full weeks from Monday to Sunday:
 * finished and started workouts, planned sessions (repeating weekdays and
 * fixed dates from active programs), missed sessions, test days and check-ins.
 */
export async function getCalendar(athleteId: string, month: string, forCoach: boolean) {
  const valid = /^\d{4}-\d{2}$/.test(month) ? month : monthOf();
  const first = valid + "-01";
  const start = mondayOf(first);
  const lastDay = at(first);
  lastDay.setUTCMonth(lastDay.getUTCMonth() + 1);
  lastDay.setUTCDate(0);
  const endMonday = at(mondayOf(iso(lastDay)));
  endMonday.setUTCDate(endMonday.getUTCDate() + 6);
  const end = iso(endMonday);
  const today = todayISO();

  const supabase = await createClient();
  const [{ data: sessions }, { data: logs }, { data: checks }, { data: results }] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, name, kind, weekday, scheduled_date, is_optional, position, week, program_id, programs!inner(status, athlete_id, start_date, created_at)")
      .eq("programs.status", "active")
      .eq("programs.athlete_id", athleteId),
    supabase
      .from("workout_logs")
      .select("id, session_id, session_name, performed_on, finished_at, duration_minutes")
      .eq("athlete_id", athleteId)
      .gte("performed_on", start)
      .lte("performed_on", end),
    supabase.from("check_ins").select("day").eq("athlete_id", athleteId).gte("day", start).lte("day", end),
    supabase.from("test_results").select("test_event_id, test_events!inner(id, name, held_on)").eq("athlete_id", athleteId).gte("test_events.held_on", start).lte("test_events.held_on", end),
  ]);

  type S = { id: string; name: string; kind: string; weekday: number | null; scheduled_date: string | null; is_optional: boolean; position: number; week: number | null; program_id: string; programs: { start_date: string | null; created_at: string } };
  type L = { id: string; session_id: string | null; session_name: string | null; performed_on: string; finished_at: string | null; duration_minutes: number | null };
  const allSessions = (sessions ?? []) as unknown as S[];
  const allLogs = (logs ?? []) as L[];
  const runsInWeek = weekFilter(allSessions, (s) => s.programs.start_date ?? s.programs.created_at.slice(0, 10));
  const checked = new Set(((checks ?? []) as { day: string }[]).map((c) => c.day));
  const tests = new Map<string, { id: string; name: string; held_on: string }>();
  for (const r of (results ?? []) as unknown as { test_events: { id: string; name: string; held_on: string } }[]) tests.set(r.test_events.id, r.test_events);

  // A session counts as done for a week when a workout of it was logged anywhere in that week.
  const doneInWeek = new Set(allLogs.filter((l) => l.session_id).map((l) => `${l.session_id}:${mondayOf(l.performed_on)}`));

  const days: CalDay[] = [];
  for (let d = at(start); iso(d) <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = iso(d);
    const weekday = ((d.getUTCDay() + 6) % 7) + 1;
    const items: CalItem[] = [];

    for (const l of allLogs.filter((x) => x.performed_on === date)) {
      const name = l.session_name ?? "Workout";
      items.push(l.finished_at ? { kind: "done", id: l.id, name, minutes: l.duration_minutes, href: `/workout/${l.id}` } : { kind: "started", id: l.id, name, href: `/workout/${l.id}` });
    }

    for (const s of [...allSessions].sort((a, b) => a.position - b.position)) {
      const onThisDay = s.scheduled_date ? s.scheduled_date === date : s.weekday === weekday;
      if (!onThisDay || !runsInWeek(s, date)) continue;
      // A repeating session only counts from the day its program starts.
      const from = s.programs.start_date ?? s.programs.created_at.slice(0, 10);
      if (!s.scheduled_date && date < from) continue;
      if (doneInWeek.has(`${s.id}:${mondayOf(date)}`)) continue;
      const slot = s.kind === "slot";
      const past = date < today;
      if (past && (s.is_optional || slot)) continue;
      items.push({
        kind: past ? "missed" : "planned",
        id: s.id,
        name: s.name,
        optional: s.is_optional,
        slot,
        href: forCoach ? `/session/${s.id}?athlete=${athleteId}` : `/session/${s.id}`,
      });
    }

    for (const t of tests.values()) if (t.held_on === date) items.push({ kind: "test", id: t.id, name: t.name });

    days.push({ date, inMonth: date.slice(0, 7) === valid, isToday: date === today, items, checkedIn: checked.has(date) });
  }

  const inMonth = days.filter((d) => d.inMonth);
  const count = (k: CalItem["kind"]) => inMonth.reduce((n, d) => n + d.items.filter((i) => i.kind === k).length, 0);
  const minutes = inMonth.reduce((n, d) => n + d.items.reduce((m, i) => m + (i.kind === "done" ? (i.minutes ?? 0) : 0), 0), 0);
  return { month: valid, days, totals: { done: count("done"), missed: count("missed"), planned: count("planned"), minutes } };
}
