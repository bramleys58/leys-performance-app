"use client";

import { useState } from "react";
import { roundToStep } from "@/lib/plan";
import { inputClass } from "./ui";

const small = inputClass + " px-2 py-2 text-sm";
const KG_PER_LB = 0.45359237;
const trim = (n: number) => String(Math.round(n * 100) / 100);

export type Lift = { id: string; name: string };

/**
 * The target part of one exercise row in the session builder. With "% of max"
 * it shows the weight the athlete will see, calculated from the maxes sheet.
 */
export function TargetFields({
  rowId,
  type,
  value,
  askRpe,
  exerciseId,
  maxExerciseId,
  lifts,
  maxes,
  step,
  unit,
  maxesHref,
}: {
  rowId: string;
  type: string;
  value: number | null;
  askRpe: boolean;
  exerciseId: string | null;
  maxExerciseId: string | null;
  /** Main lifts a percent can be based on. */
  lifts: Lift[];
  /** Working max in kg per exercise id. Null for a template: there is no athlete yet. */
  maxes: Record<string, number> | null;
  step: number;
  unit: "kg" | "lbs";
  maxesHref: string | null;
}) {
  const [t, setT] = useState(type);
  const [v, setV] = useState(value == null ? "" : String(value));
  const [base, setBase] = useState(maxExerciseId ?? "");

  const pct = Number(v.replace(",", "."));
  const maxId = base || exerciseId;
  const max = maxes && maxId ? maxes[maxId] : undefined;
  const show = (kg: number) => (unit === "lbs" ? trim(Math.round((kg / KG_PER_LB) * 2) / 2) : trim(kg));
  const baseName = lifts.find((l) => l.id === base)?.name;

  let hint: React.ReactNode = null;
  if (t === "percent") {
    if (!maxes) hint = "The weight is worked out per athlete, from their own max.";
    else if (!max)
      hint = (
        <>
          No max yet{baseName ? ` for ${baseName}` : " for this lift"}.{" "}
          {maxesHref && (
            <a href={maxesHref} target="_blank" rel="noopener" className="text-accent underline">
              Set it
            </a>
          )}
        </>
      );
    else if (v && Number.isFinite(pct) && pct > 0)
      hint = (
        <>
          = <span className="font-semibold text-text">{show(roundToStep((max * pct) / 100, step))} {unit}</span> (max {show(max)} {unit})
        </>
      );
    else hint = `Max ${show(max)} ${unit}. Fill in the percent.`;
  }

  return (
    <div className="mt-2 lg:mt-0 lg:min-w-0 lg:flex-1">
      <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
        <label className="text-xs text-muted">
          Target
          <select name={`target_type__${rowId}`} value={t} onChange={(e) => setT(e.target.value)} className={small}>
            <option value="none">None (athlete picks)</option>
            <option value="weight">Weight</option>
            <option value="percent">% of max</option>
            <option value="rpe">RPE</option>
          </select>
        </label>
        <label className="text-xs text-muted">
          {t === "percent" ? "Percent" : t === "weight" ? `Weight (${unit})` : t === "rpe" ? "RPE" : "Value"}
          <input name={`target_value__${rowId}`} value={v} onChange={(e) => setV(e.target.value)} disabled={t === "none"} inputMode="decimal" className={small + " disabled:opacity-40"} />
        </label>
        <label className="flex items-center gap-1.5 pb-2 text-xs text-muted">
          <input type="checkbox" name={`ask_rpe__${rowId}`} defaultChecked={askRpe} /> Ask RPE
        </label>
      </div>
      {t === "percent" && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {lifts.length > 0 && (
            <label className="flex items-center gap-1.5">
              of
              <select name={`max_exercise_id__${rowId}`} value={base} onChange={(e) => setBase(e.target.value)} aria-label="Percent of which max" className="h-8 max-w-44 rounded-lg border border-border bg-surface-2 px-1.5 text-text outline-none focus:border-accent">
                <option value="">this exercise</option>
                {lifts
                  .filter((l) => l.id !== exerciseId)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <span aria-live="polite">{hint}</span>
        </div>
      )}
    </div>
  );
}
