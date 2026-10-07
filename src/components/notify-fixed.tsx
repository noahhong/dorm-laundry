"use client";

import { useEffect, useState } from "react";
import { isWatchingForFix, stopWatchingForFix, watchForFix } from "@/app/actions";
import { currentSubscription, isIos, pushSupported, subscribeForPush } from "@/lib/push-client";
import { BellIcon } from "./icons";

type State =
  | "checking"
  | "idle"
  | "busy"
  | "on"
  /** iPhone/iPad Safari: push only works once the site is on the Home Screen (iOS 16.4+). */
  | "install"
  | "unsupported"
  | "denied";

/** "Notify me when it's fixed" for a broken machine (PLAN.md §17). Opt-in, no account. */
export function NotifyFixed({ code, label, publicKey }: { code: string; label: string; publicKey: string }) {
  const [state, setState] = useState<State>("checking");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      let next: State = "idle";
      if (!pushSupported()) next = isIos() ? "install" : "unsupported";
      else if (Notification.permission === "denied") next = "denied";
      else {
        const sub = await currentSubscription().catch(() => null);
        if (sub && (await isWatchingForFix(code, sub.endpoint).catch(() => false))) next = "on";
      }
      if (live) setState(next);
    })();
    return () => {
      live = false;
    };
  }, [code]);

  async function turnOn() {
    setState("busy");
    setError(null);
    try {
      const sub = await subscribeForPush(publicKey);
      if (sub === "denied" || sub === "dismissed") {
        setState(sub === "denied" ? "denied" : "idle");
        return;
      }
      const res = await watchForFix(code, sub);
      if (res.ok) setState("on");
      else {
        setError(res.error);
        setState("idle");
      }
    } catch {
      setError("Couldn't turn on notifications. Try again.");
      setState("idle");
    }
  }

  async function turnOff() {
    setState("busy");
    setError(null);
    try {
      const sub = await currentSubscription();
      if (sub) await stopWatchingForFix(code, sub.endpoint);
      setState("idle");
    } catch {
      setError("Couldn't cancel. Try again.");
      setState("on");
    }
  }

  // Unsupported desktop browsers: stay out of the way.
  if (state === "unsupported") return null;

  return (
    <section aria-labelledby="notify-fixed" className="animate-fade-up mt-4 rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-e1">
      <h2 id="notify-fixed" className="flex items-center gap-2 text-headline text-text">
        <BellIcon size={18} className="shrink-0 text-accent" /> {state === "on" ? "We'll let you know" : "Get told when it's fixed"}
      </h2>
      <p className="mt-1 text-label text-text-2" aria-live="polite">
        {state === "on"
          ? `You'll get one notification when ${label} works again.`
          : state === "install"
            ? "On iPhone, add this site to your Home Screen first (Share → Add to Home Screen), then open it from there and tap the bell."
            : state === "denied"
              ? "Notifications are blocked for this site. Allow them in your browser's site settings, then reload."
              : "One notification when it works again. No account, and you can cancel any time."}
      </p>
      {error && (
        <p role="alert" className="mt-2 text-label font-medium text-broken-fg">
          {error}
        </p>
      )}
      {state !== "install" && state !== "denied" && (
        <button
          type="button"
          onClick={state === "on" ? turnOff : turnOn}
          disabled={state === "checking" || state === "busy"}
          className={
            state === "on"
              ? "pressable mt-3 inline-flex h-11 items-center rounded-full border border-border bg-surface px-4 text-label font-semibold text-text disabled:opacity-60"
              : "pressable mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-accent-tint text-headline text-accent disabled:opacity-60"
          }
        >
          {state === "on" ? "Cancel notification" : state === "busy" ? "One moment…" : "Notify me when it's fixed"}
        </button>
      )}
    </section>
  );
}
