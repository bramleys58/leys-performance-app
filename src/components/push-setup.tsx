import { PushSetupClient } from "@/components/push-setup-client";
import { vapidKeys } from "@/lib/push";

/** Card to turn on phone notifications for new messages. Hidden when push is not set up. */
export async function PushSetup({ dismissable = false }: { dismissable?: boolean }) {
  const keys = await vapidKeys();
  return keys ? <PushSetupClient publicKey={keys.publicKey} dismissable={dismissable} /> : null;
}
