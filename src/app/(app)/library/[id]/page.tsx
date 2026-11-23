import { notFound } from "next/navigation";
import { ExercisePicker } from "@/components/exercise-picker";
import { ActionButton, BackLink, Card, Field, Notice, PrimaryButton, SecondaryButton, Select, inputClass } from "@/components/ui";
import { requireCoach } from "@/lib/auth";
import { FIELD_PRESETS, presetFor } from "@/lib/field";
import { createClient } from "@/lib/supabase/server";
import { reviewQueue } from "@/lib/review-queue";
import Link from "next/link";
import { addAlternative, archiveExercise, mergeExercise, removeAlternative, updateExercise } from "../../coach-actions";

const TRACKING = [
  ["load", "Load (kg and reps)"],
  ["bodyweight_reps", "Bodyweight reps (+ optional kg)"],
  ["time", "Time (seconds)"],
  ["distance", "Distance (metres)"],
  ["distance_height", "Distance or height (best result)"],
  ["reps_only", "Reps only (no PR)"],
  ["completion", "Tick when done (drills, A-skips, wickets)"],
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
  const fieldPreset = presetFor(e.log_fields, e.best, e.distance_unit);

  // Who added it, when an athlete did.
  const { data: addedBy } =
    !e.approved && e.created_by
      ? await supabase.from("athletes").select("full_name").eq("user_id", e.created_by).maybeSingle()
      : { data: null };

  const { data: altData } = await supabase.from("exercise_alternatives").select("alt:exercises!exercise_alternatives_alternative_id_fkey(id, name)").eq("exercise_id", id);
  const alternatives = ((altData ?? []) as unknown as { alt: { id: string; name: string } | null }[]).flatMap((a) => (a.alt ? [a.alt] : [])).sort((a, b) => a.name.localeCompare(b.name));

  const patterns = [...new Set((patternRows ?? []).map((r) => r.movement_pattern as string))].sort();

  // Opened from the "to check" list: save, merge or archive moves on to the next one.
  const inQueue = sp.queue === "1";
  const queue = inQueue ? await reviewQueue(supabase) : [];
  const others = queue.filter((q) => q.id !== e.id);
  const skipTo = others.find((q) => q.name.localeCompare(e.name) > 0) ?? others[0];

  return (
    <div className="space-y-5">
      <BackLink href={inQueue ? "/library?review=check" : "/library"}>{inQueue ? "To check" : "Exercise library"}</BackLink>
      {inQueue && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm">
          <span className="text-muted">
            {queue.length} left to check{sp.saved ? " · previous one done" : ""}
          </span>
          {skipTo && (
            <Link href={`/library/${skipTo.id}?queue=1`} className="font-medium text-accent">
              Skip →
            </Link>
          )}
        </div>
      )}
      <div>
        <h1 className="text-2xl font-bold">{e.name}</h1>
        <p className="mt-1 text-sm text-muted">
          Used in {planCount ?? 0} program rows · {setCount ?? 0} logged sets
          {e.archived ? " · archived" : ""}
        </p>
      </div>

      {sp.saved && !inQueue && <Notice kind="ok">Saved.</Notice>}
      {sp.merged && <Notice kind="ok">Merged. Everything logged with the duplicate now counts for this exercise.</Notice>}
      {typeof sp.error === "string" && <Notice kind="error">{sp.error}</Notice>}
      {!e.approved && (
        <Notice kind="error">
          Waiting for your approval. Added by {addedBy?.full_name ?? "an athlete"} during a workout. Only they can see it until you save it below, or merge it into an existing exercise if it is a duplicate.
        </Notice>
      )}
      {e.approved && e.needs_review && !sp.saved && (
        <p className="text-sm text-muted">
          Marked for review{e.review_note ? <>: <span className="text-text">{e.review_note}</span></> : ""}. Check the details and save to clear the mark.
        </p>
      )}

      <Card>
        <form action={updateExercise} className="space-y-4">
          <input type="hidden" name="id" value={e.id} />
          {inQueue && <input type="hidden" name="queue" value="1" />}
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
          <Select label="What the athlete logs" name="tracking_type" defaultValue={fieldPreset ? `field:${fieldPreset.key}` : e.tracking_type}>
            <optgroup label="Gym">
              {TRACKING.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </optgroup>
            <optgroup label="Speed and field">
              {FIELD_PRESETS.map((p) => (
                <option key={p.key} value={`field:${p.key}`}>
                  {p.label} ({p.example})
                </option>
              ))}
            </optgroup>
          </Select>
          <p className="-mt-2 text-xs text-muted">Speed and field: sprints keep their best time per distance, jumps and throws their farthest, sleds their heaviest.</p>
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
            {e.approved ? (inQueue ? "Save and next" : "Save") : inQueue ? "Approve and next" : "Approve and save"}
          </PrimaryButton>
        </form>
      </Card>

      <Card>
        <h2 className="font-semibold" id="alternatives">
          Approved alternatives
        </h2>
        <p className="mt-1 text-sm text-muted">When this exercise is in a program, the athlete can swap it for one of these in a workout, for example when the equipment is taken. It works both ways.</p>
        {alternatives.length > 0 && (
          <ul className="mt-2 divide-y divide-border">
            {alternatives.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate">{a.name}</span>
                <form action={removeAlternative.bind(null, id, a.id)}>
                  <ActionButton aria-label={`Remove ${a.name}`} className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted">
                    Remove
                  </ActionButton>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form key={alternatives.length} action={addAlternative.bind(null, id)} className="mt-3 space-y-3">
          <ExercisePicker />
          <SecondaryButton type="submit">Add alternative</SecondaryButton>
        </form>
      </Card>

      <Card>
        <h2 className="font-semibold">Duplicate of another exercise?</h2>
        <p className="mt-1 text-sm text-muted">
          Merging moves every logged set, program row and max to the exercise you pick, keeps &ldquo;{e.name}&rdquo; as an extra name there, and removes this one.
        </p>
        <form action={mergeExercise.bind(null, e.id)} className="mt-3 space-y-3">
          {inQueue && <input type="hidden" name="queue" value="1" />}
          <input type="hidden" name="from_name" value={e.name} />
          <ExercisePicker />
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" required /> Yes, merge and remove this exercise
          </label>
          <SecondaryButton type="submit" pendingLabel="Merging…">
            Merge into selected exercise
          </SecondaryButton>
        </form>
      </Card>

      <form action={archiveExercise.bind(null, e.id, !e.archived, inQueue)}>
        <ActionButton className="w-full rounded-xl border border-border px-4 py-3 text-sm text-muted">
          {e.archived ? "Bring back into the library" : "Archive (hide from search, keep history)"}
        </ActionButton>
      </form>
    </div>
  );
}
