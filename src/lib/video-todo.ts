import type { SupabaseClient } from "@supabase/supabase-js";

/** Exercises athletes actually use that still have no video, most used first. */
export async function getVideoTodo(supabase: SupabaseClient) {
  const { data: usage } = await supabase.rpc("exercise_usage");
  const uses = new Map<string, number>(((usage ?? []) as { exercise_id: string; uses: number }[]).map((u) => [u.exercise_id, Number(u.uses)]));
  if (uses.size === 0) return [];
  const ids = [...uses.keys()];
  const rows: { id: string; name: string; movement_pattern: string | null; equipment: string | null }[] = [];
  // In chunks, so the request stays short.
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await supabase
      .from("exercises")
      .select("id, name, movement_pattern, equipment")
      .in("id", ids.slice(i, i + 150))
      .is("video_url", null)
      .eq("archived", false);
    rows.push(...(data ?? []));
  }
  return rows.map((r) => ({ ...r, uses: uses.get(r.id) ?? 0 })).sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name));
}
