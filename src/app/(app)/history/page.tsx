import Link from "next/link";
import { BackLink, Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getMyAthlete } from "@/lib/athlete";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "History | Leys Performance" };

export default async function HistoryPage() {
  const user = await requireUser();
  const athlete = await getMyAthlete();
  const home = user.role === "coach" ? "/me" : "/";
  const supabase = await createClient();
  const { data: logs } = athlete
    ? await supabase
        .from("workout_logs")
        .select("id, session_name, performed_on, finished_at, session_rpe, set_logs(count)")
        .eq("athlete_id", athlete.id)
        .order("performed_on", { ascending: false })
        .limit(60)
    : { data: [] };

  const fmt = (d: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(new Date(d + "T12:00:00Z"));

  return (
    <div className="space-y-5">
      <BackLink href={home}>Today</BackLink>
      <h1 className="text-2xl font-bold">Workout history</h1>
      {(logs ?? []).length === 0 ? (
        <Card>
          <p className="text-sm text-muted">No workouts logged yet.</p>
        </Card>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {(logs ?? []).map((l) => {
            const sets = (l.set_logs as unknown as { count: number }[])?.[0]?.count ?? 0;
            return (
              <li key={l.id}>
                <Link href={`/workout/${l.id}`} className="flex items-center justify-between px-4 py-3">
                  <span>
                    <span className="block font-medium">{l.session_name ?? "Workout"}</span>
                    <span className="block text-sm text-muted">
                      {fmt(l.performed_on)} · {sets} sets{l.session_rpe ? ` · RPE ${l.session_rpe}` : ""}
                    </span>
                  </span>
                  <span className={`text-sm ${l.finished_at ? "text-ok" : "text-muted"}`}>{l.finished_at ? "✓" : "in progress"}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
