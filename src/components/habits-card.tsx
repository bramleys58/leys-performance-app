"use client";

import { useState, useTransition } from "react";
import { toggleHabit } from "@/app/(app)/athlete-actions";

type Habit = { id: string; name: string; target_per_week: number };

const LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

/** This week's habits as tap-to-tick days. Today and earlier days can be ticked, later days cannot. */
export function HabitsCard({ habits, done, week, today }: { habits: Habit[]; done: Record<string, string[]>; week: string[]; today: string }) {
  const [state, setState] = useState<Record<string, string[]>>(done);
  const [failed, setFailed] = useState(false);
  const [, start] = useTransition();

  const toggle = (habitId: string, day: string) => {
    const was = (state[habitId] ?? []).includes(day);
    const next = (s: Record<string, string[]>, on: boolean) => ({ ...s, [habitId]: on ? [...(s[habitId] ?? []), day] : (s[habitId] ?? []).filter((d) => d !== day) });
    setState((s) => next(s, !was));
    setFailed(false);
    start(async () => {
      let ok = false;
      try {
        ok = (await toggleHabit(habitId, day, !was)).ok;
      } catch {
        ok = false;
      }
      if (!ok) {
        setState((s) => next(s, was));
        setFailed(true);
      }
    });
  };

  return (
    <section className="rounded-2xl border border-border bg-surface px-5 py-4" aria-labelledby="habits-title">
      <div className="flex items-baseline justify-between">
        <h2 id="habits-title" className="font-semibold">
          Habits this week
        </h2>
        <span className="text-xs text-muted">Tap a day when done</span>
      </div>
      <ul className="mt-3 space-y-3">
        {habits.map((h) => {
          const days = state[h.id] ?? [];
          const count = days.filter((d) => week.includes(d)).length;
          const met = count >= h.target_per_week;
          return (
            <li key={h.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-sm font-medium">{h.name}</span>
                <span className={`shrink-0 text-xs tabular-nums ${met ? "text-ok" : "text-muted"}`}>
                  {count}/{h.target_per_week}
                  {met ? " ✓" : ""}
                </span>
              </div>
              <div className="mt-1.5 grid grid-cols-7 gap-1.5">
                {week.map((d, i) => {
                  const on = days.includes(d);
                  const future = d > today;
                  return (
                    <button
                      key={d}
                      type="button"
                      disabled={future}
                      onClick={() => toggle(h.id, d)}
                      aria-pressed={on}
                      aria-label={`${h.name}, ${new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long" })}${d === today ? " (today)" : ""}: ${on ? "done" : "not done"}`}
                      className={`flex h-10 items-center justify-center rounded-lg border text-xs font-semibold transition-colors ${
                        on ? "border-ok bg-ok text-bg" : future ? "border-border text-muted/40" : "border-border bg-surface-2 text-muted"
                      } ${d === today && !on ? "border-text/60 text-text" : ""}`}
                    >
                      {on ? "✓" : LETTERS[i]}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
      {failed && <p className="mt-2 text-sm text-accent">No connection, that tap was not saved. Try again.</p>}
    </section>
  );
}
