"use client";

import { useEffect, useState } from "react";
import { savePushSubscription } from "@/app/(app)/chat-actions";

type State = "hidden" | "ask" | "install" | "blocked" | "busy";
const DISMISS = "lp-push-dismissed";

function keyBytes(base64: string) {
  const s = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(s);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/**
 * Asks to turn on phone notifications for new messages. On an iPhone that only
 * works from the app on the home screen, so there it explains that step first.
 * Disappears once notifications are on. On the home screen it can be dismissed.
 */
export function PushSetupClient({ publicKey: KEY, dismissable = false }: { publicKey: string; dismissable?: boolean }) {
  const [state, setState] = useState<State>("hidden");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!KEY) return;
    let dismissed = false;
    try {
      dismissed = dismissable && localStorage.getItem(DISMISS) === "1";
    } catch {}
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    let next: State = "hidden";
    if (!supported) next = ios && !standalone && !dismissed ? "install" : "hidden";
    else if (Notification.permission === "denied") next = dismissable ? "hidden" : "blocked";
    else if (Notification.permission === "default") next = dismissed ? "hidden" : "ask";
    else {
      // Already allowed: make sure this phone is still saved (it can change after an update).
      navigator.serviceWorker.ready
        .then(async (reg) => {
          const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(KEY) }));
          await savePushSubscription(sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } });
        })
        .catch(() => {});
    }
    // Reading the browser's state can only happen after it loaded.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(next);
  }, [dismissable, KEY]);

  const turnOn = async () => {
    setError(null);
    setState("busy");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "blocked" : "ask");
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(KEY) }));
      const res = await savePushSubscription(sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } });
      if (!res.ok) throw new Error(res.error);
      setState("hidden");
    } catch {
      setError("Could not turn them on. Try again.");
      setState("ask");
    }
  };

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS, "1");
    } catch {}
    setState("hidden");
  };

  if (state === "hidden") return null;
  const notNow = dismissable && (
    <button type="button" onClick={dismiss} className="text-sm text-muted">
      Not now
    </button>
  );

  if (state === "blocked")
    return <p className="rounded-xl border border-border px-4 py-3 text-sm text-muted">Notifications are blocked for this app. Allow them in your phone&apos;s settings to get a ping for new messages.</p>;

  if (state === "install")
    return (
      <div className="rounded-2xl border border-accent bg-surface px-4 py-3">
        <p className="font-semibold">Get a notification for new messages</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm text-muted">
          <li>Tap the Share button in Safari (square with an arrow).</li>
          <li>Choose &quot;Add to Home Screen&quot;.</li>
          <li>Open the app from your home screen and turn on notifications.</li>
        </ol>
        {notNow && <div className="mt-2">{notNow}</div>}
      </div>
    );

  return (
    <div className="rounded-2xl border border-accent bg-surface px-4 py-3">
      <p className="font-semibold">Get a notification for new messages</p>
      <p className="text-sm text-muted">Only for messages, nothing else.</p>
      <div className="mt-2 flex items-center gap-4">
        <button type="button" onClick={turnOn} disabled={state === "busy"} className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-text disabled:opacity-50">
          {state === "busy" ? "Turning on…" : "Turn on notifications"}
        </button>
        {notNow}
      </div>
      {error && <p className="mt-2 text-sm text-accent">{error}</p>}
    </div>
  );
}
