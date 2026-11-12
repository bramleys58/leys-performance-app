"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getMyAthlete } from "@/lib/athlete";
import { todayISO } from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";

/**
 * Opens today's workout for a session, creating it on first use.
 * An athlete starts their own. A coach passes athlete_id to log for a client.
 */
export async function startWorkout(mode: "now" | "later", fd: FormData) {
  const user = await requireUser();
  const supabase = await createClient();
  const sessionId = String(fd.get("session_id"));
  const later = mode === "later";

  let athleteId: string | null = null;
  if (user.role === "coach") athleteId = String(fd.get("athlete_id") ?? "") || null;
  else athleteId = (await getMyAthlete())?.id ?? null;
  if (!athleteId) redirect("/");

  const { data: session } = await supabase.from("sessions").select("id, name").eq("id", sessionId).maybeSingle();
  if (!session) redirect("/");

  const day = todayISO();
  const { data: existing } = await supabase
    .from("workout_logs")
    .select("id")
    .eq("athlete_id", athleteId)
    .eq("session_id", sessionId)
    .eq("performed_on", day)
    .maybeSingle();

  let logId = existing?.id as string | undefined;
  if (!logId) {
    const { data: created, error } = await supabase
      .from("workout_logs")
      .insert({
        athlete_id: athleteId,
        session_id: sessionId,
        session_name: session.name,
        performed_on: day,
        started_at: later ? null : new Date().toISOString(),
        logged_by: user.id,
      })
      .select("id")
      .single();
    if (error || !created) redirect(`/session/${sessionId}?error=1`);
    logId = created.id;
  }
  redirect(`/workout/${logId}`);
}

export type SetInput = {
  workoutLogId: string;
  athleteId: string;
  sessionExerciseId: string;
  exerciseId: string | null;
  exerciseName: string;
  setNumber: number;
  weight: number | null; // kg
  reps: number | null;
  seconds: number | null;
  distance: number | null;
  rpe: number | null;
  plannedWeight: number | null;
  plannedReps: string | null;
  skipped: boolean;
  skipReason: string | null;
};

/** Saves one set. Saving the same set again replaces it. */
export async function saveSet(input: SetInput): Promise<{ ok: boolean }> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("set_logs").upsert(
    {
      workout_log_id: input.workoutLogId,
      athlete_id: input.athleteId,
      session_exercise_id: input.sessionExerciseId,
      exercise_id: input.exerciseId,
      exercise_name: input.exerciseName,
      set_number: input.setNumber,
      weight: input.weight,
      reps: input.reps,
      seconds: input.seconds,
      distance: input.distance,
      rpe: input.rpe,
      planned_weight: input.plannedWeight,
      planned_reps: input.plannedReps,
      skipped: input.skipped,
      skip_reason: input.skipReason,
      logged_at: new Date().toISOString(),
    },
    { onConflict: "workout_log_id,session_exercise_id,set_number" },
  );
  return { ok: !error };
}

export async function finishWorkout(fd: FormData) {
  await requireUser();
  const supabase = await createClient();
  const logId = String(fd.get("workout_log_id"));
  const rpe = Number.parseInt(String(fd.get("session_rpe") ?? ""), 10);
  const comment = String(fd.get("comment") ?? "").trim();
  const felt = String(fd.get("felt") ?? "").trim();

  await supabase
    .from("workout_logs")
    .update({
      finished_at: new Date().toISOString(),
      session_rpe: rpe >= 1 && rpe <= 10 ? rpe : null,
      felt: felt || null,
      comment: comment || null,
    })
    .eq("id", logId);

  revalidatePath("/");
  revalidatePath(`/workout/${logId}`);
  redirect(`/workout/${logId}`);
}

/** Reopens a finished workout so sets can be corrected. */
export async function reopenWorkout(fd: FormData) {
  await requireUser();
  const supabase = await createClient();
  const logId = String(fd.get("workout_log_id"));
  await supabase.from("workout_logs").update({ finished_at: null }).eq("id", logId);
  revalidatePath(`/workout/${logId}`);
  redirect(`/workout/${logId}`);
}

/** Removes one logged set (un-ticking it on the logging screen). */
export async function deleteSet(workoutLogId: string, sessionExerciseId: string, setNumber: number): Promise<{ ok: boolean }> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("set_logs")
    .delete()
    .eq("workout_log_id", workoutLogId)
    .eq("session_exercise_id", sessionExerciseId)
    .eq("set_number", setNumber);
  return { ok: !error };
}
