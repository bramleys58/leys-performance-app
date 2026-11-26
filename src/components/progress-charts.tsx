/** Small server-rendered charts for the progress page. Every chart has a table or text fallback next to it. */

import { weightAxis } from "@/lib/progress-math";

type BwPoint = { day: string; kg: number; avg: number };

type Dot = { key: string; x: number; y: number; title: string; big?: boolean; solid?: boolean };

/**
 * Plot area drawn in percent: lines in a stretched SVG (strokes keep their width),
 * dots and labels as plain HTML so text stays readable at any screen width.
 */
function Plot({ ticks, yPct, paths, dots, xLabels, label, height = "h-44" }: { ticks: number[]; yPct: (v: number) => number; paths: string[]; dots: Dot[]; xLabels: { key: string; x: number; text: string }[]; label: string; height?: string }) {
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  return (
    <div role="img" aria-label={label} className="mt-5 grid grid-cols-[2.75rem_1fr] gap-x-2">
      <div className={`relative ${height}`}>
        {ticks.map((v) => (
          <span key={v} className="absolute right-0 -translate-y-1/2 text-xs tabular-nums text-muted" style={{ top: `${yPct(v)}%` }}>
            {fmt(v)}
          </span>
        ))}
      </div>
      <div className={`relative ${height}`}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          {ticks.map((v) => (
            <line key={v} x1="0" x2="100" y1={yPct(v)} y2={yPct(v)} className="stroke-border" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          {paths.map((d, i) => (
            <path key={i} d={d} fill="none" className="stroke-accent" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        {dots.map((d) => (
          <span
            key={d.key}
            title={d.title}
            className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
            style={{ left: `${d.x}%`, top: `${d.y}%` }}
          >
            <span className={`block rounded-full border-2 border-surface ${d.big ? "h-3.5 w-3.5" : "h-2.5 w-2.5"} ${d.solid ? "bg-accent" : "bg-text/40"}`} />
          </span>
        ))}
      </div>
      <div />
      <div className="relative mt-1 h-4">
        {xLabels.map((l, i) => (
          <span
            key={l.key}
            className={`absolute whitespace-nowrap text-xs text-muted ${i === 0 && xLabels.length > 1 ? "" : i === xLabels.length - 1 ? "-translate-x-full" : "-translate-x-1/2"}`}
            style={{ left: `${l.x}%` }}
          >
            {l.text}
          </span>
        ))}
      </div>
    </div>
  );
}

const t = (d: string) => Date.parse(d + "T12:00:00Z");
const fmt1 = (v: number) => (Math.round(v * 100) / 100).toString();
const INSET = 3; // percent kept free left and right so edge dots aren't cut off

/** Bodyweight: weigh-ins as dots, 7-day average as a line. */
export function BodyweightChart({ points, toUnit, unit, short }: { points: BwPoint[]; toUnit: (kg: number) => number; unit: string; short: (d: string) => string }) {
  if (points.length < 2) return null;
  const x0 = t(points[0].day);
  const x1 = Math.max(t(points[points.length - 1].day), x0 + 86400000);
  const { lo, hi, ticks } = weightAxis(points.flatMap((p) => [toUnit(p.kg), toUnit(p.avg)]));
  const xPct = (d: string) => INSET + ((t(d) - x0) / (x1 - x0)) * (100 - 2 * INSET);
  const yPct = (v: number) => (1 - (v - lo) / (hi - lo)) * 100;
  const line = points.map((p, i) => `${i ? "L" : "M"}${xPct(p.day).toFixed(2)},${yPct(toUnit(p.avg)).toFixed(2)}`).join(" ");
  const first = points[0].day;
  const last = points[points.length - 1].day;

  return (
    <figure>
      <Plot
        label={`Bodyweight from ${short(first)} to ${short(last)}, ${fmt1(toUnit(points[0].avg))} to ${fmt1(toUnit(points[points.length - 1].avg))} ${unit} on the 7-day average`}
        ticks={ticks}
        yPct={yPct}
        paths={[line]}
        dots={points.map((p) => ({ key: p.day, x: xPct(p.day), y: yPct(toUnit(p.kg)), title: `${short(p.day)}: ${fmt1(toUnit(p.kg))} ${unit} (7-day average ${fmt1(toUnit(p.avg))})` }))}
        xLabels={[
          { key: "a", x: xPct(first), text: short(first) },
          { key: "b", x: xPct(last), text: short(last) },
        ]}
      />
      <figcaption className="mt-2 flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-text/40" /> Weigh-in
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded bg-accent" /> 7-day average
        </span>
      </figcaption>
    </figure>
  );
}

/** A lift's best estimated max per week, as a small line. Weeks without the lift leave a gap. */
export function Sparkline({ values, label }: { values: (number | null)[]; label: string }) {
  const known = values.filter((v): v is number => v != null);
  if (known.length < 2) return null;
  const w = 120;
  const h = 32;
  const lo = Math.min(...known);
  const hi = Math.max(...known);
  const span = hi - lo || 1;
  const x = (i: number) => 3 + (i / Math.max(values.length - 1, 1)) * (w - 6);
  const y = (v: number) => 4 + (1 - (v - lo) / span) * (h - 8);
  let d = "";
  values.forEach((v, i) => {
    if (v == null) return;
    const prev = i > 0 ? values[i - 1] : null;
    d += `${prev == null ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
  });
  const lastIdx = values.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0).pop() as number;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-28 shrink-0" role="img" aria-label={label}>
      <path d={d} fill="none" className="stroke-accent" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {values.map((v, i) => (v == null ? null : <circle key={i} cx={x(i)} cy={y(v)} r={i === lastIdx ? 3 : 1.6} className="fill-accent" />))}
    </svg>
  );
}

/** Weekly average bodyweight: one dot per week, connected when weeks follow each other. */
export function WeeklyWeightChart({
  weeks,
  toUnit,
  unit,
  short,
}: {
  weeks: { monday: string; avg: number; count: number; change: number | null }[];
  toUnit: (kg: number) => number;
  unit: string;
  short: (d: string) => string;
}) {
  if (weeks.length < 2) return null;
  const x0 = t(weeks[0].monday);
  const x1 = t(weeks[weeks.length - 1].monday);
  const { lo, hi, ticks } = weightAxis(weeks.map((w) => toUnit(w.avg)));
  const xPct = (d: string) => INSET + ((t(d) - x0) / Math.max(x1 - x0, 1)) * (100 - 2 * INSET);
  const yPct = (v: number) => (1 - (v - lo) / (hi - lo)) * 100;
  let d = "";
  weeks.forEach((w, i) => {
    const joined = i > 0 && w.change != null;
    d += `${joined ? "L" : "M"}${xPct(w.monday).toFixed(2)},${yPct(toUnit(w.avg)).toFixed(2)} `;
  });
  // Only as many date labels as fit on a phone.
  const every = Math.max(1, Math.ceil(weeks.length / 4));
  const labelled = weeks.filter((_, i) => (weeks.length - 1 - i) % every === 0);

  return (
    <figure>
      <Plot
        label={`Weekly average bodyweight: ${weeks.map((w) => `week of ${short(w.monday)} ${fmt1(toUnit(w.avg))} ${unit}`).join(", ")}`}
        ticks={ticks}
        yPct={yPct}
        paths={[d]}
        dots={weeks.map((w, i) => ({
          key: w.monday,
          x: xPct(w.monday),
          y: yPct(toUnit(w.avg)),
          solid: true,
          big: i === weeks.length - 1,
          title: `Week of ${short(w.monday)}: ${fmt1(toUnit(w.avg))} ${unit} average of ${w.count} weigh-in${w.count === 1 ? "" : "s"}${w.change != null ? `, ${w.change > 0 ? "+" : ""}${fmt1(toUnit(w.change))} vs the week before` : ""}`,
        }))}
        xLabels={labelled.map((w) => ({ key: w.monday, x: xPct(w.monday), text: short(w.monday) }))}
      />
      <figcaption className="mt-2 text-xs text-muted">Average per week (Monday to Sunday). A gap means a week without weigh-ins.</figcaption>
    </figure>
  );
}

/**
 * Estimated 1RM of one lift: a dot per week (that week's best) and a line for the best so far,
 * which only goes up. Light weeks and deloads show as lower dots without pulling the line down.
 */
export function LiftChart({ name, weekly, bestBefore, toUnit, unit, short }: { name: string; weekly: { monday: string; e1rm: number | null }[]; bestBefore: number | null; toUnit: (kg: number) => number; unit: string; short: (d: string) => string }) {
  const points = weekly.filter((w): w is { monday: string; e1rm: number } => w.e1rm != null);
  if (points.length < 2) return null;
  const first = points[0].monday;
  const last = points[points.length - 1].monday;
  const x0 = t(first);
  const x1 = Math.max(t(last), x0 + 86400000);
  // Best so far, carried over from before the chart starts.
  const steps: { monday: string; best: number }[] = [];
  for (const p of points) steps.push({ monday: p.monday, best: Math.max(steps.length ? steps[steps.length - 1].best : (bestBefore ?? 0), p.e1rm) });
  const { lo, hi, ticks } = weightAxis([...points.map((p) => toUnit(p.e1rm)), ...steps.map((s) => toUnit(s.best))]);
  const xPct = (d: string) => INSET + ((t(d) - x0) / (x1 - x0)) * (100 - 2 * INSET);
  const yPct = (v: number) => (1 - (v - lo) / (hi - lo)) * 100;
  // A step line: flat until a new best, then straight up.
  let d = `M${xPct(steps[0].monday).toFixed(2)},${yPct(toUnit(steps[0].best)).toFixed(2)}`;
  for (let i = 1; i < steps.length; i++) {
    const x = xPct(steps[i].monday).toFixed(2);
    d += ` L${x},${yPct(toUnit(steps[i - 1].best)).toFixed(2)} L${x},${yPct(toUnit(steps[i].best)).toFixed(2)}`;
  }
  return (
    <figure>
      <Plot
        height="h-32"
        label={`${name}: best estimated 1RM per week, ${points.map((p) => `${short(p.monday)} ${fmt1(toUnit(p.e1rm))} ${unit}`).join(", ")}`}
        ticks={ticks}
        yPct={yPct}
        paths={[d]}
        dots={points.map((p, i) => ({
          key: p.monday,
          x: xPct(p.monday),
          y: yPct(toUnit(p.e1rm)),
          solid: p.e1rm >= steps[i].best,
          title: `Week of ${short(p.monday)}: ${fmt1(toUnit(p.e1rm))} ${unit}${p.e1rm >= steps[i].best && i > 0 && p.e1rm > steps[i - 1].best ? " (new best)" : ""}`,
        }))}
        xLabels={[
          { key: "a", x: xPct(first), text: short(first) },
          { key: "b", x: xPct(last), text: short(last) },
        ]}
      />
    </figure>
  );
}

