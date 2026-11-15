import { notFound } from "next/navigation";
import { CalendarView } from "@/components/calendar-view";
import { BackLink } from "@/components/ui";
import { requireCoach } from "@/lib/auth";
import { getCalendar, monthOf } from "@/lib/calendar";
import { todayISO } from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";

export default async function AthleteCalendarPage({ params, searchParams }: PageProps<"/athletes/[id]/calendar">) {
  await requireCoach();
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: athlete } = await supabase.from("athletes").select("id, full_name").eq("id", id).maybeSingle();
  if (!athlete) notFound();
  const data = await getCalendar(id, typeof sp.m === "string" ? sp.m : monthOf(), true);
  return (
    <div className="space-y-5">
      <BackLink href={`/athletes/${id}`}>{athlete.full_name}</BackLink>
      <h1 className="text-2xl font-bold">Calendar</h1>
      <CalendarView data={data} selected={typeof sp.d === "string" ? sp.d : todayISO()} basePath={`/athletes/${id}/calendar`} />
    </div>
  );
}
