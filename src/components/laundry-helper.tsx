"use client";

import Link from "next/link";
import { useState } from "react";
import type { ChatTurn, LoadQuestion, MachinePick, LoadPlan } from "@/lib/assistant";
import { writeLoad } from "@/lib/load-store";
import { AlertIcon, ChevronRight, DryerIcon, SparkleIcon, WasherIcon } from "./icons";

type Props = { roomId: string; usingChatGPT?: boolean; machineCode?: string };
type Answer = { reply: string; question?: LoadQuestion; plan: Pick<LoadPlan, "load" | "picks" | "options" | "care"> | null };
const chip = "pressable min-h-10 rounded-full border px-3.5 py-2 text-label font-semibold disabled:opacity-50";
const field = "w-full rounded-[10px] border border-border bg-surface-2 p-3 text-body text-text";
const QUICK_ITEMS = ["T-shirt", "Hoodie", "Jeans", "Leggings", "Towel", "Socks", "Sheets", "Underwear", "Sports bra", "Sweater", "Puffer jacket", "Blanket", "Dress", "Button-down shirt", "Pillowcase", "Swimwear", "Shorts", "Joggers"];

/** A guided load planner. Conversation is kept privately to resolve follow-up details. */
export function LaundryHelper({ roomId, machineCode, usingChatGPT }: Props) {
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<string[]>([]);
  const [browse, setBrowse] = useState(false);
  const [size, setSize] = useState("Not sure");
  const [careLabel, setCareLabel] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState("");

  async function plan(text: string) {
    if (!text.trim() || busy) return;
    const history: ChatTurn[] = [...turns, { role: "user", content: text }];
    setBusy(true); setError(null); setRetry(text);
    try {
      const response = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId, machineCode, messages: history }) });
      const body = await response.json().catch(() => ({})) as Answer & { error?: string };
      if (!response.ok || !body.reply) { setError(body.error || "Couldn't plan this load. Try again."); return; }
      if (body.plan?.load.fabrics.length && body.plan.care !== "no_machine") writeLoad(body.plan.load);
      setTurns([...history, { role: "assistant", content: body.reply }]);
      setAnswer(body); setDetail("");
    } catch { setError("No connection. Your load details are saved here; try again."); }
    finally { setBusy(false); }
  }
  function edit() { setAnswer(null); setTurns([]); setError(null); setRetry(""); setDetail(""); }
  const completed = !!answer?.plan;
  const stage = completed ? 3 : answer || busy ? 2 : 1;
  const suggestions = QUICK_ITEMS.filter((item) => !items.includes(item) && (!description.trim() || item.toLowerCase().includes(description.trim().toLowerCase()))).slice(0, browse || description.trim() ? QUICK_ITEMS.length : 6);
  function addItem(item: string) {
    const next = item.trim();
    if (next && items.length < 20 && !items.some((value) => value.toLowerCase() === next.toLowerCase())) setItems([...items, next]);
    setDescription("");
  }

  return <section aria-labelledby="laundry-helper" className="animate-fade-up mt-4 rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-e1">
    <div className="flex items-center justify-between gap-2">
      <h2 id="laundry-helper" className="flex items-center gap-1.5 text-label font-semibold text-text"><SparkleIcon size={18} className="text-accent" /> Plan your load</h2>
      {(answer || turns.length > 0) && <button type="button" disabled={busy} onClick={edit} className="min-h-10 text-label font-semibold text-accent disabled:opacity-50">Edit load</button>}
    </div>
    <p className="mt-1 text-label text-text-2">Add your items in a few taps. We&apos;ll work out the care needs and settings using this room&apos;s machine reports.</p>
    <ol aria-label="Planning progress" className="my-4 flex gap-4 text-caption text-text-3">
      {["Your load", "Care check", "Your settings"].map((label, i) => <li key={label} aria-current={stage === i + 1 ? "step" : undefined} className={stage === i + 1 ? "font-semibold text-accent" : ""}>{i + 1}. {label}</li>)}
    </ol>
    {usingChatGPT && <p className="mb-3 text-caption text-text-3">Using ChatGPT plan · <a href="https://chatgpt.com/#settings/Usage" target="_blank" rel="noreferrer" className="text-accent underline">Manage usage</a></p>}

    {!answer && !busy && <form onSubmit={(event) => { event.preventDefault(); plan(`Plan this load: ${[...items, description.trim()].filter(Boolean).join(", ")}. Drum size: ${size}. ${careLabel ? `Care label or special instructions: ${careLabel}` : "Care labels not provided."}`); }} className="space-y-4">
      <div><p className="mb-2 text-label font-semibold">What&apos;s in your load?</p>
        {!!items.length && <ul aria-label="Items in your load" className="mb-3 flex flex-wrap gap-2">{items.map((item) => <li key={item}><button type="button" onClick={() => setItems(items.filter((value) => value !== item))} aria-label={`Remove ${item}`} className={`${chip} border-accent bg-accent-tint text-accent`}>{item} <span aria-hidden="true">×</span></button></li>)}</ul>}
        <label htmlFor="helper-load" className="sr-only">Add any item</label><div className="flex gap-2"><input id="helper-load" value={description} onChange={(event) => setDescription(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addItem(description); } }} maxLength={120} placeholder="Search or add anything, e.g. linen pants" aria-describedby="helper-load-hint" className={field} /><button type="button" onClick={() => addItem(description)} disabled={!description.trim() || items.length >= 20} className={`${chip} border-border bg-surface-2 text-text`}>Add</button></div>
        <p id="helper-load-hint" className="mt-2 text-caption text-text-3">Quick add below, or enter any item name. No full description needed.</p>
        <div aria-label="Quick add items" className="mt-3 flex flex-wrap gap-2">{suggestions.map((item) => <button key={item} type="button" disabled={items.length >= 20} onClick={() => addItem(item)} aria-label={`Add ${item}`} className={`${chip} border-border bg-surface-2 text-text-2`}>+ {item}</button>)}</div>
        {!description.trim() && <button type="button" onClick={() => setBrowse(!browse)} className="mt-2 min-h-10 text-label font-semibold text-accent">{browse ? "Show fewer items" : "Browse more items"}</button>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label htmlFor="helper-size" className="mb-2 block text-label font-semibold">How full is the drum?</label><select id="helper-size" value={size} onChange={(event) => setSize(event.target.value)} className={field}>{["Not sure", "Small", "Medium", "Full", "Overstuffed"].map((value) => <option key={value}>{value}</option>)}</select></div>
        <details><summary className="cursor-pointer py-2 text-label font-semibold text-text-2">Care notes or concerns (optional)</summary><label htmlFor="helper-care" className="sr-only">Care label notes</label><input id="helper-care" value={careLabel} onChange={(event) => setCareLabel(event.target.value)} maxLength={120} placeholder="e.g. do not tumble dry, muddy, avoid shrinking" className={field} /></details>
      </div>
      <button type="submit" disabled={!items.length && !description.trim()} className="pressable min-h-11 w-full rounded-[10px] bg-accent px-4 py-3 text-label font-semibold text-accent-fg disabled:opacity-50">Find my settings</button>
    </form>}

    {busy && <div role="status" className="rounded-[12px] bg-surface-2 p-4 text-label text-text-2">Checking your load, care needs and machine reports…</div>}
    {error && <div role="alert" className="mt-3 flex items-start gap-2 rounded-[12px] bg-caution-tint p-3 text-label text-caution-fg"><AlertIcon className="shrink-0" /><div>{error}<button type="button" onClick={() => plan(retry)} disabled={busy} className="mt-2 block min-h-10 font-semibold underline">Try again</button></div></div>}

    {answer && !completed && !busy && <div className="space-y-3" data-testid="load-question">
      <h3 className="text-body font-semibold text-text">One detail before we pick settings</h3>
      <p className="text-label text-text-2">{answer.question?.question || answer.reply}</p>
      {answer.question && <div className="flex flex-wrap gap-2">{answer.question.options.map((option) => <button key={option} type="button" onClick={() => plan(option)} className={`${chip} border-border bg-surface-2 text-text`}>{option}</button>)}</div>}
      <form onSubmit={(event) => { event.preventDefault(); plan(detail); }} className="flex gap-2"><label htmlFor="helper-detail" className="sr-only">More about your load</label><input id="helper-detail" value={detail} maxLength={400} onChange={(event) => setDetail(event.target.value)} placeholder="Or describe it in your own words" className={field} /><button type="submit" disabled={!detail.trim()} className="pressable rounded-[10px] bg-accent px-4 text-label font-semibold text-accent-fg disabled:opacity-50">Continue</button></form>
    </div>}

    {answer?.plan && !busy && <div data-testid="load-results" className="space-y-3" aria-live="polite">
      <h3 className="text-body font-semibold text-text">Your load plan</h3>
      <p className="whitespace-pre-line text-label text-text-2">{answer.reply}</p>
      {answer.plan.care === "no_machine" && <p className="rounded-[10px] bg-caution-tint p-3 text-label font-semibold text-caution-fg">Keep this load out of the machines. Follow the care labels or separate the unsuitable items, then edit your load.</p>}
      {answer.plan.care === "air_dry" && <p className="rounded-[10px] bg-caution-tint p-3 text-label font-semibold text-caution-fg">Air dry this load. Lay wool flat; keep items marked “do not tumble dry” out of the dryer.</p>}
      <div className="grid gap-3 sm:grid-cols-2">{answer.plan.picks.map((pick) => <PickCard key={pick.code} pick={pick} here={pick.code === machineCode} />)}</div>
      {!answer.plan.picks.length && answer.plan.care !== "no_machine" && <p className="text-label text-caution-fg">There isn&apos;t a suitable machine recommendation for this load in this room.</p>}
      {!!answer.plan.options?.length && <details className="rounded-[10px] border border-border p-3"><summary className="cursor-pointer text-label font-semibold text-text">Settings for other machines</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">{answer.plan.options.filter((option) => !answer.plan!.picks.some((pick) => pick.code === option.code)).map((pick) => <PickCard key={pick.code} pick={pick} here={pick.code === machineCode} />)}{answer.plan.options.length === answer.plan.picks.length && <p className="text-label text-text-2">The recommended machines are the only usable options reported here.</p>}</div></details>}
      <p className="text-caption text-text-3">Ranked by reported performance. Check in person whether a machine is free. Your clothes&apos; care labels take priority.</p>
    </div>}
  </section>;
}

function PickCard({ pick, here }: { pick: MachinePick; here: boolean }) {
  const Icon = pick.kind === "dryer" ? DryerIcon : WasherIcon;
  return <article className="rounded-[12px] border border-border bg-surface-2 p-4">
    <p className="flex items-center gap-2 text-label font-semibold text-text"><Icon size={20} />{pick.label}{here ? " · This machine" : ""}</p>
    <p className="mt-2 text-xl font-semibold text-accent">{pick.setting}</p>
    <p className="mt-2 text-label text-text-2">{pick.why}</p>
    {pick.evidence && <p className="mt-2 text-caption text-text-3">{pick.evidence}</p>}
    {!!pick.tips.length && <ul className="mt-2 list-disc space-y-1 pl-4 text-caption text-text-2">{pick.tips.map((tip) => <li key={tip}>{tip}</li>)}</ul>}
    {!here && <Link href={`/m/${pick.code}`} className="pressable mt-3 flex min-h-10 items-center justify-between text-label font-semibold text-accent">View {pick.label}<ChevronRight size={16} /></Link>}
  </article>;
}
