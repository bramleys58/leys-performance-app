import { notFound } from "next/navigation";
import { ExercisePicker } from "@/components/exercise-picker";
import { BackLink, Card, Notice, SecondaryButton, inputClass } from "@/components/ui";
import { requireCoach } from "@/lib/auth";
import { epley, todayISO } from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";
import { removeMax, setMax } from "../../../coach-actions";

const KG_PER_LB = 0.45359237;

export default async function MaxesPage({ params, searchParams }: PageProps<"/athletes/[id]/maxes">) {
  await requireCoach();
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const [{ data: athlete }, { data: maxData }, { data: setData }] = await Promise.all([
    supabase.from("athletes").select("id, full_name, unit").eq("id", id).maybeSingle(),
    supabase.from("maxes").select("id, value, source, set_on, is_active, exercise_id, exercises(name)").eq("athlete_id", id).order("set_on", { ascending: false }),
    supabase
      .from("set_logs")
      .select("exercise_id, exercise_name, weight, reps, logged_at, exercises(tracking_type)")
      .eq("athlete_id", id)
      .eq("skipped", false)
      .not("weight", "is", null)
      .not("exercise_id", "is", null)
      .order("logged_at", { ascending: false })
      .limit(5000),
  ]);
  if (!athlete) notFound();

  const unit = athlete.unit as "kg" | "lbs";
  const show = (kg: number) => new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }).format(unit === "lbs" ? kg / KG_PER_LB : kg);

  type Max = { id: string; value: number; source: string; set_on: string; is_active: boolean; exercise_id: string; exercises: { name: string } | null };
  const maxes = (maxData ?? []) as unknown as Max[];
  const active = maxes.filter((m) => m.is_active).sort((a, b) => (a.exercises?.name ?? "").localeCompare(b.exercises?.name ?? ""));
  const activeBy = new Map(active.map((m) => [m.exercise_id, m]));

  // Best estimated 1RM per lift from everything the athlete logged.
  type SetRow = { exercise_id: string; exercise_name: string; weight: number; reps: number | null; logged_at: string; exercises: { tracking_type: string } | null };
  const best = new Map<string, { name: string; e1rm: number; weight: number; reps: number; on: string }>();
  for (const s of (setData ?? []) as unknown as SetRow[]) {
    if (!s.reps || (s.exercises?.tracking_type ?? "load") !== "load") continue;
    const e = epley(Number(s.weight), s.reps);
    if (e && e > (best.get(s.exercise_id)?.e1rm ?? 0)) best.set(s.exercise_id, { name: s.exercise_name, e1rm: e, weight: Number(s.weight), reps: s.reps, on: s.logged_at.slice(0, 10) });
  }
  // Suggest only where there is no max yet, or the logs clearly beat the current one.
  const suggestions = [...best.entries()]
    .filter(([exId, b]) => {
      const current = activeBy.get(exId);
      return !current || b.e1rm > Number(current.value) * 1.01;
    })
    .sort((a, b) => a[1].name.localeCompare(b[1].name));

  return (
    <div className="space-y-5">
      <BackLink href={`/athletes/${id}`}>{athlete.full_name}</BackLink>
      <h1 className="text-2xl font-bold">Maxes</h1>
      {sp.saved && <Notice kind="ok">Saved.</Notice>}
      {typeof sp.error === "string" && <Notice kind="error">{sp.error}</Notice>}

      <Card>
        <h2 className="font-semibold">Working maxes</h2>
        <p className="mt-1 text-sm text-muted">Percent-based weights in programs are calculated from these.</p>
        {active.length === 0 && <p className="mt-3 text-sm text-muted">No maxes yet.</p>}
        <ul className="mt-3 divide-y divide-border">
          {active.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{m.exercises?.name ?? "Exercise"}</p>
                <p className="text-sm text-muted">
                  {m.source} · {m.set_on}
                </p>
              </div>
              <p className="text-lg font-bold tabular-nums">
                {show(Number(m.value))} <span className="text-sm font-normal text-muted">{unit}</span>
              </p>
              <form action={removeMax.bind(null, m.id)}>
                <input type="hidden" name="athlete_id" value={id} />
                <button aria-label="Remove max" className="rounded-lg border border-border px-2.5 py-2 text-sm text-muted">✕</button>
              </form>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="font-semibold">Set a max</h2>
        <form key={maxes.length} action={setMax} className="mt-3 space-y-3">
          <input type="hidden" name="athlete_id" value={id} />
          <input type="hidden" name="unit" value={unit} />
          <ExercisePicker />
          <div className="grid grid-cols-2 gap-3">
            <input name="value" inputMode="decimal" placeholder={`Max in ${unit}`} required className={inputClass} />
            <input name="set_on" type="date" defaultValue={todayISO()} className={inputClass} />
          </div>
          <SecondaryButton type="submit">Save as tested max</SecondaryButton>
        </form>
      </Card>

      {suggestions.length > 0 && (
        <Card>
          <h2 className="font-semibold">Estimated from logged sets</h2>
          <p className="mt-1 text-sm text-muted">Suggestions only. Nothing changes until you accept one.</p>
          <ul className="mt-3 divide-y divide-border">
            {suggestions.map(([exId, b]) => {
              const current = activeBy.get(exId);
              return (
                <li key={exId} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{b.name}</p>
                    <p className="text-sm text-muted">
                      {show(b.weight)} {unit} × {b.reps} on {b.on}
                      {current ? ` · current ${show(Number(current.value))}` : ""}
                    </p>
                  </div>
                  <p className="text-lg font-bold tabular-nums">{show(b.e1rm)}</p>
                  <form action={setMax}>
                    <input type="hidden" name="athlete_id" value={id} />
                    <input type="hidden" name="exercise_id" value={exId} />
                    <input type="hidden" name="value" value={Math.round(b.e1rm * 100) / 100} />
                    <input type="hidden" name="unit" value="kg" />
                    <input type="hidden" name="source" value="estimated" />
                    <button className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">Use</button>
                  </form>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
