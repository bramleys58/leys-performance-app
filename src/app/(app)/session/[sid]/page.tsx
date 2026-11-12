import { notFound } from "next/navigation";
import { BackLink, Card, PrimaryButton, SecondaryButton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { SUPERSET_COLORS, formatTarget, sortRows, supersetLabels, type PlanRow } from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";
import { startWorkout } from "../../athlete-actions";

export default async function SessionPreviewPage({ params, searchParams }: PageProps<"/session/[sid]">) {
  const user = await requireUser();
  const { sid } = await params;
  const sp = await searchParams;
  // A coach opens this page for a client: /session/<id>?athlete=<athlete id>
  const forAthlete = user.role === "coach" && typeof sp.athlete === "string" ? sp.athlete : null;
  const supabase = await createClient();

  const [{ data: session }, { data: rowData }] = await Promise.all([
    supabase.from("sessions").select("*, programs(name, athlete_id)").eq("id", sid).maybeSingle(),
    supabase.from("session_exercises").select("*, exercises(video_url, equipment)").eq("session_id", sid),
  ]);
  if (!session) notFound();

  type Row = PlanRow & { exercises: { video_url: string | null; equipment: string | null } | null };
  const rows = sortRows((rowData ?? []) as Row[]);
  const labels = supersetLabels(rows);
  const equipment = [...new Set(rows.flatMap((r) => (r.exercises?.equipment ?? "").split("+").map((e) => e.trim())).filter((e) => e && e !== "Bodyweight"))];
  const program = session.programs as unknown as { name: string; athlete_id: string } | null;
  const athleteId = forAthlete ?? (user.role === "coach" ? program?.athlete_id ?? null : null);

  const list = (key: "prep" | "workout", title: string) => {
    const items = rows.filter((r) => r.section === key);
    if (items.length === 0) return null;
    return (
      <div>
        <h2 className="mb-2 text-xs font-semibold tracking-[0.2em] text-muted">{title}</h2>
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {items.map((r, i) => {
            const g = (r.superset_group ?? "").toUpperCase();
            const color = SUPERSET_COLORS[g[0]];
            const video = r.video_url ?? r.exercises?.video_url;
            return (
              <li key={r.id} className="flex items-start gap-3 px-4 py-3" style={color ? { borderLeft: `4px solid ${color}` } : undefined}>
                <span className="w-7 shrink-0 pt-0.5 text-sm font-bold" style={{ color: color ?? "var(--muted)" }}>
                  {labels[r.id] ?? i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{r.display_name}</p>
                  <p className="text-sm text-muted">
                    {[r.sets && r.reps ? `${r.sets} × ${r.reps}` : r.sets ? `${r.sets} sets` : r.reps, r.tempo ? `tempo ${r.tempo}` : null, formatTarget(r)]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {r.coaching_note && <p className="mt-1 text-sm text-muted">{r.coaching_note}</p>}
                </div>
                {video && (
                  <a href={video} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
                    ▶
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  const canStart = session.kind !== "slot" && rows.length > 0 && (user.role !== "coach" || athleteId);

  return (
    <div className="space-y-5">
      <BackLink href={user.role === "coach" && athleteId ? `/athletes/${athleteId}` : "/"}>Back</BackLink>
      <div>
        <h1 className="text-2xl font-bold">{session.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {[program?.name, session.session_type, session.estimated_minutes ? `about ${session.estimated_minutes} min` : null, session.is_optional ? "optional" : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      {session.instructions && (
        <Card>
          <p className="whitespace-pre-line text-sm">{session.instructions}</p>
        </Card>
      )}
      {equipment.length > 0 && (
        <p className="text-sm text-muted">
          <span className="font-medium text-text">You need:</span> {equipment.join(", ")}
        </p>
      )}

      {list("prep", "PREP CIRCUIT")}
      {list("workout", session.kind === "routine" ? "ROUTINE" : "WORKOUT")}

      {session.kind === "slot" && (
        <Card>
          <p className="text-sm text-muted">This session is coached in person. There is nothing to log here.</p>
        </Card>
      )}

      {canStart && (
        <form className="sticky bottom-3 space-y-2">
          <input type="hidden" name="session_id" value={sid} />
          {athleteId && <input type="hidden" name="athlete_id" value={athleteId} />}
          <PrimaryButton formAction={startWorkout.bind(null, "now")}>Start workout</PrimaryButton>
          <SecondaryButton formAction={startWorkout.bind(null, "later")}>
            Log it afterwards
          </SecondaryButton>
        </form>
      )}
    </div>
  );
}
