"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Hit = { id: string; name: string; movement_pattern: string | null; equipment: string | null };

/**
 * Type an exercise name. Matches from the library (names and aliases) appear
 * below; picking one links the row to the library. A name that is not in the
 * library is fine too: it is added to the library when the row is saved.
 */
export function ExercisePicker() {
  const [value, setValue] = useState("");
  const [picked, setPicked] = useState<Hit | null>(null);
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const latest = useRef(0);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2 || (picked && picked.name === value)) return;
    const ticket = ++latest.current;
    const timer = setTimeout(async () => {
      const { data } = await createClient().rpc("search_exercises", { q });
      if (ticket === latest.current) {
        setHits((data ?? []) as Hit[]);
        setOpen(true);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [value, picked]);

  const visible = open && value.trim().length >= 2;

  return (
    <div className="relative">
      <input type="hidden" name="exercise_id" value={picked && picked.name === value ? picked.id : ""} />
      <input
        name="display_name"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setPicked(null);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => hits.length > 0 && setOpen(true)}
        placeholder="Exercise name"
        autoComplete="off"
        required
        className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 outline-none placeholder:text-muted focus:border-accent"
      />
      {visible && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-border bg-surface shadow-xl">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setPicked(h);
                  setValue(h.name);
                  setOpen(false);
                }}
                className="block w-full px-4 py-2.5 text-left hover:bg-surface-2"
              >
                <span className="block font-medium">{h.name}</span>
                <span className="block text-xs text-muted">
                  {[h.movement_pattern, h.equipment].filter(Boolean).join(" · ") || "No details yet"}
                </span>
              </button>
            </li>
          ))}
          {hits.length === 0 && (
            <li className="px-4 py-2.5 text-sm text-muted">Not in the library. It will be added as a new exercise.</li>
          )}
        </ul>
      )}
    </div>
  );
}
