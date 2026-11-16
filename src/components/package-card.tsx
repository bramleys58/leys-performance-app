import Link from "next/link";
import { type ClientPackage, type PackageState, euro } from "@/lib/business";

const nice = (day: string) => new Date(day + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** One package with its state: sessions left, dates, paid or not. */
export function PackageSummary({ p, s, name, href }: { p: ClientPackage; s: PackageState; name?: string; href?: string }) {
  const title = name ? `${name} · ${p.name}` : p.name;
  return (
    <div className="min-w-0">
      <p className="font-medium">{href ? <Link href={href} className="hover:underline">{title}</Link> : title}</p>
      <p className="text-sm text-muted">
        {[
          p.kind === "sessions" && p.sessions_total ? `${s.used} of ${p.sessions_total} used` : "subscription",
          p.price != null ? euro(Number(p.price)) + (p.paid_on ? ` paid ${nice(p.paid_on)}` : " unpaid") : null,
          `from ${nice(p.start_date)}`,
          p.end_date ? `${p.kind === "subscription" ? "renews" : "until"} ${nice(p.end_date)}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {s.alerts.length > 0 && <p className="text-sm text-accent">{s.alerts.join(" · ")}</p>}
      {p.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{p.notes}</p>}
    </div>
  );
}
