import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { ChatThread } from "@/components/chat-thread";
import { ChatLive } from "@/components/chat-live";
import { PushSetup } from "@/components/push-setup";
import { Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getMyAthlete } from "@/lib/athlete";
import { cleanupOldMedia, getThread } from "@/lib/chat";
import { createClient } from "@/lib/supabase/server";

export default async function ChatPage() {
  const user = await requireUser();
  if (user.role === "coach") return <Inbox userId={user.id} />;
  const me = await getMyAthlete();
  if (!me) redirect("/");
  const messages = await getThread(me.id);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Chat with your coach</h1>
      <ChatThread messages={messages} asCoach={false} athleteId={null} otherName="Coach" emptyText="Questions, feedback or a video of a set: send it here." />
    </div>
  );
}

const when = (iso: string) => {
  const d = new Date(iso);
  const sameDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(d) === new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
  return new Intl.DateTimeFormat("en-GB", sameDay ? { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" } : { day: "numeric", month: "short", timeZone: "Europe/Brussels" }).format(d);
};

/** Coach: one line per athlete, newest conversation first, unread in bold. */
async function Inbox({ userId }: { userId: string }) {
  const supabase = await createClient();
  after(cleanupOldMedia);
  const [{ data: athletes }, { data: recent }] = await Promise.all([
    supabase.from("athletes").select("id, full_name, user_id").eq("status", "active").order("full_name"),
    supabase.from("messages").select("athlete_id, from_coach, body, media_kind, media_removed, read_at, created_at").order("created_at", { ascending: false }).limit(1000),
  ]);
  type R = { athlete_id: string; from_coach: boolean; body: string | null; media_kind: string | null; media_removed: boolean; read_at: string | null; created_at: string };
  const rows = (recent ?? []) as R[];
  const last = new Map<string, R>();
  const unread = new Map<string, number>();
  for (const r of rows) {
    if (!last.has(r.athlete_id)) last.set(r.athlete_id, r);
    if (!r.from_coach && !r.read_at) unread.set(r.athlete_id, (unread.get(r.athlete_id) ?? 0) + 1);
  }
  const list = (athletes ?? []).filter((a) => a.user_id !== userId);
  const talking = list.filter((a) => last.has(a.id)).sort((a, b) => (last.get(b.id)!.created_at > last.get(a.id)!.created_at ? 1 : -1));
  const quiet = list.filter((a) => !last.has(a.id));
  const preview = (r: R) => (r.from_coach ? "You: " : "") + (r.body ?? (r.media_kind === "image" ? "📷 Photo" : "📹 Video"));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Messages</h1>
      <PushSetup />
      {talking.length === 0 ? (
        <p className="text-sm text-muted">No messages yet. Athletes can write to you from Chat in their menu, or right after a workout.</p>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {talking.map((a) => {
              const r = last.get(a.id)!;
              const n = unread.get(a.id) ?? 0;
              return (
                <li key={a.id}>
                  <Link href={`/chat/${a.id}`} className="flex items-center gap-3 py-3">
                    <span className="min-w-0 flex-1">
                      <span className={`block ${n ? "font-bold" : "font-medium"}`}>{a.full_name}</span>
                      <span className={`block truncate text-sm ${n ? "text-text" : "text-muted"}`}>{preview(r)}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-xs text-muted">{when(r.created_at)}</span>
                      {n > 0 && <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-text">{n}</span>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {quiet.length > 0 && (
        <details className="rounded-2xl border border-border bg-surface px-5 py-3">
          <summary className="cursor-pointer text-sm font-medium">Start a chat ({quiet.length})</summary>
          <ul className="mt-2 divide-y divide-border">
            {quiet.map((a) => (
              <li key={a.id}>
                <Link href={`/chat/${a.id}`} className="block py-2.5 text-sm">
                  {a.full_name}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
      <ChatLive last={rows[0]?.created_at ?? null} />
    </div>
  );
}
