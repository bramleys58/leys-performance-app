import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Opens a photo or video from the chat. The lookup runs as the logged-in user, so
 * only messages this person may see are found. The link works for an hour, long
 * enough to watch and scrub through a clip.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: m } = await supabase.from("messages").select("media_path").eq("id", id).maybeSingle();
  const admin = adminClient();
  if (!m?.media_path || !admin) return new NextResponse("Not available", { status: 404 });
  const { data } = await admin.storage.from("chat").createSignedUrl(m.media_path, 3600);
  if (!data?.signedUrl) return new NextResponse("Not available", { status: 404 });
  return NextResponse.redirect(data.signedUrl, { headers: { "cache-control": "private, max-age=3000" } });
}
