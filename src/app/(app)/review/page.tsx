import Link from "next/link";
import { ActionButton, Card } from "@/components/ui";
import { requireCoach } from "@/lib/auth";
import { getWorkoutsToReview } from "@/lib/review";
import { reviewWorkout } from "../coach-actions";

export const metadata = { title: "Workouts to review | Leys Performance" };

const day = (d: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(new Date(d + "T12:00:00Z"));

export default async function ReviewPage() {
  const user = await requireCoach();
  const list = await getWorkoutsToReview(user.id);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Workouts to review</h1>
        <p className="mt-1 text-sm text-muted">Finished in the last 14 days. Open one to see the sets and reply, or tick it off as seen.</p>
      </div>
      {list.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">All caught up.</p>
        </Card>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {list.map((w) => (
            <li key={w.id} className="flex items-start gap-3 px-4 py-3">
              <Link href={`/workout/${w.id}`} className="min-w-0 flex-1">
                <span className="block font-medium">
                  {w.athleteName} <span className="font-normal text-muted">· {w.sessionName}</span>
                </span>
                <span className="block text-sm text-muted">
                  {[day(w.performedOn), `${w.sets} set${w.sets === 1 ? "" : "s"}`, w.sessionRpe != null ? `RPE ${w.sessionRpe}` : null].filter(Boolean).join(" · ")}
                </span>
                {w.comment && <span className="mt-1 block truncate text-sm">“{w.comment}”</span>}
              </Link>
              <form action={reviewWorkout.bind(null, w.id)}>
                <input type="hidden" name="next" value="/review" />
                <ActionButton aria-label={`Mark ${w.athleteName}'s ${w.sessionName} as seen`} className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted">
                  Seen
                </ActionButton>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
