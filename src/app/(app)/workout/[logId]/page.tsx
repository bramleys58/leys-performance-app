import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton, Card, SecondaryButton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { epley, roundToStep, sortRows, type PlanRow, type TrackingType } from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";
import { extraRow, fieldInfo, type LoggedSet, type LoggerRow } from "@/lib/logger-types";
import { fieldRecords, type Best, type FieldSet } from "@/lib/field";
import { reopenWorkout, repeatWorkout } from "../../athlete-actions";
import { reviewWorkout } from "../../coach-actions";
import { Logger } from "./logger";

const KG_PER_LB = 0.45359237;

export default async function WorkoutPage({ params }: PageProps<"/workout/[logId]">) {
  const user = await requireUser();
  const { logId } = await params;
  const supabase = await createClient();

  const { data: log } = await supabase
    .from("workout_logs")
    .select("*, athletes(id, full_name, unit, user_id)")
    .eq("id", logId)
    .maybeSingle();
  if (!log) notFound();
  const athlete = log.athletes as unknown as { id: string; full_name: string; unit: "kg" | "lbs"; user_id: string | null };
  // A coach logging their own training sees it like an athlete would.
  const forClient = user.role === "coach" && athlete.user_id !== user.id;

  const [{ data: rowData }, { data: setData }, { data: extraData }] = await Promise.all([
    log.session_id
      ? supabase
          .from("session_exercises")
          .select("*, exercises!session_exercises_exercise_id_fkey(tracking_type, weight_step, video_url, equipment, log_fields, best, distance_unit), base:exercises!session_exercises_max_exercise_id_fkey(name)")
          .eq("session_id", log.session_id)
      : Promise.resolve({ data: [] as unknown[] }),
    supabase.from("set_logs").select("*").eq("workout_log_id", logId),
    supabase
      .from("workout_exercises")
      .select("*, exercises(tracking_type, weight_step, video_url, equipment, log_fields, best, distance_unit)")
      .eq("workout_log_id", logId)
      .order("position"),
  ]);
  type Extra = { id: string; exercise_id: string | null; display_name: string; position: number; superset_group: string | null; planned_sets: number | null; exercises: { tracking_type: TrackingType; weight_step: number; video_url: string | null; equipment: string | null; log_fields: string[] | null; best: string | null; distance_unit: string | null } | null };
  const extras = (extraData ?? []) as unknown as Extra[];
  const isFree = !log.session_id;

  type Row = PlanRow & { base: { name: string } | null; exercises: { tracking_type: TrackingType; weight_step: number; video_url: string | null; equipment: string | null; log_fields: string[] | null; best: string | null; distance_unit: string | null } | null };
  const rows = sortRows((rowData ?? []) as Row[]);
  // Swaps made in this workout, and the alternatives the coach approved for the planned exercises.
  const plannedIds = [...new Set(rows.map((r) => r.exercise_id).filter(Boolean))] as string[];
  const [{ data: swapData }, { data: altData }] = await Promise.all([
    supabase.from("workout_swaps").select("session_exercise_id, exercise_id, exercise_name, exercises(tracking_type, weight_step, video_url, log_fields, best, distance_unit)").eq("workout_log_id", logId),
    plannedIds.length
      ? supabase.from("exercise_alternatives").select("exercise_id, alt:exercises!exercise_alternatives_alternative_id_fkey(id, name, archived)").in("exercise_id", plannedIds)
      : Promise.resolve({ data: [] }),
  ]);
  type Swap = { session_exercise_id: string; exercise_id: string; exercise_name: string; exercises: { tracking_type: TrackingType; weight_step: number; video_url: string | null; log_fields: string[] | null; best: string | null; distance_unit: string | null } | null };
  const swapBy = new Map(((swapData ?? []) as unknown as Swap[]).map((s) => [s.session_exercise_id, s]));
  const altsBy = new Map<string, { id: string; name: string }[]>();
  for (const a of (altData ?? []) as unknown as { exercise_id: string; alt: { id: string; name: string; archived: boolean } | null }[]) {
    if (a.alt && !a.alt.archived) altsBy.set(a.exercise_id, [...(altsBy.get(a.exercise_id) ?? []), { id: a.alt.id, name: a.alt.name }]);
  }

  const exerciseIds = [...new Set([...rows.map((r) => r.exercise_id), ...extras.map((e) => e.exercise_id), ...[...swapBy.values()].map((s) => s.exercise_id)].filter(Boolean))] as string[];
  // A percent can be based on another lift, so those maxes are needed too.
  const maxIds = [...new Set([...exerciseIds, ...rows.map((r) => r.max_exercise_id)].filter(Boolean))] as string[];

  const [{ data: lastData }, { data: maxData }] = await Promise.all([
    exerciseIds.length
      ? supabase.rpc("previous_sets", { p_athlete: athlete.id, p_exercises: exerciseIds, p_before: log.performed_on, p_exclude: logId })
      : Promise.resolve({ data: [] }),
    maxIds.length
      ? supabase.from("maxes").select("exercise_id, value").eq("athlete_id", athlete.id).eq("is_active", true).in("exercise_id", maxIds)
      : Promise.resolve({ data: [] }),
  ]);

  type Prev = { exercise_id: string; set_number: number; weight: number | null; reps: number | null; seconds: number | null; distance: number | null; performed_on: string };
  const prevBy = new Map<string, Prev[]>();
  for (const p of (lastData ?? []) as Prev[]) prevBy.set(p.exercise_id, [...(prevBy.get(p.exercise_id) ?? []), p]);
  // A repeated workout shows (and fills in) the numbers of the workout it repeats, not just the latest.
  if (log.repeat_of && exerciseIds.length) {
    const [{ data: src }, { data: srcLog }] = await Promise.all([
      supabase.from("set_logs").select("exercise_id, set_number, weight, reps, seconds, distance").eq("workout_log_id", log.repeat_of).eq("skipped", false).in("exercise_id", exerciseIds).order("set_number"),
      supabase.from("workout_logs").select("performed_on").eq("id", log.repeat_of).maybeSingle(),
    ]);
    const fromSrc = new Map<string, Prev[]>();
    for (const r of (src ?? []) as Omit<Prev, "performed_on">[]) {
      const list = fromSrc.get(r.exercise_id) ?? [];
      // Number them 1, 2, 3 in order, in case a set was deleted in between.
      list.push({ ...r, set_number: list.length + 1, performed_on: srcLog?.performed_on ?? log.performed_on });
      fromSrc.set(r.exercise_id, list);
    }
    for (const [id, list] of fromSrc) prevBy.set(id, list);
  }
  const maxBy = new Map(((maxData ?? []) as { exercise_id: string; value: number }[]).map((m) => [m.exercise_id, Number(m.value)]));

  const loggerRows: LoggerRow[] = rows.map((r) => {
    const alternatives = (r.exercise_id ? altsBy.get(r.exercise_id) : undefined) ?? [];
    const swap = swapBy.get(r.id);
    if (swap) {
      // Swapped for this workout: the alternative's own history and settings, the planned sets and reps.
      // A weight or percent target belongs to the planned lift, so it is dropped.
      const prev = prevBy.get(swap.exercise_id) ?? [];
      return {
        id: r.id,
        source: "plan" as const,
        exerciseId: swap.exercise_id,
        name: swap.exercise_name,
        section: r.section,
        supersetGroup: r.superset_group,
        position: r.position,
        sets: r.sets ?? 1,
        reps: r.reps,
        tempo: r.tempo,
        targetType: r.target_type === "rpe" ? ("rpe" as const) : ("none" as const),
        targetValue: r.target_type === "rpe" && r.target_value != null ? Number(r.target_value) : null,
        askRpe: r.ask_rpe,
        note: r.coaching_note,
        videoUrl: swap.exercises?.video_url ?? null,
        tracking: swap.exercises?.tracking_type ?? "load",
        ...fieldInfo(swap.exercises),
        weightStep: Number(swap.exercises?.weight_step ?? 2.5),
        plannedKg: null,
        alternatives,
        swappedFrom: r.display_name,
        previous: prev.map((p) => ({ setNumber: p.set_number, weight: p.weight == null ? null : Number(p.weight), reps: p.reps, seconds: p.seconds == null ? null : Number(p.seconds), distance: p.distance == null ? null : Number(p.distance) })),
      };
    }
    const step = Number(r.exercises?.weight_step ?? 2.5);
    const previous = (r.exercise_id ? prevBy.get(r.exercise_id) : undefined) ?? [];
    const maxOf = r.max_exercise_id ?? r.exercise_id;
    const max = maxOf ? maxBy.get(maxOf) : undefined;
    let plannedKg: number | null = null;
    if (r.target_type === "weight" && r.target_value != null) {
      // A weight target is written in the athlete's own unit.
      plannedKg = athlete.unit === "lbs" ? Number(r.target_value) * KG_PER_LB : Number(r.target_value);
    } else if (r.target_type === "percent" && r.target_value != null && max) {
      plannedKg = roundToStep((max * Number(r.target_value)) / 100, step);
    }
    return {
      id: r.id,
      source: "plan" as const,
      exerciseId: r.exercise_id,
      name: r.display_name,
      section: r.section,
      supersetGroup: r.superset_group,
      position: r.position,
      sets: r.sets ?? 1,
      reps: r.reps,
      tempo: r.tempo,
      targetType: r.target_type,
      maxName: r.max_exercise_id && r.max_exercise_id !== r.exercise_id ? r.base?.name ?? null : null,
      targetValue: r.target_value == null ? null : Number(r.target_value),
      askRpe: r.ask_rpe,
      note: r.coaching_note,
      videoUrl: r.video_url ?? r.exercises?.video_url ?? null,
      tracking: r.exercises?.tracking_type ?? "load",
      ...fieldInfo(r.exercises),
      weightStep: step,
      plannedKg,
      alternatives,
      previous: previous.map((p) => ({
        setNumber: p.set_number,
        weight: p.weight == null ? null : Number(p.weight),
        reps: p.reps,
        seconds: p.seconds == null ? null : Number(p.seconds),
        distance: p.distance == null ? null : Number(p.distance),
      })),
    };
  });

  for (const e of extras) {
    const prev = ((e.exercise_id ? prevBy.get(e.exercise_id) : undefined) ?? []) as Prev[];
    loggerRows.push(extraRow(e, e.exercises, prev, e.planned_sets ?? 3));
  }

  type SetRow = { session_exercise_id: string | null; workout_exercise_id: string | null; exercise_id: string | null; exercise_name: string; set_number: number; weight: number | null; reps: number | null; seconds: number | null; distance: number | null; rpe: number | null; skipped: boolean };
  const sets = (setData ?? []) as SetRow[];
  const logged: LoggedSet[] = sets
    .filter((s) => s.session_exercise_id || s.workout_exercise_id)
    .map((s) => ({
      rowId: (s.session_exercise_id ?? s.workout_exercise_id) as string,
      setNumber: s.set_number,
      weight: s.weight == null ? null : Number(s.weight),
      reps: s.reps,
      seconds: s.seconds == null ? null : Number(s.seconds),
      distance: s.distance == null ? null : Number(s.distance),
      rpe: s.rpe == null ? null : Number(s.rpe),
      skipped: s.skipped,
    }));

  const backHref = forClient ? `/athletes/${athlete.id}` : user.role === "coach" ? "/me" : "/";

  // Notes per exercise on this workout, and the latest note on each exercise from earlier workouts.
  // All recent ones, not only for exercises already in it: exercises can be added during the workout.
  const [{ data: noteRows }, { data: oldNotes }] = await Promise.all([
    supabase.from("workout_exercise_notes").select("row_key, note").eq("workout_log_id", logId),
    supabase
      .from("workout_exercise_notes")
      .select("exercise_id, note, updated_at")
      .eq("athlete_id", athlete.id)
      .neq("workout_log_id", logId)
      .not("exercise_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(300),
  ]);
  const notes: Record<string, string> = Object.fromEntries((noteRows ?? []).map((n) => [n.row_key, n.note]));
  const lastNotes: Record<string, string> = {};
  for (const n of (oldNotes ?? []) as { exercise_id: string | null; note: string }[]) if (n.exercise_id && !(n.exercise_id in lastNotes)) lastNotes[n.exercise_id] = n.note;

  // ----------------------------------------------------------- summary view
  if (log.finished_at) {
    const done = sets.filter((s) => !s.skipped);

    // Coach feedback. Opening the workout counts as reading it.
    const { data: review } = await supabase.from("workout_reviews").select("reply, reviewed_at, reply_seen_at").eq("workout_log_id", logId).maybeSingle();
    if (!forClient && user.role !== "coach" && review?.reply && !review.reply_seen_at) await supabase.rpc("mark_reply_seen", { p_workout_log_id: logId });

    // Sets per exercise, in the order they were planned or added.
    const unitOf = athlete.unit;
    const show = (kg: number) => new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(unitOf === "lbs" ? kg / KG_PER_LB : kg);
    const unitOfRow = new Map(loggerRows.map((r) => [r.id, r.distanceUnit]));
    const setText = (x: LoggedSet) => {
      if (x.skipped) return "skipped";
      const du = unitOfRow.get(x.rowId) ?? "m";
      const n = (v: number) => String(Math.round(Number(v) * 100) / 100);
      const parts: string[] = [];
      if (x.weight != null && x.reps != null) parts.push(`${show(x.weight)}×${x.reps}`);
      else if (x.reps != null) parts.push(`${x.reps} reps`);
      else if (x.weight != null) parts.push(`${show(x.weight)} ${unitOf}`);
      // A sprint reads "20 m in 3.12 s"; a jump or sled just its distance.
      if (x.distance != null && x.seconds != null) parts.push(`${n(x.distance)} ${du} in ${n(x.seconds)} s`);
      else if (x.seconds != null) parts.push(`${n(x.seconds)}s`);
      else if (x.distance != null) parts.push(`${n(x.distance)} ${du}`);
      if (x.rpe != null) parts.push(`@${x.rpe}`);
      return parts.join(" ") || "done";
    };
    const perExercise = loggerRows
      .map((r) => ({ key: r.id, name: r.name, exerciseId: r.exerciseId, group: r.supersetGroup, sets: logged.filter((x) => x.rowId === r.id).sort((a, b) => a.setNumber - b.setNumber) }))
      .filter((e) => e.sets.length > 0);
    // Exercises done back to back share a superset group; blocks of 2+ get a coloured bar.
    const blocks: { group: string | null; items: typeof perExercise }[] = [];
    for (const e of perExercise) {
      const last = blocks[blocks.length - 1];
      if (e.group && last && last.group === e.group) last.items.push(e);
      else blocks.push({ group: e.group, items: [e] });
    }
    const factor = athlete.unit === "lbs" ? 1 / KG_PER_LB : 1;
    const fmt = (n: number) => new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }).format(n);
    const tonnage = done.reduce((t, s) => t + (s.weight && s.reps ? Number(s.weight) * s.reps : 0), 0) * factor;
    const timed = log.started_at ? Math.max(1, Math.round((new Date(log.finished_at).getTime() - new Date(log.started_at).getTime()) / 60000)) : null;
    const minutes: number | null = log.duration_minutes ?? (timed != null && timed <= 360 ? timed : null);

    // PRs: best estimated 1RM per exercise in this workout against everything logged before it.
    const todayBest = new Map<string, { name: string; e1rm: number; weight: number; reps: number }>();
    for (const s of done) {
      if (!s.exercise_id || !s.weight || !s.reps) continue;
      // Loaded lifts, and bodyweight exercises with added weight (weighted dips, chin-ups).
      const tracking = loggerRows.find((r) => r.exerciseId === s.exercise_id)?.tracking ?? "load";
      if (tracking !== "load" && tracking !== "bodyweight_reps") continue;
      const e = epley(Number(s.weight), s.reps);
      if (e && e > (todayBest.get(s.exercise_id)?.e1rm ?? 0)) todayBest.set(s.exercise_id, { name: s.exercise_name, e1rm: e, weight: Number(s.weight), reps: s.reps });
    }
    type Pr = { exerciseId: string; name: string; text: string; matches: (x: LoggedSet) => boolean };
    const prs: Pr[] = [];
    // Speed/field exercises: their own kind of best (time per distance, distance, weight).
    const bestOf = new Map<string, Best>();
    const rowOfField = new Map<string, LoggerRow>();
    for (const r of loggerRows) {
      if (!r.exerciseId || !r.best) continue;
      bestOf.set(r.exerciseId, r.best);
      rowOfField.set(r.exerciseId, r);
    }
    const fieldToday: FieldSet[] = [];
    const num = (v: number | string | null) => (v == null ? null : Number(v));
    for (const x of done) {
      if (x.exercise_id && bestOf.has(x.exercise_id)) fieldToday.push({ exerciseId: x.exercise_id, weight: num(x.weight), reps: x.reps, seconds: num(x.seconds), distance: num(x.distance) });
    }
    if (todayBest.size > 0 || fieldToday.length > 0) {
      const { data: earlier } = await supabase
        .from("set_logs")
        .select("exercise_id, weight, reps, seconds, distance")
        .eq("athlete_id", athlete.id)
        .neq("workout_log_id", logId)
        .eq("skipped", false)
        .in("exercise_id", [...todayBest.keys(), ...bestOf.keys()])
        .limit(5000);
      const before = ((earlier ?? []) as { exercise_id: string; weight: number | null; reps: number | null; seconds: number | null; distance: number | null }[])
        .filter((s) => bestOf.has(s.exercise_id))
        .map((s) => ({ exerciseId: s.exercise_id, weight: s.weight == null ? null : Number(s.weight), reps: s.reps, seconds: s.seconds == null ? null : Number(s.seconds), distance: s.distance == null ? null : Number(s.distance) }));
      for (const rec of fieldRecords(fieldToday, before, bestOf)) {
        const row = rowOfField.get(rec.exerciseId) as LoggerRow;
        const r2 = (v: number) => String(Math.round(v * 100) / 100);
        const text =
          rec.best === "fastest"
            ? `${rec.distance != null ? `${r2(rec.distance)} ${row.distanceUnit} in ` : ""}${r2(rec.value)} s`
            : rec.best === "farthest"
              ? `${r2(rec.value)} ${row.distanceUnit}`
              : `${fmt(rec.value * factor)} ${athlete.unit}`;
        const field = rec.best === "fastest" ? "seconds" : rec.best === "farthest" ? "distance" : "weight";
        prs.push({
          exerciseId: rec.exerciseId,
          name: row.name,
          text,
          matches: (x) => !x.skipped && x[field] != null && Math.abs(Number(x[field]) - rec.value) < 0.001 && (rec.best !== "fastest" || (x.distance ?? null) === rec.distance),
        });
      }
      const prevBest = new Map<string, number>();
      for (const s of (earlier ?? []) as { exercise_id: string; weight: number | null; reps: number | null }[]) {
        const e = s.weight && s.reps ? epley(Number(s.weight), s.reps) : null;
        if (e && e > (prevBest.get(s.exercise_id) ?? 0)) prevBest.set(s.exercise_id, e);
      }
      for (const [id, b] of todayBest) {
        const prev = prevBest.get(id);
        if (prev !== undefined && b.e1rm > prev + 0.01)
          prs.push({
            exerciseId: id,
            name: b.name,
            text: `${fmt(b.weight * factor)} ${athlete.unit} × ${b.reps}`,
            matches: (x) => !x.skipped && x.weight != null && Math.abs(Number(x.weight) - b.weight) < 0.001 && x.reps === b.reps,
          });
      }
    }

    // An exercise can have more than one record today (a 10 m and a 20 m sprint).
    const prOf = new Map<string, Pr[]>();
    for (const p of prs) prOf.set(p.exerciseId, [...(prOf.get(p.exerciseId) ?? []), p]);

    // Which workout this is for the athlete, counting every finished one up to this one.
    const { count: workoutNumber } = await supabase
      .from("workout_logs")
      .select("id", { count: "exact", head: true })
      .eq("athlete_id", athlete.id)
      .not("finished_at", "is", null)
      .lte("finished_at", log.finished_at);

    const tiles = [
      { label: "Sets", value: String(done.length) },
      { label: `${athlete.unit} lifted`, value: fmt(Math.round(tonnage)) },
      { label: "Minutes", value: minutes == null ? "–" : String(minutes) },
      { label: "Session RPE", value: log.session_rpe == null ? "–" : String(log.session_rpe) },
    ];

    return (
      <div className="space-y-5">
        <div>
          <p className="text-sm text-ok">Workout done</p>
          <h1 className="mt-1 text-2xl font-bold">{log.session_name ?? "Workout"}</h1>
          {forClient && <p className="mt-1 text-sm text-muted">{athlete.full_name}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {tiles.map((t) => (
            <Card key={t.label}>
              <p className="text-3xl font-bold tabular-nums">{t.value}</p>
              <p className="mt-1 text-sm text-muted">{t.label}</p>
            </Card>
          ))}
        </div>
        {prs.length > 0 && (
          <Card>
            <h2 className="font-semibold">New personal records</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {prs.map((p) => (
                <li key={p.name + p.text}>
                  <span className="font-medium">{p.name}</span> <span className="text-muted">{p.text}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {log.comment && (
          <Card>
            <p className="text-sm text-muted">{forClient ? `${athlete.full_name.split(" ")[0]}'s comment` : "Your comment"}</p>
            <p className="mt-1 whitespace-pre-line">{log.comment}</p>
          </Card>
        )}
        {!forClient && review?.reply && (
          <Card>
            <p className="text-sm text-accent">Feedback from your coach</p>
            <p className="mt-1 whitespace-pre-line">{review.reply}</p>
          </Card>
        )}
        {perExercise.length > 0 && (
          <Card>
            {/* Everything worth sharing sits in this one card, so a single screenshot shows it. */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate font-semibold">{log.session_name ?? "Workout"}</h2>
                <p className="text-sm text-muted">
                  {new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(log.performed_on + "T12:00:00Z"))}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {workoutNumber ? <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold">Workout #{workoutNumber}</span> : null}
                {prs.length > 0 && (
                  <span className="rounded-full border border-ok/40 bg-ok/10 px-2.5 py-0.5 text-xs font-semibold text-ok">
                    🏆 {prs.length} PR{prs.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            </div>
            <p className="mt-2 text-sm tabular-nums">
              {[`${done.length} sets`, tonnage > 0 ? `${fmt(Math.round(tonnage))} ${athlete.unit}` : null, minutes != null ? `${minutes} min` : null, log.session_rpe != null ? `RPE ${log.session_rpe}` : null].filter(Boolean).join(" · ")}
            </p>
            <div className="mt-2 divide-y divide-border">
              {blocks.map((b, bi) => {
                const superset = b.items.length > 1;
                return (
                  <div key={b.items[0].key} className={superset ? `my-1 border-l-4 py-1 pl-3 ${bi % 2 ? "border-ok/70" : "border-accent/70"}` : ""}>
                    {superset && <p className="pt-1 text-xs font-semibold tracking-wide text-muted">SUPERSET</p>}
                    <ul>
                      {b.items.map((e) => {
                        const pr = e.exerciseId ? prOf.get(e.exerciseId) : undefined;
                        let marked = false;
                        return (
                          <li key={e.key} className="py-2">
                            <p className="flex items-center gap-2 text-sm font-medium">
                              {e.name}
                              {pr && <span className="rounded-full border border-ok/40 bg-ok/10 px-2 py-0.5 text-xs font-semibold text-ok">🏆 PR</span>}
                            </p>
                            {notes[e.key] && <p className="mt-0.5 whitespace-pre-line text-sm italic text-text/80">“{notes[e.key]}”</p>}
                            <p className="text-sm tabular-nums text-muted">
                              {e.sets.map((x, i) => {
                                // The set that made the PR is shown in green.
                                const isPr = !!pr && !marked && pr.some((p) => p.matches(x));
                                if (isPr) marked = true;
                                return (
                                  <span key={x.setNumber}>
                                    {i > 0 && " · "}
                                    <span className={isPr ? "font-semibold text-ok" : ""}>{setText(x)}</span>
                                  </span>
                                );
                              })}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted">Weight × reps in {unitOf}, @ is RPE.{prs.length > 0 && " Green is a new PR (best estimated max so far)."}</p>
          </Card>
        )}
        {forClient && (
          <Card>
            <h2 className="font-semibold">{review ? "Your feedback" : "Feedback"}</h2>
            {review && !review.reply && <p className="mt-1 text-sm text-muted">Marked as seen.</p>}
            {review?.reply && <p className="mt-1 text-xs text-muted">{review.reply_seen_at ? "Read" : "Not read yet"}</p>}
            <form action={reviewWorkout.bind(null, logId)} className="mt-3 space-y-3">
              <input type="hidden" name="next" value="/review" />
              <textarea
                name="reply"
                rows={3}
                maxLength={2000}
                defaultValue={review?.reply ?? ""}
                placeholder={`Reply to ${athlete.full_name.split(" ")[0]} (optional)`}
                className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 outline-none focus:border-accent"
              />
              <ActionButton className="w-full rounded-xl bg-accent px-4 py-3 font-semibold text-accent-text">{review ? "Update" : "Send and mark as seen"}</ActionButton>
              <p className="text-xs text-muted">Leave it empty to only tick it off. The athlete sees a reply on their Today screen.</p>
            </form>
          </Card>
        )}
        <Link href={backHref} className="block w-full rounded-xl bg-accent px-4 py-3 text-center font-semibold text-accent-text">
          Done
        </Link>
        <form action={repeatWorkout.bind(null, logId)}>
          <SecondaryButton type="submit">Repeat today</SecondaryButton>
        </form>
        <p className="-mt-2 text-center text-xs text-muted">Starts a new workout with these exercises and last time&apos;s numbers filled in.</p>
        <form action={reopenWorkout}>
          <input type="hidden" name="workout_log_id" value={logId} />
          <SecondaryButton type="submit">Edit sets</SecondaryButton>
        </form>
      </div>
    );
  }

  // ------------------------------------------------------------ logging view
  return (
    <Logger
      workoutLogId={logId}
      athleteId={athlete.id}
      unit={athlete.unit}
      sessionName={log.session_name ?? "Workout"}
      athleteName={forClient ? athlete.full_name : null}
      startedAt={log.duration_minutes == null ? log.started_at : null}
      rows={loggerRows}
      initialLogged={logged}
      backHref={backHref}
      isFree={isFree}
      performedOn={log.performed_on}
      isCoach={user.role === "coach"}
      savedMinutes={log.duration_minutes ?? null}
      initialNotes={notes}
      lastNotes={lastNotes}
    />
  );
}
