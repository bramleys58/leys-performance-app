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
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    redirect("/account?error=" + encodeURIComponent("Could not save the password. Try again."));
  }

  redirect("/account?saved=1");
}
