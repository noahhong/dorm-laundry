import { DRYER_SETTINGS, type DryerSetting } from "./labels";

/** The dryer settings a room's dryers actually have, always a non-empty subset of the heat ladder, coolest first. */
export function offeredSettings(stored: readonly string[] | null | undefined): DryerSetting[] {
  if (!stored) return [...DRYER_SETTINGS];
  const set = new Set(stored);
  const out = DRYER_SETTINGS.filter((s) => set.has(s));
  return out.length > 0 ? out : [...DRYER_SETTINGS];
}

/** Admin form → what to store: null when it's the full ladder (the default), otherwise the chosen subset. */
export function settingsToStore(picked: readonly string[]): DryerSetting[] | null | "empty" {
  const valid = DRYER_SETTINGS.filter((s) => picked.includes(s));
  if (valid.length === 0) return "empty";
  return valid.length === DRYER_SETTINGS.length ? null : valid;
}
