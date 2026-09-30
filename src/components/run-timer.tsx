"use client";

import { useId, useState, useSyncExternalStore, useTransition } from "react";
import { endRun, startRun } from "@/app/actions";
import type { InUse } from "@/lib/status";
import { ClockIcon } from "./icons";

// One shared clock for every timer on the page, ticking every 15 s.
let clockNow = 0;
const listeners = new Set<() => void>();
let ticker: ReturnType<typeof setInterval> | null = null;
function subscribeClock(cb: () => void) {
  listeners.add(cb);
  if (!ticker) {
    clockNow = Date.now();
    ticker = setInterval(() => {
      clockNow = Date.now();
      listeners.forEach((l) => l());
    }, 15_000);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && ticker) {
      clearInterval(ticker);
      ticker = null;
    }
  };
}

/** Current time: the server's `now` during SSR and hydration, then the device clock (never older than the latest server render). */
function useNow(serverNow: number) {
  return useSyncExternalStore(
    subscribeClock,
    () => Math.max(clockNow, serverNow),
    () => serverNow,
  );
}

const noopSubscribe = () => () => {};
/** Wall-clock times depend on the viewer's time zone, so they only render in the browser. */
function useIsClient() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

function clock(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function minutesLeft(endsAt: number, now: number) {
  return Math.max(1, Math.ceil((endsAt - now) / 60_000));
}

/** "In use · free ~3:40" (or "Should be done") for a machine card; renders nothing once the timer has expired. */
export function InUseLine({ inUse, serverNow }: { inUse: InUse; serverNow: number }) {
  const now = useNow(serverNow);
  const client = useIsClient();
  if (now >= inUse.expiresAt) return null;
  const running = now < inUse.endsAt;
  return (
    <div className="mt-0.5 flex items-center gap-1 truncate text-caption text-text-2">
      <ClockIcon size={13} className="shrink-0 text-accent" />
      {running ? (
        <span>
          In use{client ? ` until ~${clock(inUse.endsAt)}` : ""} · {minutesLeft(inUse.endsAt, now)} min left
        </span>
      ) : (
        <span>Should be done · clothes may still be inside</span>
      )}
    </div>
  );
}

const MINUTE_OPTIONS = [15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 75, 90, 120];

/** Machine page: "I started it" with a cycle length, or the current timer and (for its starter) a way to stop it. */
export function RunTimer({
  code,
  kind,
  inUse,
  defaultMinutes,
  serverNow,
}: {
  code: string;
  kind: "washer" | "dryer";
  inUse: InUse | null;
  defaultMinutes: number;
  serverNow: number;
}) {
  const now = useNow(serverNow);
  const client = useIsClient();
  const selectId = useId();
  const [minutes, setMinutes] = useState(defaultMinutes);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const active = inUse && now < inUse.expiresAt ? inUse : null;
  const running = active != null && now < active.endsAt;
  const options = [...new Set([...MINUTE_OPTIONS, defaultMinutes])].sort((a, b) => a - b);

  const start = () =>
    startTransition(async () => {
      setError(null);
      const res = await startRun({ code, minutes });
      if (!res.ok) setError(res.error);
    });
  const stop = (id: string) =>
    startTransition(async () => {
      setError(null);
      const res = await endRun(id);
      if (!res.ok) setError(res.error);
    });

  return (
    <section aria-labelledby={`${selectId}-h`} className="animate-fade-up mt-4 rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-e1">
      <h2 id={`${selectId}-h`} className="flex items-center gap-2 text-caption uppercase tracking-wide text-text-3">
        <ClockIcon size={14} /> {active ? (running ? "In use" : "Should be done") : "Using it now?"}
      </h2>

      {active ? (
        <p className="mt-1 text-headline text-text">
          {running ? (
            <>
              {active.mine ? "You started it. " : ""}Free {client ? `at about ${clock(active.endsAt)}` : "soon"}
              <span className="text-label font-normal text-text-2"> · {minutesLeft(active.endsAt, now)} min left</span>
            </>
          ) : (
            <>{active.mine ? "Your load should be done." : "Should be done by now. Clothes may still be inside."}</>
          )}
        </p>
      ) : (
        <p className="mt-1 text-label text-text-2">Tap when you start the {kind} so others can see when it will be free.</p>
      )}

      {active?.mine ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => stop(active.runId)}
          className="pressable mt-3 inline-flex h-11 items-center rounded-full border border-border bg-surface-2 px-4 text-label font-semibold text-text disabled:opacity-60"
        >
          {running ? "Stop timer" : "I took my clothes out"}
        </button>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={start}
            className="pressable inline-flex h-11 items-center gap-1.5 rounded-full bg-accent px-4 text-label font-semibold text-accent-fg hover:brightness-110 disabled:opacity-60"
          >
            I started it
          </button>
          <label htmlFor={selectId} className="text-label text-text-2">
            runs for
          </label>
          <select
            id={selectId}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="h-11 rounded-[10px] border border-border bg-surface-2 px-2 text-label text-text"
          >
            {options.map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </select>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-label text-broken-fg">
          {error}
        </p>
      )}
    </section>
  );
}
