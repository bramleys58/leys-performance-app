import { Card, Field, Notice, PrimaryButton, SecondaryButton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { signOut } from "@/app/login/actions";
import { setPassword } from "./actions";

export const metadata = { title: "Account | Leys Performance" };

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const user = await requireUser();
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Account</h1>

      {params.welcome && <Notice kind="ok">Welcome. Choose a password so you can log in next time.</Notice>}
      {params.saved && <Notice kind="ok">Password saved.</Notice>}

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

      <form action={signOut}>
        <SecondaryButton type="submit">Log out</SecondaryButton>
      </form>
    </div>
  );
}
