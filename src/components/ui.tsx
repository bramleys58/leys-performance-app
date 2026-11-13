import type { ComponentProps, ReactNode } from "react";

export { ActionButton, PrimaryButton, SecondaryButton } from "./buttons";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-border bg-surface p-5 ${className}`}>{children}</div>
  );
}

export function Field({ label, ...props }: { label: string } & ComponentProps<"input">) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-muted">{label}</span>
      <input
        {...props}
        className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-base text-text outline-none placeholder:text-muted focus:border-accent"
      />
    </label>
  );
}

export function Notice({ kind, children }: { kind: "error" | "ok"; children: ReactNode }) {
  const tone = kind === "error" ? "border-accent/50 text-accent" : "border-ok/50 text-ok";
  return <p className={`rounded-xl border bg-surface-2 px-4 py-3 text-sm ${tone}`}>{children}</p>;
}

export const inputClass =
  "w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-base text-text outline-none placeholder:text-muted focus:border-accent";

export function Select({ label, children, ...props }: { label: string } & ComponentProps<"select">) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-muted">{label}</span>
      <select {...props} className={inputClass + " py-3"}>
        {children}
      </select>
    </label>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="text-sm text-muted hover:text-text">
      ← {children}
    </a>
  );
}
