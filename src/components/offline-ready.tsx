"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Registers the service worker that lets the app open without a connection,
 * and tells it to forget kept pages whenever the login screen is shown.
 */
export function OfflineReady() {
  const pathname = usePathname();

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const login = pathname.startsWith("/login");
    // Screens worth having without a connection: Today and an open workout.
    const keep = pathname === "/" || pathname === "/me" || pathname.startsWith("/workout/");
    if (!login && !keep) return;
    const t = setTimeout(() => {
      navigator.serviceWorker.ready
        .then((reg) => {
          if (login) return reg.active?.postMessage({ type: "clear-pages" });
          if (!navigator.onLine) return;
          const urls = performance
            .getEntriesByType("resource")
            .map((e) => e.name)
            .filter((u) => u.includes("/_next/static/"));
          reg.active?.postMessage({ type: "keep-assets", urls });
          reg.active?.postMessage({ type: "keep-page", url: window.location.pathname });
        })
        .catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [pathname]);

  return null;
}
