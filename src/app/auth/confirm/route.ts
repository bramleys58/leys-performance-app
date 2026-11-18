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
  let hasPassword = true;

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  if (!ok) {
    const message = encodeURIComponent("That link no longer works. Each new email replaces the previous link, so use the newest one, or fill in your email below and tap 'Email me a login link'.");
    return NextResponse.redirect(`${origin}/login?error=${message}`);
  }
  const { data } = await supabase.auth.getUser();
  hasPassword = data.user?.user_metadata?.password_set === true;

  // New and recovering users, and anyone without a password yet, choose one first.
  const needsPassword = type === "invite" || type === "recovery" || !hasPassword;
  return NextResponse.redirect(`${origin}${needsPassword ? "/account?welcome=1" : "/"}`);
}
