"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { alertWhenDone, cancelRunAlert } from "@/app/actions";
import { isIos, pushSupported, subscribeForPush } from "@/lib/push-client";
import { BellIcon } from "./icons";

type Support = "checking" | "ok" | "install" | "denied" | "unsupported";

const noopSubscribe = () => () => {};
function detectSupport(): Support {
  if (!pushSupported()) return isIos() ? "install" : "unsupported";
  return Notification.permission === "denied" ? "denied" : "ok";
}

/** "Notify me when it's done" on the starter's own running timer (PLAN.md §18). One push when the estimate runs out. */
export function DoneAlert({ runId, on, publicKey }: { runId: string; on: boolean; publicKey: string }) {
  const detected = useSyncExternalStore(noopSubscribe, detectSupport, () => "checking" as Support);
  const [blocked, setBlocked] = useState(false);
  const support: Support = blocked ? "denied" : detected;
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const turnOn = () =>
    startTransition(async () => {
      setError(null);
      try {
        const sub = await subscribeForPush(publicKey);
        if (sub === "denied") return setBlocked(true);
        if (sub === "dismissed") return;
        const res = await alertWhenDone(runId, sub);
        if (!res.ok) setError(res.error);
      } catch {
        setError("Couldn't turn on notifications. Try again.");
      }
    });
  const turnOff = () =>
    startTransition(async () => {
      setError(null);
      await cancelRunAlert(runId).catch(() => setError("Couldn't cancel. Try again."));
    });

  if (support === "unsupported" || support === "checking") return null;

  return (
    <div className="mt-3 border-t border-border pt-3" aria-live="polite">
      {on ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-label text-text-2">
          <BellIcon size={16} className="shrink-0 text-accent" />
          <span>{"We'll notify you when it's done."}</span>
          <button type="button" onClick={turnOff} disabled={pending} className="-my-2 inline-flex min-h-11 items-center px-1 font-semibold text-accent underline-offset-2 hover:underline disabled:opacity-60">
            Cancel
          </button>
        </p>
      ) : support === "install" ? (
        <p className="text-label text-text-2">
          {"To get told when it's done on iPhone, add this site to your Home Screen (Share → Add to Home Screen) and start the timer from there."}
        </p>
      ) : support === "denied" ? (
        <p className="text-label text-text-2">{"Notifications are blocked for this site. Allow them in your browser's site settings to get told when it's done."}</p>
      ) : (
        <button
          type="button"
          onClick={turnOn}
          disabled={pending}
          className="pressable inline-flex h-11 items-center gap-2 rounded-full bg-accent-tint px-4 text-label font-semibold text-accent disabled:opacity-60"
        >
          <BellIcon size={16} /> {pending ? "One moment…" : "Notify me when it's done"}
        </button>
      )}
      {error && (
        <p role="alert" className="mt-2 text-label text-broken-fg">
          {error}
        </p>
      )}
    </div>
  );
}
