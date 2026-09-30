"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { submitReport, undoReport } from "@/app/actions";
import {
  DRYER_OUTCOMES,
  DRYER_SETTINGS,
  LOAD_SIZES,
  LOAD_SIZE_LABEL,
  OUTCOME_LABEL,
  SETTING_LABEL,
  SYMPTOM_LABEL,
  WASHER_OUTCOMES,
  WASHER_SETTINGS,
  symptomsFor,
  type MachineKind,
} from "@/lib/labels";
import type { StatusLevel } from "@/lib/status";
import { CheckIcon, DropIcon, DropletsIcon, FlameIcon, ScissorsIcon, SparkleIcon, StatusIcon, SunIcon, XIcon, ChevronLeft } from "./icons";

type Props = {
  machine: { code: string; label: string; kind: MachineKind; level: StatusLevel; reason: string | null };
  autoOpen?: boolean;
  /** Cloudflare Turnstile site key; when set, each report carries a bot-check token. */
  turnstileSiteKey?: string;
  /** Dryer settings this room's dryers have (coolest first); the sheet offers exactly these. */
  dryerSettings?: readonly string[];
};

type Tone = "works" | "caution" | "broken";
const OUTCOME_META: Record<string, { icon: React.ReactNode; tone: Tone; hint?: string }> = {
  dry: { icon: <SunIcon />, tone: "works", hint: "Came out dry" },
  good: { icon: <SparkleIcon />, tone: "works", hint: "Clean & spun" },
  damp: { icon: <DropIcon />, tone: "caution", hint: "Needs more time" },
  wet: { icon: <DropletsIcon />, tone: "caution", hint: "Barely dried" },
  soaking: { icon: <DropletsIcon />, tone: "caution", hint: "Dripping wet" },
  dirty: { icon: <DropIcon />, tone: "caution", hint: "Soap or stains left" },
  too_hot: { icon: <FlameIcon />, tone: "caution", hint: "Hot to touch" },
  damaged: { icon: <ScissorsIcon />, tone: "broken", hint: "Shrunk, melted…" },
  not_working: { icon: <XIcon />, tone: "broken", hint: "Won't start, no heat…" },
};

const TONE_CLS: Record<Tone, string> = {
  works: "text-works-icon",
  caution: "text-caution-icon",
  broken: "text-broken-icon",
};

const LAST_SETTING_KEY = "dl:lastSetting";
function readLast(kind: MachineKind): string | null {
  try {
    return localStorage.getItem(`${LAST_SETTING_KEY}:${kind}`);
  } catch {
    return null;
  }
}
const noopSubscribe = () => () => {};
function writeLast(kind: MachineKind, v: string) {
  try {
    localStorage.setItem(`${LAST_SETTING_KEY}:${kind}`, v);
  } catch {}
}

