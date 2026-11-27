import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ChatMessage = {
  id: string;
  athlete_id: string;
  from_coach: boolean;
  body: string | null;
  media_path: string | null;
  media_kind: "video" | "image" | null;
  media_removed: boolean;
  workout_log_id: string | null;
  read_at: string | null;
  created_at: string;
  workout_logs: { session_name: string | null; performed_on: string } | null;
};

const MEDIA_DAYS = 30;

/** The last messages of one thread, oldest first, and marks the other side's messages as read. */
export async function getThread(athleteId: string, limit = 100): Promise<ChatMessage[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("messages")
    .select("id, athlete_id, from_coach, body, media_path, media_kind, media_removed, workout_log_id, read_at, created_at, workout_logs(session_name, performed_on)")
    .eq("athlete_id", athleteId)
    .order("created_at", { ascending: false })
    .limit(limit);
  await supabase.rpc("mark_chat_read", { p_athlete: athleteId });
  return ((data ?? []) as unknown as ChatMessage[]).reverse();
}

/** Unread messages for the logged-in person: for the coach from all athletes, for an athlete from the coach. */
export async function unreadCount(role: "coach" | "athlete", athleteId: string | null): Promise<number> {
  const supabase = await createClient();
  let q = supabase.from("messages").select("id", { count: "exact", head: true }).is("read_at", null).eq("from_coach", role !== "coach");
  if (role !== "coach") {
    if (!athleteId) return 0;
    q = q.eq("athlete_id", athleteId);
  }
  const { count } = await q;
  return count ?? 0;
}

/** Deletes photos and videos older than 30 days from storage. The text of the message stays. */
export async function cleanupOldMedia(): Promise<void> {
  const admin = adminClient();
  if (!admin) return;
  const cutoff = new Date(Date.now() - MEDIA_DAYS * 86400000).toISOString();
  const { data } = await admin.from("messages").select("id, media_path").not("media_path", "is", null).lt("created_at", cutoff).limit(200);
  if (!data?.length) return;
  await admin.storage.from("chat").remove(data.map((m) => m.media_path as string));
  await admin.from("messages").update({ media_path: null, media_removed: true }).in("id", data.map((m) => m.id));
}
