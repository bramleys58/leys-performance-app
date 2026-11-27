import Link from "next/link";
import { ActionButton } from "@/components/buttons";
import { Card, Field, Notice, Select } from "@/components/ui";
import { requireCoach } from "@/lib/auth";
import { euro } from "@/lib/business";
import { byMonth, entryItems, packageItems, quarterOf, vatForQuarter, yearSummary, type FinanceEntry, type FinanceSettings } from "@/lib/finance";
import { todayISO } from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";
import { addFinanceEntry, deleteFinanceEntry, saveFinanceSettings, stopFinanceEntry } from "../coach-actions";

export const metadata = { title: "Finances | Leys Performance" };

const STREAMS = ["Online coaching", "Personal training", "Tribes", "Peak", "Basic-Fit", "Partners"];
const COSTS = ["Software", "Insurance", "Phone", "Equipment", "Education", "Marketing", "Travel"];
const monthName = (m: string) => new Date(m + "-15T12:00:00Z").toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
const REPEAT_LABEL: Record<string, string> = { monthly: "every month", quarterly: "every quarter", yearly: "every year" };

export default async function FinancesPage({ searchParams }: PageProps<"/finances">) {
  await requireCoach();
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayISO();
  const year = Number(typeof sp.year === "string" && /^\d{4}$/.test(sp.year) ? sp.year : today.slice(0, 4));
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  const [{ data: entryData }, { data: settingsData }, { data: pkgData }] = await Promise.all([
    supabase.from("finance_entries").select("*").order("date", { ascending: false }),
    supabase.from("finance_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("client_packages").select("price, paid_on, athletes(is_in_person, tracking_only)").not("paid_on", "is", null),
  ]);
  const entries = ((entryData ?? []) as FinanceEntry[]).map((e) => ({ ...e, amount: Number(e.amount), vat_rate: Number(e.vat_rate) }));
  const settings: FinanceSettings = {
    year_target: settingsData?.year_target != null ? Number(settingsData.year_target) : null,
    set_aside_pct: Number(settingsData?.set_aside_pct ?? 40),
    package_prices_incl_vat: settingsData?.package_prices_incl_vat ?? true,
    package_vat_rate: Number(settingsData?.package_vat_rate ?? 21),
  };
  // App packages count as income on their payment day; online or in-person decides the stream.
  const packages = ((pkgData ?? []) as unknown as { price: number | null; paid_on: string | null; athletes: { is_in_person: boolean; tracking_only: boolean } | null }[]).map((p) => ({
    price: p.price,
    paid_on: p.paid_on,
    stream: p.athletes?.is_in_person ? "Personal training" : "Online coaching",
  }));
  const items = [...entryItems(entries, from, to), ...packageItems(packages, settings)].filter((i) => i.day >= from && i.day <= to);

  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const rows = byMonth(items, months);
  const isThisYear = String(year) === today.slice(0, 4);
  // Months still to come only hold the repeating entries: shown lighter, as expected.
  const future = (month: string) => isThisYear && month > today.slice(0, 7);
  const soFar = isThisYear ? rows.filter((r) => r.month <= today.slice(0, 7)) : rows;
  const ys = yearSummary(soFar, settings);
  const thisMonth = isThisYear ? rows.find((r) => r.month === today.slice(0, 7)) : undefined;
  const q = isThisYear ? quarterOf(today) : 4;
  // VAT counts what actually happened, not repeating entries still to come.
  const itemsSoFar = isThisYear ? items.filter((i) => i.day <= today) : items;
  const vatNow = vatForQuarter(itemsSoFar, year, q);
  const vatPrev = q > 1 ? vatForQuarter(itemsSoFar, year, (q - 1) as 1 | 2 | 3) : null;
  const salaryYear = soFar.reduce((s, r) => s + r.salary, 0);

  // Revenue per stream this year, biggest first.
  const streamTotals = new Map<string, number>();
  for (const r of soFar) for (const [k, v] of Object.entries(r.byStream)) streamTotals.set(k, (streamTotals.get(k) ?? 0) + v);
  const salaryStreams = new Set(entries.filter((e) => e.salary).map((e) => e.stream));
  const streams = [...streamTotals.entries()].filter(([k]) => !salaryStreams.has(k)).sort((a, b) => b[1] - a[1]);
  const top = Math.max(...rows.map((r) => Math.max(r.income, r.costs)), 1);

  const repeating = entries.filter((e) => e.repeat !== "none" && (!e.end_date || e.end_date >= today));
  const oneOff = entries.filter((e) => e.repeat === "none" && e.date >= from && e.date <= to);
  const knownStreams = [...new Set([...STREAMS, ...entries.filter((e) => e.kind === "income").map((e) => e.stream)])];
  const knownCosts = [...new Set([...COSTS, ...entries.filter((e) => e.kind === "cost").map((e) => e.stream)])];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Finances</h1>
          <p className="mt-1 text-sm text-muted">Amounts excl. VAT. Client packages are counted on the day they were paid.</p>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-sm">
          <Link href={`/finances?year=${year - 1}`} className="text-muted">
            ← {year - 1}
          </Link>
          <span className="font-semibold">{year}</span>
          {!isThisYear && (
            <Link href={`/finances?year=${year + 1}`} className="text-muted">
              {year + 1} →
            </Link>
          )}
        </div>
      </div>
      {sp.saved && <Notice kind="ok">Saved.</Notice>}
      {typeof sp.error === "string" && <Notice kind="error">{sp.error}</Notice>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: isThisYear ? "Revenue so far" : "Revenue", value: euro(ys.income), sub: thisMonth ? `this month ${euro(thisMonth.income)}` : null },
          { label: "Costs", value: euro(ys.costs), sub: thisMonth ? `this month ${euro(thisMonth.costs)}` : null },
          { label: "Profit", value: euro(ys.profit), sub: thisMonth ? `this month ${euro(thisMonth.profit)}` : null },
          { label: `Set aside (${settings.set_aside_pct}%)`, value: euro(ys.setAside), sub: "for social contributions and tax" },
        ].map((t) => (
          <Card key={t.label}>
            <p className="text-xs text-muted">{t.label}</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{t.value}</p>
            {t.sub && <p className="mt-0.5 text-xs text-muted">{t.sub}</p>}
          </Card>
        ))}
      </div>

      {ys.target && (
        <Card>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-semibold">Target {year}</h2>
            <p className="text-sm tabular-nums text-muted">
              {euro(ys.income)} of {euro(ys.target)} · {ys.targetPct}%
            </p>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${ys.targetPct}% of the revenue target`}>
            <div className="h-full rounded-full bg-accent" style={{ width: `${ys.targetPct}%` }} />
          </div>
          {isThisYear && ys.targetPct != null && ys.targetPct < 100 && (
            <p className="mt-2 text-xs text-muted">
              On pace for {euro(Math.round((ys.income / Number(today.slice(5, 7))) * 12))} this year at the average so far ({euro(Math.round(ys.income / Number(today.slice(5, 7))))} per month).
            </p>
          )}
        </Card>
      )}

      <Card>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-semibold">Per month</h2>
          <p className="flex gap-3 text-xs text-muted">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-accent" /> Revenue
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-text/35" /> Costs
            </span>
          </p>
        </div>
        <div className="mt-4 grid grid-cols-12 items-end gap-1.5" style={{ height: 140 }}>
          {rows.map((r) => (
            <div
              key={r.month}
              className={`flex h-full items-end justify-center gap-0.5 ${future(r.month) ? "opacity-35" : ""}`}
              title={`${monthName(r.month)}${future(r.month) ? " (expected)" : ""}: revenue ${euro(r.income)}, costs ${euro(r.costs)}, profit ${euro(r.profit)}`}
            >
              <div className="w-1/2 rounded-t bg-accent" style={{ height: `${(r.income / top) * 100}%`, minHeight: r.income ? 2 : 0 }} />
              <div className="w-1/2 rounded-t bg-text/35" style={{ height: `${(r.costs / top) * 100}%`, minHeight: r.costs ? 2 : 0 }} />
            </div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-12 gap-1.5 text-center text-[10px] text-muted">
          {rows.map((r) => (
            <span key={r.month}>{monthName(r.month).slice(0, 1)}</span>
          ))}
        </div>
        <table className="mt-4 w-full text-sm tabular-nums">
          <thead className="text-xs text-muted">
            <tr>
              <th className="text-left font-normal">Month</th>
              <th className="text-right font-normal">Revenue</th>
              <th className="text-right font-normal">Costs</th>
              <th className="text-right font-normal">Profit</th>
            </tr>
          </thead>
          <tbody>
            {rows
              .filter((r) => r.income || r.costs)
              .map((r) => (
                <tr key={r.month} className={`border-t border-border ${future(r.month) ? "text-muted" : ""}`}>
                  <td className="py-1.5">
                    {monthName(r.month)}
                    {future(r.month) && <span className="ml-1 text-xs">expected</span>}
                  </td>
                  <td className="text-right">{euro(r.income)}</td>
                  <td className="text-right">{euro(r.costs)}</td>
                  <td className={`text-right ${r.profit < 0 ? "text-accent" : ""}`}>{euro(r.profit)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </Card>

      <div className="grid gap-5 sm:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Revenue per stream</h2>
          {streams.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Nothing yet this year.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border text-sm">
              {streams.map(([k, v]) => (
                <li key={k} className="flex justify-between py-2">
                  <span>{k}</span>
                  <span className="tabular-nums">
                    {euro(Math.round(v * 100) / 100)} <span className="text-muted">· {ys.income ? Math.round((v / ys.income) * 100) : 0}%</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {salaryYear > 0 && <p className="mt-2 text-xs text-muted">Plus {euro(Math.round(salaryYear * 100) / 100)} wage, not counted in revenue or profit.</p>}
        </Card>

        <Card>
          <h2 className="font-semibold">VAT</h2>
          {[vatNow, vatPrev].filter(Boolean).map((v) => (
            <div key={`${v!.year}-${v!.quarter}`} className="mt-2 border-t border-border pt-2 text-sm first:border-0 first:pt-0">
              <p className="font-medium">
                Q{v!.quarter} {v!.year}
                {v === vatNow && isThisYear ? " (so far)" : ""}
              </p>
              <p className="tabular-nums text-muted">
                charged {euro(v!.charged)} · paid on costs {euro(v!.paid)}
              </p>
              <p className="tabular-nums">
                {v!.due >= 0 ? "to pay" : "to get back"} <span className="font-semibold">{euro(Math.abs(v!.due))}</span>
              </p>
            </div>
          ))}
          <p className="mt-2 text-xs text-muted">An estimate from what is entered here; your accountant&apos;s VAT return is what counts.</p>
        </Card>
      </div>

      <Card>
        <h2 className="font-semibold">Add income or a cost</h2>
        <form action={addFinanceEntry} className="mt-3 grid gap-3 sm:grid-cols-2">
          <Select label="Type" name="kind" defaultValue="income">
            <option value="income">Income</option>
            <option value="cost">Cost</option>
          </Select>
          <Field label="Stream or category" name="stream" list="finance-streams" required placeholder="Tribes, Basic-Fit, Software…" />
          <datalist id="finance-streams">
            {[...knownStreams, ...knownCosts].map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <Field label="What (optional)" name="description" placeholder="Vercel Pro, insurance, ..." />
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Field label="Amount (€)" name="amount" inputMode="decimal" required placeholder="121" />
            <Select label="Amount is" name="incl_vat" defaultValue="yes">
              <option value="yes">incl. VAT</option>
              <option value="no">excl. VAT</option>
            </Select>
          </div>
          <Select label="VAT rate" name="vat_rate" defaultValue="21">
            <option value="21">21%</option>
            <option value="12">12%</option>
            <option value="6">6%</option>
            <option value="0">0% (none)</option>
          </Select>
          <Field label="Date (or first time)" name="date" type="date" defaultValue={today} required />
          <Select label="Repeats" name="repeat" defaultValue="none">
            <option value="none">Once</option>
            <option value="monthly">Every month</option>
            <option value="quarterly">Every quarter</option>
            <option value="yearly">Every year</option>
          </Select>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-muted">
            <input type="checkbox" name="salary" /> This is a wage (e.g. Basic-Fit): no VAT, kept out of profit
          </label>
          <div className="sm:col-span-2">
            <ActionButton pendingLabel="Saving…" className="w-full rounded-xl bg-accent px-4 py-3 font-semibold text-accent-text sm:w-auto">
              Add
            </ActionButton>
          </div>
        </form>
      </Card>

      <Card>
        <h2 className="font-semibold">Repeating ({repeating.length})</h2>
        {repeating.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Add your fixed income and costs once (Basic-Fit wage, Tribes, software, insurance) with Repeats every month.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border text-sm">
            {repeating.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {e.stream}
                    {e.description ? <span className="font-normal text-muted"> · {e.description}</span> : null}
                  </span>
                  <span className="block text-xs text-muted">
                    {e.kind === "income" ? "income" : "cost"} · {euro(e.amount)} excl. VAT {REPEAT_LABEL[e.repeat]}
                    {e.salary ? " · wage" : e.vat_rate ? ` · ${e.vat_rate}% VAT` : ""} · since {e.date}
                  </span>
                </span>
                <form action={stopFinanceEntry.bind(null, e.id)}>
                  <ActionButton pendingLabel="…" className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted">
                    Stop
                  </ActionButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold">One-off in {year} ({oneOff.length})</h2>
        {oneOff.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nothing yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border text-sm">
            {oneOff.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {e.stream}
                    {e.description ? <span className="font-normal text-muted"> · {e.description}</span> : null}
                  </span>
                  <span className="block text-xs text-muted">
                    {e.date} · {e.kind === "income" ? "income" : "cost"} · {euro(e.amount)} excl. VAT{e.vat_rate ? ` · ${e.vat_rate}% VAT` : ""}
                  </span>
                </span>
                <form action={deleteFinanceEntry.bind(null, e.id)}>
                  <ActionButton pendingLabel="…" className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted">
                    Remove
                  </ActionButton>
                </form>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted">Client packages are not listed here: they come from the packages on each athlete (Business).</p>
      </Card>

      <Card>
        <h2 className="font-semibold">Settings</h2>
        <form action={saveFinanceSettings} className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label={`Revenue target ${year} (€, excl. VAT)`} name="year_target" inputMode="decimal" defaultValue={settings.year_target ?? ""} placeholder="e.g. 60000" />
          <Field label="Set aside (% of profit)" name="set_aside_pct" inputMode="decimal" defaultValue={settings.set_aside_pct} />
          <Select label="Package prices in the app are" name="package_prices_incl_vat" defaultValue={settings.package_prices_incl_vat ? "yes" : "no"}>
            <option value="yes">incl. VAT</option>
            <option value="no">excl. VAT</option>
          </Select>
          <Select label="VAT on packages" name="package_vat_rate" defaultValue={String(settings.package_vat_rate)}>
            <option value="21">21%</option>
            <option value="12">12%</option>
            <option value="6">6%</option>
            <option value="0">0%</option>
          </Select>
          <p className="text-xs text-muted sm:col-span-2">
            Set aside is a rule of thumb for social contributions and income tax, not a calculation; ask your accountant which percentage fits you.
          </p>
          <div className="sm:col-span-2">
            <ActionButton pendingLabel="Saving…" className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium">
              Save settings
            </ActionButton>
          </div>
        </form>
      </Card>
    </div>
  );
}
