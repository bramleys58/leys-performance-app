import { createClient } from "@/lib/supabase/server";

export type ToReview = {
  id: string;
  athleteId: string;
  athleteName: string;
  sessionName: string;
  performedOn: string;
  comment: string | null;
  sessionRpe: number | null;
  sets: number;
};

/**
 * Finished workouts of the last 14 days that the coach has not looked at yet.
 * Leaves out the coach's own training and sessions the coach logged for a client
 * (the coach was there).
 */
export async function getWorkoutsToReview(coachUserId: string, limit = 50): Promise<ToReview[]> {
  const supabase = await createClient();
  const since = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("workout_logs")
    .select("id, athlete_id, session_name, performed_on, comment, session_rpe, logged_by, athletes!inner(full_name, user_id, status), workout_reviews(workout_log_id), set_logs(count)")
    .not("finished_at", "is", null)
    .gte("performed_on", since)
    .eq("athletes.status", "active")
    .order("performed_on", { ascending: false })
    .limit(300);
  type Row = {
    id: string;
    athlete_id: string;
    session_name: string | null;
    performed_on: string;
    comment: string | null;
    session_rpe: number | null;
    logged_by: string | null;
    athletes: { full_name: string; user_id: string | null };
    workout_reviews: { workout_log_id: string }[] | { workout_log_id: string } | null;
    set_logs: { count: number }[];
  };
  const reviewed = (r: Row) => (Array.isArray(r.workout_reviews) ? r.workout_reviews.length > 0 : r.workout_reviews != null);
  return ((data ?? []) as unknown as Row[])
    .filter((r) => !reviewed(r) && r.athletes.user_id !== coachUserId && r.logged_by !== coachUserId)
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      athleteId: r.athlete_id,
      athleteName: r.athletes.full_name,
      sessionName: r.session_name ?? "Workout",
      performedOn: r.performed_on,
      comment: r.comment,
      sessionRpe: r.session_rpe,
      sets: r.set_logs?.[0]?.count ?? 0,
    }));
}
