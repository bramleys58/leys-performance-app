import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type AthleteRow = {
  id: string;
  full_name: string;
  unit: "kg" | "lbs";
  notes_language: "en" | "nl";
};

/** The athlete profile linked to the logged-in user, or null. */
export const getMyAthlete = cache(async function getMyAthlete(): Promise<AthleteRow | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("athletes")
    .select("id, full_name, unit, notes_language")
    .eq("user_id", user.id)
    .maybeSingle();
  return (data as AthleteRow | null) ?? null;
});
