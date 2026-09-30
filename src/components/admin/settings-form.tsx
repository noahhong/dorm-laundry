"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { resetSettings, saveSettings, type FormState } from "@/app/admin/actions";
import { FIELDS, GROUPS, optionLabel, type Config, type Field } from "@/lib/config";
import { Pill } from "./ui";

const control = "h-11 w-full rounded-[var(--radius-xs)] border border-border-strong/60 bg-surface px-3 text-body text-text";

function Save() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="pressable h-11 rounded-[10px] bg-accent px-5 text-label font-semibold text-accent-fg shadow-e1 disabled:opacity-50">
      {pending ? "Saving…" : "Save changes"}
    </button>
  );
}

function Control({ f, value, invalid }: { f: Field; value: Config[Field["key"]]; invalid: boolean }) {
  const describedBy = `${f.key}-help`;
  if (f.kind === "bool") {
    return (
      <label className="relative inline-flex h-11 cursor-pointer items-center">
        <input type="checkbox" id={f.key} name={f.key} defaultChecked={Boolean(value)} className="peer sr-only" aria-describedby={describedBy} role="switch" />
        <span className="h-7 w-12 rounded-full bg-surface-3 transition-colors peer-checked:bg-accent peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent)]" />
        <span className="pointer-events-none absolute left-1 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </label>
    );
  }
  if (f.kind === "choice") {
    return (
      <select id={f.key} name={f.key} defaultValue={String(value)} aria-describedby={describedBy} aria-invalid={invalid} className={`${control} max-w-[12rem]`}>
        {f.options.map((o) => (
          <option key={o} value={o}>
            {optionLabel(o)}
          </option>
        ))}
      </select>
    );
  }
  if (f.kind === "longtext") {
    return <textarea id={f.key} name={f.key} defaultValue={String(value)} rows={2} maxLength={f.max} aria-describedby={describedBy} aria-invalid={invalid} className={`${control} h-auto py-2`} />;
  }
  if (f.kind === "text") {
    return <input id={f.key} name={f.key} defaultValue={String(value)} maxLength={f.max} aria-describedby={describedBy} aria-invalid={invalid} className={control} />;
  }
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        id={f.key}
        name={f.key}
        defaultValue={String(value)}
        min={f.min}
        max={f.max}
        step={f.step}
        inputMode={f.kind === "int" ? "numeric" : "decimal"}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        className={`${control} max-w-[9rem] tabular-nums`}
      />
      {f.unit && <span className="text-label text-text-3">{f.unit}</span>}
    </div>
  );
}

function fmtDefault(f: Field) {
  if (f.kind === "bool") return f.default ? "on" : "off";
  if (f.kind === "choice") return optionLabel(f.default);
  if (f.kind === "text" || f.kind === "longtext") return f.default === "" ? "empty" : `“${String(f.default).slice(0, 40)}${String(f.default).length > 40 ? "…" : ""}”`;
  return `${f.default}${"unit" in f && f.unit ? ` ${f.unit}` : ""}`;
}

export function SettingsForm({ values }: { values: Config }) {
  const [state, action] = useActionState<FormState, FormData>(saveSettings, undefined);
  const errors = state?.errors ?? {};
  // Remount the inputs when the saved values change, so they show what the server now has.
  const version = JSON.stringify(values);

  return (
    <form action={action} className="space-y-4">
      <div key={version} className="space-y-4">
        {GROUPS.map((g) => (
          <section key={g.id} aria-labelledby={`g-${g.id}`} className="rounded-[var(--radius-md)] border border-border bg-surface shadow-e1">
            <header className="px-4 pt-4">
              <h2 id={`g-${g.id}`} className="text-headline">
                {g.title}
              </h2>
              <p className="text-label text-text-3">{g.blurb}</p>
            </header>
            <div className="mt-2 divide-y divide-border">
              {FIELDS.filter((f) => f.group === g.id).map((f) => {
                const changed = values[f.key] !== f.default;
                const err = errors[f.key];
                return (
                  <div key={f.key} className="grid gap-2 px-4 py-3.5 md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] md:gap-6">
                    <div>
                      <p className="flex flex-wrap items-center gap-2 text-label font-semibold text-text">
                        <label htmlFor={f.key}>{f.label}</label>
                        {changed && <Pill tone="accent">Changed</Pill>}
                      </p>
                      <p id={`${f.key}-help`} className="mt-0.5 text-caption text-text-3">
                        {f.help ? `${f.help} ` : ""}<span className="whitespace-nowrap">Default: {fmtDefault(f)}.</span>
                      </p>
                    </div>
                    <div>
                      <Control f={f} value={values[f.key]} invalid={Boolean(err)} />
                      {err && (
                        <p role="alert" className="mt-1 text-caption font-semibold text-broken-fg">
                          {err}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur lg:-mx-8 lg:px-8">
        <Save />
        <p role="status" className={`text-label font-semibold ${state?.error ? "text-broken-fg" : "text-works-fg"}`}>
          {state?.error ?? state?.ok}
        </p>
      </div>
    </form>
  );
}

export function ResetDefaults() {
  const [confirming, setConfirming] = useState(false);
  const [state, action] = useActionState<FormState, FormData>(resetSettings, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      {!confirming ? (
        <button type="button" onClick={() => setConfirming(true)} className="pressable h-10 rounded-[10px] border border-border bg-surface px-4 text-label font-semibold text-text-2">
          Reset everything to defaults…
        </button>
      ) : (
        <>
          <span className="text-label text-text-2">Reset all settings to the defaults?</span>
          <button type="submit" className="pressable h-10 rounded-[10px] border border-broken-icon/40 bg-broken-tint px-4 text-label font-semibold text-broken-fg">
            Yes, reset
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="pressable h-10 rounded-[10px] px-3 text-label font-semibold text-text-2">
            Cancel
          </button>
        </>
      )}
      {state?.ok && <span role="status" className="text-label font-semibold text-works-fg">{state.ok}</span>}
    </form>
  );
}
