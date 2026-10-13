"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { selectAssistantProvider, type FormState } from "@/app/admin/actions";
import { optionLabel } from "@/lib/config";
import { Card, Pill } from "./ui";
function Save() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="pressable h-11 rounded-[10px] bg-accent px-5 text-label font-semibold text-accent-fg disabled:opacity-50">{pending ? "Saving…" : "Use this provider"}</button>;
}
export function AssistantProviderForm({ provider }: { provider: string }) {
  const [state, action] = useActionState<FormState, FormData>(selectAssistantProvider, undefined);
  return <Card id="assistant-provider" title="Choose your AI connection" className="mb-4" description="Select which connection the laundry helper uses. Configure its key or subscription below.">
    <p className="mb-3 text-label text-text-2"><Pill tone="accent">Selected</Pill> {optionLabel(provider)}</p>
    <form action={action} className="flex flex-wrap gap-2">
      <label htmlFor="activeAssistantProvider" className="sr-only">AI provider</label>
      <select key={provider} id="activeAssistantProvider" name="provider" defaultValue={provider} className="h-11 min-w-0 flex-1 rounded-[var(--radius-xs)] border border-border-strong/60 bg-surface px-3 text-body text-text">
        {["anthropic", "openai", "chatgpt", "auto"].map((value) => <option key={value} value={value}>{optionLabel(value)}</option>)}
      </select>
      <Save />
      {state && <p role="status" className={`w-full text-label ${state.error ? "text-broken-fg" : "text-works-fg"}`}>{state.error || state.ok}</p>}
    </form>
    <p className="mt-2 text-caption text-text-3">Automatic uses Anthropic API when configured, otherwise OpenAI API. ChatGPT subscription is for your signed-in local preview.</p>
  </Card>;
}
