import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "coach" | "athlete";

export type CurrentUser = {
  id: string;
  email: string;
  role: Role;
  fullName: string;
};

/** The logged-in user with their role, or a redirect to the login page. */
export const requireUser = cache(async function requireUser(): Promise<CurrentUser> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email ?? "",
    role: profile?.role === "coach" ? "coach" : "athlete",
    fullName: profile?.full_name ?? "",
  };
});

/** Same as requireUser, but sends athletes back to their home screen. */
export async function requireCoach(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "coach") redirect("/");
  return user;
}
