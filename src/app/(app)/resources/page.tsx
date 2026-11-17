import { ResourceForm } from "@/components/resource-form";
import { ActionButton, Card, Notice } from "@/components/ui";
import { getMyAthlete } from "@/lib/athlete";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { deleteResource } from "../coach-actions";

export const metadata = { title: "Resources | Leys Performance" };

type R = { id: string; title: string; description: string | null; category: string; kind: "file" | "link"; url: string | null; file_name: string | null; file_size: number | null; athlete_id: string | null; created_at: string };

const DEFAULT_CATEGORIES = ["General", "Nutrition", "Training", "Mobility", "Recovery", "Mindset"];

const size = (n: number | null) => (n == null ? "" : n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const host = (u: string | null) => {
  try {
    return u ? new URL(u).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
};
const typeOf = (r: R) => (r.kind === "link" ? (/youtu/.test(host(r.url)) ? "Video" : "Link") : (r.file_name?.split(".").pop() ?? "File").toUpperCase());

/** Guides and links: athletes see what is shared with them, the coach also adds and removes. */
export default async function ResourcesPage({ searchParams }: PageProps<"/resources">) {
  const user = await requireUser();
  const sp = await searchParams;
  const isCoach = user.role === "coach";
  const supabase = await createClient();
  if (!isCoach) await getMyAthlete();

  const [{ data }, { data: athleteData }] = await Promise.all([
    supabase.from("resources").select("*").order("category").order("created_at", { ascending: false }),
    isCoach ? supabase.from("athletes").select("id, full_name").eq("status", "active").order("full_name") : Promise.resolve({ data: [] }),
  ]);
  const list = (data ?? []) as R[];
  const athletes = (athleteData ?? []) as { id: string; full_name: string }[];
  const nameOf = new Map(athletes.map((a) => [a.id, a.full_name]));
  const categories = [...new Set([...list.map((r) => r.category), ...DEFAULT_CATEGORIES])];
  const groups = [...new Set(list.map((r) => r.category))].map((c) => ({ category: c, items: list.filter((r) => r.category === c) }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Resources</h1>
        <p className="mt-1 text-sm text-muted">{isCoach ? "Guides, PDFs and links for your athletes. Athletes find them under Resources in their menu." : "Guides and links from your coach."}</p>
      </div>
      {sp.saved && <Notice kind="ok">Saved.</Notice>}
      {typeof sp.error === "string" && <Notice kind="error">{sp.error}</Notice>}

      {list.length === 0 && (
        <Card>
          <p className="text-sm text-muted">{isCoach ? "Nothing shared yet. Add your first guide below." : "Nothing here yet."}</p>
        </Card>
      )}

      {groups.map((g) => (
        <section key={g.category} className="space-y-2">
          <h2 className="text-xs font-semibold tracking-[0.2em] text-muted">{g.category.toUpperCase()}</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {g.items.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <a href={`/resources/${r.id}/open`} target="_blank" rel="noopener" className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex h-10 w-12 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-[11px] font-semibold text-muted">{typeOf(r).slice(0, 4)}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.title}</span>
                    <span className="block truncate text-sm text-muted">
                      {[r.description, r.kind === "link" ? host(r.url) : size(r.file_size), isCoach ? (r.athlete_id ? `only ${nameOf.get(r.athlete_id) ?? "one athlete"}` : "all athletes") : null].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </a>
                {isCoach && (
                  <details className="shrink-0 text-xs text-muted">
                    <summary className="cursor-pointer list-none px-1">Remove</summary>
                    <form action={deleteResource.bind(null, r.id)} className="mt-2 flex items-center gap-2">
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" required /> Sure
                      </label>
                      <ActionButton className="rounded-lg border border-border px-2.5 py-1.5 text-accent">Remove</ActionButton>
                    </form>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {isCoach && (
        <Card>
          <h2 className="mb-3 font-semibold">Add a resource</h2>
          <ResourceForm key={list.length} categories={categories} athletes={athletes} />
        </Card>
      )}
    </div>
  );
}
