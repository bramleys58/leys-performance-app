import Link from "next/link";
import { Card } from "@/components/ui";
import type { getProgress } from "@/lib/progress";
import { change, fmt, isNeutral } from "@/lib/testing";

type Data = Awaited<ReturnType<typeof getProgress>>;
const KG_PER_LB = 0.45359237;

/** Progress for one athlete: weekly volume, records, maxes and test results. */
export function ProgressView({ data, unit, historyHref }: { data: Data; unit: "kg" | "lbs"; historyHref: string }) {
  const toUnit = (kg: number) => (unit === "lbs" ? kg / KG_PER_LB : kg);
  const n0 = (v: number) => new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(v);
  const n1 = (v: number) => new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }).format(v);
  const short = (d: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(d + "T12:00:00Z"));

  const max = Math.max(...data.weeks.map((w) => w.tonnage), 1);
  const thisWeek = data.weeks[data.weeks.length - 1];
  const lastWeek = data.weeks[data.weeks.length - 2];
  const empty = data.weeks.every((w) => w.tonnage === 0 && w.sessions === 0) && data.prs.length === 0 && data.maxes.length === 0 && data.tests.length === 0;

  if (empty) {
    return (
      <Card>
        <p className="text-sm text-muted">Nothing to show yet. Progress appears here after the first logged workouts and tests.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-semibold">Weekly volume</h2>
          <p className="text-sm text-muted">
            {unit} lifted, last {data.weeks.length} weeks
          </p>
        </div>
        <p className="mt-3 text-3xl font-bold tabular-nums">
          {n0(toUnit(thisWeek.tonnage))} <span className="text-base font-normal text-muted">{unit} this week</span>
        </p>
        <p className="text-sm text-muted">
          {thisWeek.sessions} session{thisWeek.sessions === 1 ? "" : "s"} · last week {n0(toUnit(lastWeek.tonnage))} {unit} in {lastWeek.sessions}
        </p>

        {/* One series, so no legend: the title names it. Every bar has a tooltip and the table below has the numbers. */}
        <div className="mt-4 flex h-36 items-end gap-1.5" role="img" aria-label={`Weekly volume, ${data.weeks.map((w) => `${short(w.monday)}: ${n0(toUnit(w.tonnage))} ${unit}`).join(", ")}`}>
          {data.weeks.map((w, i) => {
            const h = w.tonnage > 0 ? Math.max(3, (w.tonnage / max) * 100) : 0;
            const current = i === data.weeks.length - 1;
            return (
              <div key={w.monday} className="group relative flex h-full flex-1 flex-col justify-end">
                <div
                  className={`w-full rounded-t-[4px] ${current ? "bg-accent" : "bg-accent/45"} transition-opacity group-hover:opacity-80`}
                  style={{ height: `${h}%` }}
                />
                {w.tonnage === 0 && <div className="h-px w-full bg-border" />}
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-surface-2 px-2 py-1 text-xs shadow-lg group-hover:block">
                  Week of {short(w.monday)}: {n0(toUnit(w.tonnage))} {unit}, {w.sessions} session{w.sessions === 1 ? "" : "s"}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-1.5 flex gap-1.5 text-[10px] text-muted">
          {data.weeks.map((w, i) => (
            <span key={w.monday} className="flex-1 whitespace-nowrap text-center">
              {i % 2 === data.weeks.length % 2 || i === data.weeks.length - 1 ? short(w.monday) : ""}
            </span>
          ))}
        </div>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted">Show as table</summary>
          <table className="mt-2 w-full tabular-nums">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1 font-normal">Week of</th>
                <th className="py-1 text-right font-normal">Sessions</th>
                <th className="py-1 text-right font-normal">{unit} lifted</th>
              </tr>
            </thead>
            <tbody>
              {[...data.weeks].reverse().map((w) => (
                <tr key={w.monday} className="border-t border-border">
                  <td className="py-1">{short(w.monday)}</td>
                  <td className="py-1 text-right">{w.sessions}</td>
                  <td className="py-1 text-right">{n0(toUnit(w.tonnage))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </Card>

      {data.prs.length > 0 && (
        <Card>
          <h2 className="font-semibold">Recent personal records</h2>
          <p className="mt-1 text-sm text-muted">Each lift&apos;s latest jump in estimated max.</p>
          <ul className="mt-3 divide-y divide-border">
            {data.prs.map((p) => (
              <li key={p.exerciseId} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="block text-sm text-muted">
                    {n1(toUnit(p.weight))} {unit} × {p.reps} · {short(p.on)}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-bold tabular-nums">{n1(toUnit(p.e1rm))}</span>
                  <span className="block text-xs text-muted">est. max</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data.maxes.length > 0 && (
        <Card>
          <h2 className="font-semibold">Working maxes</h2>
          <ul className="mt-3 divide-y divide-border">
            {data.maxes.map((m) => (
              <li key={m.name} className="flex items-center justify-between py-2.5">
                <span>
                  <span className="block font-medium">{m.name}</span>
                  <span className="block text-sm text-muted">
                    {m.source} · {short(m.on)}
                  </span>
                </span>
                <span className="font-bold tabular-nums">
                  {n1(toUnit(m.value))} <span className="text-sm font-normal text-muted">{unit}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data.tests.length > 0 && (
        <Card>
          <h2 className="font-semibold">Test results</h2>
          <ul className="mt-3 divide-y divide-border">
            {data.tests.map((t) => {
              const c = t.previous != null ? change(t.latest, t.previous, t.test) : null;
              const tone = c?.tone === "better" ? "text-ok" : c?.tone === "worse" ? "text-accent" : "text-muted";
              return (
                <li key={t.test.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{t.test.name}</span>
                      <span className="block text-sm text-muted">
                        {short(t.latestOn)}
                        {!isNeutral(t.test) && t.history.length > 1 ? ` · best ${fmt(t.best, t.test.decimals)}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-bold tabular-nums">
                        {fmt(t.latest, t.test.decimals)} <span className="text-sm font-normal text-muted">{t.test.unit}</span>
                      </span>
                      {c && (
                        <span className={`block text-xs ${tone}`}>
                          {c.text}
                          {c.tone === "better" ? ", better" : c.tone === "worse" ? ", worse" : c.tone === "same" ? ", same" : ""}
                        </span>
                      )}
                    </span>
                  </div>
                  {t.history.length > 2 && (
                    <p className="mt-1 text-xs text-muted">
                      {t.history.map((h) => `${short(h.on)}: ${fmt(h.value, t.test.decimals)}`).join(" · ")}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Link href={historyHref} className="block text-center text-sm text-muted underline">
        Workout history
      </Link>
    </div>
  );
}
