import Link from "next/link";
import { ActionButton, Card, Notice, inputClass } from "@/components/ui";
import { requireCoach } from "@/lib/auth";
import { weekNumbers } from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";
import { createProgram } from "../coach-actions";

export const metadata = { title: "Templates | Leys Performance" };

export default async function TemplatesPage({ searchParams }: PageProps<"/templates">) {
  await requireCoach();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("programs").select("id, name, phase, sessions(week)").is("athlete_id", null).order("name");
  const templates = (data ?? []) as unknown as { id: string; name: string; phase: string | null; sessions: { week: number | null }[] }[];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Program templates</h1>
      <p className="text-sm text-muted">Build a block once, then give it to any athlete in two taps. Each athlete gets their own copy, so you can still adjust it per person.</p>
      {typeof sp.error === "string" && <Notice kind="error">{sp.error}</Notice>}

      {templates.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">No templates yet. Start one below, or open an athlete&apos;s program and press &quot;Save as template&quot;.</p>
        </Card>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {templates.map((t) => {
            const weeks = weekNumbers(t.sessions).length;
            const perWeek = weeks > 0 ? Math.round(t.sessions.length / weeks) : t.sessions.length;
            return (
              <li key={t.id}>
                <Link href={`/programs/${t.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{t.name}</span>
                    {t.phase && <span className="block truncate text-sm text-muted">{t.phase}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-muted">
                    {weeks > 0 ? `${weeks} weeks · ` : ""}
                    {perWeek} {perWeek === 1 ? "session" : "sessions"}
                    {weeks > 0 ? " a week" : ""}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Card>
        <h2 className="font-semibold">New template</h2>
        <form action={createProgram} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <input name="name" placeholder="Name, e.g. Off-season strength 4 wk" required className={inputClass} />
          <input name="phase" placeholder="Phase or goal (optional)" className={inputClass} />
          <ActionButton className="rounded-xl bg-accent px-5 py-2.5 font-semibold text-accent-text">Create</ActionButton>
        </form>
      </Card>
    </div>
  );
}
