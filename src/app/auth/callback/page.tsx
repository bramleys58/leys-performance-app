"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Landing page for invite emails. Supabase's standard invite link puts the
// session in the part of the address after "#", which only the browser can
// read, so this page runs in the browser and stores the session.
export default function AuthCallbackPage() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      const type = hash.get("type");
      const supabase = createClient();

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (cancelled) return;
        if (error) return setFailed(true);
        // Remove the tokens from the address bar and browser history.
        const needsPassword = type === "invite" || type === "recovery";
        window.location.replace(needsPassword ? "/account?welcome=1" : "/");
        return;
      }

      // No tokens: either already logged in, or the link expired.
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      if (data.user) window.location.replace("/");
      else setFailed(true);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-5 py-10 text-center">
      <p className="text-xs font-semibold tracking-[0.25em] text-accent">LEYS PERFORMANCE</p>
      {failed ? (
        <>
          <h1 className="mt-3 text-2xl font-bold">This link no longer works</h1>
          <p className="mt-2 text-sm text-muted">It may have expired or been used already.</p>
          <a href="/login" className="mt-6 rounded-xl bg-accent px-4 py-3 font-semibold text-accent-text">
            Go to login
          </a>
        </>
      ) : (
        <h1 className="mt-3 text-2xl font-bold">Logging you in…</h1>
      )}
    </main>
  );
}
