"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Keeps an open chat up to date: checks for new messages every 15 seconds while
 * the screen is visible, and right away when you come back to the app.
 * Also scrolls to the newest message when one arrives.
 */
export function ChatLive({ last }: { last: string | null }) {
  const router = useRouter();
  const seen = useRef<string | null>(null);

  useEffect(() => {
    const tick = () => document.visibilityState === "visible" && router.refresh();
    const t = setInterval(tick, 15000);
    // Once right after opening, so the unread dot in the menu clears.
    const first = setTimeout(tick, 800);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      clearTimeout(first);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router]);

  useEffect(() => {
    if (last && last !== seen.current) {
      seen.current = last;
      document.getElementById("chat-end")?.scrollIntoView({ block: "end" });
    }
  }, [last]);

  return <div id="chat-end" />;
}
