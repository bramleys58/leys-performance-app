"use client";

import { useState } from "react";
import { best, fmt, type Test } from "@/lib/testing";
import { saveAttempt } from "../../coach-actions";

type Row = { id: string; name: string; attempts: (number | null)[] };
type Status = "saving" | "saved" | "error";

const ATTEMPTS = 3;

/** Results for one test: a row per athlete, three attempts each, saved as soon as you leave a field. */
export function AttemptGrid({ eventId, test, rows }: { eventId: string; test: Test; rows: Row[] }) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const r of rows) r.attempts.forEach((a, i) => a != null && (v[`${r.id}:${i + 1}`] = String(a)));
    return v;
  });
  const [saved, setSaved] = useState<Record<string, string>>(values);
  const [status, setStatus] = useState<Record<string, Status>>({});

  const parse = (s: string | undefined) => {
    if (s == null || s.trim() === "") return null;
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) ? n : NaN;
  };

  const commit = async (athleteId: string, attempt: number) => {
    const k = `${athleteId}:${attempt}`;
    const raw = values[k] ?? "";
    if ((saved[k] ?? "") === raw) return;
    const n = parse(raw);
    if (Number.isNaN(n)) return setStatus((s) => ({ ...s, [k]: "error" }));
    setStatus((s) => ({ ...s, [k]: "saving" }));
    const res = await saveAttempt(eventId, athleteId, test.id, attempt, n).catch(() => ({ ok: false }));
    setStatus((s) => ({ ...s, [k]: res.ok ? "saved" : "error" }));
    if (res.ok) setSaved((s) => ({ ...s, [k]: raw }));
  };

  const ring = (st?: Status) =>
    st === "error" ? "border-accent" : st === "saved" ? "border-ok/60 bg-ok/10" : st === "saving" ? "border-border opacity-60" : "border-border";

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="grid grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_minmax(0,0.9fr)] items-center gap-2 border-b border-border px-3 py-2 text-xs text-muted">
        <span>Athlete</span>
        {Array.from({ length: ATTEMPTS }, (_, i) => (
          <span key={i} className="text-center">
            Try {i + 1}
          </span>
        ))}
        <span className="text-right">Best</span>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((r) => {
          const nums = Array.from({ length: ATTEMPTS }, (_, i) => parse(values[`${r.id}:${i + 1}`])).filter((n): n is number => n != null && !Number.isNaN(n));
          const b = best(nums, test.higher_is_better);
          return (
            <li key={r.id} className="grid grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_minmax(0,0.9fr)] items-center gap-2 px-3 py-2">
              <span className="truncate text-sm font-medium">{r.name}</span>
              {Array.from({ length: ATTEMPTS }, (_, i) => {
                const k = `${r.id}:${i + 1}`;
                return (
                  <input
                    key={k}
                    value={values[k] ?? ""}
                    onChange={(e) => {
                      setValues((v) => ({ ...v, [k]: e.target.value }));
                      setStatus((s) => ({ ...s, [k]: undefined as unknown as Status }));
                    }}
                    onBlur={() => commit(r.id, i + 1)}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    inputMode="decimal"
                    enterKeyHint="next"
                    aria-label={`${r.name} ${test.name} try ${i + 1}`}
                    className={`h-11 w-full min-w-0 rounded-lg border bg-surface-2 text-center text-base font-semibold tabular-nums outline-none focus:border-accent ${ring(status[k])}`}
                  />
                );
              })}
              <span className="text-right text-sm font-bold tabular-nums">{b == null ? "–" : fmt(b, test.decimals)}</span>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-border px-3 py-2 text-xs text-muted">
        In {test.unit}. {test.higher_is_better ? "Highest" : "Lowest"} try counts. Saved when you leave a field (green). Clear a field to remove that try.
      </p>
    </div>
  );
}
