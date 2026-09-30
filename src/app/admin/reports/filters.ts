import { REPORT_RANGES, type ReportFilters, type ReportRange, type ReportState } from "@/lib/admin-queries";
import { DRYER_OUTCOMES, WASHER_OUTCOMES } from "@/lib/labels";

export const STATES: { value: ReportState; label: string }[] = [
  { value: "visible", label: "Visible" },
  { value: "hidden", label: "Hidden by an admin" },
  { value: "undone", label: "Undone by reporter" },
  { value: "all", label: "Everything" },
];
export const ALL_OUTCOMES = [...new Set([...DRYER_OUTCOMES, ...WASHER_OUTCOMES])];

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function parseFilters(sp: Record<string, string | string[] | undefined>): ReportFilters & { page: number } {
  const range = one(sp.range) as ReportRange;
  const state = one(sp.state) as ReportState;
  const kind = one(sp.kind);
  return {
    q: one(sp.q) || undefined,
    roomId: one(sp.room) || undefined,
    kind: kind === "washer" || kind === "dryer" ? kind : undefined,
    outcome: ALL_OUTCOMES.includes(one(sp.outcome) as never) ? one(sp.outcome) : undefined,
    state: STATES.some((s) => s.value === state) ? state : "visible",
    range: range in REPORT_RANGES ? range : "30d",
    page: Math.max(1, Number(one(sp.page)) || 1),
  };
}
