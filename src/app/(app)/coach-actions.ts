"use server";

import { revalidatePath } from "next/cache";
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
        .insert({ name, needs_review: true })
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

export async function saveRows(fd: FormData) {
  const db = await coachDb();
  const sessionId = String(fd.get("session_id"));
  const programId = String(fd.get("program_id"));
  await persistRows(db, fd, sessionId);
  go(`/programs/${programId}/sessions/${sessionId}?saved=1`);
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
