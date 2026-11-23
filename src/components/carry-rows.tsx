"use client";

import { useEffect, useRef } from "react";

/**
 * Put inside any form on the session editor. When that form is sent, everything typed in the
 * exercise list (form "rows") goes along, so adding an exercise or saving the session details
 * saves those edits too instead of dropping them.
 */
export function CarryRows({ from = "rows" }: { from?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const carry = (e: FormDataEvent) => {
      const src = document.getElementById(from);
      if (!(src instanceof HTMLFormElement) || src === form) return;
      for (const [k, v] of new FormData(src)) {
        // Only the row fields (name__rowId) and the list of rows, never this form's own fields.
        if (typeof v === "string" && (k.includes("__") || k === "row_ids") && !e.formData.has(k)) e.formData.append(k, v);
      }
    };
    form.addEventListener("formdata", carry);
    return () => form.removeEventListener("formdata", carry);
  }, [from]);
  return <span ref={ref} hidden />;
}
