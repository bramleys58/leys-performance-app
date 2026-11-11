import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata = { title: "Setup | Leys Performance" };

// Shown only while the app is not connected to a database yet.
export default function SetupPage() {
  if (isSupabaseConfigured) redirect("/");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-10">
      <p className="text-xs font-semibold tracking-[0.25em] text-accent">LEYS PERFORMANCE</p>
      <h1 className="mt-2 text-3xl font-bold">Almost there</h1>
      <Card className="mt-6">
        <p className="text-sm text-muted">
          The app is online but not connected to its database yet. Add these two settings in Vercel
          under Project Settings, Environment Variables, then redeploy:
        </p>
        <ul className="mt-4 space-y-2 font-mono text-sm">
          <li>NEXT_PUBLIC_SUPABASE_URL</li>
          <li>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</li>
        </ul>
        <p className="mt-4 text-sm text-muted">The full steps are in docs/SETUP.md in the repository.</p>
      </Card>
    </main>
  );
}
