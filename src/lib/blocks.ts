import { weekRange } from "./plan.ts";

/** Days from one YYYY-MM-DD to another. */
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000);
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);

/** Last day (Sunday) of a block that starts in the week of `start` and runs `weeks` weeks. */
export function blockEnd(start: string, weeks: number): string {
  return addDays(weekRange(start.slice(0, 10)).monday, weeks * 7 - 1);
}

export type BlockProgram = { id: string; athlete_id: string; name: string; status: string; start_date: string | null; created_at: string; weeks: number };
export type BlockAthlete = { id: string; full_name: string };
export type BlockToWrite = { athleteId: string; athlete: string; program: string | null; end: string | null; daysLeft: number | null; kind: "ending" | "ended" | "none" | "draft" };

/**
 * Athletes who need their next block soon: the active block ends within `ahead` days or ended
 * up to `behind` days ago with nothing after it, or there is no active program at all.
 * A later program (draft or active) counts as the next block being ready.
 */
export function blocksToWrite(athletes: BlockAthlete[], programs: BlockProgram[], today: string, ahead = 7, behind = 28): BlockToWrite[] {
  const out: BlockToWrite[] = [];
  for (const a of athletes) {
    const mine = programs.filter((p) => p.athlete_id === a.id && (p.status === "active" || p.status === "draft"));
    const active = mine.filter((p) => p.status === "active");
    if (active.length === 0) {
      out.push({ athleteId: a.id, athlete: a.full_name, program: mine[0]?.name ?? null, end: null, daysLeft: null, kind: mine.length ? "draft" : "none" });
      continue;
    }
    // The active block that ends last; blocks without week numbers repeat, so they never end.
    const dated = active.filter((p) => p.start_date && p.weeks >= 1).map((p) => ({ p, end: blockEnd(p.start_date as string, p.weeks) }));
    if (dated.length < active.length || dated.length === 0) continue;
    const cur = dated.sort((x, y) => y.end.localeCompare(x.end))[0];
    const next = mine.some(
      (p) => p.id !== cur.p.id && ((p.start_date && p.start_date > (cur.p.start_date as string)) || (!p.start_date && p.created_at > cur.p.created_at)),
    );
    if (next) continue;
    const daysLeft = daysBetween(today, cur.end);
    if (daysLeft > ahead || daysLeft < -behind) continue;
    out.push({ athleteId: a.id, athlete: a.full_name, program: cur.p.name, end: cur.end, daysLeft, kind: daysLeft < 0 ? "ended" : "ending" });
  }
  // Most urgent first: no program, ended longest ago, then ending soonest.
  const rank = (b: BlockToWrite) => (b.kind === "none" ? -1000 : b.kind === "draft" ? -999 : (b.daysLeft as number));
  return out.sort((x, y) => rank(x) - rank(y) || x.athlete.localeCompare(y.athlete));
}
