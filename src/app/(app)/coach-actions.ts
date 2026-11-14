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
      notes: text(fd, "notes"),
    })
    .eq("id", id);
  go(`/athletes/${id}?saved=1`);
}

// ----------------------------------------------------------------- programs

export async function createProgram(fd: FormData) {
  const db = await coachDb();
  const athleteId = String(fd.get("athlete_id"));
  const { data, error } = await db
    .from("programs")
    .insert({
      athlete_id: athleteId,
      name: text(fd, "name") ?? "New block",
      phase: text(fd, "phase"),
      start_date: text(fd, "start_date"),
    })
    .select("id")
    .single();
  if (error || !data) go(`/athletes/${athleteId}?error=` + encodeURIComponent("Could not create the program."));
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

/** Copies a program with all its sessions and rows to an athlete, as a draft. */
export async function copyProgram(fd: FormData) {
  const db = await coachDb();
  const sourceId = String(fd.get("source_id"));
  const athleteId = String(fd.get("athlete_id"));

  const { data: src } = await db.from("programs").select("name, phase").eq("id", sourceId).single();
  if (!src) go(`/athletes/${athleteId}`);
  const { data: created } = await db
    .from("programs")
    .insert({ athlete_id: athleteId, name: src.name + " (copy)", phase: src.phase })
    .select("id")
    .single();
  if (!created) go(`/athletes/${athleteId}`);

  const { data: sessions } = await db.from("sessions").select("*").eq("program_id", sourceId).order("position");
  for (const s of sessions ?? []) {
    const { id: oldId, created_at: _c, program_id: _p, ...rest } = s;
    void _c;
    void _p;
    const { data: newSession } = await db
      .from("sessions")
      .insert({ ...rest, program_id: created.id })
      .select("id")
      .single();
    if (!newSession) continue;
    const { data: rows } = await db.from("session_exercises").select("*").eq("session_id", oldId);
    if (rows?.length) {
      await db.from("session_exercises").insert(
        rows.map(({ id: _id, session_id: _sid, ...r }) => {
          void _id;
          void _sid;
          return { ...r, session_id: newSession.id };
        }),
      );
    }
  }
  go(`/programs/${created.id}`);
}

// ----------------------------------------------------------------- sessions

export async function createSession(fd: FormData) {
  const db = await coachDb();
  const programId = String(fd.get("program_id"));
  const kind = text(fd, "kind");
  const { count } = await db.from("sessions").select("id", { count: "exact", head: true }).eq("program_id", programId);
  const weekday = int(fd, "weekday");
  const { data } = await db
    .from("sessions")
    .insert({
      program_id: programId,
      name: text(fd, "name") ?? "New session",
      kind: kind === "routine" || kind === "slot" ? kind : "workout",
      weekday: weekday && weekday >= 1 && weekday <= 7 ? weekday : null,
      is_optional: fd.get("is_optional") === "on",
      position: count ?? 0,
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
