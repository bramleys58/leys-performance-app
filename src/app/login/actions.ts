"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function back(kind: "error" | "sent", message: string): never {
  redirect(`/login?${kind}=${encodeURIComponent(message)}`);
}

export async function signInWithPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) back("error", "Fill in your email and password.");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) back("error", "That email and password do not match.");

  redirect("/");
}

export async function sendLoginLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) back("error", "Fill in your email first.");

  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();
  // shouldCreateUser: false means only people the coach invited can get a link.
  await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/confirm` },
  });

  // Same message whether or not the address exists, so nobody can test who has an account.
  back("sent", "If that address has an account, a login link is on its way.");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
