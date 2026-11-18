"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function setPassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const repeat = String(formData.get("repeat") ?? "");

  if (password.length < 10) {
    redirect("/account?error=" + encodeURIComponent("Use at least 10 characters."));
  }
  if (password !== repeat) {
    redirect("/account?error=" + encodeURIComponent("The two passwords are not the same."));
  }

  const supabase = await createClient();
  // The flag lets the app know this person can log in with a password from now on.
  const { error } = await supabase.auth.updateUser({ password, data: { password_set: true } });
  if (error) {
    const msg = /session|jwt|not authenticated|missing/i.test(error.message)
      ? "Your login link has run out. Go to the login page, tap 'Email me a login link' and set the password from that email."
      : /different|same/i.test(error.message)
        ? "That is already your password. You can log in with it."
        : `Could not save the password: ${error.message}`;
    redirect("/account?error=" + encodeURIComponent(msg));
  }

  redirect("/account?saved=1");
}
