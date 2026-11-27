"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireUser } from "@/lib/auth";
import { getMyAthlete } from "@/lib/athlete";
import { sendPush } from "@/lib/push";
import { adminClient, MAX_RESOURCE_BYTES } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/i;
type Result = { ok: true } | { ok: false; error: string };

/** Whose thread: an athlete always writes in their own, the coach names the athlete. */
async function threadFor(athleteId: string | null) {
  const user = await requireUser();
  if (user.role === "coach") {
    if (!athleteId || !UUID.test(athleteId)) return null;
    return { user, athleteId };
  }
  const me = await getMyAthlete();
  return me ? { user, athleteId: me.id } : null;
}

/** Step 1 of sending a photo or video: a one-time upload link into the private chat bucket. */
export async function createChatUpload(athleteId: string | null, fileName: string, size: number, type: string): Promise<{ ok: true; path: string; token: string; kind: "video" | "image" } | { ok: false; error: string }> {
  const t = await threadFor(athleteId);
  if (!t) return { ok: false, error: "Log in again and retry." };
  const kind = type.startsWith("video/") ? "video" : type.startsWith("image/") ? "image" : null;
  if (!kind) return { ok: false, error: "Only photos and videos can be sent." };
  if (!(size > 0) || size > MAX_RESOURCE_BYTES) return { ok: false, error: "That file is over 50 MB. Film a shorter clip (about 30 seconds), or at 1080p instead of 4K." };
  const admin = adminClient();
  if (!admin) return { ok: false, error: "Uploads are not set up yet." };
  const ext = (fileName.match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? (kind === "video" ? "mp4" : "jpg")).toLowerCase();
  const path = `${t.athleteId}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await admin.storage.from("chat").createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "Could not start the upload. Try again." };
  return { ok: true, path: data.path, token: data.token, kind };
}

/** Step 2: saves the message and notifies the other side's phone. */
export async function sendMessage(input: { athleteId: string | null; body: string; mediaPath?: string | null; mediaKind?: "video" | "image" | null; workoutLogId?: string | null }): Promise<Result> {
  const t = await threadFor(input.athleteId);
  if (!t) return { ok: false, error: "Log in again and retry." };
  const body = input.body.trim().slice(0, 4000) || null;
  const mediaPath = input.mediaPath && input.mediaPath.startsWith(t.athleteId + "/") ? input.mediaPath : null;
  if (!body && !mediaPath) return { ok: false, error: "Write a message or add a video." };
  const supabase = await createClient();
  const fromCoach = t.user.role === "coach";
  const { error } = await supabase.from("messages").insert({
    athlete_id: t.athleteId,
    from_coach: fromCoach,
    body,
    media_path: mediaPath,
    media_kind: mediaPath ? (input.mediaKind === "image" ? "image" : "video") : null,
    workout_log_id: input.workoutLogId && UUID.test(input.workoutLogId) ? input.workoutLogId : null,
  });
  if (error) return { ok: false, error: "Could not send it. Try again." };

  const preview = body ?? (input.mediaKind === "image" ? "📷 Photo" : "📹 Video");
  after(async () => {
    const admin = adminClient();
    if (!admin) return;
    if (fromCoach) {
      const { data: a } = await admin.from("athletes").select("user_id").eq("id", t.athleteId).maybeSingle();
      if (a?.user_id) await sendPush([a.user_id], { title: t.user.fullName.split(" ")[0] || "Your coach", body: preview, url: "/chat", tag: "chat" });
    } else {
      const [{ data: coaches }, { data: a }] = await Promise.all([admin.from("profiles").select("id").eq("role", "coach"), admin.from("athletes").select("full_name").eq("id", t.athleteId).maybeSingle()]);
      await sendPush((coaches ?? []).map((c) => c.id), { title: a?.full_name ?? "New message", body: preview, url: `/chat/${t.athleteId}`, tag: "chat-" + t.athleteId });
    }
  });
  revalidatePath("/chat", "layout");
  return { ok: true };
}

/** Saves this phone for notifications (called after the person allowed them). */
export async function savePushSubscription(sub: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<Result> {
  const user = await requireUser();
  if (!/^https:\/\//.test(sub?.endpoint ?? "") || !sub.keys?.p256dh || !sub.keys?.auth) return { ok: false, error: "Not a valid subscription." };
  const supabase = await createClient();
  // The same phone can move between logins: take it over for whoever is logged in now.
  await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  const admin = adminClient();
  if (admin) await admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  const { error } = await supabase.from("push_subscriptions").insert({ user_id: user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth });
  return error ? { ok: false, error: "Could not turn on notifications." } : { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<Result> {
  await requireUser();
  const supabase = await createClient();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return { ok: true };
}
