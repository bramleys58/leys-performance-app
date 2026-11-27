import webpush from "web-push";
import { adminClient } from "@/lib/supabase/admin";

type Keys = { publicKey: string; privateKey: string };
let cached: Keys | null = null;

/**
 * The key pair phones use to trust our notifications. Taken from Vercel settings
 * if set there, otherwise made once by the app and kept in the database.
 */
export async function vapidKeys(): Promise<Keys | null> {
  if (cached) return cached;
  if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    cached = { publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    return cached;
  }
  const admin = adminClient();
  if (!admin) return null;
  const read = async () => (await admin.from("app_keys").select("vapid_public, vapid_private").eq("id", 1).maybeSingle()).data;
  let row = await read();
  if (!row) {
    const k = webpush.generateVAPIDKeys();
    // Two first visits at once: the second insert is ignored and both read the same row.
    await admin.from("app_keys").upsert({ id: 1, vapid_public: k.publicKey, vapid_private: k.privateKey }, { onConflict: "id", ignoreDuplicates: true });
    row = await read();
  }
  if (!row) return null;
  cached = { publicKey: row.vapid_public, privateKey: row.vapid_private };
  return cached;
}

export type PushMessage = {
  title: string;
  body: string;
  /** Opened when the notification is tapped. */
  url: string;
  /** Notifications with the same tag replace each other, one per chat. */
  tag?: string;
};

/**
 * Sends a phone notification to every device of these users. Never throws:
 * a failed notification must not break sending a message. Devices that
 * unsubscribed (404/410) are removed.
 */
export async function sendPush(userIds: string[], msg: PushMessage): Promise<number> {
  if (userIds.length === 0) return 0;
  const admin = adminClient();
  const keys = await vapidKeys();
  if (!admin || !keys) return 0;
  const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").in("user_id", userIds);
  if (!subs?.length) return 0;
  const subject = process.env.VAPID_SUBJECT || "https://app.leysperformance.be";
  const payload = JSON.stringify({ ...msg, body: msg.body.length > 140 ? msg.body.slice(0, 137) + "…" : msg.body });
  let sent = 0;
  const gone: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
          vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey },
          TTL: 60 * 60 * 24,
          urgency: "high",
          timeout: 8000,
        });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) gone.push(s.id);
      }
    }),
  );
  if (gone.length) await admin.from("push_subscriptions").delete().in("id", gone);
  return sent;
}
