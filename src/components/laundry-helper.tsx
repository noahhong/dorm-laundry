"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { ChatTurn, MachinePick } from "@/lib/assistant";
import type { LoadInput } from "@/lib/load-advice";
import { writeLoad } from "@/lib/load-store";
import { AlertIcon, ChevronRight, DryerIcon, SparkleIcon, WasherIcon } from "./icons";

type Props = {
  roomId: string;
  /** Set on a machine page: the machine the resident is standing at. */
  machineCode?: string;
};

type Turn = ChatTurn & { picks?: MachinePick[]; error?: boolean };

const EXAMPLES = ["Gym leggings and a hoodie", "Towels and sheets", "Jeans and a wool sweater"];

/** "Ask the laundry helper": describe the clothes, get a machine and setting. Optional, never part of reporting. */
export function LaundryHelper({ roomId, machineCode }: Props) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const history: Turn[] = [...turns.filter((t) => !t.error), { role: "user", content: q }];
    setTurns(history);
    setDraft("");
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, machineCode, messages: history.map(({ role, content }) => ({ role, content })) }),
      });
      const body = (await res.json().catch(() => ({}))) as { reply?: string; error?: string; plan?: { load: LoadInput; picks: MachinePick[] } | null };
      if (!res.ok || !body.reply) {
        setTurns([...history, { role: "assistant", content: body.error ?? "The helper couldn't answer just now.", error: true }]);
        return;
      }
      // Same picks as "What's in your load?" below, so the two agree and the report sheet pre-fills them.
      if (body.plan?.load.fabrics.length) writeLoad(body.plan.load);
      setTurns([...history, { role: "assistant", content: body.reply, picks: body.plan?.picks }]);
    } catch {
      setTurns([...history, { role: "assistant", content: "No connection. Try again.", error: true }]);
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  }

  return (
    <section aria-labelledby="laundry-helper" className="animate-fade-up mt-4 rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-e1">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="laundry-helper" className="flex items-center gap-1.5 text-caption uppercase tracking-wide text-text-3">
          <SparkleIcon size={14} className="text-accent" /> Ask the laundry helper
        </h2>
        {turns.length > 0 && !busy && (
          <button type="button" onClick={() => setTurns([])} className="h-8 text-caption font-semibold text-accent">
            Start over
          </button>
        )}
      </div>
      <p className="mt-0.5 text-label text-text-2">
        Describe what you&apos;re washing and get the {machineCode ? "setting, or a better machine" : "machine and setting to use"}. AI answers, based on this room&apos;s reports.
      </p>

      {turns.length === 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {EXAMPLES.map((e) => (
            <button key={e} type="button" onClick={() => ask(e)} className="pressable h-10 rounded-full border border-border bg-surface-2 px-3.5 text-label font-semibold text-text-2 hover:text-text">
              {e}
            </button>
          ))}
        </div>
      )}

      {turns.length > 0 && (
        <ol aria-live="polite" data-testid="helper-chat" className="mt-3 space-y-2">
          {turns.map((t, i) =>
            t.role === "user" ? (
              <li key={i} className="ml-8 rounded-[14px] rounded-br-[4px] bg-accent px-3.5 py-2 text-label text-accent-fg">
                {t.content}
              </li>
            ) : (
              <li key={i} className={`mr-4 rounded-[14px] rounded-bl-[4px] px-3.5 py-2 text-label ${t.error ? "flex items-start gap-2 bg-caution-tint text-caution-fg" : "bg-surface-2 text-text"}`}>
                {t.error && <AlertIcon className="mt-0.5 shrink-0" />}
                <p className="whitespace-pre-line">{t.content}</p>
                {t.picks && t.picks.length > 0 && (
                  <ul className="mt-2 space-y-1.5">
                    {t.picks.map((p) => (
                      <li key={p.code}>
                        <PickRow pick={p} here={p.code === machineCode} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ),
          )}
          {busy && (
            <li className="mr-4 w-fit rounded-[14px] bg-surface-2 px-3.5 py-2 text-label text-text-3" aria-label="Thinking">
              Thinking…
            </li>
          )}
        </ol>
      )}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(draft);
        }}
      >
        <label htmlFor="helper-input" className="sr-only">
          What are you washing?
        </label>
        <input
          ref={input}
          id="helper-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={600}
          placeholder={turns.length ? "Ask a follow-up" : "e.g. white hoodies and a sports bra"}
          autoComplete="off"
          enterKeyHint="send"
          className="h-11 min-w-0 flex-1 rounded-full border border-border bg-surface-2 px-4 text-body text-text placeholder:text-text-3"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="pressable h-11 shrink-0 rounded-full bg-accent px-4 text-label font-semibold text-accent-fg disabled:opacity-50"
        >
          Ask
        </button>
      </form>
    </section>
  );
}

function PickRow({ pick, here }: { pick: MachinePick; here: boolean }) {
  const Icon = pick.kind === "dryer" ? DryerIcon : WasherIcon;
  const inner = (
    <>
      <Icon size={18} className="shrink-0 text-text-3" />
      <span className="min-w-0 flex-1">
        <span className="font-semibold text-text">{pick.label}</span>
        <span className="text-text-2">{here ? " (this one)" : ""} · {pick.setting}</span>
      </span>
      {!here && <ChevronRight className="shrink-0 text-text-3" />}
    </>
  );
  const cls = "flex min-h-11 items-center gap-2 rounded-[10px] border border-border bg-surface px-3 py-2";
  return here ? (
    <div className={cls}>{inner}</div>
  ) : (
    <Link href={`/m/${pick.code}`} className={`pressable ${cls}`}>
      {inner}
    </Link>
  );
}