export function ReportSheet({ machine, autoOpen = false, turnstileSiteKey, dryerSettings }: Props) {
  const [open, setOpen] = useState(autoOpen);
  const [toast, setToast] = useState<{ text: string; id?: string; tone: "ok" | "err" } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!autoOpen) return;
    // Drop ?r=1 so a refresh doesn't reopen the sheet.
    const url = new URL(window.location.href);
    url.searchParams.delete("r");
    window.history.replaceState(null, "", url);
  }, [autoOpen]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.id ? 6000 : 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const [undoing, startUndo] = useTransition();
  const undo = (id: string) =>
    startUndo(async () => {
      const res = await undoReport(id);
      setToast(res.ok ? { text: "Report removed.", tone: "ok" } : { text: res.error, tone: "err" });
    });

  return (
    <>
      <div className="no-print pointer-events-none fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-bg via-bg/90 to-transparent px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-8">
        <div className="pointer-events-auto mx-auto max-w-2xl">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            className="pressable h-[52px] w-full rounded-[14px] bg-accent text-headline text-accent-fg shadow-e2 hover:brightness-110"
          >
            Report how it went
          </button>
        </div>
      </div>

      {open && (
        <Sheet
          machine={machine}
          turnstileSiteKey={turnstileSiteKey}
          dryerSettings={dryerSettings}
          onClose={close}
          onDone={(id) => {
            close();
            setToast({ text: `Thanks! ${machine.label} report saved.`, id, tone: "ok" });
          }}
        />
      )}

      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-[88px] z-40 flex justify-center px-4">
        {toast && (
          <div
            className={`animate-toast-in pointer-events-auto flex min-h-12 max-w-md items-center gap-3 rounded-[14px] px-4 py-2 shadow-e2 ${
              toast.tone === "ok" ? "bg-text text-bg" : "bg-broken-tint text-broken-fg"
            }`}
          >
            {toast.tone === "ok" ? <CheckIcon size={18} /> : <StatusIcon level="broken" size={18} />}
            <span className="text-label font-semibold">{toast.text}</span>
            {toast.id && toast.id !== "ignored" && (
              <button
                type="button"
                disabled={undoing}
                onClick={() => undo(toast.id!)}
                className="-mr-2 h-11 rounded-[10px] px-3 text-label font-bold underline-offset-2 hover:underline"
              >
                Undo
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function Sheet({
  machine,
  turnstileSiteKey,
  dryerSettings,
  onClose,
  onDone,
}: {
  machine: Props["machine"];
  turnstileSiteKey?: string;
  dryerSettings?: readonly string[];
  onClose: () => void;
  onDone: (id: string) => void;
}) {
  const { ref: turnstileRef, token: turnstileToken, ready: turnstileReady, reset: resetTurnstile } = useTurnstile(turnstileSiteKey);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const openedAt = useRef(0);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [setting, setSetting] = useState<string | null>(null);
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [more, setMore] = useState(false);
  const [minutes, setMinutes] = useState("");
  const [loadSize, setLoadSize] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [dragY, setDragY] = useState(0);
  const lastSetting = useSyncExternalStore(
    noopSubscribe,
    () => readLast(machine.kind),
    () => null,
  );
  const drag = useRef<{ y0: number; active: boolean }>({ y0: 0, active: false });

  const isDryer = machine.kind === "dryer";
  const outcomes: readonly string[] = isDryer ? DRYER_OUTCOMES : WASHER_OUTCOMES;
  const settings: readonly string[] = isDryer ? [...(dryerSettings ?? DRYER_SETTINGS)].reverse() : WASHER_SETTINGS;
  const flagged = machine.level === "broken" || machine.level === "caution";

  useEffect(() => {
    openedAt.current = Date.now();
  }, []);

  // Scroll lock, Esc to close, focus trap.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || !panel) return;
      const els = [...panel.querySelectorAll<HTMLElement>('button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])')];
      if (els.length === 0) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Keep focus inside the panel when the step changes.
  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, [outcome]);

  const needsSetting = isDryer && outcome !== null && outcome !== "not_working";
  const canSubmit = outcome !== null && (!needsSetting || setting !== null) && !pending && turnstileReady;

  function pickOutcome(o: string, presetSymptoms: string[] = []) {
    setOutcome(o);
    setSymptoms(presetSymptoms);
    setError(null);
  }

  function submit() {
    if (!outcome) return;
    setError(null);
    startTransition(async () => {
      const res = await submitReport({
        code: machine.code,
        outcome,
        setting: outcome === "not_working" ? null : setting,
        symptoms,
        minutes: minutes ? Number(minutes) : null,
        loadSize: loadSize as never,
        errorCode: errorCode || null,
        note: note || null,
        website: (panelRef.current?.querySelector<HTMLInputElement>('input[name="website"]')?.value ?? "") || undefined,
        elapsedMs: Date.now() - openedAt.current,
        turnstileToken: turnstileToken ?? undefined,
      });
      if (res.ok) {
        if (setting) writeLast(machine.kind, setting);
        onDone(res.id);
      } else {
        setError(res.error);
        resetTurnstile();
      }
    });
  }

  // Swipe down on the handle/header to dismiss.
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { y0: e.clientY, active: true };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (drag.current.active) setDragY(Math.max(0, e.clientY - drag.current.y0));
  };
  const onPointerUp = () => {
    if (!drag.current.active) return;
    drag.current.active = false;
    if (dragY > 110) onClose();
    else setDragY(0);
  };

  return (
    <div className="fixed inset-0 z-30">
      <div className="animate-scrim-in absolute inset-0 bg-[var(--scrim)]" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="animate-sheet-in absolute inset-x-0 bottom-0 mx-auto flex max-h-[92dvh] max-w-2xl flex-col rounded-t-[var(--radius-lg)] bg-surface shadow-e3"
        style={{ transform: dragY ? `translateY(${dragY}px)` : undefined, transition: dragY ? "none" : undefined }}
      >
        <div
          className="flex shrink-0 cursor-grab touch-none flex-col items-center px-5 pb-2 pt-2.5"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <span className="h-[5px] w-9 rounded-full bg-surface-3" aria-hidden />
          <div className="mt-2 flex w-full items-center gap-2">
            {outcome && (
              <button type="button" onClick={() => setOutcome(null)} className="-ml-2 grid h-11 w-11 place-items-center rounded-full text-text-2 hover:bg-surface-2" aria-label="Back">
                <ChevronLeft size={22} />
              </button>
            )}
            <h2 id={titleId} className="flex-1 text-headline text-text">
              {outcome ? `${machine.label} · ${OUTCOME_LABEL[outcome]}` : `${machine.label}: how'd it go?`}
            </h2>
            <button type="button" onClick={onClose} className="-mr-2 grid h-11 w-11 place-items-center rounded-full text-text-2 hover:bg-surface-2" aria-label="Close">
              <XIcon size={20} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-3">
          {turnstileSiteKey && <div ref={turnstileRef} className="empty:hidden [&:has(iframe)]:mt-3" />}
          {/* Honeypot: hidden from humans and assistive tech. */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute left-[-9999px] h-0 w-0 opacity-0" />

          {!outcome ? (
            <>
              {flagged && (
                <div className="mb-3 rounded-[14px] border border-border bg-surface-2 p-3">
                  <p className="text-label text-text-2">
                    Reported {machine.level === "broken" ? "broken" : "with issues"}
                    {machine.reason ? `: ${machine.reason}` : ""}. Is that still true?
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button type="button" data-autofocus onClick={() => pickOutcome("not_working")} className="pressable flex h-12 items-center justify-center gap-2 rounded-[12px] border border-border bg-surface text-label font-semibold text-broken-fg">
                      <StatusIcon level="broken" size={18} className="text-broken-icon" /> Still broken
                    </button>
                    <button type="button" onClick={() => pickOutcome(isDryer ? "dry" : "good")} className="pressable flex h-12 items-center justify-center gap-2 rounded-[12px] border border-border bg-surface text-label font-semibold text-works-fg">
                      <StatusIcon level="works" size={18} className="text-works-icon" /> Works now
                    </button>
                  </div>
                </div>
              )}
              <div role="radiogroup" aria-label="Outcome" className="grid grid-cols-2 gap-2.5">
                {outcomes.map((o, i) => {
                  const meta = OUTCOME_META[o];
                  return (
                    <button
                      key={o}
                      type="button"
                      role="radio"
                      aria-checked={false}
                      data-autofocus={!flagged && i === 0 ? true : undefined}
                      onClick={() => pickOutcome(o)}
                      className="pressable animate-fade-up flex min-h-[72px] flex-col items-start justify-center gap-0.5 rounded-[14px] border border-border bg-surface px-3.5 py-2.5 text-left hover:border-border-strong/60 hover:bg-surface-2"
                      style={{ ["--i" as string]: i }}
                    >
                      <span className={`flex items-center gap-2 text-headline text-text`}>
                        <span className={TONE_CLS[meta.tone]}>{meta.icon}</span>
                        {OUTCOME_LABEL[o]}
                      </span>
                      {meta.hint && <span className="text-caption text-text-3">{meta.hint}</span>}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="animate-fade-up space-y-4">
              {outcome === "not_working" ? (
                <fieldset>
                  <legend className="mb-2 text-label font-semibold text-text-2">What happened? (pick any)</legend>
                  <div className="flex flex-wrap gap-2">
                    {symptomsFor(machine.kind).map((s, i) => {
                      const on = symptoms.includes(s);
                      return (
                        <button
                          key={s}
                          type="button"
                          aria-pressed={on}
                          data-autofocus={i === 0 ? true : undefined}
                          onClick={() => setSymptoms((cur) => (on ? cur.filter((x) => x !== s) : [...cur, s].slice(0, 6)))}
                          className={`pressable h-11 rounded-full border px-3.5 text-label font-semibold ${
                            on ? "border-broken-icon bg-broken-tint text-broken-fg" : "border-border bg-surface text-text-2 hover:bg-surface-2"
                          }`}
                        >
                          {on && <CheckIcon size={14} className="-ml-0.5 mr-1 inline" />}
                          {SYMPTOM_LABEL[s]}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ) : (
                <fieldset>
                  <legend className="mb-2 text-label font-semibold text-text-2">
                    {isDryer ? "Which setting did you use?" : "Water temperature (optional)"}
                  </legend>
                  <div role="radiogroup" aria-label="Setting" style={{ gridTemplateColumns: `repeat(${settings.length}, minmax(min-content, 1fr))` }}
                    className="grid gap-1 rounded-[14px] bg-surface-2 p-1">
                    {settings.map((s, i) => (
                      <button
                        key={s}
                        type="button"
                        role="radio"
                        aria-checked={setting === s}
                        aria-label={SETTING_LABEL[s]}
                        data-autofocus={i === 0 ? true : undefined}
                        onClick={() => setSetting(setting === s && !isDryer ? null : s)}
                        className={`pressable relative h-12 rounded-[10px] px-0.5 text-[13px] font-semibold leading-tight ${
                          setting === s ? "bg-accent text-accent-fg shadow-e1" : "text-text-2 hover:bg-surface"
                        }`}
                      >
                        {SETTING_LABEL[s].replace("Delicates", "Delicate").replace("Medium", "Med")}
                        {lastSetting === s && setting !== s && (
                          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent" aria-label="(used last time)" />
                        )}
                      </button>
                    ))}
                  </div>
                  {lastSetting && isDryer && !setting && (
                    <p className="mt-1.5 text-caption text-text-3">Dot = what you used last time</p>
                  )}
                </fieldset>
              )}

              <div>
                <button type="button" onClick={() => setMore((m) => !m)} aria-expanded={more} className="h-11 text-label font-semibold text-accent">
                  {more ? "Hide details" : "More details (optional)"}
                </button>
                {more && (
                  <div className="animate-fade-up mt-1 grid gap-3">
                    <div className="grid grid-cols-2 gap-3">
                      <label className="text-label text-text-2">
                        Minutes run
                        <input
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={minutes}
                          onChange={(e) => setMinutes(e.target.value.replace(/\D/g, "").slice(0, 3))}
                          placeholder="e.g. 45"
                          className="mt-1 h-12 w-full rounded-[var(--radius-xs)] border border-border-strong/60 bg-surface px-3 text-body text-text"
                        />
                      </label>
                      <label className="text-label text-text-2">
                          Error code
                          <input
                            value={errorCode}
                            onChange={(e) => setErrorCode(e.target.value.toUpperCase().slice(0, 8))}
                            placeholder="e.g. OE"
                            autoCapitalize="characters"
                            className="mt-1 h-12 w-full rounded-[var(--radius-xs)] border border-border-strong/60 bg-surface px-3 text-body text-text"
                          />
                        </label>
                    </div>
                    <div>
                      <span className="text-label text-text-2">Load size</span>
                      <div className="mt-1 grid grid-cols-4 gap-1 rounded-[12px] bg-surface-2 p-1">
                        {LOAD_SIZES.map((l) => (
                          <button
                            key={l}
                            type="button"
                            aria-pressed={loadSize === l}
                            onClick={() => setLoadSize(loadSize === l ? null : l)}
                            className={`h-10 rounded-[9px] text-caption font-semibold ${loadSize === l ? "bg-surface text-text shadow-e1" : "text-text-2"}`}
                          >
                            {LOAD_SIZE_LABEL[l]}
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className="text-label text-text-2">
                      Note (public, no names please)
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value.slice(0, 280))}
                        rows={2}
                        placeholder="e.g. Waistband came out shiny"
                        className="mt-1 w-full rounded-[var(--radius-xs)] border border-border-strong/60 bg-surface px-3 py-2 text-body text-text"
                      />
                      <span className="block text-right text-caption text-text-3">{note.length}/280</span>
                    </label>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {outcome && (
          <div className="shrink-0 border-t border-border px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
            {error && (
              <p role="alert" className="mb-2 flex items-center gap-2 text-label font-semibold text-broken-fg">
                <StatusIcon level="broken" size={16} className="text-broken-icon" /> {error}
              </p>
            )}
            <button
              type="button"
              disabled={!canSubmit}
              onClick={submit}
              className="pressable h-[52px] w-full rounded-[14px] bg-accent text-headline text-accent-fg shadow-e1 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? "Sending…" : needsSetting && !setting ? "Pick a setting" : !turnstileReady ? "Checking…" : "Submit report"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let turnstileScript: Promise<void> | null = null;
function loadTurnstile(): Promise<void> {
  turnstileScript ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      turnstileScript = null;
      reject(new Error("turnstile failed to load"));
    };
    document.head.appendChild(s);
  });
  return turnstileScript;
}

/** Renders an interaction-only Turnstile widget; `ready` is always true when no site key is configured. */
function useTurnstile(siteKey?: string) {
  const ref = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;
    loadTurnstile()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return;
        widget.current = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          appearance: "interaction-only",
          size: "flexible",
          callback: (t: string) => setToken(t),
          "expired-callback": () => setToken(null),
          "error-callback": () => setToken(null),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey]);

  return {
    ref,
    token,
    ready: !siteKey || token !== null,
    reset: () => {
      setToken(null);
      if (widget.current) window.turnstile?.reset(widget.current);
    },
  };
}
