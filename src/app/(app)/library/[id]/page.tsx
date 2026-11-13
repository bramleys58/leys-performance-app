import { notFound } from "next/navigation";
import { ExercisePicker } from "@/components/exercise-picker";
import { ActionButton, BackLink, Card, Field, Notice, PrimaryButton, SecondaryButton, Select, inputClass } from "@/components/ui";
import { requireCoach } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { archiveExercise, mergeExercise, updateExercise } from "../../coach-actions";

const TRACKING = [
  ["load", "Load (kg and reps)"],
  ["bodyweight_reps", "Bodyweight reps (+ optional kg)"],
  ["time", "Time (seconds)"],
  ["distance", "Distance (metres)"],
  ["distance_height", "Distance or height (best result)"],
  ["reps_only", "Reps only (no PR)"],
  ["completion", "Completion (done or not)"],
];

export default async function ExercisePage({ params, searchParams }: PageProps<"/library/[id]">) {
  await requireCoach();
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const [{ data: e }, { data: patternRows }, { count: setCount }, { count: planCount }] = await Promise.all([
    supabase.from("exercises").select("*").eq("id", id).maybeSingle(),
    supabase.from("exercises").select("movement_pattern").not("movement_pattern", "is", null),
    supabase.from("set_logs").select("id", { count: "exact", head: true }).eq("exercise_id", id),
    supabase.from("session_exercises").select("id", { count: "exact", head: true }).eq("exercise_id", id),
  ]);
  if (!e) notFound();

  // Who added it, when an athlete did.
  const { data: addedBy } =
    !e.approved && e.created_by
      ? await supabase.from("athletes").select("full_name").eq("user_id", e.created_by).maybeSingle()
      : { data: null };

  const patterns = [...new Set((patternRows ?? []).map((r) => r.movement_pattern as string))].sort();

  return (
    <div className="space-y-5">
      <BackLink href="/library">Exercise library</BackLink>
      <div>
        <h1 className="text-2xl font-bold">{e.name}</h1>
        <p className="mt-1 text-sm text-muted">
          Used in {planCount ?? 0} program rows · {setCount ?? 0} logged sets
          {e.archived ? " · archived" : ""}
        </p>
      </div>

      {sp.saved && <Notice kind="ok">Saved.</Notice>}
      {sp.merged && <Notice kind="ok">Merged. Everything logged with the duplicate now counts for this exercise.</Notice>}
      {typeof sp.error === "string" && <Notice kind="error">{sp.error}</Notice>}
      {!e.approved && (
        <Notice kind="error">
          Waiting for your approval. Added by {addedBy?.full_name ?? "an athlete"} during a workout. Only they can see it until you save it below, or merge it into an existing exercise if it is a duplicate.
        </Notice>
      )}
      {e.approved && e.needs_review && !sp.saved && (
        <p className="text-sm text-muted">Marked for review. Check the details and save to clear the mark.</p>
      )}

      <Card>
        <form action={updateExercise} className="space-y-4">
          <input type="hidden" name="id" value={e.id} />
          <Field label="Name" name="name" defaultValue={e.name} required />
          <label className="block">
            <span className="mb-1.5 block text-sm text-muted">Other names (one per line, search finds these too)</span>
            <textarea name="aliases" rows={2} defaultValue={(e.aliases ?? []).join("\n")} className={inputClass} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm text-muted">Movement pattern</span>
              <input name="movement_pattern" list="patterns" defaultValue={e.movement_pattern ?? ""} className={inputClass + " py-3"} />
              <datalist id="patterns">
                {patterns.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </label>
            <Field label="Primary muscle" name="primary_muscle" defaultValue={e.primary_muscle ?? ""} />
            <Field label="Equipment" name="equipment" defaultValue={e.equipment ?? ""} />
            <Field label="Weight step (kg)" name="weight_step" inputMode="decimal" defaultValue={String(e.weight_step ?? 2.5)} />
          </div>
          <Select label="What the athlete logs" name="tracking_type" defaultValue={e.tracking_type}>
            {TRACKING.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
          <Field label="Video link" name="video_url" inputMode="url" defaultValue={e.video_url ?? ""} />
          {e.video_url && (
            <a href={e.video_url} target="_blank" rel="noopener noreferrer" className="inline-block rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
              ▶ Watch current video
            </a>
          )}
          <p className="pt-2 text-sm font-semibold">Defaults when you add it to a program</p>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Sets" name="default_sets" inputMode="numeric" defaultValue={e.default_sets ?? ""} />
            <Field label="Reps" name="default_reps" defaultValue={e.default_reps ?? ""} />
            <Field label="Tempo" name="default_tempo" defaultValue={e.default_tempo ?? ""} />
          </div>
          <label className="block">
            <span className="mb-1.5 block text-sm text-muted">Coaching note</span>
            <textarea name="default_note" rows={3} defaultValue={e.default_note ?? ""} className={inputClass} />
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" name="counts_for_maxes" defaultChecked={e.counts_for_maxes} /> Main lift (shows on the maxes sheet)
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" name="keep_review" /> Keep it marked for review
          </label>
          <PrimaryButton type="submit" pendingLabel="Saving…">
            {e.approved ? "Save" : "Approve and save"}
          </PrimaryButton>
        </form>
      </Card>

      <Card>
        <h2 className="font-semibold">Duplicate of another exercise?</h2>
        <p className="mt-1 text-sm text-muted">
          Merging moves every logged set, program row and max to the exercise you pick, keeps &ldquo;{e.name}&rdquo; as an extra name there, and removes this one.
        </p>
        <form action={mergeExercise.bind(null, e.id)} className="mt-3 space-y-3">
          <ExercisePicker />
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" required /> Yes, merge and remove this exercise
          </label>
          <SecondaryButton type="submit" pendingLabel="Merging…">
            Merge into selected exercise
          </SecondaryButton>
        </form>
      </Card>

      <form action={archiveExercise.bind(null, e.id, !e.archived)}>
        <ActionButton className="w-full rounded-xl border border-border px-4 py-3 text-sm text-muted">
          {e.archived ? "Bring back into the library" : "Archive (hide from search, keep history)"}
        </ActionButton>
      </form>
    </div>
  );
}
