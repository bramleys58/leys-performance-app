import { programWeek, weekRange } from "./plan.ts";

export type PlanSession = {
  id: string;
  kind: string;
  is_optional: boolean;
  week: number | null;
  program_id: string;
  programs: { athlete_id: string; start_date: string | null; created_at: string };
};
export type DoneLog = { athlete_id: string; session_id: string | null; performed_on: string };
export type WeekCell = { monday: string; planned: number; done: number; free: number };

/** Mondays of the last n weeks, oldest first, ending with the week of `day`. */
export function lastMondays(day: string, n: number): string[] {
  const end = Date.parse(weekRange(day).monday + "T12:00:00Z");
  return Array.from({ length: n }, (_, i) => new Date(end - (n - 1 - i) * 7 * 86400000).toISOString().slice(0, 10));
}

/** Answers that mean "no pain", in English and Dutch. */
export function isRealPain(text: string | null | undefined): boolean {
  const t = (text ?? "").trim();
  return t.length > 0 && !/^(no|none|nope|nah|nothing|nee|neen|geen|niets|niks|n\/?a|-+|\/|0|all good|alles goed)[.!]*$/i.test(t);
}

/**
 * Planned versus done per week for one athlete. Planned counts the sessions of
 * the programs that are active now, from the week each program started.
 * Earlier weeks have no plan to compare with, so they only show what was logged.
 */
export function complianceFor(athleteId: string, sessions: PlanSession[], logs: DoneLog[], mondays: string[]): WeekCell[] {
  const mine = sessions.filter((s) => s.programs.athlete_id === athleteId && s.kind !== "slot" && !s.is_optional);
  const weeksOf = new Map<string, number>();
  for (const s of sessions) if (s.week) weeksOf.set(s.program_id, Math.max(weeksOf.get(s.program_id) ?? 0, s.week));

  return mondays.map((monday) => {
    const sunday = weekRange(monday).sunday;
    const planned = mine.filter((s) => {
      const start = s.programs.start_date ?? s.programs.created_at.slice(0, 10);
      if (weekRange(start).monday > monday) return false; // program had not started yet
      return !s.week || s.week === programWeek(start, monday, weeksOf.get(s.program_id) ?? 1);
    });
    const inWeek = logs.filter((l) => l.athlete_id === athleteId && l.performed_on >= monday && l.performed_on <= sunday);
    const doneIds = new Set(inWeek.map((l) => l.session_id));
    const plannedIds = new Set(planned.map((s) => s.id));
    return {
      monday,
      planned: planned.length,
      done: planned.filter((s) => doneIds.has(s.id)).length,
      // Everything else that was trained: free workouts and sessions outside this week's plan.
      free: inWeek.filter((l) => !l.session_id || !plannedIds.has(l.session_id)).length,
    };
  });
}

/** True when the last two finished weeks were both under half of the plan. */
export function fallingBehind(cells: WeekCell[]): boolean {
  const finished = cells.slice(0, -1).slice(-2);
  return finished.length === 2 && finished.every((c) => c.planned > 0 && c.done / c.planned < 0.5);
}
