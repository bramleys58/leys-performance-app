import { notFound } from "next/navigation";
import { BackLink } from "@/components/ui";
import { ProgressView } from "@/components/progress-view";
import { requireCoach } from "@/lib/auth";
import { getProgress } from "@/lib/progress";
import { logAthleteBodyweight } from "../../../coach-actions";
import { saveTrackedLifts } from "../../../athlete-actions";
import { createClient } from "@/lib/supabase/server";

export default async function AthleteProgressPage({ params, searchParams }: PageProps<"/athletes/[id]/progress">) {
  const sp = await searchParams;
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
      <ProgressView data={data} unit={athlete.unit as "kg" | "lbs"} historyHref={`/athletes/${id}`} logBodyweight={logAthleteBodyweight.bind(null, id)} bwStatus={typeof sp.bw === "string" ? sp.bw : undefined} saveLifts={saveTrackedLifts.bind(null, id, `/athletes/${id}/progress`)} />
    </div>
  );
}
