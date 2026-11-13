import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, SecondaryButton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { epley, roundToStep, sortRows, type PlanRow, type TrackingType } from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";
import { extraRow, type LoggedSet, type LoggerRow } from "@/lib/logger-types";
import { reopenWorkout } from "../../athlete-actions";
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
          .select("*, exercises(tracking_type, weight_step, video_url)")
          .eq("session_id", log.session_id)
      : Promise.resolve({ data: [] as unknown[] }),
    supabase.from("set_logs").select("*").eq("workout_log_id", logId),
    supabase
      .from("workout_exercises")
      .select("id, exercise_id, display_name, position, superset_group, exercises(tracking_type, weight_step, video_url)")
      .eq("workout_log_id", logId)
      .order("position"),
  ]);
  type Extra = { id: string; exercise_id: string | null; display_name: string; position: number; superset_group: string | null; exercises: { tracking_type: TrackingType; weight_step: number; video_url: string | null } | null };
  const extras = (extraData ?? []) as unknown as Extra[];
  const isFree = !log.session_id;

  type Row = PlanRow & { exercises: { tracking_type: TrackingType; weight_step: number; video_url: string | null } | null };
  const rows = sortRows((rowData ?? []) as Row[]);
  const exerciseIds = [...new Set([...rows.map((r) => r.exercise_id), ...extras.map((e) => e.exercise_id)].filter(Boolean))] as string[];

  const [{ data: lastData }, { data: maxData }] = await Promise.all([
    exerciseIds.length
      ? supabase.rpc("previous_sets", { p_athlete: athlete.id, p_exercises: exerciseIds, p_before: log.performed_on, p_exclude: logId })
      : Promise.resolve({ data: [] }),
    exerciseIds.length
      ? supabase.from("maxes").select("exercise_id, value").eq("athlete_id", athlete.id).eq("is_active", true).in("exercise_id", exerciseIds)
      : Promise.resolve({ data: [] }),
  ]);

  type Prev = { exercise_id: string; set_number: number; weight: number | null; reps: number | null; seconds: number | null; distance: number | null; performed_on: string };
  const prevBy = new Map<string, Prev[]>();
  for (const p of (lastData ?? []) as Prev[]) prevBy.set(p.exercise_id, [...(prevBy.get(p.exercise_id) ?? []), p]);
  const maxBy = new Map(((maxData ?? []) as { exercise_id: string; value: number }[]).map((m) => [m.exercise_id, Number(m.value)]));

  const loggerRows: LoggerRow[] = rows.map((r) => {
    const step = Number(r.exercises?.weight_step ?? 2.5);
    const previous = (r.exercise_id ? prevBy.get(r.exercise_id) : undefined) ?? [];
    const max = r.exercise_id ? maxBy.get(r.exercise_id) : undefined;
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
      targetValue: r.target_value == null ? null : Number(r.target_value),
      askRpe: r.ask_rpe,
      note: r.coaching_note,
      videoUrl: r.video_url ?? r.exercises?.video_url ?? null,
      tracking: r.exercises?.tracking_type ?? "load",
      weightStep: step,
      plannedKg,
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
    loggerRows.push(extraRow(e, e.exercises, prev, 3));
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

  // ----------------------------------------------------------- summary view
  if (log.finished_at) {
    const done = sets.filter((s) => !s.skipped);
    const factor = athlete.unit === "lbs" ? 1 / KG_PER_LB : 1;
    const tonnage = done.reduce((t, s) => t + (s.weight && s.reps ? Number(s.weight) * s.reps : 0), 0) * factor;
    const minutes = log.started_at ? Math.max(1, Math.round((new Date(log.finished_at).getTime() - new Date(log.started_at).getTime()) / 60000)) : null;

    // PRs: best estimated 1RM per exercise in this workout against everything logged before it.
    const todayBest = new Map<string, { name: string; e1rm: number; weight: number; reps: number }>();
    for (const s of done) {
      if (!s.exercise_id || !s.weight || !s.reps) continue;
      if ((loggerRows.find((r) => r.exerciseId === s.exercise_id)?.tracking ?? "load") !== "load") continue;
      const e = epley(Number(s.weight), s.reps);
      if (e && e > (todayBest.get(s.exercise_id)?.e1rm ?? 0)) todayBest.set(s.exercise_id, { name: s.exercise_name, e1rm: e, weight: Number(s.weight), reps: s.reps });
    }
    const prs: { name: string; weight: number; reps: number }[] = [];
    if (todayBest.size > 0) {
      const { data: earlier } = await supabase
        .from("set_logs")
        .select("exercise_id, weight, reps")
        .eq("athlete_id", athlete.id)
        .neq("workout_log_id", logId)
        .eq("skipped", false)
        .in("exercise_id", [...todayBest.keys()])
        .limit(5000);
      const prevBest = new Map<string, number>();
      for (const s of (earlier ?? []) as { exercise_id: string; weight: number | null; reps: number | null }[]) {
        const e = s.weight && s.reps ? epley(Number(s.weight), s.reps) : null;
        if (e && e > (prevBest.get(s.exercise_id) ?? 0)) prevBest.set(s.exercise_id, e);
      }
      for (const [id, b] of todayBest) {
        const prev = prevBest.get(id);
        if (prev !== undefined && b.e1rm > prev + 0.01) prs.push({ name: b.name, weight: b.weight, reps: b.reps });
      }
    }

    const fmt = (n: number) => new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }).format(n);
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
                <li key={p.name}>
                  <span className="font-medium">{p.name}</span>{" "}
                  <span className="text-muted">
                    {fmt(p.weight * factor)} {athlete.unit} × {p.reps}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {log.comment && (
          <Card>
            <p className="text-sm text-muted">Comment</p>
            <p className="mt-1 whitespace-pre-line">{log.comment}</p>
          </Card>
        )}
        <Link href={backHref} className="block w-full rounded-xl bg-accent px-4 py-3 text-center font-semibold text-accent-text">
          Done
        </Link>
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
      startedAt={log.started_at}
      rows={loggerRows}
      initialLogged={logged}
      backHref={backHref}
      isFree={isFree}
      performedOn={log.performed_on}
    />
  );
}
