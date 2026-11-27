import Link from "next/link";
import { PackageSummary } from "@/components/package-card";
import { Card } from "@/components/ui";
import { requireCoach } from "@/lib/auth";
import { type ClientPackage, euro, incomeByMonth, packageState } from "@/lib/business";
import { todayISO } from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Business | Leys Performance" };

const monthName = (m: string) => new Date(m + "-15T12:00:00Z").toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });

export default async function BusinessPage() {
  await requireCoach();
  const supabase = await createClient();
  const today = todayISO();

  const [{ data: pkgData }, { data: athleteData }] = await Promise.all([
    supabase.from("client_packages").select("*").order("start_date", { ascending: false }),
    supabase.from("athletes").select("id, full_name, status, is_in_person, tracking_only, billing").neq("status", "archived").order("full_name"),
  ]);
  const packages = (pkgData ?? []) as ClientPackage[];
  const ids = [...new Set(packages.map((p) => p.athlete_id))];
  const { data: logData } = ids.length
    ? await supabase.from("workout_logs").select("athlete_id, performed_on").in("athlete_id", ids).not("finished_at", "is", null)
    : { data: [] };
  const datesBy = new Map<string, string[]>();
  for (const l of (logData ?? []) as { athlete_id: string; performed_on: string }[]) datesBy.set(l.athlete_id, [...(datesBy.get(l.athlete_id) ?? []), l.performed_on]);

  const athletes = (athleteData ?? []) as { id: string; full_name: string; status: string; is_in_person: boolean; tracking_only: boolean; billing: string }[];
  const nameOf = new Map(athletes.map((a) => [a.id, a.full_name]));
  const rows = packages.map((p) => ({ p, s: packageState(p, datesBy.get(p.athlete_id) ?? [], today) }));
  const attention = rows.filter(({ s }) => s.alerts.length > 0);
  const running = rows.filter(({ s }) => s.running);
  const withPackage = new Set(rows.filter(({ p, s }) => !p.ended && s.running).map(({ p }) => p.athlete_id));
  const without = athletes.filter((a) => a.status === "active" && !a.tracking_only && a.billing === "package" && !withPackage.has(a.id));

  const income = incomeByMonth(packages, today, 12);
  const thisMonth = income[income.length - 1].total;
  const lastMonth = income[income.length - 2].total;
  const year = today.slice(0, 4);
  const thisYear = packages.filter((p) => p.paid_on?.startsWith(year)).reduce((s, p) => s + Number(p.price ?? 0), 0);
  const open = rows.filter(({ p }) => !p.ended && !p.paid_on && (p.price ?? 0) > 0).reduce((s, { p }) => s + Number(p.price ?? 0), 0);
  const top = Math.max(...income.map((i) => i.total), 1);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Business</h1>
        <p className="mt-1 text-sm text-muted">Packages, renewals and income. Add packages from each client&apos;s page (Client and payments).</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["This month", euro(thisMonth)],
          ["Last month", euro(lastMonth)],
          [`Paid in ${year}`, euro(Math.round(thisYear * 100) / 100)],
          ["Still to be paid", euro(Math.round(open * 100) / 100)],
        ].map(([label, value]) => (
          <Card key={label}>
            <p className="text-2xl font-bold tabular-nums">{value}</p>
            <p className="text-sm text-muted">{label}</p>
          </Card>
        ))}
      </div>

      {attention.length > 0 && (
        <Card>
          <h2 className="font-semibold">Needs attention</h2>
          <ul className="divide-y divide-border">
            {attention.map(({ p, s }) => (
              <li key={p.id} className="py-3">
                <PackageSummary p={p} s={s} name={nameOf.get(p.athlete_id) ?? "Client"} href={`/athletes/${p.athlete_id}/client`} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="font-semibold">Income per month</h2>
        <p className="text-xs text-muted">By payment date, last 12 months.</p>
        <div className="mt-4 flex h-36 items-end gap-1.5" role="img" aria-label={`Income per month: ${income.map((i) => `${monthName(i.month)} ${euro(i.total)}`).join(", ")}`}>
          {income.map((i) => (
            <div key={i.month} className="group flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${monthName(i.month)}: ${euro(i.total)}`}>
              <span className="text-[10px] tabular-nums text-muted opacity-0 group-hover:opacity-100">{euro(i.total)}</span>
              <div className="w-full rounded-t bg-accent" style={{ height: `${Math.max((i.total / top) * 100, i.total > 0 ? 3 : 0)}%` }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-1.5">
          {income.map((i) => (
            <span key={i.month} className="flex-1 text-center text-[10px] text-muted">
              {monthName(i.month)}
            </span>
          ))}
        </div>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted">Show as table</summary>
          <table className="mt-2 w-full text-sm">
            <tbody className="divide-y divide-border">
              {[...income].reverse().map((i) => (
                <tr key={i.month}>
                  <td className="py-1.5">{i.month}</td>
                  <td className="py-1.5 text-right tabular-nums">{euro(i.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </Card>

      <Card>
        <h2 className="font-semibold">Running packages ({running.length})</h2>
        {running.length === 0 && <p className="mt-2 text-sm text-muted">None yet.</p>}
        <ul className="divide-y divide-border">
          {running.map(({ p, s }) => (
            <li key={p.id} className="py-3">
              <PackageSummary p={p} s={s} name={nameOf.get(p.athlete_id) ?? "Client"} href={`/athletes/${p.athlete_id}/client`} />
            </li>
          ))}
        </ul>
      </Card>

      {without.length > 0 && (
        <Card>
          <h2 className="font-semibold">Active clients without a running package</h2>
          <p className="text-xs text-muted">Tracking only athletes are left out.</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {without.map((a) => (
              <li key={a.id}>
                <Link href={`/athletes/${a.id}/client`} className="block rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2">
                  {a.full_name}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
