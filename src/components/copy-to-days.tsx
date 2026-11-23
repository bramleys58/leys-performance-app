"use client";

import { useState } from "react";
import { ActionButton } from "@/components/buttons";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Copy button for a session. It opens a calendar of the block (weeks x days, with dates when the
 * block has a start date); tap the days to copy the session to, then copy them all at once.
 */
export function CopyToDays(props: {
  name: string;
  weeks: (number | null)[]; // [null] for a block without week numbers
  newWeek: number | null; // the week after the last one, to start a new week; null when not used
  startMonday: string | null;
  taken: Record<string, string[]>; // "week-weekday" -> session names already there
  action: (fd: FormData) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const rows = props.newWeek ? [...props.weeks, props.newWeek] : props.weeks;
  const dateOf = (week: number | null, day: number) => {
    if (!props.startMonday || week == null) return null;
    const d = new Date(Date.parse(props.startMonday + "T12:00:00Z") + ((week - 1) * 7 + (day - 1)) * 86400000);
    return d.getUTCDate();
  };
  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Copy ${props.name}`}
        className={`rounded-lg border px-2.5 py-1.5 text-xs ${open ? "border-accent text-accent" : "border-border text-muted"}`}
      >
        Copy
      </button>
      {open && (
        <form action={props.action} className="w-full basis-full rounded-xl border border-border bg-surface-2 p-3">
          <p className="text-sm">
            Copy <span className="font-medium">{props.name}</span> to:
          </p>
          <div className="mt-2 grid grid-cols-[2.5rem_repeat(7,1fr)] gap-1 text-center text-xs">
            <span />
            {DAYS.map((d) => (
              <span key={d} className="text-muted">
                {d}
              </span>
            ))}
            {rows.map((w) => (
              <Row key={w ?? 0} w={w} isNew={w != null && w === props.newWeek} />
            ))}
          </div>
          {picked.map((k) => (
            <input key={k} type="hidden" name="slot" value={k} />
          ))}
          <p className="mt-2 text-xs text-muted">A dot means there is already a session that day.</p>
          <div className="mt-3 flex gap-2">
            <ActionButton disabled={picked.length === 0} pendingLabel="Copying…" className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-text disabled:opacity-40">
              {picked.length === 0 ? "Pick one or more days" : `Copy to ${picked.length} day${picked.length === 1 ? "" : "s"}`}
            </ActionButton>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setPicked([]);
              }}
              className="rounded-xl border border-border px-4 py-2.5 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </>
  );

  function Row({ w, isNew }: { w: number | null; isNew: boolean }) {
    return (
      <>
        <span className="self-center text-left text-muted">{w == null ? "Wk" : isNew ? `W${w}+` : `W${w}`}</span>
        {DAYS.map((d, i) => {
          const k = `${w ?? 0}-${i + 1}`;
          const on = picked.includes(k);
          const there = props.taken[k] ?? [];
          const date = dateOf(w, i + 1);
          return (
            <button
              key={d}
              type="button"
              onClick={() => toggle(k)}
              aria-pressed={on}
              aria-label={`${w == null ? "" : `Week ${w} `}${d}${there.length ? `, has ${there.join(", ")}` : ""}`}
              title={there.join(", ") || undefined}
              className={`relative flex h-9 items-center justify-center rounded-lg border text-sm ${on ? "border-accent bg-accent text-accent-text" : "border-border bg-surface"}`}
            >
              {date ?? (on ? "✓" : "")}
              {there.length > 0 && <span className={`absolute bottom-1 h-1 w-1 rounded-full ${on ? "bg-accent-text" : "bg-muted"}`} />}
            </button>
          );
        })}
      </>
    );
  }
}
