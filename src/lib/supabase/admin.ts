import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client with the secret key. Server only, for the few things normal
 * logins cannot do (invites, file links). Returns null when the key is not set.
 */
export function adminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!secret || !url) return null;
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const RESOURCE_BUCKET = "resources";
export const MAX_RESOURCE_BYTES = 50 * 1024 * 1024;
