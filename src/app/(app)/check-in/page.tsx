import { BackLink, Card, Notice, PrimaryButton, inputClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getMyAthlete } from "@/lib/athlete";
import { SCALES, type CheckIn } from "@/lib/checkin";
import { todayISO } from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";
import { saveCheckIn } from "../athlete-actions";

export const metadata = { title: "Check-in | Leys Performance" };

const KG_PER_LB = 0.45359237;

export default async function CheckInPage({ searchParams }: PageProps<"/check-in">) {
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

  const supabase = await createClient();
  const [{ data: existing }, { data: profile }] = await Promise.all([
    supabase.from("check_ins").select("*").eq("athlete_id", athlete.id).eq("day", todayISO()).maybeSingle(),
    supabase.from("athletes").select("checkin_consent_at").eq("id", athlete.id).maybeSingle(),
  ]);
  const c = existing as CheckIn | null;
  const weight = c?.bodyweight == null ? "" : String(Math.round((athlete.unit === "lbs" ? Number(c.bodyweight) / KG_PER_LB : Number(c.bodyweight)) * 10) / 10);

  return (
    <div className="space-y-5">
      <BackLink href={home}>Today</BackLink>
      <div>
        <h1 className="text-2xl font-bold">Daily check-in</h1>
        <p className="mt-1 text-sm text-muted">Takes 20 seconds. Skip anything you do not want to answer.</p>
      </div>
      {sp.error && <Notice kind="error">Could not save your check-in. Try again.</Notice>}

      <form action={saveCheckIn} className="space-y-5">
        <Card>
          <label className="block">
            <span className="mb-1.5 block text-sm text-muted">Hours of sleep last night</span>
            <input name="sleep_hours" inputMode="decimal" defaultValue={c?.sleep_hours ?? ""} placeholder="e.g. 7.5" className={inputClass + " py-3"} />
          </label>
        </Card>

        {SCALES.map((s) => (
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
            <label className="block">
              <span className="mb-1.5 block text-sm text-muted">Bodyweight this morning in {athlete.unit} (optional)</span>
              <input name="bodyweight" inputMode="decimal" defaultValue={weight} className={inputClass + " py-3"} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm text-muted">Anything else? Pain, illness, a busy day (optional)</span>
              <textarea name="note" rows={2} maxLength={500} defaultValue={c?.note ?? ""} className={inputClass} />
            </label>
          </div>
        </Card>

        {!profile?.checkin_consent_at && (
          <label className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 text-sm">
            <input type="checkbox" name="consent" required className="mt-0.5" />
            <span>
              I agree that my coach sees my check-in answers and uses them to adjust my training. I can stop checking in at any time and ask for my answers to be deleted.
            </span>
          </label>
        )}

        <PrimaryButton type="submit" pendingLabel="Saving…">
          {c ? "Update check-in" : "Save check-in"}
        </PrimaryButton>
      </form>
    </div>
  );
}
