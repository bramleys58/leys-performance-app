"use server";

import { createClient as createAdminClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireCoach } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const text = (fd: FormData, key: string) => {
  const v = String(fd.get(key) ?? "").trim();
  return v === "" ? null : v;
};
const int = (fd: FormData, key: string) => {
  const v = text(fd, key);
  if (v == null) return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};
const num = (fd: FormData, key: string) => {
  const v = text(fd, key);
  if (v == null) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** Refreshes the cached page data for the target, then navigates to it. */
function go(path: string): never {
  revalidatePath(path.split(/[?#]/)[0]);
  redirect(path);
}

async function coachDb() {
  await requireCoach();
  return createClient();
}

async function coachUserId() {
  return (await requireCoach()).id;
}

// ----------------------------------------------------------------- athletes

export async function createAthlete(fd: FormData) {
  const db = await coachDb();
  const fullName = text(fd, "full_name");
  if (!fullName) go("/athletes?error=" + encodeURIComponent("A name is required."));

  const { data, error } = await db
    .from("athletes")
    .insert({
      full_name: fullName,
      email: text(fd, "email")?.toLowerCase() ?? null,
      sport: text(fd, "sport"),
      unit: text(fd, "unit") === "lbs" ? "lbs" : "kg",
      notes_language: text(fd, "notes_language") === "nl" ? "nl" : "en",
      is_in_person: fd.get("is_in_person") === "on",
      tracking_only: fd.get("tracking_only") === "on",
    })
    .select("id")
    .single();
  if (error || !data) go("/athletes?error=" + encodeURIComponent("Could not add the athlete."));

  go(`/athletes/${data.id}`);
}

export async function updateAthlete(fd: FormData) {
  const db = await coachDb();
  const id = String(fd.get("id"));
  const status = text(fd, "status");
  await db
    .from("athletes")
    .update({
      full_name: text(fd, "full_name") ?? "Unnamed",
      email: text(fd, "email")?.toLowerCase() ?? null,
      sport: text(fd, "sport"),
      phase: text(fd, "phase"),
      unit: text(fd, "unit") === "lbs" ? "lbs" : "kg",
      notes_language: text(fd, "notes_language") === "nl" ? "nl" : "en",
      status: status === "paused" || status === "archived" ? status : "active",
      is_in_person: fd.get("is_in_person") === "on",
      tracking_only: fd.get("tracking_only") === "on",
      notes: text(fd, "notes"),
    })
    .eq("id", id);
  go(`/athletes/${id}?saved=1`);
}

// ----------------------------------------------------------------- programs

export async function createProgram(fd: FormData) {
  const db = await coachDb();
  // No athlete = a template that can be copied to anyone.
  const athleteId = text(fd, "athlete_id");
  const { data, error } = await db
    .from("programs")
    .insert({
      athlete_id: athleteId,
      is_template: !athleteId,
      name: text(fd, "name") ?? (athleteId ? "New block" : "New template"),
      phase: text(fd, "phase"),
      start_date: athleteId ? text(fd, "start_date") : null,
    })
    .select("id")
    .single();
  if (error || !data) go((athleteId ? `/athletes/${athleteId}` : "/templates") + "?error=" + encodeURIComponent("Could not create the program."));
  go(`/programs/${data.id}`);
}

export async function updateProgram(fd: FormData) {
  const db = await coachDb();
  const id = String(fd.get("id"));
  const status = text(fd, "status");
  await db
    .from("programs")
    .update({
      name: text(fd, "name") ?? "Untitled",
      phase: text(fd, "phase"),
      start_date: text(fd, "start_date"),
      status: status === "active" || status === "archived" ? status : "draft",
    })
    .eq("id", id);
  go(`/programs/${id}?saved=1`);
}

/**
 * Copies a program with all its weeks, sessions and rows, as a draft.
 * With an athlete: a program for that athlete. Without: a new template.
 */
export async function copyProgram(fd: FormData) {
  const db = await coachDb();
  const sourceId = String(fd.get("source_id") ?? "");
  const athleteId = text(fd, "athlete_id");
  const fail = (msg: string) => go((athleteId ? `/athletes/${athleteId}` : sourceId ? `/programs/${sourceId}` : "/templates") + "?error=" + encodeURIComponent(msg));
  if (!sourceId) return fail("Pick a program or template to copy.");

  const { data: src } = await db.from("programs").select("name, phase, is_template").eq("id", sourceId).single();
  if (!src) return fail("That program no longer exists.");
  const name = text(fd, "name") ?? (athleteId ? (src.is_template ? src.name : src.name + " (copy)") : src.name.replace(/ \(copy\)$/, "") + (src.is_template ? " (copy)" : ""));
  const { data: created } = await db
    .from("programs")
    .insert({ athlete_id: athleteId, is_template: !athleteId, name, phase: src.phase, start_date: athleteId ? text(fd, "start_date") : null })
    .select("id")
    .single();
  if (!created) return fail("Could not create the copy.");

  const { error } = await db.rpc("clone_sessions", { p_from_program: sourceId, p_to_program: created.id });
  if (error) {
    await db.from("programs").delete().eq("id", created.id);
    return fail("Could not copy the sessions.");
  }
  go(`/programs/${created.id}?copied=1`);
}

export async function deleteProgram(fd: FormData) {
  const db = await coachDb();
  const id = String(fd.get("id"));
  const { data: program } = await db.from("programs").select("athlete_id").eq("id", id).maybeSingle();
  // Logged workouts stay in the athlete's history: they keep their own copy of the names and numbers.
  await db.from("programs").delete().eq("id", id);
  go(program?.athlete_id ? `/athletes/${program.athlete_id}` : "/templates");
}

// -------------------------------------------------------------------- weeks

/**
 * Adds a week at the end of the block as a copy of an existing week.
 * A program without weeks first becomes week 1. Targets can step up in the copy.
 */
export async function copyWeek(programId: string, fd: FormData) {
  const db = await coachDb();
  const back = `/programs/${programId}`;
  const { data: sessions } = await db.from("sessions").select("id, week").eq("program_id", programId);
  const list = sessions ?? [];
  if (list.length === 0) go(back + "?error=" + encodeURIComponent("Add at least one session first."));

  let last = Math.max(0, ...list.map((s) => s.week ?? 0));
  if (last === 0) {
    // Not a multi-week block yet: what is there becomes week 1.
    await db.from("sessions").update({ week: 1 }).eq("program_id", programId).is("week", null);
    last = 1;
  }
  const from = Math.min(Math.max(int(fd, "from_week") ?? last, 1), last);
  const times = Math.min(Math.max(int(fd, "times") ?? 1, 1), 12);
  const percent = num(fd, "percent_delta") ?? 0;
  const weight = num(fd, "weight_delta") ?? 0;

  // Each new week builds on the one before it, so the steps add up week after week.
  let source = from;
  for (let i = 0; i < times; i++) {
    const to = last + 1 + i;
    const { error } = await db.rpc("clone_sessions", {
      p_from_program: programId,
      p_to_program: programId,
      p_from_week: source,
      p_to_week: to,
      p_percent_delta: percent,
      p_weight_delta: weight,
    });
    if (error) go(back + "?error=" + encodeURIComponent("Could not copy the week."));
    source = to;
  }
  go(back + `?saved=1#week-${last + 1}`);
}

/** Removes a week and moves the later weeks one up. */
export async function deleteWeek(programId: string, week: number) {
  const db = await coachDb();
  await db.from("sessions").delete().eq("program_id", programId).eq("week", week);
  const { data: later } = await db.from("sessions").select("id, week").eq("program_id", programId).gt("week", week);
  await Promise.all((later ?? []).map((s) => db.from("sessions").update({ week: (s.week as number) - 1 }).eq("id", s.id)));
  go(`/programs/${programId}?saved=1`);
}

/** Copies one session with its exercises, into the same week or another one. */
export async function duplicateSession(programId: string, sessionId: string, fd: FormData) {
  const db = await coachDb();
  const toWeek = int(fd, "to_week");
  const { error } = await db.rpc("clone_sessions", {
    p_from_program: programId,
    p_to_program: programId,
    p_session: sessionId,
    p_to_week: toWeek && toWeek >= 1 ? toWeek : null,
    p_name_suffix: toWeek ? "" : " (copy)",
  });
  go(`/programs/${programId}` + (error ? "?error=" + encodeURIComponent("Could not copy the session.") : "?saved=1"));
}

// ----------------------------------------------------------------- sessions

export async function createSession(fd: FormData) {
  const db = await coachDb();
  const programId = String(fd.get("program_id"));
  const kind = text(fd, "kind");
  const { count } = await db.from("sessions").select("id", { count: "exact", head: true }).eq("program_id", programId);
  const weekday = int(fd, "weekday");
  const week = int(fd, "week");
  const { data } = await db
    .from("sessions")
    .insert({
      program_id: programId,
      name: text(fd, "name") ?? "New session",
      kind: kind === "routine" || kind === "slot" ? kind : "workout",
      weekday: weekday && weekday >= 1 && weekday <= 7 ? weekday : null,
      is_optional: fd.get("is_optional") === "on",
      position: count ?? 0,
      week: week && week >= 1 ? week : null,
    })
    .select("id")
    .single();
  go(data ? `/programs/${programId}/sessions/${data.id}` : `/programs/${programId}`);
}

export async function updateSession(fd: FormData) {
  const db = await coachDb();
  const id = String(fd.get("id"));
  const programId = String(fd.get("program_id"));
  const kind = text(fd, "kind");
  const weekday = int(fd, "weekday");
  await db
    .from("sessions")
    .update({
      name: text(fd, "name") ?? "Untitled",
      kind: kind === "routine" || kind === "slot" ? kind : "workout",
      session_type: text(fd, "session_type"),
      weekday: weekday && weekday >= 1 && weekday <= 7 ? weekday : null,
      scheduled_date: text(fd, "scheduled_date"),
      estimated_minutes: int(fd, "estimated_minutes"),
      is_optional: fd.get("is_optional") === "on",
      instructions: text(fd, "instructions"),
      ...(fd.has("week") ? { week: (int(fd, "week") ?? 0) >= 1 ? int(fd, "week") : null } : {}),
    })
    .eq("id", id);
  go(`/programs/${programId}/sessions/${id}?saved=1`);
}

export async function deleteSession(fd: FormData) {
  const db = await coachDb();
  const programId = String(fd.get("program_id"));
  await db.from("sessions").delete().eq("id", String(fd.get("id")));
  go(`/programs/${programId}`);
}

// --------------------------------------------------------------------- rows

export async function addRow(fd: FormData) {
  const db = await coachDb();
  const sessionId = String(fd.get("session_id"));
  const programId = String(fd.get("program_id"));
  const section = text(fd, "section") === "prep" ? "prep" : "workout";
  const name = text(fd, "display_name");
  const back = `/programs/${programId}/sessions/${sessionId}`;
  if (!name) go(back);

  let exerciseId = text(fd, "exercise_id");
  let defaults: { default_sets: number | null; default_reps: string | null; default_tempo: string | null; default_note: string | null } | null = null;

  if (exerciseId) {
    const { data } = await db
      .from("exercises")
      .select("default_sets, default_reps, default_tempo, default_note")
      .eq("id", exerciseId)
      .maybeSingle();
    defaults = data;
  } else {
    // A name that is not in the library yet: add it, so it can be reused and tracked.
    const { data: existing } = await db.from("exercises").select("id").ilike("name", name.replace(/[%_\\]/g, "\\$&")).maybeSingle();
    if (existing) {
      exerciseId = existing.id;
    } else {
      const { data: created } = await db
        .from("exercises")
        .insert({ name, needs_review: true, created_by: await coachUserId() })
        .select("id")
        .single();
      exerciseId = created?.id ?? null;
    }
  }

  const { data: last } = await db
    .from("session_exercises")
    .select("position")
    .eq("session_id", sessionId)
    .eq("section", section)
    .order("position", { ascending: false })
    .limit(1);

  await db.from("session_exercises").insert({
    session_id: sessionId,
    exercise_id: exerciseId,
    display_name: name,
    section,
    superset_group: text(fd, "superset_group")?.toUpperCase().slice(0, 2) ?? null,
    position: (last?.[0]?.position ?? -1) + 1,
    sets: int(fd, "sets") ?? defaults?.default_sets ?? (section === "prep" ? 1 : 3),
    reps: text(fd, "reps") ?? defaults?.default_reps ?? null,
    tempo: text(fd, "tempo") ?? defaults?.default_tempo ?? null,
    coaching_note: text(fd, "coaching_note") ?? defaults?.default_note ?? null,
  });
  go(back + "#add-" + section);
}

type Db = Awaited<ReturnType<typeof createClient>>;

/** Writes every row of the session form. Inputs are named field__rowId. */
async function persistRows(db: Db, fd: FormData, sessionId: string) {
  const ids = String(fd.get("row_ids") ?? "").split(",").filter(Boolean);
  await Promise.all(
    ids.map((id) => {
      const f = (k: string) => `${k}__${id}`;
      const targetType = text(fd, f("target_type"));
      return db
        .from("session_exercises")
        .update({
          display_name: text(fd, f("display_name")) ?? "Exercise",
          superset_group: text(fd, f("superset_group"))?.toUpperCase().slice(0, 2) ?? null,
          sets: int(fd, f("sets")),
          reps: text(fd, f("reps")),
          tempo: text(fd, f("tempo")),
          target_type: targetType === "weight" || targetType === "percent" || targetType === "rpe" ? targetType : "none",
          target_value: num(fd, f("target_value")),
          max_exercise_id: targetType === "percent" ? text(fd, f("max_exercise_id")) : null,
          ask_rpe: fd.get(f("ask_rpe")) === "on",
          coaching_note: text(fd, f("coaching_note")),
          video_url: text(fd, f("video_url")),
        })
        .eq("id", id)
        .eq("session_id", sessionId);
    }),
  );
}

/** Saves the session's rows. "back" returns to the program, "stay" keeps the editor open. */
export async function saveRows(then: "back" | "stay", fd: FormData) {
  const db = await coachDb();
  const sessionId = String(fd.get("session_id"));
  const programId = String(fd.get("program_id"));
  await persistRows(db, fd, sessionId);
  revalidatePath(`/programs/${programId}/sessions/${sessionId}`);
  go(then === "back" ? `/programs/${programId}?saved=1` : `/programs/${programId}/sessions/${sessionId}?saved=1`);
}

export async function rowOp(op: "up" | "down" | "delete", id: string, fd: FormData) {
  const db = await coachDb();
  const sessionId = String(fd.get("session_id"));
  const programId = String(fd.get("program_id"));
  const back = `/programs/${programId}/sessions/${sessionId}`;

  // Keep any edits typed in the other rows before moving or deleting.
  await persistRows(db, fd, sessionId);

  if (op === "delete") {
    await db.from("session_exercises").delete().eq("id", id).eq("session_id", sessionId);
    go(back);
  }

  const { data: row } = await db.from("session_exercises").select("id, section, position").eq("id", id).single();
  if (!row) go(back);
  const { data: siblings } = await db
    .from("session_exercises")
    .select("id, position")
    .eq("session_id", sessionId)
    .eq("section", row.section)
    .order("position");
  const list = siblings ?? [];
  const i = list.findIndex((r) => r.id === id);
  const j = op === "up" ? i - 1 : i + 1;
  if (i >= 0 && j >= 0 && j < list.length) {
    [list[i], list[j]] = [list[j], list[i]];
    // Rewrite all positions so they are always 0, 1, 2 ... without gaps.
    await Promise.all(list.map((r, idx) => db.from("session_exercises").update({ position: idx }).eq("id", r.id)));
  }
  go(back);
}

// -------------------------------------------------------------------- maxes

const KG_PER_LB = 0.45359237;

/** Sets the working max for one lift. The previous one is kept as history. */
export async function setMax(fd: FormData) {
  const db = await coachDb();
  const athleteId = String(fd.get("athlete_id"));
  const back = `/athletes/${athleteId}/maxes`;
  const exerciseId = text(fd, "exercise_id");
  const value = num(fd, "value");
  if (!exerciseId) go(back + "?error=" + encodeURIComponent("Pick the exercise from the list, so the max is linked to the library."));
  if (value == null || value <= 0) go(back + "?error=" + encodeURIComponent("Fill in a weight above zero."));

  const kg = text(fd, "unit") === "lbs" ? value * KG_PER_LB : value;
  await db.from("maxes").update({ is_active: false }).eq("athlete_id", athleteId).eq("exercise_id", exerciseId).eq("is_active", true);
  const { error } = await db.from("maxes").insert({
    athlete_id: athleteId,
    exercise_id: exerciseId,
    value: Math.round(kg * 100) / 100,
    source: text(fd, "source") === "estimated" ? "estimated" : "tested",
    set_on: text(fd, "set_on") ?? new Date().toISOString().slice(0, 10),
  });
  await db.from("exercises").update({ counts_for_maxes: true }).eq("id", exerciseId);
  go(back + (error ? "?error=" + encodeURIComponent("Could not save the max.") : "?saved=1"));
}

export async function removeMax(id: string, fd: FormData) {
  const db = await coachDb();
  const athleteId = String(fd.get("athlete_id"));
  await db.from("maxes").update({ is_active: false }).eq("id", id);
  go(`/athletes/${athleteId}/maxes`);
}

// ---------------------------------------------------------------- exercises

const TRACKING = ["load", "bodyweight_reps", "time", "distance", "distance_height", "reps_only", "completion"];

export async function updateExercise(fd: FormData) {
  const db = await coachDb();
  const id = String(fd.get("id"));
  const back = `/library/${id}`;
  const name = text(fd, "name");
  if (!name) go(back + "?error=" + encodeURIComponent("A name is required."));
  const tracking = text(fd, "tracking_type") ?? "load";
  const aliases = (text(fd, "aliases") ?? "")
    .split(/[;\n]/)
    .map((a) => a.trim())
    .filter((a) => a && a.toLowerCase() !== name.toLowerCase());

  const { error } = await db
    .from("exercises")
    .update({
      name,
      aliases: [...new Set(aliases)],
      movement_pattern: text(fd, "movement_pattern"),
      primary_muscle: text(fd, "primary_muscle"),
      equipment: text(fd, "equipment"),
      tracking_type: TRACKING.includes(tracking) ? tracking : "load",
      weight_step: num(fd, "weight_step") ?? 2.5,
      counts_for_maxes: fd.get("counts_for_maxes") === "on",
      default_sets: int(fd, "default_sets"),
      default_reps: text(fd, "default_reps"),
      default_tempo: text(fd, "default_tempo"),
      default_note: text(fd, "default_note"),
      video_url: text(fd, "video_url"),
      // Saving the form counts as reviewing it, and approves an athlete's exercise.
      needs_review: fd.get("keep_review") === "on",
      approved: true,
    })
    .eq("id", id);
  if (error) {
    const msg = error.code === "23505" ? "Another exercise already has that name. Merge them instead." : "Could not save the exercise.";
    go(back + "?error=" + encodeURIComponent(msg));
  }
  go(back + "?saved=1");
}

export async function mergeExercise(fromId: string, fd: FormData) {
  const db = await coachDb();
  const into = text(fd, "exercise_id");
  if (!into || into === fromId) go(`/library/${fromId}?error=` + encodeURIComponent("Pick the exercise to keep from the list."));
  const { error } = await db.rpc("merge_exercise", { p_from: fromId, p_into: into });
  if (error) go(`/library/${fromId}?error=` + encodeURIComponent("Could not merge the exercises."));
  go(`/library/${into}?merged=1`);
}

export async function archiveExercise(id: string, archived: boolean) {
  const db = await coachDb();
  await db.from("exercises").update({ archived, needs_review: false, approved: true }).eq("id", id);
  go(archived ? "/library?archived=1" : `/library/${id}`);
}

// ------------------------------------------------------------------ testing

const ids = (fd: FormData, key: string) => fd.getAll(key).map(String).filter(Boolean);

export async function createTestEvent(fd: FormData) {
  const db = await coachDb();
  const testIds = ids(fd, "test_ids");
  const athleteIds = ids(fd, "athlete_ids");
  if (testIds.length === 0 || athleteIds.length === 0) {
    go("/testing?error=" + encodeURIComponent("Pick at least one test and one athlete."));
  }
  const { data, error } = await db
    .from("test_events")
    .insert({
      name: text(fd, "name") ?? "Test day",
      held_on: text(fd, "held_on") ?? new Date().toISOString().slice(0, 10),
      test_ids: testIds,
      athlete_ids: athleteIds,
    })
    .select("id")
    .single();
  if (error || !data) go("/testing?error=" + encodeURIComponent("Could not create the test day."));
  go(`/testing/${data.id}`);
}

export async function updateTestEvent(fd: FormData) {
  const db = await coachDb();
  const id = String(fd.get("id"));
  await db
    .from("test_events")
    .update({
      name: text(fd, "name") ?? "Test day",
      held_on: text(fd, "held_on") ?? undefined,
      notes: text(fd, "notes"),
      test_ids: ids(fd, "test_ids"),
      athlete_ids: ids(fd, "athlete_ids"),
    })
    .eq("id", id);
  go(`/testing/${id}?saved=1`);
}

export async function deleteTestEvent(id: string) {
  const db = await coachDb();
  await db.from("test_events").delete().eq("id", id);
  go("/testing");
}

/** Saves one attempt. An empty value removes the attempt. */
export async function saveAttempt(eventId: string, athleteId: string, testId: string, attempt: number, value: number | null): Promise<{ ok: boolean }> {
  const db = await coachDb();
  if (value == null) {
    const { error } = await db.from("test_results").delete().match({ test_event_id: eventId, athlete_id: athleteId, test_id: testId, attempt });
    return { ok: !error };
  }
  const { error } = await db
    .from("test_results")
    .upsert(
      { test_event_id: eventId, athlete_id: athleteId, test_id: testId, attempt, value, recorded_at: new Date().toISOString() },
      { onConflict: "test_event_id,athlete_id,test_id,attempt" },
    );
  revalidatePath(`/testing/${eventId}`);
  return { ok: !error };
}

export async function createTest(fd: FormData) {
  const db = await coachDb();
  const name = text(fd, "name");
  const unit = text(fd, "unit");
  if (!name || !unit) go("/testing/tests?error=" + encodeURIComponent("A name and a unit are required."));
  const { count } = await db.from("tests").select("id", { count: "exact", head: true });
  const { error } = await db.from("tests").insert({
    name,
    unit,
    category: text(fd, "category"),
    higher_is_better: text(fd, "direction") !== "lower",
    decimals: Math.min(3, Math.max(0, int(fd, "decimals") ?? 2)),
    position: 100 + (count ?? 0),
  });
  go("/testing/tests" + (error ? "?error=" + encodeURIComponent(error.code === "23505" ? "A test with that name exists already." : "Could not add the test.") : "?saved=1"));
}

// ------------------------------------------------------------------ invites

/**
 * Emails an athlete an invitation to set up their login.
 * Needs the Supabase secret key as SUPABASE_SECRET_KEY on the server (never in the browser).
 */
export async function inviteAthlete(athleteId: string) {
  const db = await coachDb();
  const back = `/athletes/${athleteId}`;
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!secret || !url) {
    go(back + "?error=" + encodeURIComponent("Invites from the app are not switched on yet. Add SUPABASE_SECRET_KEY in Vercel (see docs/SETUP.md), or invite this address from Supabase."));
  }

  const { data: athlete } = await db.from("athletes").select("email, full_name, user_id").eq("id", athleteId).maybeSingle();
  if (!athlete?.email) go(back + "?error=" + encodeURIComponent("Add an email address to the profile first."));
  if (athlete.user_id) go(back + "?error=" + encodeURIComponent("This athlete already has a login."));

  const origin = (await headers()).get("origin") ?? "";
  const admin = createAdminClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await admin.auth.admin.inviteUserByEmail(athlete.email, {
    redirectTo: origin ? `${origin}/auth/callback` : undefined,
    data: { full_name: athlete.full_name },
  });
  if (error) {
    const msg = /already|registered|exists/i.test(error.message)
      ? "That email address already has a login. Save the profile again to link it."
      : /rate|limit/i.test(error.message)
        ? "Too many emails in a short time. Try again in an hour, or connect an email service."
        : "The invite could not be sent.";
    go(back + "?error=" + encodeURIComponent(msg));
  }
  go(back + "?invited=1");
}

// --------------------------------------------------------------- injury log

/** Adds a note to an athlete's injury log (coach only). */
export async function addInjuryNote(athleteId: string, fd: FormData) {
  const db = await coachDb();
  const back = `/athletes/${athleteId}/injuries`;
  const note = text(fd, "note");
  if (!note) go(back + "?error=" + encodeURIComponent("Write what is going on."));
  const { error } = await db.from("injury_notes").insert({
    athlete_id: athleteId,
    day: text(fd, "day") ?? new Date().toISOString().slice(0, 10),
    area: text(fd, "area"),
    note,
  });
  go(back + (error ? "?error=" + encodeURIComponent("Could not save the note.") : "?saved=1"));
}

/** Marks an injury note as resolved, or opens it again. */
export async function setInjuryStatus(athleteId: string, noteId: string, resolved: boolean) {
  const db = await coachDb();
  await db
    .from("injury_notes")
    .update({ status: resolved ? "resolved" : "open", resolved_on: resolved ? new Date().toISOString().slice(0, 10) : null })
    .eq("id", noteId)
    .eq("athlete_id", athleteId);
  go(`/athletes/${athleteId}/injuries?saved=1`);
}

export async function deleteInjuryNote(athleteId: string, noteId: string) {
  const db = await coachDb();
  await db.from("injury_notes").delete().eq("id", noteId).eq("athlete_id", athleteId);
  go(`/athletes/${athleteId}/injuries?saved=1`);
}

// ------------------------------------------------------------- alternatives

/** Approves an alternative for an exercise. It works both ways: each can replace the other. */
export async function addAlternative(exerciseId: string, fd: FormData) {
  const db = await coachDb();
  const back = `/library/${exerciseId}`;
  const altId = text(fd, "exercise_id");
  if (!altId) go(back + "?error=" + encodeURIComponent("Pick the alternative from the list."));
  if (altId === exerciseId) go(back + "?error=" + encodeURIComponent("An exercise cannot be its own alternative."));
  const { error } = await db.from("exercise_alternatives").upsert(
    [
      { exercise_id: exerciseId, alternative_id: altId },
      { exercise_id: altId, alternative_id: exerciseId },
    ],
    { onConflict: "exercise_id,alternative_id" },
  );
  go(back + (error ? "?error=" + encodeURIComponent("Could not save the alternative.") : "?saved=1#alternatives"));
}

export async function removeAlternative(exerciseId: string, altId: string) {
  const db = await coachDb();
  await db.from("exercise_alternatives").delete().eq("exercise_id", exerciseId).eq("alternative_id", altId);
  await db.from("exercise_alternatives").delete().eq("exercise_id", altId).eq("alternative_id", exerciseId);
  go(`/library/${exerciseId}?saved=1#alternatives`);
}

// ----------------------------------------------------------------- business

/** Adds what a client bought: a pack of sessions or a subscription. */
export async function addPackage(athleteId: string, fd: FormData) {
  const db = await coachDb();
  const back = `/athletes/${athleteId}/client`;
  const kind = text(fd, "kind") === "subscription" ? "subscription" : "sessions";
  const total = int(fd, "sessions_total");
  if (kind === "sessions" && !(total && total > 0)) go(back + "?error=" + encodeURIComponent("Fill in how many sessions are in the pack."));
  const price = num(fd, "price");
  const { error } = await db.from("client_packages").insert({
    athlete_id: athleteId,
    name: text(fd, "name") ?? (kind === "sessions" ? `${total} sessions` : "Subscription"),
    kind,
    sessions_total: kind === "sessions" ? total : null,
    sessions_used_before: Math.max(int(fd, "sessions_used_before") ?? 0, 0),
    price: price != null && price >= 0 ? Math.round(price * 100) / 100 : null,
    start_date: text(fd, "start_date") ?? new Date().toISOString().slice(0, 10),
    end_date: text(fd, "end_date"),
    paid_on: fd.get("paid") === "on" ? (text(fd, "paid_on") ?? new Date().toISOString().slice(0, 10)) : null,
    notes: text(fd, "notes"),
  });
  go(back + (error ? "?error=" + encodeURIComponent("Could not save the package.") : "?saved=1"));
}

export async function markPackagePaid(athleteId: string, packageId: string, paid: boolean) {
  const db = await coachDb();
  await db.from("client_packages").update({ paid_on: paid ? new Date().toISOString().slice(0, 10) : null }).eq("id", packageId).eq("athlete_id", athleteId);
  go(`/athletes/${athleteId}/client?saved=1`);
}

export async function endPackage(athleteId: string, packageId: string, ended: boolean) {
  const db = await coachDb();
  await db.from("client_packages").update({ ended }).eq("id", packageId).eq("athlete_id", athleteId);
  go(`/athletes/${athleteId}/client?saved=1`);
}

/** Starts the same package again from today (or the old end date), for a renewal. */
export async function renewPackage(athleteId: string, packageId: string) {
  const db = await coachDb();
  const { data: p } = await db.from("client_packages").select("*").eq("id", packageId).eq("athlete_id", athleteId).maybeSingle();
  if (!p) go(`/athletes/${athleteId}/client`);
  const today = new Date().toISOString().slice(0, 10);
  const start = p.kind === "subscription" && p.end_date && p.end_date >= today ? p.end_date : today;
  let end: string | null = null;
  if (p.end_date) {
    // Same length as before.
    const length = Date.parse(p.end_date + "T12:00:00Z") - Date.parse(p.start_date + "T12:00:00Z");
    end = new Date(Date.parse(start + "T12:00:00Z") + length).toISOString().slice(0, 10);
  }
  await db.from("client_packages").update({ ended: true }).eq("id", packageId);
  const { error } = await db.from("client_packages").insert({
    athlete_id: athleteId,
    name: p.name,
    kind: p.kind,
    sessions_total: p.sessions_total,
    price: p.price,
    start_date: start,
    end_date: end,
    notes: p.notes,
  });
  go(`/athletes/${athleteId}/client` + (error ? "?error=" + encodeURIComponent("Could not renew.") : "?saved=1"));
}

export async function deletePackage(athleteId: string, packageId: string) {
  const db = await coachDb();
  await db.from("client_packages").delete().eq("id", packageId).eq("athlete_id", athleteId);
  go(`/athletes/${athleteId}/client?saved=1`);
}
