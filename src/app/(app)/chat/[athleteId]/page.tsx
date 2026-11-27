import Link from "next/link";
import { notFound } from "next/navigation";
import { ChatThread } from "@/components/chat-thread";
import { BackLink } from "@/components/ui";
import { requireCoach } from "@/lib/auth";
import { getThread } from "@/lib/chat";
import { createClient } from "@/lib/supabase/server";

/** Coach: the conversation with one athlete. */
export default async function CoachChatPage({ params }: PageProps<"/chat/[athleteId]">) {
  await requireCoach();
  const { athleteId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(athleteId)) notFound();
  const supabase = await createClient();
  const { data: athlete } = await supabase.from("athletes").select("id, full_name").eq("id", athleteId).maybeSingle();
  if (!athlete) notFound();
  const messages = await getThread(athleteId);
  return (
    <div className="space-y-4">
      <BackLink href="/chat">Messages</BackLink>
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold">{athlete.full_name}</h1>
        <Link href={`/athletes/${athlete.id}`} className="text-sm text-muted">
          Profile →
        </Link>
      </div>
      <ChatThread messages={messages} asCoach athleteId={athlete.id} otherName={athlete.full_name.split(" ")[0]} emptyText={`No messages with ${athlete.full_name.split(" ")[0]} yet.`} />
    </div>
  );
}
