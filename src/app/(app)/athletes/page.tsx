import Link from "next/link";
import { Card, Field, Notice, PrimaryButton, Select } from "@/components/ui";
import { requireCoach } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAthlete } from "../coach-actions";

export const metadata = { title: "Athletes | Leys Performance" };

export default async function AthletesPage({ searchParams }: PageProps<"/athletes">) {
  await requireCoach();
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  const showAll = params.all === "1";

  const supabase = await createClient();
  let query = supabase
    .from("athletes")
    .select("id, full_name, sport, status, is_in_person, user_id, email")
    .order("full_name");
  if (!showAll) query = query.eq("status", "active");
  const { data: athletes } = await query;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <h1 className="text-2xl font-bold">Athletes</h1>
        <Link href={showAll ? "/athletes" : "/athletes?all=1"} className="text-sm text-muted hover:text-text">
          {showAll ? "Active only" : "Show paused and archived"}
        </Link>
      </div>

      {(athletes ?? []).length === 0 ? (
        <Card>
          <p className="text-sm text-muted">No athletes yet. Add the first one below.</p>
        </Card>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {(athletes ?? []).map((a) => (
            <li key={a.id}>
              <Link href={`/athletes/${a.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{a.full_name}</p>
                  <p className="truncate text-sm text-muted">
                    {[a.sport, a.is_in_person ? "In person" : "Online", a.status !== "active" ? a.status : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted">
                  {a.user_id ? "has login" : a.email ? "not logged in yet" : "no login"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Card>
        <h2 className="font-semibold">Add an athlete</h2>
        <form action={createAthlete} className="mt-4 space-y-4">
          {error && <Notice kind="error">{error}</Notice>}
          <Field label="Full name" name="full_name" required />
          <Field label="Email (only needed if they get a login)" name="email" type="email" />
          <Field label="Sport" name="sport" />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Unit" name="unit" defaultValue="kg">
              <option value="kg">kg</option>
              <option value="lbs">lbs</option>
            </Select>
            <Select label="Coaching notes in" name="notes_language" defaultValue="en">
              <option value="en">English</option>
              <option value="nl">Dutch</option>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" name="is_in_person" /> In-person client
          </label>
          <PrimaryButton type="submit">Add athlete</PrimaryButton>
        </form>
      </Card>
    </div>
  );
}
