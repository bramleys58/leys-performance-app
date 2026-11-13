export type Test = {
  id: string;
  name: string;
  category: string | null;
  unit: string;
  higher_is_better: boolean;
  decimals: number;
  position: number;
};

/** Body measurements (like bodyweight) have no better or worse direction. */
export const isNeutral = (t: Pick<Test, "category">) => (t.category ?? "").toLowerCase() === "body";

export function best(values: number[], higherIsBetter: boolean): number | null {
  if (values.length === 0) return null;
  return higherIsBetter ? Math.max(...values) : Math.min(...values);
}

export function fmt(value: number | null | undefined, decimals = 2): string {
  if (value == null) return "–";
  return new Intl.NumberFormat("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

/** "+2.1 cm, better" style text for a change, so the meaning never depends on colour alone. */
export function change(now: number, before: number, t: Test): { text: string; tone: "better" | "worse" | "same" | "neutral" } {
  const diff = now - before;
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "±";
  const text = `${sign}${fmt(Math.abs(diff), t.decimals)} ${t.unit}`;
  if (isNeutral(t)) return { text, tone: "neutral" };
  if (Math.abs(diff) < Math.pow(10, -t.decimals) / 2) return { text, tone: "same" };
  const better = t.higher_is_better ? diff > 0 : diff < 0;
  return { text, tone: better ? "better" : "worse" };
}

export function groupByCategory<T extends { category: string | null; position: number; name: string }>(tests: T[]): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const t of [...tests].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))) {
    const k = t.category ?? "Other";
    map.set(k, [...(map.get(k) ?? []), t]);
  }
  return [...map.entries()];
}
