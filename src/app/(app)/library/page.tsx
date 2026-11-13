import Link from "next/link";
import { ActionButton, Card } from "@/components/ui";
import { requireCoach } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Exercise library | Leys Performance" };

const PAGE_SIZE = 50;

const TRACKING_LABEL: Record<string, string> = {
  load: "Load",
  bodyweight_reps: "Bodyweight reps",
  time: "Time",
  distance: "Distance",
  distance_height: "Distance / height",
  reps_only: "Reps only",
  completion: "Completion",
};

function one(v: string | string[] | undefined) {
  return typeof v === "string" ? v : "";
}

export default async function LibraryPage({ searchParams }: PageProps<"/library">) {
  await requireCoach();
  const params = await searchParams;
  const q = one(params.q).trim();
  const pattern = one(params.pattern);
  const review = one(params.review) === "1";
  const novideo = one(params.novideo) === "1";
  const page = Math.max(1, Number.parseInt(one(params.page) || "1", 10) || 1);

  const supabase = await createClient();

  let query = supabase
    .from("exercises")
    .select("id, name, aliases, movement_pattern, equipment, tracking_type, video_url, needs_review", {
      count: "exact",
    })
    .eq("archived", false)
    .order("name")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  // Strip characters that have a meaning in the filter syntax before searching.
  const term = q.replace(/[%_,()\\]/g, " ").trim();
  if (term) query = query.ilike("name", `%${term}%`);
  if (pattern) query = query.eq("movement_pattern", pattern);
  if (review) query = query.eq("needs_review", true);
  if (novideo) query = query.is("video_url", null);

  const [{ data: exercises, count, error }, { data: patternRows }] = await Promise.all([
    query,
    supabase.from("exercises").select("movement_pattern").eq("archived", false).not("movement_pattern", "is", null),
  ]);

  const patterns = [...new Set((patternRows ?? []).map((r) => r.movement_pattern as string))].sort();
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const link = (p: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (pattern) sp.set("pattern", pattern);
    if (review) sp.set("review", "1");
    if (novideo) sp.set("novideo", "1");
    if (p > 1) sp.set("page", String(p));
    const s = sp.toString();
    return s ? `/library?${s}` : "/library";
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <h1 className="text-2xl font-bold">Exercise library</h1>
        <p className="text-sm text-muted tabular-nums">{total} exercises</p>
      </div>

      <form className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by name"
          className="rounded-xl border border-border bg-surface-2 px-4 py-3 outline-none placeholder:text-muted focus:border-accent"
        />
        <select
          name="pattern"
          defaultValue={pattern}
          className="rounded-xl border border-border bg-surface-2 px-4 py-3 outline-none focus:border-accent"
        >
          <option value="">All patterns</option>
          {patterns.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <ActionButton className="rounded-xl bg-accent px-5 py-3 font-semibold text-accent-text">Search</ActionButton>
        <div className="flex gap-5 text-sm text-muted sm:col-span-3">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="review" value="1" defaultChecked={review} /> Needs review
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="novideo" value="1" defaultChecked={novideo} /> No video
          </label>
        </div>
      </form>

      {error && (
        <Card>
          <p className="text-sm text-accent">The library could not be loaded. Check that the database setup has been run.</p>
        </Card>
      )}

      {!error && total === 0 && (
        <Card>
          <p className="text-sm text-muted">No exercises match. Clear the filters, or import the library if this is a new database.</p>
        </Card>
      )}

      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {(exercises ?? []).map((e) => (
          <li key={e.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {e.name}
                {e.needs_review && <span className="ml-2 align-middle text-xs text-accent">review</span>}
              </p>
              <p className="truncate text-sm text-muted">
                {[e.movement_pattern, e.equipment, TRACKING_LABEL[e.tracking_type] ?? e.tracking_type]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {e.aliases?.length > 0 && (
                <p className="truncate text-xs text-muted">Also: {e.aliases.join(", ")}</p>
              )}
            </div>
            {e.video_url ? (
              <a
                href={e.video_url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
              >
                ▶ Watch
              </a>
            ) : (
              <span className="shrink-0 text-xs text-muted">no video</span>
            )}
          </li>
        ))}
      </ul>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={link(page - 1)} className="rounded-lg border border-border px-4 py-2">
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted tabular-nums">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link href={link(page + 1)} className="rounded-lg border border-border px-4 py-2">
              Next
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
