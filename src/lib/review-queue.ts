import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Exercises waiting for the coach: added by an athlete and not approved yet, or marked for a
 * check (marks set automatically during the import are left out). Alphabetical.
 */
export async function reviewQueue(db: SupabaseClient, excludeId?: string) {
  let q = db
    .from("exercises")
    .select("id, name")
    .eq("archived", false)
    .or("approved.eq.false,and(needs_review.eq.true,or(review_note.is.null,review_note.not.ilike.*automatically*))")
    .order("name");
  if (excludeId) q = q.neq("id", excludeId);
  const { data } = await q;
  return data ?? [];
}

/** Where to go after handling one exercise from the queue: the next one, or the list when done. */
export async function nextInQueue(db: SupabaseClient, doneId: string, doneName: string) {
  const left = await reviewQueue(db, doneId);
  // Carry on alphabetically after the one just done, wrapping round to the start.
  const next = left.find((e) => e.name.localeCompare(doneName) > 0) ?? left[0];
  return next ? `/library/${next.id}?queue=1&saved=1` : "/library?review=check&queue_done=1";
}
