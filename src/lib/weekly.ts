import { isoWeekday, todayISO, weekRange } from "./plan.ts";

export type WeeklyCheckIn = {
  id: string;
  athlete_id: string;
  week_start: string;
  training: number | null;
  nutrition: number | null;
  recovery: number | null;
  stress: number | null;
  win: string | null;
  struggle: string | null;
  pain: string | null;
  message: string | null;
  created_at: string;
};

export const WEEKLY_SCALES = [
  { name: "training", label: "How was your training week?", low: "Poor", high: "Great" },
  { name: "nutrition", label: "Nutrition on track?", low: "Not at all", high: "Fully" },
  { name: "recovery", label: "Sleep and recovery", low: "Bad", high: "Great" },
  { name: "stress", label: "Stress and life load", low: "Relaxed", high: "Very high" },
] as const;

export const WEEKLY_TEXTS = [
  { name: "win", label: "Biggest win this week" },
  { name: "struggle", label: "What was hard, or did not go to plan?" },
  { name: "pain", label: "Any pain or injury to report?" },
  { name: "message", label: "Anything you need from your coach?" },
] as const;

function addDays(day: string, n: number): string {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Which week a weekly check-in is about, and whether to ask for it now.
 * From Wednesday to Sunday it is about the current week. On Monday and
 * Tuesday it is still about the week that just ended (catching up).
 * The reminder shows on Sunday, and on Monday and Tuesday if it was missed.
 */
export function weeklyTarget(day = todayISO(), weekday = isoWeekday()) {
  const { monday } = weekRange(day);
  const catchUp = weekday <= 2;
  const weekStart = catchUp ? addDays(monday, -7) : monday;
  return { weekStart, weekEnd: addDays(weekStart, 6), due: weekday === 7 || catchUp, isSunday: weekday === 7 };
}

export function weekLabel(weekStart: string): string {
  const f = (d: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(d + "T12:00:00Z"));
  return `${f(weekStart)} to ${f(addDays(weekStart, 6))}`;
}
