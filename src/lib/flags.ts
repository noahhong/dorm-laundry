// "Flag this report" (PLAN.md §19). Pure rules, shared by the server and the tests.

export const FLAG_REASONS = ["spam", "rude", "personal", "wrong"] as const;
export type FlagReason = (typeof FLAG_REASONS)[number];

export const FLAG_REASON_LABEL: Record<FlagReason, string> = {
  spam: "Spam or fake",
  rude: "Rude or offensive",
  personal: "Names or personal info",
  wrong: "Wrong machine or not true",
};

export interface FlagInput {
  createdAt: number;
  reason: string;
}

/** Flags an admin hasn't looked at yet: anything after they last hid or kept the report. */
export function openFlags<F extends FlagInput>(flags: F[], clearedAt: number | null): F[] {
  return flags.filter((f) => clearedAt == null || f.createdAt > clearedAt);
}

/** Count of each reason, most common first, e.g. [["spam", 2], ["rude", 1]]. */
export function flagReasons(flags: FlagInput[]): [string, number][] {
  const n = new Map<string, number>();
  for (const f of flags) n.set(f.reason, (n.get(f.reason) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/**
 * Hide a report on its own once `threshold` different devices flag it (0 = never). Kept reports only count flags
 * since the admin kept them, so the same people can't hide it again; it takes `threshold` new flags.
 */
export function shouldAutoHide(open: number, threshold: number, hidden: boolean): boolean {
  return !hidden && threshold > 0 && open >= threshold;
}
