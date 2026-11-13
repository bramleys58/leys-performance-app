import { BackLink, Card, Field, Notice, SecondaryButton, Select } from "@/components/ui";
import { requireCoach } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { groupByCategory, isNeutral, type Test } from "@/lib/testing";
import { createTest } from "../../coach-actions";

export const metadata = { title: "Tests | Leys Performance" };

export default async function TestsPage({ searchParams }: PageProps<"/testing/tests">) {
  await requireCoach();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: tests } = await supabase.from("tests").select("*").order("position");
  const categories = [...new Set((tests ?? []).map((t) => t.category).filter(Boolean))] as string[];

  return (
    <div className="space-y-5">
      <BackLink href="/testing">Testing</BackLink>
      <h1 className="text-2xl font-bold">Tests</h1>
      {sp.saved && <Notice kind="ok">Test added.</Notice>}
      {typeof sp.error === "string" && <Notice kind="error">{sp.error}</Notice>}

      {groupByCategory((tests ?? []) as Test[]).map(([cat, list]) => (
        <div key={cat}>
          <h2 className="mb-2 text-xs font-semibold tracking-[0.2em] text-muted">{cat.toUpperCase()}</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {list.map((t) => (
              <li key={t.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="font-medium">{t.name}</span>
                <span className="text-muted">
                  {t.unit} · {isNeutral(t) ? "no direction" : t.higher_is_better ? "higher is better" : "lower is better"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <Card>
        <h2 className="font-semibold">Add a test</h2>
        <form action={createTest} className="mt-4 space-y-4">
          <Field label="Name" name="name" placeholder="e.g. 5-0-5 agility" required />
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm text-muted">Category</span>
              <input name="category" list="test-categories" className="w-full rounded-xl border border-border bg-surface-2 px-3 py-3 text-base outline-none focus:border-accent" />
              <datalist id="test-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <Field label="Unit" name="unit" placeholder="s, cm, m, kg" required />
            <Select label="Better is" name="direction" defaultValue="higher">
              <option value="higher">Higher</option>
              <option value="lower">Lower (times)</option>
            </Select>
            <Select label="Decimals" name="decimals" defaultValue="2">
              <option value="0">0</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
            </Select>
          </div>
          <SecondaryButton type="submit" pendingLabel="Adding…">
            Add test
          </SecondaryButton>
        </form>
      </Card>
    </div>
  );
}
