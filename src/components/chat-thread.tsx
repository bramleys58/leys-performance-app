import Link from "next/link";
import { ChatComposer } from "@/components/chat-composer";
import { ChatLive } from "@/components/chat-live";
import { PushSetup } from "@/components/push-setup";
import type { ChatMessage } from "@/lib/chat";

const TZ = "Europe/Brussels";
const time = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso));
const day = (iso: string) => new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }).format(new Date(iso));
const shortDate = (d: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));

/** One conversation: messages oldest first, day separators, the box to write at the bottom. */
export function ChatThread({ messages, asCoach, athleteId, otherName, emptyText }: { messages: ChatMessage[]; asCoach: boolean; athleteId: string | null; otherName: string; emptyText: string }) {
  const mine = (m: ChatMessage) => m.from_coach === asCoach;
  const lastMine = [...messages].reverse().find(mine);
  return (
    <div className="space-y-4">
      <PushSetup />
      {messages.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">{emptyText}</p>
      ) : (
        <ul className="space-y-2">
          {messages.map((m, i) => {
            const d = day(m.created_at);
            const sep = i === 0 || d !== day(messages[i - 1].created_at);
            const me = mine(m);
            return (
              <li key={m.id}>
                {sep && <p className="py-2 text-center text-xs text-muted">{d}</p>}
                <div className={`flex ${me ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${me ? "rounded-br-md bg-accent/15" : "rounded-bl-md border border-border bg-surface"}`}>
                    {!me && (sep || mine(messages[i - 1])) && <p className="text-xs font-semibold text-muted">{otherName}</p>}
                    {m.workout_log_id && m.workout_logs && (
                      <Link href={`/workout/${m.workout_log_id}`} className="mb-1 block text-xs text-accent">
                        About: {m.workout_logs.session_name ?? "Workout"}, {shortDate(m.workout_logs.performed_on)} →
                      </Link>
                    )}
                    {m.media_path && m.media_kind === "video" && (
                      <video src={`/chat/media/${m.id}`} controls playsInline preload="metadata" className="mb-1 max-h-96 w-full rounded-xl bg-black" />
                    )}
                    {m.media_path && m.media_kind === "image" && (
                      <a href={`/chat/media/${m.id}`} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/chat/media/${m.id}`} alt="Photo" className="mb-1 max-h-96 rounded-xl" />
                      </a>
                    )}
                    {m.media_removed && <p className="text-xs italic text-muted">{m.media_kind === "image" ? "Photo" : "Video"} removed after 30 days</p>}
                    {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                    <p className="mt-0.5 text-right text-[11px] text-muted">
                      {time(m.created_at)}
                      {me && m.id === lastMine?.id && m.read_at ? " · Seen" : ""}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="sticky bottom-0 -mx-5 border-t border-border bg-bg/95 px-5 py-3 backdrop-blur">
        <ChatComposer athleteId={athleteId} />
      </div>
      <ChatLive last={messages.at(-1)?.id ?? null} />
    </div>
  );
}
