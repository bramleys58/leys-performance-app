"use server";

import { revalidatePath } from "next/cache";
import { storeKg } from "@/lib/units";
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
  /** When the set was ticked on the phone. Used when it could only be sent later (bad signal). */
  loggedAt?: string;
};

/** Saves one set. Saving the same set again replaces it. */
export async function saveSet(input: SetInput): Promise<{ ok: boolean }> {
  await requireUser();
  // Trust the phone's time only when it is plausible: not in the future, not older than a week.
  const ticked = input.loggedAt ? Date.parse(input.loggedAt) : NaN;
  const now = Date.now();
  const loggedAt = Number.isFinite(ticked) && ticked <= now + 60_000 && ticked > now - 7 * 86_400_000 ? new Date(ticked) : new Date(now);
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
      logged_at: loggedAt.toISOString(),
    },
    { onConflict: input.workoutExerciseId ? "workout_log_id,workout_exercise_id,set_number" : "workout_log_id,session_exercise_id,set_number" },
  );
  return { ok: !error };
}

export async function finishWorkout(fd: FormData) {
  const user = await requireUser();
  const supabase = await createClient();
  const logId = String(fd.get("workout_log_id"));
  const rpe = Number.parseInt(String(fd.get("session_rpe") ?? ""), 10);
  const comment = String(fd.get("comment") ?? "").trim();
  const felt = String(fd.get("felt") ?? "").trim();
  const name = String(fd.get("session_name") ?? "").trim();
  const typed = Number.parseInt(String(fd.get("duration_minutes") ?? ""), 10);
  const duration = typed >= 1 && typed <= 1440 ? typed : null;

  await supabase
    .from("workout_logs")
    .update({
      finished_at: new Date().toISOString(),
      duration_minutes: duration,
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
  revalidatePath("/me");
  revalidatePath(`/workout/${logId}`);
  // Straight back to where they came from, with a short "saved" line there. The summary stays one tap away.
  const { data: who } = await supabase.from("workout_logs").select("athlete_id, athletes!inner(user_id)").eq("id", logId).maybeSingle();
  const ownerUser = (who?.athletes as unknown as { user_id: string | null } | null)?.user_id ?? null;
  if (user.role === "coach" && who && ownerUser !== user.id) redirect(`/athletes/${who.athlete_id}?done=${logId}`);
  redirect(`${user.role === "coach" ? "/me" : "/"}?done=${logId}`);
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
      // The coach's own new exercise goes straight into the library, marked for review.
      const { data: created } = await supabase.from("exercises").insert({ name: display, needs_review: true, created_by: user.id }).select("id").single();
      exId = created?.id ?? null;
    } else {
      // An athlete's new exercise is saved for them and waits for the coach's approval.
      const { data: suggested } = await supabase.rpc("suggest_exercise", { p_name: display });
      exId = (suggested as string | null) ?? null;
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
    exId ? supabase.from("exercises").select("tracking_type, weight_step, video_url, equipment").eq("id", exId).maybeSingle() : Promise.resolve({ data: null }),
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

/** Saves the order of the exercises added during a workout (first id = top). */
export async function setWorkoutOrder(ids: string[]): Promise<{ ok: boolean }> {
  await requireUser();
  const supabase = await createClient();
  const results = await Promise.all(ids.map((id, i) => supabase.from("workout_exercises").update({ position: i }).eq("id", id)));
  return { ok: results.every((r) => !r.error) };
}

// ----------------------------------------------------------------- check-ins

const KG_PER_LB_CHECKIN = 0.45359237;

/** Saves today's check-in (or replaces it). */
export async function saveCheckIn(fd: FormData) {
  const user = await requireUser();
  const supabase = await createClient();
  const athlete = await getMyAthlete();
  const home = user.role === "coach" ? "/me" : "/";
  if (!athlete) redirect(home);

  const scale = (key: string) => {
    const n = Number.parseInt(String(fd.get(key) ?? ""), 10);
    return n >= 1 && n <= 5 ? n : null;
  };
  const number = (key: string) => {
    const raw = String(fd.get(key) ?? "").trim().replace(",", ".");
    const n = Number(raw);
    return raw !== "" && Number.isFinite(n) && n >= 0 ? n : null;
  };

  if (fd.get("consent") === "on") await supabase.rpc("agree_to_check_ins");

  const sleep = number("sleep_hours");
  const weight = number("bodyweight");
  const note = String(fd.get("note") ?? "").trim();
  const { error } = await supabase.from("check_ins").upsert(
    {
      athlete_id: athlete.id,
      day: todayISO(),
      sleep_hours: sleep != null && sleep <= 24 ? sleep : null,
      sleep_quality: scale("sleep_quality"),
      energy: scale("energy"),
      soreness: scale("soreness"),
      stress: scale("stress"),
      bodyweight: weight == null || weight === 0 ? null : storeKg(athlete.unit === "lbs" ? weight * KG_PER_LB_CHECKIN : weight),
      note: note ? note.slice(0, 500) : null,
    },
    { onConflict: "athlete_id,day" },
  );
  if (error) redirect("/check-in?error=1");

  revalidatePath("/");
  revalidatePath("/me");
  redirect(home);
}

// ----------------------------------------------------------- weekly check-in

export async function saveWeeklyCheckIn(fd: FormData) {
  const user = await requireUser();
  const supabase = await createClient();
  const athlete = await getMyAthlete();
  const home = user.role === "coach" ? "/me" : "/";
  if (!athlete) redirect(home);

  const weekStart = String(fd.get("week_start") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) redirect("/weekly?error=1");
  const scale = (key: string) => {
    const n = Number.parseInt(String(fd.get(key) ?? ""), 10);
    return n >= 1 && n <= 5 ? n : null;
  };
  const words = (key: string) => {
    const v = String(fd.get(key) ?? "").trim();
    return v ? v.slice(0, 1000) : null;
  };

  if (fd.get("consent") === "on") await supabase.rpc("agree_to_check_ins");

  const { error } = await supabase.from("weekly_check_ins").upsert(
    {
      athlete_id: athlete.id,
      week_start: weekStart,
      training: scale("training"),
      nutrition: scale("nutrition"),
      recovery: scale("recovery"),
      stress: scale("stress"),
      win: words("win"),
      struggle: words("struggle"),
      pain: words("pain"),
      message: words("message"),
    },
    { onConflict: "athlete_id,week_start" },
  );
  if (error) redirect("/weekly?error=1");

  revalidatePath("/");
  revalidatePath("/me");
  redirect(home + "?weekly=1");
}

/**
 * Replaces a planned exercise by an approved alternative for this workout only,
 * or puts the planned one back (exerciseId null). Not possible once sets are ticked.
 */
export async function swapExercise(workoutLogId: string, sessionExerciseId: string, exerciseId: string | null): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  const supabase = await createClient();
  const { count } = await supabase.from("set_logs").select("id", { count: "exact", head: true }).eq("workout_log_id", workoutLogId).eq("session_exercise_id", sessionExerciseId);
  if ((count ?? 0) > 0) return { ok: false, error: "Un-tick the sets of this exercise first." };

  if (!exerciseId) {
    const { error } = await supabase.from("workout_swaps").delete().eq("workout_log_id", workoutLogId).eq("session_exercise_id", sessionExerciseId);
    revalidatePath(`/workout/${workoutLogId}`);
    return { ok: !error };
  }
  const { data: exercise } = await supabase.from("exercises").select("id, name").eq("id", exerciseId).maybeSingle();
  if (!exercise) return { ok: false, error: "That exercise no longer exists." };
  // The database only accepts alternatives the coach approved.
  const { error } = await supabase
    .from("workout_swaps")
    .upsert({ workout_log_id: workoutLogId, session_exercise_id: sessionExerciseId, exercise_id: exercise.id, exercise_name: exercise.name }, { onConflict: "workout_log_id,session_exercise_id" });
  revalidatePath(`/workout/${workoutLogId}`);
  return error ? { ok: false, error: "Could not swap the exercise." } : { ok: true };
}

// ----------------------------------------------------------------- bodyweight

/** Logs today's (or a chosen day's) bodyweight for the athlete who is logged in. */
export async function logMyBodyweight(fd: FormData) {
  await requireUser();
  const athlete = await getMyAthlete();
  if (!athlete) redirect("/");
  const supabase = await createClient();
  const kg = bodyweightKg(fd, athlete.unit);
  const day = bodyweightDay(fd);
  if (kg == null) redirect("/progress?bw=invalid#bodyweight");
  const { error } = await supabase.from("bodyweights").upsert({ athlete_id: athlete.id, day, kg }, { onConflict: "athlete_id,day" });
  revalidatePath("/progress");
  redirect(`/progress?bw=${error ? "error" : "saved"}#bodyweight`);
}

/** Reads the weight in the athlete's unit and returns kg, or null when it is not a plausible bodyweight. */
function bodyweightKg(fd: FormData, unit: "kg" | "lbs"): number | null {
  const raw = String(fd.get("weight") ?? "").trim().replace(",", ".");
  const n = Number(raw);
  if (raw === "" || !Number.isFinite(n)) return null;
  const kg = unit === "lbs" ? n * KG_PER_LB_CHECKIN : n;
  return kg > 20 && kg < 400 ? storeKg(kg) : null;
}

/** Today, or a chosen day that is not in the future and not older than a year. */
function bodyweightDay(fd: FormData): string {
  const today = todayISO();
  const raw = String(fd.get("day") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || raw > today) return today;
  const yearAgo = new Date(Date.parse(today + "T12:00:00Z") - 365 * 86400000).toISOString().slice(0, 10);
  return raw < yearAgo ? today : raw;
}

// ------------------------------------------------------------------ welcome

/** First login: privacy agreement, unit and an optional first weigh-in. */
export async function finishWelcome(fd: FormData) {
  await requireUser();
  const athlete = await getMyAthlete();
  if (!athlete) redirect("/");
  if (fd.get("agree") !== "on") redirect("/welcome?error=1");
  const supabase = await createClient();
  const unit = fd.get("unit") === "lbs" ? "lbs" : "kg";
  await supabase.rpc("accept_privacy");
  if (unit !== athlete.unit) await supabase.rpc("set_my_unit", { p_unit: unit });
  const kg = bodyweightKg(fd, unit);
  if (kg != null) await supabase.from("bodyweights").upsert({ athlete_id: athlete.id, day: todayISO(), kg }, { onConflict: "athlete_id,day" });
  revalidatePath("/", "layout");
  redirect("/?welcome=1");
}

/** Athletes switch between kg and lbs themselves. */
export async function setMyUnit(unit: "kg" | "lbs") {
  await requireUser();
  const supabase = await createClient();
  await supabase.rpc("set_my_unit", { p_unit: unit === "lbs" ? "lbs" : "kg" });
  revalidatePath("/", "layout");
  redirect("/account?saved=unit");
}

// -------------------------------------------------------------------- habits

/** Ticks a habit off for a day (today or earlier), or un-ticks it. */
export async function toggleHabit(habitId: string, day: string, done: boolean): Promise<{ ok: boolean }> {
  await requireUser();
  const athlete = await getMyAthlete();
  if (!athlete || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day > todayISO()) return { ok: false };
  const supabase = await createClient();
  const { error } = done
    ? await supabase.from("habit_logs").upsert({ habit_id: habitId, athlete_id: athlete.id, day }, { onConflict: "habit_id,day" })
    : await supabase.from("habit_logs").delete().eq("habit_id", habitId).eq("day", day).eq("athlete_id", athlete.id);
  return { ok: !error };
}
