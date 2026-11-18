import { Card, Field, Notice, PrimaryButton, SecondaryButton } from "@/components/ui";
import Link from "next/link";
import { getMyAthlete } from "@/lib/athlete";
import { requireUser } from "@/lib/auth";
import { setMyUnit } from "../athlete-actions";
import { signOut } from "@/app/login/actions";
import { setPassword } from "./actions";

export const metadata = { title: "Account | Leys Performance" };

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const user = await requireUser();
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  const athlete = user.role === "coach" ? null : await getMyAthlete();
  const when = (d: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(d));

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Account</h1>

      {(params.welcome || !user.passwordSet) && !params.saved && <Notice kind="ok">Welcome. Choose a password so you can log in next time.</Notice>}
      {params.saved && <Notice kind="ok">{params.saved === "unit" ? "Unit saved." : "Password saved."}</Notice>}

      <Card>
        <p className="text-sm text-muted">Logged in as</p>
        <p className="mt-1 font-medium">{user.email}</p>
        <p className="mt-1 text-sm text-muted">{user.role === "coach" ? "Coach" : "Athlete"}</p>
      </Card>

      <Card>
        <h2 className="font-semibold">Set a password</h2>
        <form action={setPassword} className="mt-4 space-y-4">
          {error && <Notice kind="error">{error}</Notice>}
          <Field label="New password" name="password" type="password" autoComplete="new-password" minLength={10} required />
          <Field label="Repeat password" name="repeat" type="password" autoComplete="new-password" minLength={10} required />
          <PrimaryButton type="submit">Save password</PrimaryButton>
        </form>
      </Card>

      {athlete && (
        <Card>
          <h2 className="font-semibold">Weights in</h2>
          <div className="mt-3 flex gap-2">
            {(["kg", "lbs"] as const).map((u) => (
              <form key={u} action={setMyUnit.bind(null, u)} className="flex-1">
                <button aria-pressed={athlete.unit === u} className={`w-full rounded-xl border py-3 font-semibold ${athlete.unit === u ? "border-accent text-accent" : "border-border bg-surface-2 text-muted"}`}>
                  {u}
                </button>
              </form>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">Everything you logged stays the same, it is only shown in the other unit.</p>
        </Card>
      )}

      {user.role === "coach" && (
        <Card>
          <h2 className="font-semibold">Backup</h2>
          <p className="mt-1 text-sm text-muted">
            Downloads everything in the app as one Excel file: athletes, programs, every logged set, check-ins, bodyweights, maxes, tests and packages. Worth doing once a week while the app runs on the free plan, which keeps no backups.
          </p>
          {/* A plain link: the browser downloads the file. */}
          <a href="/account/export" download className="mt-3 inline-block rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium">
            Download backup (.xlsx)
          </a>
        </Card>
      )}

      <Card>
        <h2 className="font-semibold">Privacy</h2>
        {athlete?.privacy_accepted_at && <p className="mt-1 text-sm text-muted">You agreed to the privacy notice on {when(athlete.privacy_accepted_at)}.</p>}
        <p className="mt-1 text-sm text-muted">
          Want a copy of your data, have something deleted or withdraw your consent? Email{" "}
          <a href="mailto:coach@leysperformance.be" className="text-accent underline">
            coach@leysperformance.be
          </a>
          .
        </p>
        <Link href="/privacy" className="mt-2 inline-block text-sm text-accent underline">
          Read the privacy notice
        </Link>
      </Card>

      <form action={signOut}>
        <SecondaryButton type="submit">Log out</SecondaryButton>
      </form>
    </div>
  );
}
