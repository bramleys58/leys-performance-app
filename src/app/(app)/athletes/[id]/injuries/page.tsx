import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton, BackLink, Card, Notice, inputClass } from "@/components/ui";
import { requireCoach } from "@/lib/auth";
import { isRealPain } from "@/lib/compliance";
import { todayISO } from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";
import { weekLabel } from "@/lib/weekly";
import { addInjuryNote, deleteInjuryNote, setInjuryStatus } from "../../../coach-actions";

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const nice = (day: string) => new Date(day + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default async function InjuriesPage({ params, searchParams }: PageProps<"/athletes/[id]/injuries">) {
  await requireCoach();
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const [{ data: athlete }, { data: noteData }, { data: weeklyData }, { data: dailyData }] = await Promise.all([
    supabase.from("athletes").select("id, full_name").eq("id", id).maybeSingle(),
    supabase.from("injury_notes").select("*").eq("athlete_id", id).order("day", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("weekly_check_ins").select("id, week_start, pain").eq("athlete_id", id).not("pain", "is", null).order("week_start", { ascending: false }).limit(60),
    supabase.from("check_ins").select("id, day, soreness, note").eq("athlete_id", id).eq("soreness", 5).order("day", { ascending: false }).limit(30),
  ]);
  if (!athlete) notFound();

  type N = { id: string; day: string; area: string | null; note: string; status: "open" | "resolved"; resolved_on: string | null };
  const notes = (noteData ?? []) as N[];
  const open = notes.filter((n) => n.status === "open");
  const resolved = notes.filter((n) => n.status === "resolved");

  // What the athlete reported in check-ins, newest first.
  const reports = [
    ...((weeklyData ?? []) as { id: string; week_start: string; pain: string | null }[])
      .filter((w) => isRealPain(w.pain))
      .map((w) => ({ key: "w" + w.id, day: w.week_start, source: `Weekly check-in, week of ${weekLabel(w.week_start)}`, text: w.pain as string })),
    ...((dailyData ?? []) as { id: string; day: string; soreness: number; note: string | null }[]).map((d) => ({
      key: "d" + d.id,
      day: d.day,
      source: `Daily check-in, ${nice(d.day)}`,
      text: `Very sore (5 of 5)${d.note ? `. ${d.note}` : ""}`,
    })),
  ].sort((a, b) => b.day.localeCompare(a.day));

  const prefill = { day: one(sp.day) || todayISO(), note: one(sp.note) };
  const base = `/athletes/${id}/injuries`;

  return (
    <div className="space-y-5">
      <BackLink href={`/athletes/${id}`}>{athlete.full_name}</BackLink>
      <div>
        <h1 className="text-2xl font-bold">Injury log</h1>
        <p className="mt-1 text-sm text-muted">Your own notes on pain and injuries, next to what {athlete.full_name.split(" ")[0]} reported in check-ins. Only you can see this page.</p>
      </div>
      {sp.saved && <Notice kind="ok">Saved.</Notice>}
      {typeof sp.error === "string" && <Notice kind="error">{sp.error}</Notice>}

      <Card>
        <h2 className="font-semibold">Open</h2>
        {open.length === 0 && <p className="mt-2 text-sm text-muted">Nothing open.</p>}
        <ul className="divide-y divide-border">
          {open.map((n) => (
            <li key={n.id} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {n.area ?? "Note"} <span className="ml-1 text-sm font-normal text-muted">since {nice(n.day)}</span>
                </p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm">{n.note}</p>
              </div>
              <form action={setInjuryStatus.bind(null, id, n.id, true)}>
                <ActionButton className="rounded-lg border border-ok px-3 py-1.5 text-sm text-ok">Resolved</ActionButton>
              </form>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="font-semibold" id="add">
          Add a note
        </h2>
        <form key={prefill.day + prefill.note} action={addInjuryNote.bind(null, id)} className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input name="area" placeholder="Area, e.g. left knee" className={inputClass} />
            <input name="day" type="date" defaultValue={prefill.day} aria-label="Date" className={inputClass} />
          </div>
          <textarea name="note" rows={3} required defaultValue={prefill.note} placeholder="What happened, what hurts, what you changed in training" className={inputClass} />
          <ActionButton className="rounded-xl bg-accent px-5 py-2.5 font-semibold text-accent-text">Add to log</ActionButton>
        </form>
      </Card>

      <Card>
        <h2 className="font-semibold">Reported in check-ins</h2>
        {reports.length === 0 && <p className="mt-2 text-sm text-muted">No pain reported in a check-in so far.</p>}
        <ul className="divide-y divide-border">
          {reports.map((r) => (
            <li key={r.key} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted">{r.source}</p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm">{r.text}</p>
              </div>
              <Link href={`${base}?day=${r.day}&note=${encodeURIComponent(r.text)}#add`} className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm text-muted">
                Add to log
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      {resolved.length > 0 && (
        <Card>
          <h2 className="font-semibold">Resolved</h2>
          <ul className="divide-y divide-border">
            {resolved.map((n) => (
              <li key={n.id} className="py-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {n.area ?? "Note"}{" "}
                      <span className="ml-1 text-sm font-normal text-muted">
                        {nice(n.day)} to {n.resolved_on ? nice(n.resolved_on) : "?"}
                      </span>
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted">{n.note}</p>
                  </div>
                  <form action={setInjuryStatus.bind(null, id, n.id, false)}>
                    <ActionButton className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted">Reopen</ActionButton>
                  </form>
                </div>
                <details className="mt-1 text-xs text-muted">
                  <summary className="cursor-pointer list-none">Delete</summary>
                  <form action={deleteInjuryNote.bind(null, id, n.id)} className="mt-2 flex items-center gap-2">
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" required /> Remove this note for good
                    </label>
                    <ActionButton className="rounded-lg border border-border px-2.5 py-1.5 text-accent">Delete</ActionButton>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
