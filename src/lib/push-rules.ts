// "Notify me when it's fixed" (Web Push, PLAN.md §17). Pure rules, shared by the server and the tests.

import { z } from "zod";
import type { StatusLevel } from "./status";

/**
 * The server POSTs to whatever endpoint a browser hands it, so only the browsers' own push services are accepted.
 * Chrome, Edge (Chromium), Brave, Opera and Samsung use FCM; Firefox uses Mozilla autopush; Safari uses Apple's
 * service; legacy Edge uses WNS.
 */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^([a-z0-9-]+\.)*push\.services\.mozilla\.com$/, /^([a-z0-9-]+\.)*push\.apple\.com$/, /^[a-z0-9-]+\.notify\.windows\.com$/];

export function isAllowedPushEndpoint(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return url.protocol === "https:" && url.port === "" && !url.username && !url.password && PUSH_HOSTS.some((h) => h.test(url.hostname));
}

const b64url = z.string().max(100).regex(/^[A-Za-z0-9_-]+={0,2}$/);
const bytes = (s: string) => Buffer.from(s, "base64url");

/** What `PushSubscription.toJSON()` gives us. */
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().max(1024).refine(isAllowedPushEndpoint, "Unsupported push service"),
  keys: z.object({
    // An uncompressed P-256 point, and a 16-byte secret (RFC 8291).
    p256dh: b64url.refine((s) => bytes(s).length === 65 && bytes(s)[0] === 4, "Bad key"),
    auth: b64url.refine((s) => bytes(s).length === 16, "Bad secret"),
  }),
});
export type PushSubscriptionJSON = z.infer<typeof pushSubscriptionSchema>;

/** A machine can be watched only while it's Broken. */
export const canWatch = (level: StatusLevel) => level === "broken";

/**
 * Residents' reports count as "fixed" once the status is Works (with default settings: two people saying it
 * works after one "broken"), or Unknown when no bad evidence is left. Caution ("Mixed reports", e.g. a single
 * "works" against one "broken") keeps people waiting. An admin's "Mark fixed" always counts.
 */
export const isFixed = (level: StatusLevel) => level === "works" || level === "unknown";

export const MAX_WATCHES_PER_DEVICE = 20;
export const MAX_WATCHERS_PER_MACHINE = 500;
/** Machines can sit broken for weeks; after this we stop waiting and forget the browser. */
export const WATCH_TTL_MS = 90 * 24 * 3600_000;

export interface FixedPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export function fixedPayload(m: { code: string; label: string; roomName: string }, by: "admin" | "reports"): FixedPayload {
  return {
    title: `${m.label} is working again`,
    body: `${m.roomName}: ${by === "admin" ? "a room admin marked it fixed" : "a resident says it works now"}. Tap for its status.`,
    url: `/m/${m.code}`,
    tag: `fixed-${m.code}`,
  };
}

