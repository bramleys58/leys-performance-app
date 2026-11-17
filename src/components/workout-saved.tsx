import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

/** One line after finishing a workout: saved, how many sets, and a link to the full summary. */
export async function WorkoutSaved({ logId }: { logId: string | undefined }) {
  if (!logId || !/^[0-9a-f-]{36}$/i.test(logId)) return null;
  const supabase = await createClient();
  const [{ data }, { count }] = await Promise.all([
    supabase.from("workout_logs").select("id, session_name, finished_at").eq("id", logId).maybeSingle(),
    supabase.from("set_logs").select("id", { count: "exact", head: true }).eq("workout_log_id", logId).eq("skipped", false),
  ]);
  if (!data?.finished_at) return null;
  const sets = count ?? 0;
  return (
    <Link href={`/workout/${data.id}`} className="flex items-center gap-3 rounded-2xl border border-ok/40 bg-ok/10 px-4 py-3">
      <span aria-hidden className="text-lg text-ok">✓</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">Workout saved</span>
        <span className="block truncate text-sm text-muted">
          {data.session_name ?? "Workout"} · {sets} set{sets === 1 ? "" : "s"}
        </span>
      </span>
      <span className="text-sm text-ok">Summary →</span>
    </Link>
  );
}
