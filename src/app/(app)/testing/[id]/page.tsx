import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton, BackLink, Card, Field, Notice, SecondaryButton, inputClass } from "@/components/ui";
import { requireCoach } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { best, fmt, groupByCategory, isNeutral, type Test } from "@/lib/testing";
import { deleteTestEvent, updateTestEvent } from "../../coach-actions";
import { AttemptGrid } from "./attempt-grid";

export default async function TestDayPage({ params, searchParams }: PageProps<"/testing/[id]">) {
  await requireCoach();
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: event } = await supabase.from("test_events").select("*").eq("id", id).maybeSingle();
  if (!event) notFound();

  const [{ data: testData }, { data: athleteData }, { data: resultData }, { data: allAthletes }] = await Promise.all([
    supabase.from("tests").select("*").order("position"),
    event.athlete_ids.length ? supabase.from("athletes").select("id, full_name").in("id", event.athlete_ids).order("full_name") : Promise.resolve({ data: [] }),
    supabase.from("test_results").select("athlete_id, test_id, attempt, value").eq("test_event_id", id),
    supabase.from("athletes").select("id, full_name, status").order("full_name"),
  ]);

  const allTests = (testData ?? []) as Test[];
  const tests = event.test_ids.map((tid: string) => allTests.find((t) => t.id === tid)).filter(Boolean) as Test[];
  const athletes = (athleteData ?? []) as { id: string; full_name: string }[];
  const results = (resultData ?? []) as { athlete_id: string; test_id: string; attempt: number; value: number }[];

  const view = sp.view === "results" ? "results" : sp.view === "edit" ? "edit" : "enter";
  const current = tests.find((t) => t.id === sp.test) ?? tests[0];
  const index = current ? tests.indexOf(current) : -1;
  const valueOf = (a: string, t: string, attempt: number) => results.find((r) => r.athlete_id === a && r.test_id === t && r.attempt === attempt)?.value ?? null;
  const bestOf = (a: string, t: Test) => best(results.filter((r) => r.athlete_id === a && r.test_id === t.id).map((r) => Number(r.value)), t.higher_is_better);

  const fmtDate = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(event.held_on + "T12:00:00Z"));
  const tab = (v: string, label: string) => (
    <Link href={`/testing/${id}?view=${v}${current && v === "enter" ? `&test=${current.id}` : ""}`} className={`rounded-lg px-3 py-2 text-sm ${view === v ? "bg-accent/15 font-semibold" : "text-muted"}`}>
      {label}
    </Link>
  );

  return (
    <div className="space-y-5">
      <BackLink href="/testing">Testing</BackLink>
      <div>
        <h1 className="text-2xl font-bold">{event.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {fmtDate} · {results.length} results
        </p>
      </div>
      {sp.saved && <Notice kind="ok">Saved.</Notice>}
      <div className="flex gap-1 rounded-xl border border-border bg-surface p-1">
        {tab("enter", "Enter results")}
        {tab("results", "Overview")}
        {tab("edit", "Settings")}
      </div>

      {view === "enter" && current && (
        <>
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
            {tests.map((t) => (
              <Link
                key={t.id}
                href={`/testing/${id}?test=${t.id}`}
                aria-current={t.id === current.id ? "page" : undefined}
                className={`shrink-0 rounded-lg border px-3 py-2 text-sm ${t.id === current.id ? "border-accent bg-accent/15 font-semibold" : "border-border bg-surface text-muted"}`}
              >
                {t.name}
              </Link>
            ))}
          </div>
          {/* The key gives every test its own fresh grid. */}
          <AttemptGrid
            key={current.id}
            eventId={id}
            test={current}
            rows={athletes.map((a) => ({ id: a.id, name: a.full_name, attempts: [1, 2, 3].map((n) => valueOf(a.id, current.id, n)) }))}
          />
          <div className="grid grid-cols-2 gap-2">
            {index > 0 ? (
              <Link href={`/testing/${id}?test=${tests[index - 1].id}`} className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-center text-sm">
                ← {tests[index - 1].name}
              </Link>
            ) : (
              <span />
            )}
            {index < tests.length - 1 ? (
              <Link href={`/testing/${id}?test=${tests[index + 1].id}`} className="rounded-xl bg-accent px-4 py-3 text-center text-sm font-semibold text-accent-text">
                {tests[index + 1].name} →
              </Link>
            ) : (
              <Link href={`/testing/${id}?view=results`} className="rounded-xl bg-accent px-4 py-3 text-center text-sm font-semibold text-accent-text">
                Overview →
              </Link>
            )}
          </div>
        </>
      )}

      {view === "enter" && !current && (
        <Card>
          <p className="text-sm text-muted">No tests on this day yet. Add them under Settings.</p>
        </Card>
      )}

      {view === "results" && (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="sticky left-0 bg-surface px-3 py-2 font-normal">Athlete</th>
                {tests.map((t) => (
                  <th key={t.id} className="px-3 py-2 text-right font-normal">
                    {t.name}
                    <span className="block">
                      {t.unit} {isNeutral(t) ? "" : t.higher_is_better ? "↑" : "↓"}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {athletes.map((a) => (
                <tr key={a.id}>
                  <td className="sticky left-0 bg-surface px-3 py-2 font-medium">
                    <Link href={`/athletes/${a.id}/progress`} className="hover:underline">
                      {a.full_name}
                    </Link>
                  </td>
                  {tests.map((t) => {
                    const b = bestOf(a.id, t);
                    // Mark the best result of the day per test.
                    const all = athletes.map((x) => bestOf(x.id, t)).filter((v): v is number => v != null);
                    const top = all.length > 1 && !isNeutral(t) ? best(all, t.higher_is_better) : null;
                    return (
                      <td key={t.id} className={`px-3 py-2 text-right tabular-nums ${b != null && b === top ? "font-bold" : ""}`}>
                        {fmt(b, t.decimals)}
                        {b != null && b === top && <span className="ml-1 text-xs text-muted">top</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === "edit" && (
        <Card>
          <form action={updateTestEvent} className="space-y-4">
            <input type="hidden" name="id" value={id} />
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <Field label="Name" name="name" defaultValue={event.name} required />
              <Field label="Date" name="held_on" type="date" defaultValue={event.held_on} />
            </div>
            <fieldset>
              <legend className="mb-2 text-sm text-muted">Tests</legend>
              <div className="space-y-3">
                {groupByCategory(allTests).map(([cat, list]) => (
                  <div key={cat}>
                    <p className="mb-1 text-xs font-semibold tracking-[0.15em] text-muted">{cat.toUpperCase()}</p>
                    <div className="flex flex-wrap gap-2">
                      {list.map((t) => (
                        <label key={t.id} className="cursor-pointer">
                          <input type="checkbox" name="test_ids" value={t.id} defaultChecked={event.test_ids.includes(t.id)} className="peer sr-only" />
                          <span className="block rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm peer-checked:border-accent peer-checked:bg-accent/15">{t.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-sm text-muted">Athletes</legend>
              <div className="flex flex-wrap gap-2">
                {(allAthletes ?? []).filter((a) => a.status === "active" || event.athlete_ids.includes(a.id)).map((a) => (
                  <label key={a.id} className="cursor-pointer">
                    <input type="checkbox" name="athlete_ids" value={a.id} defaultChecked={event.athlete_ids.includes(a.id)} className="peer sr-only" />
                    <span className="block rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm peer-checked:border-accent peer-checked:bg-accent/15">{a.full_name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block">
              <span className="mb-1.5 block text-sm text-muted">Notes (conditions, surface, timing method)</span>
              <textarea name="notes" rows={2} defaultValue={event.notes ?? ""} className={inputClass} />
            </label>
            <p className="text-xs text-muted">Results already entered stay saved when you remove a test or an athlete, and come back if you add them again.</p>
            <SecondaryButton type="submit" pendingLabel="Saving…">
              Save settings
            </SecondaryButton>
          </form>
          <form action={deleteTestEvent.bind(null, id)} className="mt-6 space-y-2 border-t border-border pt-4">
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" required /> Yes, delete this test day and all its results
            </label>
            <ActionButton className="w-full rounded-xl border border-border px-4 py-3 text-sm text-accent">Delete test day</ActionButton>
          </form>
        </Card>
      )}
    </div>
  );
}
