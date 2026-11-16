export type ClientPackage = {
  id: string;
  athlete_id: string;
  name: string;
  kind: "sessions" | "subscription";
  sessions_total: number | null;
  sessions_used_before: number;
  price: number | null;
  start_date: string;
  end_date: string | null;
  paid_on: string | null;
  notes: string | null;
  ended: boolean;
};

export type PackageState = {
  used: number | null;
  left: number | null;
  daysLeft: number | null;
  /** Short reasons this package needs attention, most urgent first. */
  alerts: string[];
  /** Still running: not ended, not past its end date, sessions not all used. */
  running: boolean;
};

const DAY = 86400000;
const days = (from: string, to: string) => Math.round((Date.parse(to + "T12:00:00Z") - Date.parse(from + "T12:00:00Z")) / DAY);

/**
 * Where a package stands today. For a pack, a session counts as used when a
 * workout of that client was finished on or after the start date (and not after
 * the end date). In-person clients' sessions are logged by the coach, so this is exact.
 */
export function packageState(p: ClientPackage, workoutDates: string[], today: string): PackageState {
  const alerts: string[] = [];
  let used: number | null = null;
  let left: number | null = null;
  if (p.kind === "sessions" && p.sessions_total) {
    used = p.sessions_used_before + workoutDates.filter((d) => d >= p.start_date && (!p.end_date || d <= p.end_date)).length;
    left = Math.max(p.sessions_total - used, 0);
  }
  const daysLeft = p.end_date ? days(today, p.end_date) : null;
  const expired = daysLeft != null && daysLeft < 0;
  const usedUp = left === 0;
  const running = !p.ended && !expired && !usedUp;

  if (!p.ended) {
    if (!p.paid_on && (p.price ?? 0) > 0) alerts.push("not paid");
    if (usedUp) alerts.push("all sessions used");
    else if (left != null && left <= 2) alerts.push(`${left} session${left === 1 ? "" : "s"} left`);
    if (expired) alerts.push(p.kind === "subscription" ? `renewal was due ${-daysLeft} day${daysLeft === -1 ? "" : "s"} ago` : "expired");
    else if (daysLeft != null && daysLeft <= 14) alerts.push(daysLeft === 0 ? "ends today" : `ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`);
  }
  return { used, left, daysLeft, alerts, running };
}

/** Paid income per month (by payment date), last n months oldest first, ending with the month of `today`. */
export function incomeByMonth(packages: ClientPackage[], today: string, n = 12): { month: string; total: number }[] {
  const [y, m] = today.split("-").map(Number);
  const months = Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
  return months.map((month) => ({
    month,
    total: Math.round(packages.filter((p) => p.paid_on?.startsWith(month)).reduce((s, p) => s + Number(p.price ?? 0), 0) * 100) / 100,
  }));
}

export const euro = (n: number) => "€" + n.toLocaleString("nl-BE", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
