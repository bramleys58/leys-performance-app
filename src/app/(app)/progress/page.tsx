import { Card } from "@/components/ui";
import { ProgressView } from "@/components/progress-view";
import { requireUser } from "@/lib/auth";
import { getMyAthlete } from "@/lib/athlete";
import { getProgress } from "@/lib/progress";

export const metadata = { title: "My progress | Leys Performance" };

export default async function MyProgressPage() {
  await requireUser();
  const athlete = await getMyAthlete();
  if (!athlete) {
    return (
      <Card>
        <p className="text-sm text-muted">Your login is not linked to an athlete profile yet.</p>
      </Card>
    );
  }
  const data = await getProgress(athlete.id);
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">My progress</h1>
      <ProgressView data={data} unit={athlete.unit} historyHref="/history" />
    </div>
  );
}
