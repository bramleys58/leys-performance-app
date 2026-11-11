import { Card, Field, Notice, PrimaryButton, SecondaryButton } from "@/components/ui";
import { sendLoginLink, signInWithPassword } from "./actions";

export const metadata = { title: "Log in | Leys Performance" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  const sent = typeof params.sent === "string" ? params.sent : null;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-5 py-10">
      <p className="text-xs font-semibold tracking-[0.25em] text-accent">LEYS PERFORMANCE</p>
      <h1 className="mt-2 text-3xl font-bold">Log in</h1>
      <p className="mt-2 text-sm text-muted">Use the email address your coach invited.</p>

      <Card className="mt-6">
        <form className="space-y-4">
          {error && <Notice kind="error">{error}</Notice>}
          {sent && <Notice kind="ok">{sent}</Notice>}
          <Field label="Email" name="email" type="email" autoComplete="email" inputMode="email" required />
          <Field label="Password" name="password" type="password" autoComplete="current-password" />
          <PrimaryButton formAction={signInWithPassword}>Log in</PrimaryButton>
          <SecondaryButton formAction={sendLoginLink} formNoValidate>
            Email me a login link instead
          </SecondaryButton>
        </form>
      </Card>

      <p className="mt-6 text-center text-xs text-muted">
        No account? Accounts are created by invitation only.
      </p>
    </main>
  );
}
