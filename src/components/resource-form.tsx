"use client";

import { useRef, useState } from "react";
import { createResourceUpload, saveResource } from "@/app/(app)/coach-actions";
import { createClient } from "@/lib/supabase/client";

const field = "w-full rounded-xl border border-border bg-surface-2 px-4 py-3 outline-none focus:border-accent";

/** Coach form to add a file or a link. Files upload straight from the browser to private storage. */
export function ResourceForm({ categories, athletes }: { categories: string[]; athletes: { id: string; full_name: string }[] }) {
  const [kind, setKind] = useState<"file" | "link">("file");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("kind", kind);
    if (kind === "file") {
      const file = fileRef.current?.files?.[0];
      if (!file) return setError("Choose a file first.");
      setBusy("Uploading…");
      try {
        const start = await createResourceUpload(file.name, file.size);
        if (!start.ok) throw new Error(start.error);
        const { error: upErr } = await createClient().storage.from("resources").uploadToSignedUrl(start.path, start.token, file, { contentType: file.type || undefined });
        if (upErr) throw new Error("The upload failed. Check your connection and try again.");
        fd.set("file_path", start.path);
        fd.set("file_name", file.name);
        fd.set("file_size", String(file.size));
        fd.delete("file");
      } catch (err) {
        setBusy(null);
        return setError(err instanceof Error ? err.message : "The upload failed.");
      }
    }
    setBusy("Saving…");
    try {
      await saveResource(fd); // redirects back to the list
    } catch (err) {
      // A redirect is how a successful save ends; anything else is a real error.
      if (!(err instanceof Error && /NEXT_REDIRECT/.test(err.message + String((err as { digest?: string }).digest)))) {
        setBusy(null);
        setError("Could not save it. Try again.");
        return;
      }
      throw err;
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Kind">
        {(["file", "link"] as const).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={`rounded-xl border py-2.5 font-semibold ${kind === k ? "border-accent text-accent" : "border-border bg-surface-2 text-muted"}`}>
            {k === "file" ? "Upload a file" : "Add a link"}
          </button>
        ))}
      </div>
      {kind === "file" ? (
        <label className="block text-sm text-muted">
          File (PDF, image, video, max 50 MB)
          <input
            ref={fileRef}
            name="file"
            type="file"
            required
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f && titleRef.current && !titleRef.current.value) titleRef.current.value = f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
            }}
            className="mt-1 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-text"
          />
        </label>
      ) : (
        <input name="url" required inputMode="url" placeholder="Link, e.g. youtube.com/… or docs.google.com/…" className={field} />
      )}
      <input ref={titleRef} name="title" required maxLength={120} placeholder="Title, e.g. Nutrition basics" className={field} />
      <div className="grid grid-cols-2 gap-2">
        <input name="category" list="resource-categories" maxLength={40} defaultValue="General" aria-label="Category" className={field} />
        <datalist id="resource-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <select name="athlete_id" defaultValue="" aria-label="Who can see it" className={field}>
          <option value="">All athletes</option>
          {athletes.map((a) => (
            <option key={a.id} value={a.id}>
              Only {a.full_name}
            </option>
          ))}
        </select>
      </div>
      <textarea name="description" rows={2} maxLength={500} placeholder="Short note (optional), e.g. Read before your first session" className={field} />
      {error && <p className="text-sm text-accent">{error}</p>}
      <button type="submit" disabled={!!busy} className="w-full rounded-xl bg-accent px-4 py-3 font-semibold text-accent-text disabled:opacity-60">
        {busy ?? (kind === "file" ? "Upload and share" : "Share link")}
      </button>
    </form>
  );
}
