// Web Push sending, shared by "notify me when it's fixed" (push.ts) and "tell me when it's done" (run-alerts.ts).
// No "server-only" here: run-alerts.ts runs from instrumentation.ts, outside the React server bundle.
import webpush from "web-push";

/** Web Push is on when both VAPID keys are set (`npx web-push generate-vapid-keys`). */
export function pushPublicKey(): string | undefined {
  const pub = process.env.VAPID_PUBLIC_KEY;
  return pub && process.env.VAPID_PRIVATE_KEY ? pub : undefined;
}

/** Push services want a contact: VAPID_SUBJECT, else the site's https origin. */
function vapidSubject(): string {
  const s = process.env.VAPID_SUBJECT || process.env.PUBLIC_BASE_URL || "";
  return /^(mailto:|https:\/\/)/.test(s) ? s : "mailto:admin@example.com";
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Send one payload to each target. Returns how many were accepted; never throws. */
export async function sendPushes(targets: PushTarget[], payload: object, ttlSeconds: number): Promise<number> {
  const publicKey = pushPublicKey();
  if (!publicKey || targets.length === 0) return 0;
  const vapidDetails = { subject: vapidSubject(), publicKey, privateKey: process.env.VAPID_PRIVATE_KEY! };
  const body = JSON.stringify(payload);
  const results = await Promise.allSettled(
    targets.map((t) =>
      webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, body, {
        vapidDetails,
        TTL: ttlSeconds,
        urgency: "normal",
        timeout: 10_000,
      }),
    ),
  );
  const failed = results.filter((r) => r.status === "rejected");
  // 404/410 just mean the browser dropped the subscription; anything else is worth a log line.
  for (const f of failed) {
    const code = (f.reason as { statusCode?: number })?.statusCode;
    if (code !== 404 && code !== 410) console.error("web push failed", code ?? f.reason);
  }
  return results.length - failed.length;
}
