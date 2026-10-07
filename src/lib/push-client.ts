// Browser side of Web Push, shared by "notify me when it's fixed" and "tell me when it's done".

const SW_URL = "/sw.js";

export function pushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** VAPID public key (base64url) → the bytes `pushManager.subscribe` wants. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function currentSubscription() {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Same key the server signs with? A rotated VAPID key means the old subscription can't receive our pushes. */
function sameKey(sub: PushSubscription, key: Uint8Array) {
  const have = sub.options.applicationServerKey;
  if (!have) return false;
  const a = new Uint8Array(have);
  return a.length === key.length && a.every((b, i) => b === key[i]);
}

/**
 * Register the service worker, ask for permission and return a subscription signed for `publicKey`.
 * Returns "denied" or "dismissed" when the person said no (or closed the prompt). Throws on other failures.
 */
export async function subscribeForPush(publicKey: string): Promise<PushSubscriptionJSON | "denied" | "dismissed"> {
  const reg = await navigator.serviceWorker.register(SW_URL, { scope: "/", updateViaCache: "none" });
  if ((await Notification.requestPermission()) !== "granted") return Notification.permission === "denied" ? "denied" : "dismissed";
  await navigator.serviceWorker.ready;
  const key = urlBase64ToUint8Array(publicKey);
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub, key)) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  return sub.toJSON();
}
