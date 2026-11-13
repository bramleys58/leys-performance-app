"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { useFormStatus } from "react-dom";

function Spinner() {
  return <span aria-hidden className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]" />;
}

/**
 * A form button that reacts the moment it is pressed: it shows a spinner and
 * every button in the same form is locked until the action has finished.
 */
export function ActionButton({ children, className = "", pendingLabel, onClick, disabled, ...props }: ComponentProps<"button"> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  // "pressed" = this button was clicked and its form is about to send or is sending.
  const [pressed, setPressed] = useState(false);
  const [sent, setSent] = useState(false);

  if (pressed && pending && !sent) setSent(true);
  if (pressed && sent && !pending) {
    setPressed(false);
    setSent(false);
  }

  // If the form never starts sending (for example the browser blocked it), stop the spinner.
  useEffect(() => {
    if (!pressed || sent) return;
    const t = setTimeout(() => setPressed(false), 4000);
    return () => clearTimeout(t);
  }, [pressed, sent]);

  const busy = pressed;

  return (
    <button
      {...props}
      // Not "disabled" while busy: disabling a button inside its own click stops the browser from sending the form.
      disabled={disabled || (pending && !busy)}
      aria-busy={busy}
      aria-disabled={busy || undefined}
      onClick={(e) => {
        if (busy) {
          e.preventDefault(); // ignore double taps
          return;
        }
        const btn = e.currentTarget;
        const form = btn.form;
        const skipChecks = btn.formNoValidate || form?.noValidate;
        // Only show the spinner when the form will actually be sent.
        if (btn.type !== "button" && (!form || skipChecks || form.checkValidity())) setPressed(true);
        onClick?.(e);
      }}
      className={`${className} transition active:scale-[0.98] disabled:cursor-wait ${pending && !busy ? "opacity-50" : ""}`}
    >
      {busy ? (
        <span className="inline-flex items-center justify-center gap-2">
          <Spinner />
          {pendingLabel ?? children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}

export function PrimaryButton({ className = "", ...props }: ComponentProps<typeof ActionButton>) {
  return <ActionButton {...props} className={`w-full rounded-xl bg-accent px-4 py-3 text-base font-semibold text-accent-text ${className}`} />;
}

export function SecondaryButton({ className = "", ...props }: ComponentProps<typeof ActionButton>) {
  return <ActionButton {...props} className={`w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-base font-medium text-text ${className}`} />;
}
