import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Landing point for links in invite and login emails.
// The link carries a one-time token that is exchanged for a session here.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  const supabase = await createClient();
  let ok = false;

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  if (!ok) {
    const message = encodeURIComponent("That link is no longer valid. Ask for a new one below.");
    return NextResponse.redirect(`${origin}/login?error=${message}`);
  }

  // New and recovering users choose a password first.
  const needsPassword = type === "invite" || type === "recovery";
  return NextResponse.redirect(`${origin}${needsPassword ? "/account?welcome=1" : "/"}`);
}
