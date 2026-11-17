import Link from "next/link";
import { Card, Field, Notice, PrimaryButton, Select } from "@/components/ui";
import { requireCoach } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAthlete } from "../coach-actions";

export const metadata = { title: "Athletes | Leys Performance" };

type GroupKey = "online" | "in_person" | "logging";
const GROUPS: { key: GroupKey; label: string }[] = [
  { key: "online", label: "Online" },
  { key: "in_person", label: "In person" },
  { key: "logging", label: "Logging only" },
];
const groupOf = (a: {
  is_in_person: boolean;
  tracking_only: boolean;
}): GroupKey =>
  a.tracking_only ? "logging" : a.is_in_person ? "in_person" : "online";

export default async function AthletesPage({
  searchParams,
}: PageProps<"/athletes">) {
  await requireCoach();
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  const showAll = params.all === "1";
  const groupParam = typeof params.group === "string" ? params.group : "all";
  const group: GroupKey | "all" = GROUPS.some((g) => g.key === groupParam)
    ? (groupParam as GroupKey)
    : "all";
  const q = typeof params.q === "string" ? params.q.trim() : "";

  const supabase = await createClient();
  let query = supabase
    .from("athletes")
    .select(
      "id, full_name, sport, status, is_in_person, tracking_only, user_id, email",
    )
    .order("full_name");
  if (!showAll) query = query.eq("status", "active");
  const { data: all } = await query;
  const everyone = all ?? [];
  const counts = Object.fromEntries(
    GROUPS.map((g) => [
      g.key,
      everyone.filter((a) => groupOf(a) === g.key).length,
    ]),
  ) as Record<GroupKey, number>;
  const needle = q.toLowerCase();
  const athletes = everyone.filter(
    (a) =>
      (group === "all" || groupOf(a) === group) &&
      (!needle ||
        a.full_name.toLowerCase().includes(needle) ||
        (a.sport ?? "").toLowerCase().includes(needle)),
  );
  // "All" is split into the three groups; one group or a search is a single list.
  const sections =
    group === "all" && !needle
      ? GROUPS.map((g) => ({
          ...g,
          list: athletes.filter((a) => groupOf(a) === g.key),
        })).filter((s) => s.list.length > 0)
      : [{ key: group, label: "", list: athletes }];
  const href = (g: string) => {
    const sp = new URLSearchParams();
    if (g !== "all") sp.set("group", g);
    if (showAll) sp.set("all", "1");
    const s = sp.toString();
    return `/athletes${s ? "?" + s : ""}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <h1 className="text-2xl font-bold">Athletes</h1>
        <Link
          href={`/athletes?${new URLSearchParams({ ...(group !== "all" ? { group } : {}), ...(showAll ? {} : { all: "1" }) }).toString()}`}
          className="text-sm text-muted hover:text-text"
        >
          {showAll ? "Active only" : "Show paused and archived"}
        </Link>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Groups">
        {[
          { key: "all", label: "All", n: everyone.length },
          ...GROUPS.map((g) => ({
            key: g.key,
            label: g.label,
            n: counts[g.key],
          })),
        ].map((t) => (
          <Link
            key={t.key}
            href={href(t.key)}
            aria-current={group === t.key ? "page" : undefined}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${group === t.key ? "border-accent bg-accent/10 text-text" : "border-border text-muted"}`}
          >
            {t.label} <span className="tabular-nums text-muted">{t.n}</span>
          </Link>
        ))}
      </nav>

      <form className="flex gap-2" role="search">
        {group !== "all" && <input type="hidden" name="group" value={group} />}
        {showAll && <input type="hidden" name="all" value="1" />}
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by name or sport"
          aria-label="Search athletes"
          className="min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-4 py-2.5 outline-none focus:border-accent"
        />
        {q && (
          <Link
            href={href(group)}
            className="rounded-xl border border-border px-3 py-2.5 text-sm text-muted"
          >
            Clear
          </Link>
        )}
      </form>

      {athletes.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">
            {everyone.length === 0
              ? "No athletes yet. Add the first one below."
              : "No athletes match."}
          </p>
        </Card>
      ) : (
        sections.map((sec) => (
          <section key={sec.key} className="space-y-2">
            {sec.label && (
              <h2 className="text-xs font-semibold tracking-[0.2em] text-muted">
                {sec.label.toUpperCase()} · {sec.list.length}
              </h2>
            )}
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
              {sec.list.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/athletes/${a.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{a.full_name}</p>
                      <p className="truncate text-sm text-muted">
                        {[
                          a.sport,
                          group === "all" && !needle
                            ? null
                            : GROUPS.find((g) => g.key === groupOf(a))?.label,
                          a.status !== "active" ? a.status : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted">
                      {a.user_id
                        ? "has login"
                        : a.email
                          ? "not logged in yet"
                          : "no login"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <Card>
        <h2 className="font-semibold">Add an athlete</h2>
        <form action={createAthlete} className="mt-4 space-y-4">
          {error && <Notice kind="error">{error}</Notice>}
          <Field label="Full name" name="full_name" required />
          <Field
            label="Email (only needed if they get a login)"
            name="email"
            type="email"
          />
          <Field label="Sport" name="sport" />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Unit" name="unit" defaultValue="kg">
              <option value="kg">kg</option>
              <option value="lbs">lbs</option>
            </Select>
            <Select
              label="Coaching notes in"
              name="notes_language"
              defaultValue="en"
            >
              <option value="en">English</option>
              <option value="nl">Dutch</option>
            </Select>
          </div>
          <Select
            label="Group"
            name="group"
            defaultValue={group === "all" ? "online" : group}
          >
            <option value="online">Online client</option>
            <option value="in_person">In-person client</option>
            <option value="logging">
              Logging only (independent, no check-ins)
            </option>
          </Select>
          <PrimaryButton type="submit">Add athlete</PrimaryButton>
        </form>
      </Card>
    </div>
  );
}
