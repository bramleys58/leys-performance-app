"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getMyAthlete } from "@/lib/athlete";
import { extraRow, type LoggerRow } from "@/lib/logger-types";
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
  sessionExerciseId: string | null; // a planned row
  workoutExerciseId: string | null; // or an exercise added during the workout
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
      workout_exercise_id: input.workoutExerciseId,
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
    { onConflict: input.workoutExerciseId ? "workout_log_id,workout_exercise_id,set_number" : "workout_log_id,session_exercise_id,set_number" },
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
  const name = String(fd.get("session_name") ?? "").trim();

  await supabase
    .from("workout_logs")
    .update({
      finished_at: new Date().toISOString(),
      session_rpe: rpe >= 1 && rpe <= 10 ? rpe : null,
      felt: felt || null,
      comment: comment || null,
      ...(name ? { session_name: name.slice(0, 80) } : {}),
    })
    .eq("id", logId);

  // A different date (for a workout logged afterwards). Never in the future.
  const date = String(fd.get("performed_on") ?? "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(date) && date <= todayISO()) {
    await supabase.from("workout_logs").update({ performed_on: date }).eq("id", logId);
  }

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
export async function deleteSet(workoutLogId: string, rowId: string, source: "plan" | "extra", setNumber: number): Promise<{ ok: boolean }> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("set_logs")
    .delete()
    .eq("workout_log_id", workoutLogId)
    .eq(source === "extra" ? "workout_exercise_id" : "session_exercise_id", rowId)
    .eq("set_number", setNumber);
  return { ok: !error };
}

// ------------------------------------------------------------- free workouts

/** Starts an empty workout for today. Exercises are added while training. */
export async function startFreeWorkout(fd: FormData) {
  const user = await requireUser();
  const supabase = await createClient();
  const athleteId = user.role === "coach" ? String(fd.get("athlete_id") ?? "") || null : ((await getMyAthlete())?.id ?? null);
  if (!athleteId) redirect("/");

  const { data, error } = await supabase
    .from("workout_logs")
    .insert({
      athlete_id: athleteId,
      session_id: null,
      session_name: "Free workout",
      performed_on: todayISO(),
      started_at: new Date().toISOString(),
      logged_by: user.id,
    })
    .select("id")
    .single();
  if (error || !data) redirect("/?error=" + encodeURIComponent("Could not start the workout."));
  redirect(`/workout/${data.id}`);
}

/** Adds an exercise to a workout that is in progress and returns it ready for the logging screen. */
export async function addWorkoutExercise(workoutLogId: string, exerciseId: string | null, name: string, supersetGroup: string | null = null): Promise<LoggerRow | null> {
  const user = await requireUser();
  const supabase = await createClient();
  const display = name.trim().slice(0, 120);
  if (!display) return null;

  const { data: log } = await supabase.from("workout_logs").select("id, athlete_id, performed_on").eq("id", workoutLogId).maybeSingle();
  if (!log) return null;

  let exId = exerciseId;
  if (!exId) {
    // A typed name: reuse the library exercise with that exact name, or (coach only) add it to the library.
    const { data: existing } = await supabase.from("exercises").select("id").ilike("name", display.replace(/[%_\\]/g, "\\$&")).maybeSingle();
    if (existing) exId = existing.id;
    else if (user.role === "coach") {
      const { data: created } = await supabase.from("exercises").insert({ name: display, needs_review: true }).select("id").single();
      exId = created?.id ?? null;
    }
  }

  const { count } = await supabase.from("workout_exercises").select("id", { count: "exact", head: true }).eq("workout_log_id", workoutLogId);
  const { data: row, error } = await supabase
    .from("workout_exercises")
    .insert({
      workout_log_id: workoutLogId,
      athlete_id: log.athlete_id,
      exercise_id: exId,
      display_name: display,
      position: count ?? 0,
      superset_group: supersetGroup?.toUpperCase().slice(0, 2) || null,
    })
    .select("id, exercise_id, display_name, position, superset_group")
    .single();
  if (error || !row) return null;

  const [{ data: info }, { data: previous }] = await Promise.all([
    exId ? supabase.from("exercises").select("tracking_type, weight_step, video_url").eq("id", exId).maybeSingle() : Promise.resolve({ data: null }),
    exId ? supabase.rpc("previous_sets", { p_athlete: log.athlete_id, p_exercises: [exId], p_before: log.performed_on, p_exclude: log.id }) : Promise.resolve({ data: [] }),
  ]);
  return extraRow(row, info, previous ?? [], 3);
}

/** Removes an exercise that was added during the workout, with its sets. */
export async function removeWorkoutExercise(id: string): Promise<{ ok: boolean }> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("workout_exercises").delete().eq("id", id);
  return { ok: !error };
}

/** Throws away an unfinished workout. */
export async function discardWorkout(fd: FormData) {
  await requireUser();
  const supabase = await createClient();
  const logId = String(fd.get("workout_log_id"));
  const back = String(fd.get("back") ?? "/");
  await supabase.from("workout_logs").delete().eq("id", logId).is("finished_at", null);
  revalidatePath("/");
  redirect(back.startsWith("/") && !back.startsWith("//") ? back : "/");
}

/** Puts added exercises in (or out of) a superset. Only exercises added during a workout can change. */
export async function setSupersetGroups(updates: { id: string; group: string | null; position?: number }[]): Promise<{ ok: boolean }> {
  await requireUser();
  const supabase = await createClient();
  const results = await Promise.all(
    updates.map((u) =>
      supabase
        .from("workout_exercises")
        .update({ superset_group: u.group?.toUpperCase().slice(0, 2) || null, ...(u.position != null ? { position: u.position } : {}) })
        .eq("id", u.id),
    ),
  );
  return { ok: results.every((r) => !r.error) };
}
