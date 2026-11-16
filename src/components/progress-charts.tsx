/** Small server-rendered charts for the progress page. Every chart has a table or text fallback next to it. */

type BwPoint = { day: string; kg: number; avg: number };

const W = 640;
const H = 220;
const PAD = { top: 14, right: 14, bottom: 34, left: 64 };

/** Bodyweight: weigh-ins as dots, 7-day average as a line. */
export function BodyweightChart({ points, toUnit, unit, short }: { points: BwPoint[]; toUnit: (kg: number) => number; unit: string; short: (d: string) => string }) {
  if (points.length < 2) return null;
  const t = (d: string) => Date.parse(d + "T12:00:00Z");
  const x0 = t(points[0].day);
  const x1 = Math.max(t(points[points.length - 1].day), x0 + 86400000);
  const vals = points.flatMap((p) => [toUnit(p.kg), toUnit(p.avg)]);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  const padY = Math.max((hi - lo) * 0.15, 0.5);
  lo -= padY;
  hi += padY;
  const x = (d: string) => PAD.left + ((t(d) - x0) / (x1 - x0)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);
  const ticks = [lo + padY, (lo + hi) / 2, hi - padY];
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.day).toFixed(1)},${y(toUnit(p.avg)).toFixed(1)}`).join(" ");
  const fmt = (v: number) => (Math.round(v * 10) / 10).toString();

  return (
    <figure className="mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Bodyweight from ${short(points[0].day)} to ${short(points[points.length - 1].day)}, ${fmt(toUnit(points[0].avg))} to ${fmt(toUnit(points[points.length - 1].avg))} ${unit} on the 7-day average`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="stroke-border" strokeWidth="1" />
            <text x={PAD.left - 10} y={y(v) + 7} textAnchor="end" className="fill-muted" fontSize="22">
              {fmt(v)}
            </text>
          </g>
        ))}
        <text x={PAD.left} y={H - 4} className="fill-muted" fontSize="22">
          {short(points[0].day)}
        </text>
        <text x={W - PAD.right} y={H - 4} textAnchor="end" className="fill-muted" fontSize="22">
          {short(points[points.length - 1].day)}
        </text>
        <path d={line} fill="none" className="stroke-accent" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p) => (
          <g key={p.day}>
            <circle cx={x(p.day)} cy={y(toUnit(p.kg))} r="6" className="fill-text/40 stroke-surface" strokeWidth="2" />
            {/* Bigger invisible target for the hover tooltip */}
            <circle cx={x(p.day)} cy={y(toUnit(p.kg))} r="16" fill="transparent">
              <title>{`${short(p.day)}: ${fmt(toUnit(p.kg))} ${unit} (7-day average ${fmt(toUnit(p.avg))})`}</title>
            </circle>
          </g>
        ))}
      </svg>
      <figcaption className="mt-1 flex gap-4 text-xs text-muted">
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
