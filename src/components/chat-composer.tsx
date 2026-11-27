"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { createChatUpload, sendMessage } from "@/app/(app)/chat-actions";
import { createClient } from "@/lib/supabase/client";

const MAX_BYTES = 50 * 1024 * 1024;

/**
 * Message box with a button to add a video or photo. Files upload straight from
 * the phone to private storage, then the message is saved.
 */
export function ChatComposer({
  athleteId = null,
  workoutLogId = null,
  placeholder = "Write a message…",
  sentNote,
  compact = false,
}: {
  /** The coach passes the athlete; an athlete always writes in their own chat. */
  athleteId?: string | null;
  /** Links the message to a workout. */
  workoutLogId?: string | null;
  placeholder?: string;
  /** Shown after sending, for composers outside the chat itself. */
  sentNote?: React.ReactNode;
  compact?: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = (f: File | undefined) => {
    setError(null);
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setError("That file is over 50 MB. Film a shorter clip (about 30 seconds), or at 1080p instead of 4K.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setFile(f);
  };

  const send = async () => {
    if (busy || (!text.trim() && !file)) return;
    setError(null);
    let mediaPath: string | null = null;
    let mediaKind: "video" | "image" | null = null;
    try {
      if (file) {
        setBusy(file.type.startsWith("video/") ? "Uploading video…" : "Uploading photo…");
        const start = await createChatUpload(athleteId, file.name, file.size, file.type || "video/mp4");
        if (!start.ok) throw new Error(start.error);
        const { error: upErr } = await createClient().storage.from("chat").uploadToSignedUrl(start.path, start.token, file, { contentType: file.type || undefined });
        if (upErr) throw new Error("The upload failed. Check your connection and try again.");
        mediaPath = start.path;
        mediaKind = start.kind;
      }
      setBusy("Sending…");
      const res = await sendMessage({ athleteId, body: text, mediaPath, mediaKind, workoutLogId });
      if (!res.ok) throw new Error(res.error);
      setText("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      setSent(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send it. Try again.");
    } finally {
      setBusy(null);
    }
  };

  if (sent && sentNote) return <div className="text-sm text-ok">{sentNote}</div>;

  return (
    <div className="space-y-2">
      {file && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm">
          <span className="min-w-0 truncate">
            {file.type.startsWith("image/") ? "📷" : "📹"} {file.name}
          </span>
          <button type="button" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }} className="shrink-0 text-muted" aria-label="Remove attachment">
            ✕
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label="Add a video or photo"
          disabled={!!busy}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-2 text-lg"
        >
          📎
        </button>
        <input ref={fileRef} type="file" accept="video/*,image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          rows={compact ? 1 : 2}
          maxLength={4000}
          aria-label="Message"
          className="min-h-11 flex-1 resize-none rounded-xl border border-border bg-surface-2 px-3 py-2.5 outline-none focus:border-accent"
        />
        <button type="button" onClick={send} disabled={!!busy || (!text.trim() && !file)} className="h-11 shrink-0 rounded-xl bg-accent px-4 font-semibold text-accent-text disabled:opacity-40">
          Send
        </button>
      </div>
      {busy && <p className="text-sm text-muted">{busy}</p>}
      {error && <p className="text-sm text-accent">{error}</p>}
    </div>
  );
}
