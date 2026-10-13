"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { disconnectChatGPTPlan, selectChatGPTPlan, type FormState } from "@/app/admin/actions";
import { Card, Pill } from "./ui";

type Props = {
  available: boolean; activeId: string | null; connected: boolean; model: string | null;
  accounts: { clientId: string; label: string; connected: boolean }[];
  models: { id: string; name: string }[]; status?: string; modelError?: string;
};
const button = "pressable h-11 rounded-[10px] border border-border bg-surface px-4 text-label font-semibold text-text-2 disabled:opacity-50";
const control = "h-11 w-full rounded-[var(--radius-xs)] border border-border-strong/60 bg-surface px-3 text-body text-text";
function Submit({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className={button}>{pending ? "Working…" : children}</button>;
}
function Status({ state }: { state: FormState }) {
  return state ? <p role="status" className={`text-label ${state.error ? "text-broken-fg" : "text-works-fg"}`}>{state.error || state.ok}</p> : null;
}
export function ChatGPTForm({ available, activeId, accounts, connected, model, models, status, modelError }: Props) {
  const [selected, select] = useActionState<FormState, FormData>(selectChatGPTPlan, undefined);
  const [disconnected, disconnect] = useActionState<FormState, FormData>(disconnectChatGPTPlan, undefined);
  const active = accounts.find((a) => a.clientId === activeId);
  return <Card id="chatgpt-plan" title="ChatGPT subscription" className="mb-4"
    description="Connect your eligible ChatGPT Plus or Pro account for personal testing on this computer. This uses your ChatGPT plan allowance. For the public site, select an API provider.">
    <div className="space-y-3">
      {!available ? <p className="text-label text-text-2">Available when running locally with a local database and a configured session secret.</p> : <>
        <p className="text-label text-text-2"><Pill tone={connected ? "accent" : "neutral"}>{connected ? "Connected" : "Not connected"}</Pill>{active ? ` ${active.label}` : " No API key needed."}</p>
        {status === "connected" && <p role="status" className="text-label text-works-fg">Connected. Choose a model, then select ChatGPT subscription in Choose your AI connection.</p>}
        {status === "failed" && <p role="alert" className="text-label text-broken-fg">The connection couldn&apos;t be completed. Start a fresh sign-in with Continue with ChatGPT and finish it in this browser.</p>}
        {status === "cancelled" && <p role="status" className="text-label text-text-2">Connection cancelled. Your previous choice is unchanged.</p>}
        <form method="post" action="/api/chatgpt/connect" className="flex flex-wrap gap-2">
          <button type="submit" className="pressable h-11 rounded-[10px] bg-accent px-5 text-label font-semibold text-accent-fg">Continue with ChatGPT</button>
          {accounts.length > 0 && <button type="submit" name="mode" value="add" className={button}>Add another account</button>}
        </form>
        {accounts.length > 0 && <form action={select} key={`${activeId}-${model}`} className="space-y-2">
          <label htmlFor="chatgptAccount" className="text-label font-semibold">ChatGPT account</label>
          <select id="chatgptAccount" name="clientId" defaultValue={activeId || ""} className={control}>{accounts.map((a) => <option key={a.clientId} value={a.clientId}>{a.label}{a.connected ? "" : " (reconnect)"}</option>)}</select>
          <p className="text-caption text-text-3">To switch accounts, choose the account and save. Its available models will then load.</p>
          {connected && models.length > 0 && <>
            <label htmlFor="chatgptModel" className="text-label font-semibold">ChatGPT model</label>
            <select id="chatgptModel" name="model" defaultValue={model || ""} className={control}>
              <option value="">Choose a model…</option>{models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </>}
          {modelError && <p role="alert" className="text-label text-broken-fg">{modelError}</p>}
          <Submit>Save account and model</Submit>
          <Status state={selected} />
        </form>}
        {connected && <form action={disconnect}><Submit>Disconnect ChatGPT</Submit><Status state={disconnected} /></form>}
        <a href="https://chatgpt.com/#settings/Usage" target="_blank" rel="noreferrer" className="text-label text-accent underline">Manage ChatGPT usage and app access</a>
      </>}
    </div>
  </Card>;
}
