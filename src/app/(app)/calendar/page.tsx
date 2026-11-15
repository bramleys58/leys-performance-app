import { CalendarView } from "@/components/calendar-view";
import { Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getMyAthlete } from "@/lib/athlete";
import { getCalendar, monthOf } from "@/lib/calendar";
import { todayISO } from "@/lib/plan";

export const metadata = { title: "Calendar | Leys Performance" };

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  await requireUser();
  const sp = await searchParams;
  const athlete = await getMyAthlete();
  if (!athlete) {
    return (
      <Card>
        <p className="text-sm text-muted">Your login is not linked to an athlete profile yet.</p>
      </Card>
    );
  }
  const month = typeof sp.m === "string" ? sp.m : monthOf();
  const data = await getCalendar(athlete.id, month, false);
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Calendar</h1>
      <CalendarView data={data} selected={typeof sp.d === "string" ? sp.d : todayISO()} basePath="/calendar" />
    </div>
  );
}
