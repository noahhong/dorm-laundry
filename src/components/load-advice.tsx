"use client";

import { useSyncExternalStore } from "react";
import { FABRICS, FABRIC_LABEL, SETTING_LABEL, type DryerSetting, type MachineKind } from "@/lib/labels";
import { suggestForLoad, type FabricRules, type LoadInput } from "@/lib/load-advice";
import { parseLoad, readLoadRaw, subscribeLoad, writeLoad } from "@/lib/load-store";
import type { Recommendation } from "@/lib/status";
import { AlertIcon, ThermometerIcon } from "./icons";

const SIZES = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "full", label: "Full" },
  { value: "overstuffed", label: "Packed" },
] as const;

type Props = {
  kind: MachineKind;
  rec: Recommendation | null;
  rules: FabricRules;
  offered: readonly DryerSetting[];
};

/** "What's in your load?": optional chips that tailor this machine's setting to the load. Not part of reporting. */
export function LoadAdvice({ kind, rec, rules, offered }: Props) {
  const raw = useSyncExternalStore(subscribeLoad, readLoadRaw, () => null);
  const load = parseLoad(raw);
  const advice = suggestForLoad(kind, load, rules, rec, offered);
  const set = (next: Partial<LoadInput>) => writeLoad({ ...load, ...next });
  const toggle = (f: (typeof FABRICS)[number]) =>
    set({ fabrics: load.fabrics.includes(f) ? load.fabrics.filter((x) => x !== f) : [...load.fabrics, f] });
  const empty = load.fabrics.length === 0 && !load.size;

  return (
    <section aria-labelledby="your-load" className="animate-fade-up mt-4 rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-e1" style={{ ["--i" as string]: 1 }}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="your-load" className="text-caption uppercase tracking-wide text-text-3">
          What&apos;s in your load?
        </h2>
        {!empty && (
          <button type="button" onClick={() => writeLoad({ fabrics: [], size: null })} className="h-8 text-caption font-semibold text-accent">
            Clear
          </button>
        )}
      </div>
      <p className="mt-0.5 text-label text-text-2">Optional. Pick what you&apos;re washing and we&apos;ll tailor the setting for this {kind}.</p>

      <div role="group" aria-label="Fabrics" className="mt-3 flex flex-wrap gap-1.5">
        {FABRICS.map((f) => {
          const on = load.fabrics.includes(f);
          return (
            <button
              key={f}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(f)}
              className={`pressable h-10 rounded-full border px-3.5 text-label font-semibold ${
                on ? "border-accent bg-accent text-accent-fg shadow-e1" : "border-border bg-surface-2 text-text-2 hover:text-text"
              }`}
            >
              {FABRIC_LABEL[f]}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-label font-semibold text-text-2">How much is in it?</p>
      <div role="group" aria-label="How much is in it?" className="mt-1 grid grid-cols-4 gap-1 rounded-[12px] bg-surface-2 p-1">
        {SIZES.map((s) => (
          <button
            key={s.value}
            type="button"
            aria-pressed={load.size === s.value}
            onClick={() => set({ size: load.size === s.value ? null : s.value })}
            className={`pressable h-10 rounded-[9px] text-label font-semibold ${load.size === s.value ? "bg-surface text-text shadow-e1" : "text-text-2"}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {advice && (
        <div aria-live="polite" data-testid="load-advice" className="animate-fade-up mt-4 rounded-[14px] bg-accent-tint p-4">
          <p className="flex items-center gap-2 text-headline text-text">
            <ThermometerIcon size={20} className="shrink-0 text-accent" />
            Use {SETTING_LABEL[advice.setting]}
            {kind === "washer" ? " water" : ""} for this load
          </p>
          <p className="mt-1 text-label text-text-2">{advice.why}</p>
          {advice.tips.length > 0 && (
            <ul className="mt-2 space-y-1">
              {advice.tips.map((t) => (
                <li key={t} className="flex items-start gap-2 text-label text-text-2">
                  <AlertIcon className="mt-0.5 shrink-0 text-text-3" />
                  {t}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
