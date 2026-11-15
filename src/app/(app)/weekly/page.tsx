import { BackLink, Card, Notice, PrimaryButton, inputClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getMyAthlete } from "@/lib/athlete";
import { createClient } from "@/lib/supabase/server";
import { WEEKLY_SCALES, WEEKLY_TEXTS, weekLabel, weeklyTarget, type WeeklyCheckIn } from "@/lib/weekly";
import { saveWeeklyCheckIn } from "../athlete-actions";

export const metadata = { title: "Weekly check-in | Leys Performance" };

export default async function WeeklyPage({ searchParams }: PageProps<"/weekly">) {
  const user = await requireUser();
  const sp = await searchParams;
  const athlete = await getMyAthlete();
  const home = user.role === "coach" ? "/me" : "/";
  if (!athlete) {
    return (
      <Card>
        <p className="text-sm text-muted">Your login is not linked to an athlete profile yet.</p>
      </Card>
    );
  }

  const { weekStart } = weeklyTarget();
  const supabase = await createClient();
  const [{ data: existing }, { data: profile }, { data: logs }] = await Promise.all([
    supabase.from("weekly_check_ins").select("*").eq("athlete_id", athlete.id).eq("week_start", weekStart).maybeSingle(),
    supabase.from("athletes").select("checkin_consent_at").eq("id", athlete.id).maybeSingle(),
    supabase.from("workout_logs").select("id, finished_at").eq("athlete_id", athlete.id).gte("performed_on", weekStart).not("finished_at", "is", null),
  ]);
  const c = existing as WeeklyCheckIn | null;
  const done = (logs ?? []).length;

  return (
    <div className="space-y-5">
      <BackLink href={home}>Today</BackLink>
      <div>
        <h1 className="text-2xl font-bold">Weekly check-in</h1>
        <p className="mt-1 text-sm text-muted">
          Week of {weekLabel(weekStart)}. You finished {done} workout{done === 1 ? "" : "s"}. Two minutes, and it shapes next week.
        </p>
      </div>
      {sp.error && <Notice kind="error">Could not save your check-in. Try again.</Notice>}

      <form action={saveWeeklyCheckIn} className="space-y-5">
        <input type="hidden" name="week_start" value={weekStart} />
        {WEEKLY_SCALES.map((s) => (
          <Card key={s.name}>
            <fieldset>
              <legend className="font-semibold">{s.label}</legend>
              <div className="mt-3 grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <label key={n} className="cursor-pointer">
                    <input type="radio" name={s.name} value={n} defaultChecked={c?.[s.name] === n} className="peer sr-only" />
                    <span className="block rounded-xl border border-border bg-surface-2 py-3 text-center text-lg font-semibold peer-checked:border-accent peer-checked:bg-accent peer-checked:text-accent-text peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
                      {n}
                    </span>
                  </label>
                ))}
              </div>
              <div className="mt-1.5 flex justify-between text-xs text-muted">
                <span>1 = {s.low}</span>
                <span>5 = {s.high}</span>
              </div>
            </fieldset>
          </Card>
        ))}

        <Card>
          <div className="space-y-4">
            {WEEKLY_TEXTS.map((t) => (
              <label key={t.name} className="block">
                <span className="mb-1.5 block text-sm text-muted">{t.label}</span>
                <textarea name={t.name} rows={2} maxLength={1000} defaultValue={c?.[t.name] ?? ""} className={inputClass} />
              </label>
            ))}
          </div>
        </Card>

        {!profile?.checkin_consent_at && (
          <label className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 text-sm">
            <input type="checkbox" name="consent" required className="mt-0.5" />
            <span>I agree that my coach sees my check-in answers and uses them to adjust my training. I can stop checking in at any time and ask for my answers to be deleted.</span>
          </label>
        )}

        <PrimaryButton type="submit" pendingLabel="Sending…">
          {c ? "Update weekly check-in" : "Send to my coach"}
        </PrimaryButton>
      </form>
    </div>
  );
}
