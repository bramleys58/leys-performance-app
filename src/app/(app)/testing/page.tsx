import Link from "next/link";
import { Card, Field, Notice, PrimaryButton } from "@/components/ui";
import { requireCoach } from "@/lib/auth";
import { todayISO } from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";
import { groupByCategory, type Test } from "@/lib/testing";
import { createTestEvent } from "../coach-actions";

export const metadata = { title: "Testing | Leys Performance" };

export default async function TestingPage({ searchParams }: PageProps<"/testing">) {
  await requireCoach();
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: events }, { data: tests }, { data: athletes }] = await Promise.all([
    supabase.from("test_events").select("id, name, held_on, test_ids, athlete_ids, test_results(count)").order("held_on", { ascending: false }).limit(50),
    supabase.from("tests").select("*").order("position"),
    supabase.from("athletes").select("id, full_name, sport").eq("status", "active").order("full_name"),
  ]);

  const fmtDate = (d: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(d + "T12:00:00Z"));

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <h1 className="text-2xl font-bold">Testing</h1>
        <Link href="/testing/tests" className="text-sm text-muted hover:text-text">
          Manage tests
        </Link>
      </div>
      {typeof sp.error === "string" && <Notice kind="error">{sp.error}</Notice>}

      {(events ?? []).length === 0 ? (
        <Card>
          <p className="text-sm text-muted">No test days yet. Set up the first one below.</p>
        </Card>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {(events ?? []).map((e) => {
            const results = (e.test_results as unknown as { count: number }[])?.[0]?.count ?? 0;
            return (
              <li key={e.id}>
                <Link href={`/testing/${e.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-surface-2">
                  <span>
                    <span className="block font-medium">{e.name}</span>
                    <span className="block text-sm text-muted">
                      {fmtDate(e.held_on)} · {e.test_ids.length} tests · {e.athlete_ids.length} athletes
                    </span>
                  </span>
                  <span className="text-sm text-muted tabular-nums">{results} results</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Card>
        <h2 className="font-semibold">New test day</h2>
        <form action={createTestEvent} className="mt-4 space-y-4">
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <Field label="Name" name="name" placeholder="e.g. Pre-season combine" required />
            <Field label="Date" name="held_on" type="date" defaultValue={todayISO()} />
          </div>
          <fieldset>
            <legend className="mb-2 text-sm text-muted">Tests</legend>
            <div className="space-y-3">
              {groupByCategory((tests ?? []) as Test[]).map(([cat, list]) => (
                <div key={cat}>
                  <p className="mb-1 text-xs font-semibold tracking-[0.15em] text-muted">{cat.toUpperCase()}</p>
                  <div className="flex flex-wrap gap-2">
                    {list.map((t) => (
                      <label key={t.id} className="cursor-pointer">
                        <input type="checkbox" name="test_ids" value={t.id} className="peer sr-only" />
                        <span className="block rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm peer-checked:border-accent peer-checked:bg-accent/15 peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
                          {t.name}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm text-muted">Athletes</legend>
            {(athletes ?? []).length === 0 ? (
              <p className="text-sm text-muted">Add athletes first.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(athletes ?? []).map((a) => (
                  <label key={a.id} className="cursor-pointer">
                    <input type="checkbox" name="athlete_ids" value={a.id} className="peer sr-only" />
                    <span className="block rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm peer-checked:border-accent peer-checked:bg-accent/15 peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
                      {a.full_name}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <PrimaryButton type="submit" pendingLabel="Creating…">
            Create test day
          </PrimaryButton>
        </form>
      </Card>
    </div>
  );
}
