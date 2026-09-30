"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { removeApiKey, saveApiKey, testApiKey, type FormState } from "@/app/admin/actions";
import { Card, Pill } from "./ui";

type Props = { source: "env" | "admin" | null; hint: string | null };

const control = "h-11 w-full min-w-0 flex-1 rounded-[var(--radius-xs)] border border-border-strong/60 bg-surface px-3 text-body text-text";
const secondary = "pressable h-11 rounded-[10px] border border-border bg-surface px-4 text-label font-semibold text-text-2 disabled:opacity-50";

function Submit({ children, pendingText, className }: { children: string; pendingText: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingText : children}
    </button>
  );
}

function Status({ state }: { state: FormState }) {
  if (!state?.error && !state?.ok) return null;
  return (
    <p role="status" className={`text-label font-semibold ${state.error ? "text-broken-fg" : "text-works-fg"}`}>
      {state.error ?? state.ok}
    </p>
  );
}

/** Where the admin pastes the Anthropic API key for the laundry helper. The saved key is never shown again. */
export function ApiKeyForm({ source, hint }: Props) {
  const [saved, save] = useActionState<FormState, FormData>(saveApiKey, undefined);
  const [tested, test] = useActionState<FormState, FormData>(testApiKey, undefined);
  const [removed, remove] = useActionState<FormState, FormData>(removeApiKey, undefined);

  return (
    <Card
      id="api-key"
      title="Laundry helper API key"
      description="The AI chat needs an Anthropic API key (console.anthropic.com → API keys). It's checked before saving, stored encrypted, and never shown again. Questions are billed to this key; cap them under Laundry helper chat below."
      className="mb-4"
    >
      <div className="space-y-3">
        <p className="flex flex-wrap items-center gap-2 text-label text-text-2">
          {source === "env" ? (
            <>
              <Pill tone="accent">From environment</Pill> Using ANTHROPIC_API_KEY ({hint}). Remove it from the environment to manage the key here.
            </>
          ) : source === "admin" ? (
            <>
              <Pill tone="accent">Saved</Pill> Key ending {hint}.
            </>
          ) : (
            <>
              <Pill>No key</Pill> The laundry helper is hidden until a key is saved.
            </>
          )}
        </p>

        {source !== "env" && (
          <form action={save} className="flex flex-wrap gap-2">
            <label htmlFor="apiKey" className="sr-only">
              Anthropic API key
            </label>
            <input
              id="apiKey"
              name="apiKey"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={source === "admin" ? "Paste a new key to replace it" : "sk-ant-…"}
              required
              className={control}
            />
            <Submit pendingText="Checking…" className="pressable h-11 rounded-[10px] bg-accent px-5 text-label font-semibold text-accent-fg shadow-e1 disabled:opacity-50">
              {source === "admin" ? "Replace key" : "Save key"}
            </Submit>
          </form>
        )}
        <Status state={saved} />

        {source && (
          <div className="flex flex-wrap items-center gap-2">
            <form action={test}>
              <Submit pendingText="Testing…" className={secondary}>
                Test key
              </Submit>
            </form>
            {source === "admin" && (
              <form action={remove}>
                <Submit pendingText="Removing…" className={`${secondary} text-broken-fg`}>
                  Remove key
                </Submit>
              </form>
            )}
            <Status state={tested} />
            <Status state={removed} />
          </div>
        )}
      </div>
    </Card>
  );
}
