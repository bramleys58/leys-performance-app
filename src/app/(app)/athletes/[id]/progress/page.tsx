import { notFound } from "next/navigation";
import { BackLink } from "@/components/ui";
import { ProgressView } from "@/components/progress-view";
import { requireCoach } from "@/lib/auth";
import { getProgress } from "@/lib/progress";
import { createClient } from "@/lib/supabase/server";

export default async function AthleteProgressPage({ params }: PageProps<"/athletes/[id]/progress">) {
  await requireCoach();
  const { id } = await params;
  const supabase = await createClient();
  const { data: athlete } = await supabase.from("athletes").select("id, full_name, unit").eq("id", id).maybeSingle();
  if (!athlete) notFound();
  const data = await getProgress(id);
  return (
    <div className="space-y-5">
      <BackLink href={`/athletes/${id}`}>{athlete.full_name}</BackLink>
      <h1 className="text-2xl font-bold">Progress</h1>
      <ProgressView data={data} unit={athlete.unit as "kg" | "lbs"} historyHref={`/athletes/${id}`} />
    </div>
  );
}
