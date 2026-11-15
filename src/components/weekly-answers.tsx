import { WEEKLY_SCALES, WEEKLY_TEXTS, weekLabel, type WeeklyCheckIn } from "@/lib/weekly";

/** One weekly check-in, as the coach reads it. */
export function WeeklyAnswers({ c, name }: { c: WeeklyCheckIn; name?: string }) {
  const short: Record<string, string> = { training: "Training", nutrition: "Nutrition", recovery: "Recovery", stress: "Stress" };
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-semibold">{name ?? `Week of ${weekLabel(c.week_start)}`}</p>
        {name && <p className="text-xs text-muted">{weekLabel(c.week_start)}</p>}
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2 text-center">
        {WEEKLY_SCALES.map((s) => (
          <div key={s.name} className="rounded-lg bg-surface-2 py-2">
            <p className="text-lg font-bold tabular-nums">{c[s.name] ?? "–"}<span className="text-xs font-normal text-muted">/5</span></p>
            <p className="text-[11px] text-muted">{short[s.name]}</p>
          </div>
        ))}
      </div>
      <dl className="mt-3 space-y-2 text-sm">
        {WEEKLY_TEXTS.filter((t) => c[t.name]).map((t) => (
          <div key={t.name}>
            <dt className="text-xs text-muted">{t.label}</dt>
            <dd className="whitespace-pre-line">{c[t.name]}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
