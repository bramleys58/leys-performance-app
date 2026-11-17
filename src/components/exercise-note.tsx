"use client";

import { useState } from "react";
import { saveExerciseNote } from "@/app/(app)/athlete-actions";

/** A short note on one exercise of a workout: how it felt. Saves when the field loses focus. */
export function ExerciseNote(props: { workoutLogId: string; athleteId: string; rowKey: string; exerciseId: string | null; name: string; open: boolean; initial: string; last: string | null }) {
  const open = props.open || props.initial !== "";
  const [text, setText] = useState(props.initial);
  const [saved, setSaved] = useState(props.initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const save = async () => {
    if (text.trim() === saved.trim()) return;
    setState("saving");
    try {
      const res = await saveExerciseNote({ workoutLogId: props.workoutLogId, athleteId: props.athleteId, rowKey: props.rowKey, exerciseId: props.exerciseId, note: text });
      if (!res.ok) throw new Error();
      setSaved(text);
      setState("saved");
    } catch {
      setState("error");
    }
  };

  return (
    <div className={open || props.last ? "mt-2" : ""}>
      {props.last && !open && <p className="mb-1 text-xs text-muted">Last time: “{props.last}”</p>}
      {open ? (
        <>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setState("idle");
            }}
            onBlur={save}
            rows={1}
            maxLength={500}
            autoFocus={props.initial === ""}
            aria-label={`Note on ${props.name}`}
            placeholder={props.last ? `Last time: ${props.last}` : "How did it feel? Too heavy, too easy, any pain…"}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <p className="text-xs text-muted" aria-live="polite">
            {state === "saving" ? "Saving…" : state === "saved" ? "Note saved" : state === "error" ? "Not saved, check your connection and tap outside again" : ""}
          </p>
        </>
      ) : null}
    </div>
  );
}
