import { NextResponse } from "next/server";
import { RESOURCE_BUCKET, adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Opens a resource. The lookup runs as the logged-in user, so the database only
 * returns resources this person may see. Files get a link that works for 2 minutes.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const back = new URL("/resources?error=" + encodeURIComponent("That resource is not available."), request.url);
  const { data: r } = await supabase.from("resources").select("kind, url, file_path, file_name").eq("id", id).maybeSingle();
  if (!r) return NextResponse.redirect(back);
  if (r.kind === "link" && r.url) return NextResponse.redirect(r.url);
  const admin = adminClient();
  if (!admin || !r.file_path) return NextResponse.redirect(back);
  const { data } = await admin.storage.from(RESOURCE_BUCKET).createSignedUrl(r.file_path, 120);
  return data?.signedUrl ? NextResponse.redirect(data.signedUrl) : NextResponse.redirect(back);
}
