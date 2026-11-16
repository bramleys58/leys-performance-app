import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionButton, Card, inputClass } from "@/components/ui";
import { getMyAthlete } from "@/lib/athlete";
import { requireUser } from "@/lib/auth";
import { finishWelcome } from "../athlete-actions";

export const metadata = { title: "Welcome | Leys Performance" };

/** First login: agree to the privacy notice and set the basics. One screen, under a minute. */
export default async function WelcomePage({ searchParams }: PageProps<"/welcome">) {
  const user = await requireUser();
  const athlete = await getMyAthlete();
  if (!athlete || user.role === "coach") redirect("/");
  if (athlete.privacy_accepted_at) redirect("/");
  const sp = await searchParams;
  const first = athlete.full_name.split(" ")[0];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Welcome{first ? `, ${first}` : ""}</h1>
        <p className="mt-1 text-muted">Two quick things before your first session.</p>
      </div>

      <form action={finishWelcome} className="space-y-5">
        <Card>
          <h2 className="font-semibold">Your weights in</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {(["kg", "lbs"] as const).map((u) => (
              <label key={u} className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 py-3 font-semibold has-[:checked]:border-accent has-[:checked]:text-accent">
                <input type="radio" name="unit" value={u} defaultChecked={athlete.unit === u} className="sr-only" />
                {u}
              </label>
            ))}
          </div>
          <label className="mt-4 block text-sm text-muted">
            Bodyweight today (optional)
            <input name="weight" inputMode="decimal" placeholder="e.g. 82.5" className={inputClass} />
          </label>
        </Card>

        <Card>
          <h2 className="font-semibold">Your data</h2>
          <ul className="mt-2 space-y-1.5 text-sm text-muted">
            <li>Only you and Bram see what you log. Never other athletes.</li>
            <li>Bodyweight, check-ins and pain notes are health data. They are only kept with your OK, and you can withdraw it any time.</li>
            <li>Stored in the EU. Nothing is sold, no ads, no tracking.</li>
          </ul>
          <Link href="/privacy" target="_blank" className="mt-2 inline-block text-sm text-accent underline">
            Read the full privacy notice
          </Link>
          {sp.error && <p className="mt-3 text-sm text-accent">Tick the box to continue.</p>}
          <label className="mt-4 flex items-start gap-3 text-sm">
            <input type="checkbox" name="agree" required className="mt-0.5 h-5 w-5 shrink-0" />
            <span>I have read the privacy notice and agree that my training and health data are stored to coach me.</span>
          </label>
        </Card>

        <ActionButton className="w-full rounded-xl bg-accent px-4 py-4 text-lg font-semibold text-accent-text">Let&apos;s go</ActionButton>
      </form>
    </div>
  );
}
