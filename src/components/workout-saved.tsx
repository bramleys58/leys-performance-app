import Link from "next/link";
import { ChatComposer } from "@/components/chat-composer";
import { createClient } from "@/lib/supabase/server";

/** One line after finishing a workout: saved, how many sets, and a link to the full summary. */
export async function WorkoutSaved({ logId, message = false }: { logId: string | undefined; message?: boolean }) {
  if (!logId || !/^[0-9a-f-]{36}$/i.test(logId)) return null;
  const supabase = await createClient();
  const [{ data }, { count }] = await Promise.all([
    supabase.from("workout_logs").select("id, session_name, finished_at").eq("id", logId).maybeSingle(),
    supabase.from("set_logs").select("id", { count: "exact", head: true }).eq("workout_log_id", logId).eq("skipped", false),
  ]);
  if (!data?.finished_at) return null;
  const sets = count ?? 0;
  const saved = (
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
  if (!message) return saved;
  // Right after a workout is when questions and form videos come up.
  return (
    <div className="space-y-2">
      {saved}
      <div className="rounded-2xl border border-border bg-surface px-4 py-3">
        <p className="mb-2 text-sm text-muted">Anything for your coach? A question, how it felt, or a video of a set.</p>
        <ChatComposer workoutLogId={data.id} placeholder="Message your coach…" compact sentNote={<>Sent to your coach ✓ <Link href="/chat" className="underline">Open chat</Link></>} />
      </div>
    </div>
  );
}
