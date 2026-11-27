/** Finances: what came in per stream, what went out, VAT per quarter and what to set aside. */

export type Repeat = "none" | "monthly" | "quarterly" | "yearly";
export type FinanceEntry = {
  id: string;
  kind: "income" | "cost";
  stream: string;
  description: string | null;
  amount: number; // excl. VAT
  vat_rate: number;
  date: string;
  repeat: Repeat;
  end_date: string | null;
  salary: boolean;
};
export type FinanceSettings = { year_target: number | null; set_aside_pct: number; package_prices_incl_vat: boolean; package_vat_rate: number };
/** One amount on one day. Packages from the app turn into these too. */
export type Item = { kind: "income" | "cost"; stream: string; day: string; net: number; vat: number; salary: boolean };

const r2 = (n: number) => Math.round(n * 100) / 100;
const addMonths = (d: string, n: number) => {
  const [y, m, day] = d.split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + n, Math.min(day, last))).toISOString().slice(0, 10);
};

/** Every day an entry counts between from and to (inclusive): once, or each month / quarter / year. */
export function occurrences(e: Pick<FinanceEntry, "date" | "repeat" | "end_date">, from: string, to: string): string[] {
  const step = e.repeat === "monthly" ? 1 : e.repeat === "quarterly" ? 3 : e.repeat === "yearly" ? 12 : 0;
  if (!step) return e.date >= from && e.date <= to ? [e.date] : [];
  const out: string[] = [];
  for (let i = 0; i < 600; i++) {
    const d = addMonths(e.date, i * step);
    if (d > to || (e.end_date && d > e.end_date)) break;
    if (d >= from) out.push(d);
  }
  return out;
}

/** Entries as items between two days. */
export function entryItems(entries: FinanceEntry[], from: string, to: string): Item[] {
  return entries.flatMap((e) =>
    occurrences(e, from, to).map((day) => ({
      kind: e.kind,
      stream: e.stream,
      day,
      net: Number(e.amount),
      vat: e.salary ? 0 : r2((Number(e.amount) * Number(e.vat_rate)) / 100),
      salary: e.salary,
    })),
  );
}

/** Paid packages as income on their payment day; the price may include VAT. */
export function packageItems(packages: { price: number | null; paid_on: string | null; stream: string }[], s: FinanceSettings): Item[] {
  return packages
    .filter((p) => p.paid_on && Number(p.price ?? 0) > 0)
    .map((p) => {
      const price = Number(p.price);
      const rate = Number(s.package_vat_rate);
      const net = s.package_prices_incl_vat ? r2(price / (1 + rate / 100)) : price;
      const vat = s.package_prices_incl_vat ? r2(price - net) : r2((price * rate) / 100);
      return { kind: "income" as const, stream: p.stream, day: p.paid_on as string, net, vat, salary: false };
    });
}

export type MonthRow = { month: string; income: number; salary: number; costs: number; profit: number; byStream: Record<string, number> };

/** Month by month: business income, wage, costs and profit (business income minus costs). Excl. VAT. */
export function byMonth(items: Item[], months: string[]): MonthRow[] {
  return months.map((month) => {
    const mine = items.filter((i) => i.day.startsWith(month));
    const income = r2(mine.filter((i) => i.kind === "income" && !i.salary).reduce((s, i) => s + i.net, 0));
    const salary = r2(mine.filter((i) => i.kind === "income" && i.salary).reduce((s, i) => s + i.net, 0));
    const costs = r2(mine.filter((i) => i.kind === "cost").reduce((s, i) => s + i.net, 0));
    const byStream: Record<string, number> = {};
    for (const i of mine) if (i.kind === "income") byStream[i.stream] = r2((byStream[i.stream] ?? 0) + i.net);
    return { month, income, salary, costs, profit: r2(income - costs), byStream };
  });
}

/** VAT for one quarter: charged on income minus paid on costs. Positive = to pay. */
export function vatForQuarter(items: Item[], year: number, quarter: 1 | 2 | 3 | 4) {
  const from = `${year}-${String((quarter - 1) * 3 + 1).padStart(2, "0")}-01`;
  const to = addMonths(from, 3).replace(/-\d\d$/, "-01");
  const mine = items.filter((i) => i.day >= from && i.day < to);
  const charged = r2(mine.filter((i) => i.kind === "income").reduce((s, i) => s + i.vat, 0));
  const paid = r2(mine.filter((i) => i.kind === "cost").reduce((s, i) => s + i.vat, 0));
  return { year, quarter, charged, paid, due: r2(charged - paid) };
}

/** The year so far: revenue, costs, profit, what to set aside and how far along the target is. */
export function yearSummary(rows: MonthRow[], s: FinanceSettings) {
  const income = r2(rows.reduce((a, r) => a + r.income, 0));
  const costs = r2(rows.reduce((a, r) => a + r.costs, 0));
  const profit = r2(income - costs);
  const setAside = r2((Math.max(profit, 0) * Number(s.set_aside_pct)) / 100);
  const target = s.year_target ? Number(s.year_target) : null;
  return { income, costs, profit, setAside, target, targetPct: target ? Math.min(100, Math.round((income / target) * 100)) : null };
}

export const quarterOf = (day: string) => (Math.floor((Number(day.slice(5, 7)) - 1) / 3) + 1) as 1 | 2 | 3 | 4;
