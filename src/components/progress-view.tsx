import Link from "next/link";
import { BodyweightChart, Sparkline, WeeklyWeightChart } from "@/components/progress-charts";
import { ActionButton, Card, Notice, inputClass } from "@/components/ui";
import { todayISO } from "@/lib/plan";
import type { getProgress } from "@/lib/progress";
import { change, fmt, isNeutral } from "@/lib/testing";

type Data = Awaited<ReturnType<typeof getProgress>>;
const KG_PER_LB = 0.45359237;

/** Progress for one athlete: block lifts, bodyweight, weekly volume, records, maxes and test results. */
export function ProgressView({
  data,
  unit,
  historyHref,
  logBodyweight,
  bwStatus,
}: {
  data: Data;
  unit: "kg" | "lbs";
  historyHref: string;
  /** Server action that saves a weigh-in. */
  logBodyweight: (fd: FormData) => Promise<void>;
  bwStatus?: string;
}) {
  const toUnit = (kg: number) => (unit === "lbs" ? kg / KG_PER_LB : kg);
  const n0 = (v: number) => new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(v);
  const n1 = (v: number) => new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(v);
  const short = (d: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(d + "T12:00:00Z"));

  const max = Math.max(...data.weeks.map((w) => w.tonnage), 1);
  const thisWeek = data.weeks[data.weeks.length - 1];
  const lastWeek = data.weeks[data.weeks.length - 2];
  const empty = data.weeks.every((w) => w.tonnage === 0 && w.sessions === 0) && data.prs.length === 0 && data.maxes.length === 0 && data.tests.length === 0 && data.wellness.days.length === 0;
  const signed = (v: number, digits = 1) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${new Intl.NumberFormat("en-GB", { maximumFractionDigits: digits }).format(Math.abs(v))}`;
  const bw = data.bodyweight;
  const weeklyMode = bw.weeksLogged >= bw.weeksNeeded && bw.weekly.length >= 2;
  const thisWk = bw.weekly[bw.weekly.length - 1];
  const lifts = data.block?.lifts ?? [];
  const blockWeeks = lifts[0]?.weekly.length ?? 0;

  const bodyweightCard = (
    <Card>
      <div id="bodyweight" className="flex scroll-mt-20 items-baseline justify-between gap-3">
        <h2 className="font-semibold">Bodyweight</h2>
        {bw.points.length > 0 && <p className="text-sm text-muted">{bw.points.length} weigh-ins this year</p>}
      </div>
      {bwStatus === "saved" && <div className="mt-3"><Notice kind="ok">Weigh-in saved.</Notice></div>}
      {bwStatus === "invalid" && <div className="mt-3"><Notice kind="error">That weight doesn&apos;t look right. Fill in your weight in {unit}.</Notice></div>}
      {bwStatus === "error" && <div className="mt-3"><Notice kind="error">Could not save the weigh-in. Try again.</Notice></div>}
      {bw.latest && weeklyMode && thisWk ? (
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div>
            <p className="text-2xl font-bold tabular-nums">{n1(toUnit(thisWk.avg))}</p>
            <p className="text-xs text-muted">
              {unit} avg, week of {short(thisWk.monday)}
            </p>
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums">{thisWk.change == null ? "–" : signed(toUnit(thisWk.change))}</p>
            <p className="text-xs text-muted">{unit} vs week before</p>
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums">{bw.ratePerWeek == null ? "–" : signed(toUnit(bw.ratePerWeek), 2)}</p>
            <p className="text-xs text-muted">{unit} per week, last 4 weeks</p>
          </div>
        </div>
      ) : bw.latest ? (
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div>
            <p className="text-2xl font-bold tabular-nums">{n1(toUnit(bw.latest.kg))}</p>
            <p className="text-xs text-muted">
              {unit} · {bw.latest.day === todayISO() ? "today" : short(bw.latest.day)}
            </p>
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums">{bw.change7 == null ? "–" : signed(toUnit(bw.change7))}</p>
            <p className="text-xs text-muted">{unit} last 7 days</p>
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums">{bw.change30 == null ? "–" : signed(toUnit(bw.change30))}</p>
            <p className="text-xs text-muted">{unit} last 30 days</p>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">No weigh-ins yet. Weigh in at the same moment each time, for example in the morning before breakfast.</p>
      )}
      {weeklyMode ? (
        <>
          <WeeklyWeightChart weeks={bw.weekly} toUnit={toUnit} unit={unit} short={short} />
          <p className="mt-2 text-xs text-muted">
            Latest weigh-in: {bw.latest ? `${n1(toUnit(bw.latest.kg))} ${unit}, ${bw.latest.day === todayISO() ? "today" : short(bw.latest.day)}` : "–"}.
          </p>
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-muted">Show daily weigh-ins</summary>
            <BodyweightChart points={bw.points.slice(-60)} toUnit={toUnit} unit={unit} short={short} />
          </details>
        </>
      ) : (
        <>
          <BodyweightChart points={bw.points.slice(-120)} toUnit={toUnit} unit={unit} short={short} />
          {(bw.change7 != null || bw.change30 != null) && <p className="mt-2 text-xs text-muted">Changes use the 7-day average, so one heavy or light day doesn&apos;t throw them off.</p>}
          {bw.points.length > 0 && (
            <p className="mt-1 text-xs text-muted">
              Weekly comparison shows after {bw.weeksNeeded} weeks with weigh-ins ({Math.min(bw.weeksLogged, bw.weeksNeeded)} of {bw.weeksNeeded} so far).
            </p>
          )}
        </>
      )}
      <form action={logBodyweight} className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4">
        <label className="text-xs text-muted">
          Weight ({unit})
          <input name="weight" inputMode="decimal" required placeholder={bw.latest ? n1(toUnit(bw.latest.kg)) : unit === "kg" ? "e.g. 82.5" : "e.g. 180"} className={inputClass + " w-32"} />
        </label>
        <label className="text-xs text-muted">
          Day
          <input name="day" type="date" defaultValue={todayISO()} max={todayISO()} className={inputClass} />
        </label>
        <ActionButton className="rounded-xl bg-accent px-5 py-3 font-semibold text-accent-text">{bw.loggedToday ? "Update" : "Log weight"}</ActionButton>
      </form>
      {bw.points.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted">{weeklyMode ? "Show as table" : "Show every weigh-in"}</summary>
          {weeklyMode && (
            <table className="mt-2 w-full tabular-nums">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-1 font-normal">Week of</th>
                  <th className="py-1 text-right font-normal">Avg {unit}</th>
                  <th className="py-1 text-right font-normal">Change</th>
                  <th className="py-1 text-right font-normal">Weigh-ins</th>
                </tr>
              </thead>
              <tbody>
                {[...bw.weekly].reverse().map((w) => (
                  <tr key={w.monday} className="border-t border-border">
                    <td className="py-1">{short(w.monday)}</td>
                    <td className="py-1 text-right">{n1(toUnit(w.avg))}</td>
                    <td className="py-1 text-right text-muted">{w.change == null ? "–" : signed(toUnit(w.change))}</td>
                    <td className="py-1 text-right text-muted">{w.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {weeklyMode && <p className="mt-3 text-xs text-muted">Every weigh-in:</p>}
          <table className="mt-2 w-full tabular-nums">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1 font-normal">Day</th>
                <th className="py-1 text-right font-normal">{unit}</th>
                <th className="py-1 text-right font-normal">7-day avg</th>
              </tr>
            </thead>
            <tbody>
              {[...bw.points].reverse().slice(0, 60).map((p) => (
                <tr key={p.day} className="border-t border-border">
                  <td className="py-1">{short(p.day)}</td>
                  <td className="py-1 text-right">{n1(toUnit(p.kg))}</td>
                  <td className="py-1 text-right text-muted">{n1(toUnit(p.avg))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </Card>
  );

  if (empty && lifts.length === 0) {
    return (
      <div className="space-y-5">
        {bodyweightCard}
        <Card>
          <p className="text-sm text-muted">Lifts, records and tests appear here after the first logged workouts.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {data.block && lifts.length > 0 && (
        <Card>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-semibold">Main lifts this block</h2>
            <p className="text-sm text-muted">since {short(data.block.start)}</p>
          </div>
          <p className="mt-1 text-sm text-muted">Best estimated max per lift, compared with before the block. The line shows each week of the block.</p>
          <ul className="mt-3 divide-y divide-border">
            {lifts.map((l) => {
              const diff = l.blockBest != null && l.before != null ? l.blockBest - l.before : null;
              const pct = diff != null && l.before ? (diff / l.before) * 100 : null;
              return (
                <li key={l.exerciseId} className="py-3">
                  <p className="font-medium">
                    {l.name}
                    {l.prDays.length > 0 && (
                      <span className="ml-2 whitespace-nowrap rounded-full border border-ok px-2 py-0.5 align-middle text-[11px] font-normal text-ok">
                        {l.prDays.length} PR{l.prDays.length === 1 ? "" : "s"}
                      </span>
                    )}
                  </p>
                  <div className="mt-1 flex items-center gap-3">
                    <p className="min-w-0 flex-1 text-sm text-muted">
                      {l.blockBestSet
                        ? `best ${n1(toUnit(l.blockBestSet.weight))} ${unit} × ${l.blockBestSet.reps} · ${short(l.blockBestSet.on)}`
                        : "not logged yet this block"}
                    </p>
                    <Sparkline
                      values={l.weekly.map((w) => (w.e1rm == null ? null : toUnit(w.e1rm)))}
                      label={`${l.name}, best estimated max per week: ${l.weekly.map((w) => `${short(w.monday)} ${w.e1rm == null ? "no sets" : n1(toUnit(w.e1rm)) + " " + unit}`).join(", ")}`}
                    />
                    <div className="w-24 shrink-0 text-right">
                      <p className="font-bold tabular-nums">
                        {l.blockBest == null ? "–" : n1(toUnit(l.blockBest))}
                        {l.blockBest != null && <span className="ml-1 text-xs font-normal text-muted">{unit}</span>}
                      </p>
                      <p className={`text-xs tabular-nums ${diff == null ? "text-muted" : diff > 0 ? "text-ok" : diff < 0 ? "text-accent" : "text-muted"}`}>
                        {diff == null ? (l.blockBest == null ? "" : "first block") : `${signed(toUnit(diff))} (${signed(pct ?? 0, 0)}%)`}
                      </p>
                    </div>
                  </div>
                  {l.repBests.length > 0 && (
                    <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                      {l.repBests.map((r) => (
                        <span key={r.reps} className={r.inBlock ? "text-text" : ""} title={`Heaviest ${r.reps === 10 ? "10+" : r.reps}-rep set: ${short(r.on)}${r.inBlock ? ", this block" : ""}`}>
                          {r.reps === 10 ? "10+" : r.reps} RM {n1(toUnit(r.weight))}
                          {r.inBlock ? " ★" : ""}
                        </span>
                      ))}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-muted">
            Estimated max from your best set (Epley). RM is the heaviest weight lifted for that many reps, all time; ★ means it was set this block. A PR is a higher estimated max or the heaviest weight ever.
            {blockWeeks > 0 ? ` Line: ${blockWeeks} week${blockWeeks === 1 ? "" : "s"}.` : ""}
          </p>
        </Card>
      )}

      {bodyweightCard}

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
          {data.avgMinutes != null ? ` · average workout ${data.avgMinutes} min` : ""}
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

      {data.wellness.days.length > 0 && (
        <Card>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-semibold">Check-ins</h2>
            <p className="text-sm text-muted">last 14 days</p>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-2xl font-bold tabular-nums">{data.wellness.avgReadiness == null ? "–" : `${data.wellness.avgReadiness}%`}</p>
              <p className="text-xs text-muted">avg readiness</p>
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">{data.wellness.avgSleep == null ? "–" : `${data.wellness.avgSleep} h`}</p>
              <p className="text-xs text-muted">avg sleep</p>
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">{data.wellness.latestWeight ? n1(toUnit(data.wellness.latestWeight.kg)) : "–"}</p>
              <p className="text-xs text-muted">
                {unit} bodyweight
                {data.wellness.latestWeight && data.wellness.firstWeight
                  ? ` (${data.wellness.latestWeight.kg - data.wellness.firstWeight.kg >= 0 ? "+" : "−"}${n1(Math.abs(toUnit(data.wellness.latestWeight.kg - data.wellness.firstWeight.kg)))})`
                  : ""}
              </p>
            </div>
          </div>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-muted">Show every day</summary>
            <table className="mt-2 w-full tabular-nums">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-1 font-normal">Day</th>
                  <th className="py-1 text-right font-normal">Ready</th>
                  <th className="py-1 text-right font-normal">Sleep</th>
                  <th className="py-1 text-right font-normal">Sore</th>
                  <th className="py-1 text-right font-normal">{unit}</th>
                </tr>
              </thead>
              <tbody>
                {data.wellness.days.map((c) => (
                  <tr key={c.day} className="border-t border-border align-top">
                    <td className="py-1">
                      {short(c.day)}
                      {c.note && <span className="block text-xs text-muted">{c.note}</span>}
                    </td>
                    <td className="py-1 text-right">{c.readiness == null ? "–" : `${c.readiness}%`}</td>
                    <td className="py-1 text-right">{c.sleep_hours == null ? "–" : `${c.sleep_hours} h`}</td>
                    <td className="py-1 text-right">{c.soreness == null ? "–" : `${c.soreness}/5`}</td>
                    <td className="py-1 text-right">{c.bodyweight == null ? "–" : n1(toUnit(Number(c.bodyweight)))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </Card>
      )}

      <Link href={historyHref} className="block text-center text-sm text-muted underline">
        Workout history
      </Link>
    </div>
  );
}
