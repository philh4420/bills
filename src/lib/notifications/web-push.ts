import webpush from "web-push";

export interface WebPushSubscriptionPayload {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

let configured = false;

function must(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function configureWebPush() {
  if (configured) {
    return;
  }

  const subject = must("WEB_PUSH_SUBJECT");
  const publicKey = must("WEB_PUSH_VAPID_PUBLIC_KEY");
  const privateKey = must("WEB_PUSH_VAPID_PRIVATE_KEY");

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export function isWebPushConfigured(): boolean {
  return Boolean(
    process.env.WEB_PUSH_SUBJECT?.trim() &&
      process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim() &&
      process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim()
  );
}

export function getWebPushPublicKey(): string {
  return must("WEB_PUSH_VAPID_PUBLIC_KEY");
}

export async function sendWebPushNotification(
  subscription: WebPushSubscriptionPayload,
  payload: Record<string, unknown>
) {
  configureWebPush();
  await webpush.sendNotification(subscription, JSON.stringify(payload));
}
