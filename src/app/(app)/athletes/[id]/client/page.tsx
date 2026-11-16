import { notFound } from "next/navigation";
import { PackageSummary } from "@/components/package-card";
import { ActionButton, BackLink, Card, Notice, inputClass } from "@/components/ui";
import { requireCoach } from "@/lib/auth";
import { type ClientPackage, packageState } from "@/lib/business";
import { todayISO } from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";
import { addPackage, deletePackage, endPackage, markPackagePaid, renewPackage } from "../../../coach-actions";

const small = "rounded-lg border border-border px-3 py-1.5 text-sm";

export default async function ClientPage({ params, searchParams }: PageProps<"/athletes/[id]/client">) {
  await requireCoach();
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayISO();

  const [{ data: athlete }, { data: pkgData }, { data: logData }] = await Promise.all([
    supabase.from("athletes").select("id, full_name").eq("id", id).maybeSingle(),
    supabase.from("client_packages").select("*").eq("athlete_id", id).order("start_date", { ascending: false }),
    supabase.from("workout_logs").select("performed_on").eq("athlete_id", id).not("finished_at", "is", null),
  ]);
  if (!athlete) notFound();
  const dates = (logData ?? []).map((l) => l.performed_on as string);
  const packages = ((pkgData ?? []) as ClientPackage[]).map((p) => ({ p, s: packageState(p, dates, today) }));
  const current = packages.filter(({ p, s }) => !p.ended && (s.running || s.alerts.length > 0));
  const past = packages.filter((x) => !current.includes(x));

  return (
    <div className="space-y-5">
      <BackLink href={`/athletes/${id}`}>{athlete.full_name}</BackLink>
      <div>
        <h1 className="text-2xl font-bold">Client and payments</h1>
        <p className="mt-1 text-sm text-muted">What {athlete.full_name.split(" ")[0]} bought, what is used and what is paid. Only you can see this.</p>
      </div>
      {sp.saved && <Notice kind="ok">Saved.</Notice>}
      {typeof sp.error === "string" && <Notice kind="error">{sp.error}</Notice>}

      <Card>
        <h2 className="font-semibold">Current</h2>
        {current.length === 0 && <p className="mt-2 text-sm text-muted">No running package.</p>}
        <ul className="divide-y divide-border">
          {current.map(({ p, s }) => (
            <li key={p.id} className="space-y-2 py-3">
              <PackageSummary p={p} s={s} />
              <div className="flex flex-wrap gap-2">
                {!p.paid_on && (p.price ?? 0) > 0 && (
                  <form action={markPackagePaid.bind(null, id, p.id, true)}>
                    <ActionButton className={`${small} border-ok text-ok`}>Mark paid</ActionButton>
                  </form>
                )}
                <form action={renewPackage.bind(null, id, p.id)}>
                  <ActionButton className={small}>Renew</ActionButton>
                </form>
                <form action={endPackage.bind(null, id, p.id, true)}>
                  <ActionButton className={`${small} text-muted`}>End</ActionButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">Sessions count as used when a workout is finished on or after the start date. Renew starts the same package again and ends this one.</p>
      </Card>

      <Card>
        <h2 className="font-semibold">Add a package</h2>
        <form action={addPackage.bind(null, id)} className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <select name="kind" defaultValue="sessions" aria-label="Kind" className={inputClass}>
              <option value="sessions">Pack of sessions</option>
              <option value="subscription">Subscription (monthly, online)</option>
            </select>
            <input name="name" placeholder="Name, e.g. 10 PT sessions" className={inputClass} />
            <label className="text-xs text-muted">
              Sessions in the pack
              <input name="sessions_total" inputMode="numeric" placeholder="e.g. 10" className={inputClass} />
            </label>
            <label className="text-xs text-muted">
              Already used before the app
              <input name="sessions_used_before" inputMode="numeric" placeholder="0" className={inputClass} />
            </label>
            <label className="text-xs text-muted">
              Price (€)
              <input name="price" inputMode="decimal" placeholder="e.g. 450" className={inputClass} />
            </label>
            <label className="text-xs text-muted">
              Start date
              <input name="start_date" type="date" defaultValue={today} className={inputClass} />
            </label>
            <label className="text-xs text-muted">
              Ends or renews on (optional)
              <input name="end_date" type="date" className={inputClass} />
            </label>
            <label className="flex items-center gap-2 self-end pb-3 text-sm text-muted">
              <input type="checkbox" name="paid" /> Already paid
            </label>
          </div>
          <textarea name="notes" rows={2} placeholder="Notes (optional), e.g. invoice number, agreement" className={inputClass} />
          <ActionButton className="rounded-xl bg-accent px-5 py-2.5 font-semibold text-accent-text">Add package</ActionButton>
        </form>
      </Card>

      {past.length > 0 && (
        <Card>
          <h2 className="font-semibold">Earlier</h2>
          <ul className="divide-y divide-border">
            {past.map(({ p, s }) => (
              <li key={p.id} className="space-y-2 py-3">
                <PackageSummary p={p} s={{ ...s, alerts: [] }} />
                <div className="flex flex-wrap items-center gap-2">
                  {p.ended && (
                    <form action={endPackage.bind(null, id, p.id, false)}>
                      <ActionButton className={`${small} text-muted`}>Reopen</ActionButton>
                    </form>
                  )}
                  {p.paid_on && (
                    <form action={markPackagePaid.bind(null, id, p.id, false)}>
                      <ActionButton className={`${small} text-muted`}>Mark unpaid</ActionButton>
                    </form>
                  )}
                  <details className="text-xs text-muted">
                    <summary className="cursor-pointer list-none px-1">Delete</summary>
                    <form action={deletePackage.bind(null, id, p.id)} className="mt-2 flex items-center gap-2">
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" required /> Remove for good (also from income)
                      </label>
                      <ActionButton className="rounded-lg border border-border px-2.5 py-1.5 text-accent">Delete</ActionButton>
                    </form>
                  </details>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
