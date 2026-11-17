import { weekRange } from "./plan.ts";

export type Habit = { id: string; name: string; target_per_week: number; position: number };

const DAY = 86400000;
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T12:00:00Z") + n * DAY).toISOString().slice(0, 10);

/** The 7 days (Monday first) of the week that `day` is in. */
export function weekDays(day: string): string[] {
  const monday = weekRange(day).monday;
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/**
 * Share of weeks the habit hit its weekly target, over the last `weeks` full weeks
 * before the current one. Weeks before the habit existed are left out.
 */
export function weeksOnTarget(doneDays: string[], target: number, createdOn: string, today: string, weeks = 4): { hit: number; of: number } {
  const thisMonday = weekRange(today).monday;
  const firstMonday = weekRange(createdOn).monday;
  let hit = 0;
  let of = 0;
  for (let i = 1; i <= weeks; i++) {
    const monday = addDays(thisMonday, -7 * i);
    if (monday < firstMonday) break;
    const sunday = addDays(monday, 6);
    of++;
    if (doneDays.filter((d) => d >= monday && d <= sunday).length >= target) hit++;
  }
  return { hit, of };
}

/** Suggestions the coach can add with one tap. Name and times per week. */
export const HABIT_SUGGESTIONS: [string, number][] = [
  ["Sleep 8 hours", 7],
  ["Hit protein target", 7],
  ["10,000 steps", 7],
  ["Drink 3 L water", 7],
  ["Mobility 10 min", 3],
  ["No alcohol", 7],
];
