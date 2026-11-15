"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * The Sunday pop-up: shown once per app session when the weekly check-in is
 * due and not done. "Later" hides it until the app is opened again.
 */
export function WeeklyPrompt({ weekLabel }: { weekLabel: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem("weekly-prompt") === weekLabel;
    } catch {
      // Storage is unavailable: show the pop-up, it is only a reminder.
    }
    const t = setTimeout(() => setOpen(!dismissed), 0);
    return () => clearTimeout(t);
  }, [weekLabel]);

  const later = () => {
    try {
      sessionStorage.setItem("weekly-prompt", weekLabel);
    } catch {
      // Nothing to remember it with: it simply shows again next time.
    }
    setOpen(false);
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="weekly-title">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl">
        <p className="text-xs font-semibold tracking-[0.2em] text-accent">SUNDAY</p>
        <h2 id="weekly-title" className="mt-1 text-xl font-bold">
          Weekly check-in
        </h2>
        <p className="mt-2 text-sm text-muted">How did the week of {weekLabel} go? Two minutes, and your coach uses it to plan your next week.</p>
        <Link href="/weekly" className="mt-4 block rounded-xl bg-accent px-4 py-3 text-center font-semibold text-accent-text">
          Start check-in
        </Link>
        <button type="button" onClick={later} className="mt-2 w-full rounded-xl border border-border px-4 py-3 text-sm text-muted">
          Later
        </button>
      </div>
    </div>
  );
}
