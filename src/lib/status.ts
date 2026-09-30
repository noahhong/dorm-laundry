// Derived machine status and recommended dryer setting. Pure functions: no DB, no Date.now().
// The algorithm is documented in PLAN.md §5–6; keep the two in sync.

import { BROKEN_SYMPTOMS, DRYER_SETTINGS, SETTING_LABEL, type DryerSetting, type MachineKind } from "./labels";

export type StatusLevel = "works" | "caution" | "broken" | "unknown";
export type Confidence = "none" | "low" | "medium" | "high";

export interface ReportInput {
  createdAt: number;
  outcome: string;
  setting: string | null;
  symptoms: string[];
  deviceHash: string;
  trust: number;
}

export interface MachineInput {
  kind: MachineKind;
  adminState: "out_of_order" | null;
  adminNote?: string | null;
  statusResetAt: number | null;
}

export interface MachineStatus {
  level: StatusLevel;
  /** Short human reason, e.g. "No heat", "Runs hot", "Mixed reports". */
  reason: string | null;
  source: "reports" | "admin" | "none";
  confidence: Confidence;
  /** Number of distinct devices whose latest report counted toward status. */
  reporters: number;
  lastReportAt: number | null;
  /** When the status is unknown but old reports exist: what the last one said. */
  staleHint: { outcome: string; at: number } | null;
}

export interface LadderRow {
  setting: DryerSetting;
  /** Direct (non-propagated), decayed evidence. */
  good: number;
  under: number;
  over: number;
  reports: number;
  verdict: "good" | "under" | "over" | "mixed" | "none";
}

export interface Recommendation {
  setting: DryerSetting;
  /** "room": no data for this dryer, borrowed from its siblings (see applyRoomFallback). */
  basis: "reports" | "room" | "default";
  /** Set when basis is "room": how many sibling dryers the suggestion came from, and their spread. */
  roomMachines?: number;
  roomRange?: { min: DryerSetting; max: DryerSetting };
  confidence: Confidence;
  tips: string[];
  avoid: { setting: DryerSetting; reports: number }[];
  ladder: LadderRow[];
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const H_STATUS = 72 * HOUR;
export const H_SETTING = 21 * DAY;
export const WINDOW = 60 * DAY;

const decay = (age: number, halfLife: number) => Math.pow(0.5, Math.max(0, age) / halfLife);

type Evidence = { broken: number; caution: number; ok: number; reason: string | null };

/** How much a single report says about the machine's health (PLAN.md §5). */
export function statusEvidence(kind: MachineKind, r: Pick<ReportInput, "outcome" | "setting" | "symptoms">): Evidence {
  const high = r.setting === "high";
  const hot = r.setting === "high" || r.setting === "medium";
  switch (r.outcome) {
    case "not_working": {
      const syms = r.symptoms ?? [];
      const brokenSym = syms.find((s) => BROKEN_SYMPTOMS.has(s));
      if (syms.length === 0 || brokenSym) return { broken: 1, caution: 0, ok: 0, reason: brokenSym ?? "not_working" };
      return { broken: 0, caution: 1, ok: 0, reason: syms[0] };
    }
    case "dry":
    case "good":
      return { broken: 0, caution: 0, ok: 1, reason: null };
    case "damp":
      return { broken: 0, caution: high ? 0.5 : 0, ok: 1, reason: high ? "weak_heat" : null };
    case "wet":
      return { broken: 0, caution: hot ? 1 : 0.5, ok: 0, reason: hot ? "weak_heat" : "wet" };
    case "too_hot":
      return { broken: 0, caution: high ? 0.3 : 0.6, ok: 0, reason: "runs_hot" };
    case "damaged":
      return { broken: 0, caution: high ? 0.5 : 1, ok: 0, reason: "runs_hot" };
    case "soaking":
      return { broken: 0, caution: 1, ok: 0, reason: "no_spin" };
    case "dirty":
      return { broken: 0, caution: 1, ok: 0, reason: "dirty" };
    default:
      return { broken: 0, caution: 0, ok: 0, reason: null };
  }
}

export const REASON_LABEL: Record<string, string> = {
  not_working: "Not working",
  weak_heat: "Weak heat",
  wet: "Leaves clothes wet",
  runs_hot: "Runs hot",
  no_spin: "Doesn't spin",
  dirty: "Doesn't clean well",
  mixed: "Mixed reports",
  took_money: "Takes money",
  wont_start: "Won't start",
  door_lock: "Door lock error",
  wont_drain: "Won't drain",
  leaking: "Leaking",
  no_hot_water: "No hot water",
  stopped_midcycle: "Stops mid-cycle",
  loud: "Loud / shaking",
  dispenser: "Soap dispenser issue",
  error_code: "Shows an error code",
  other: "Has an issue",
  no_heat: "No heat",
  too_hot: "Runs hot",
  not_tumbling: "Drum doesn't turn",
  stopped_early: "Stops early",
  burnt_smell: "Burning smell",
  lint_screen: "Lint screen issue",
  door: "Door won't latch",
};

function confidenceFor(weight: number): Confidence {
  if (weight <= 0) return "none";
  if (weight < 1) return "low";
  if (weight < 3) return "medium";
  return "high";
}

/** Keep only the newest report per key. Input order doesn't matter. */
function latestBy<T extends ReportInput>(reports: T[], key: (r: T) => string): T[] {
  const m = new Map<string, T>();
  for (const r of reports) {
    const k = key(r);
    const cur = m.get(k);
    if (!cur || r.createdAt > cur.createdAt) m.set(k, r);
  }
  return [...m.values()];
}

export function computeStatus(machine: MachineInput, allReports: ReportInput[], now: number): MachineStatus {
  const inWindow = allReports.filter((r) => now - r.createdAt <= WINDOW && r.createdAt <= now);
  const lastReportAt = inWindow.reduce<number | null>((a, r) => (a === null || r.createdAt > a ? r.createdAt : a), null);

  if (machine.adminState === "out_of_order") {
    return {
      level: "broken",
      reason: machine.adminNote?.trim() || "Out of order",
      source: "admin",
      confidence: "high",
      reporters: 0,
      lastReportAt,
      staleHint: null,
    };
  }

  const counted = latestBy(
    inWindow.filter((r) => machine.statusResetAt == null || r.createdAt >= machine.statusResetAt),
    (r) => r.deviceHash,
  ).sort((a, b) => b.createdAt - a.createdAt);

  let B = 0,
    C = 0,
    O = 0;
  const reasons = new Map<string, { w: number; broken: boolean }>();
  counted.forEach((r, i) => {
    const w = r.trust * decay(now - r.createdAt, H_STATUS) * (i === 0 ? 1.5 : 1);
    const e = statusEvidence(machine.kind, r);
    B += w * e.broken;
    C += w * e.caution;
    O += w * e.ok;
    if (e.reason && (e.broken || e.caution)) {
      const cur = reasons.get(e.reason) ?? { w: 0, broken: false };
      cur.w += w * (e.broken + e.caution);
      cur.broken ||= e.broken > 0;
      reasons.set(e.reason, cur);
    }
  });
  const W = B + C + O;
  const topReason = (brokenOnly: boolean) => {
    let best: string | null = null;
    let bw = -1;
    for (const [k, v] of reasons) {
      if (brokenOnly && !v.broken) continue;
      if (v.w > bw) {
        best = k;
        bw = v.w;
      }
    }
    return best ? (REASON_LABEL[best] ?? best) : null;
  };

  const base = { source: "reports" as const, reporters: counted.length, lastReportAt, staleHint: null };

  if (W < 0.25) {
    const newest = [...inWindow].sort((a, b) => b.createdAt - a.createdAt)[0];
    return {
      ...base,
      level: "unknown",
      reason: null,
      source: newest ? "reports" : "none",
      confidence: "none",
      reporters: 0,
      staleHint: newest && (machine.statusResetAt == null || newest.createdAt >= machine.statusResetAt)
        ? { outcome: newest.outcome, at: newest.createdAt }
        : null,
    };
  }

  const confidence = confidenceFor(W);
  if (B >= 0.5 && B / W >= 0.6) {
    return { ...base, level: "broken", reason: topReason(true), confidence };
  }
  if (B + C >= 0.4 && (B + C) / W >= 0.3) {
    const reason = B > 0 && B >= C ? REASON_LABEL.mixed : topReason(false);
    return { ...base, level: "caution", reason, confidence };
  }
  return { ...base, level: "works", reason: null, confidence };
}

/** Setting evidence for one dryer report (PLAN.md §5). */
export function settingEvidence(outcome: string): { good: number; under: number; over: number } | null {
  switch (outcome) {
    case "dry":
      return { good: 1, under: 0, over: 0 };
    case "damp":
      return { good: 0, under: 0.5, over: 0 };
    case "wet":
      return { good: 0, under: 1, over: 0 };
    case "too_hot":
      return { good: 0.3, under: 0, over: 0.7 };
    case "damaged":
      return { good: 0, under: 0, over: 1.5 };
    default:
      return null;
  }
}

const DEFAULT_SETTING: DryerSetting = "medium";

export function recommendSetting(allReports: ReportInput[], now: number): Recommendation {
  const L = DRYER_SETTINGS;
  const idx = (s: string) => L.indexOf(s as DryerSetting);
  const usable = allReports.filter(
    (r) => now - r.createdAt <= WINDOW && r.createdAt <= now && r.setting && idx(r.setting) >= 0 && settingEvidence(r.outcome),
  );
  const counted = latestBy(usable, (r) => `${r.deviceHash}|${r.setting}`);

  const G = L.map(() => 0);
  const U = L.map(() => 0);
  const O = L.map(() => 0);
  const direct = L.map(() => ({ good: 0, under: 0, over: 0, reports: 0 }));

  for (const r of counted) {
    const i = idx(r.setting!);
    const e = settingEvidence(r.outcome)!;
    const w = r.trust * decay(now - r.createdAt, H_SETTING);
    direct[i].good += w * e.good;
    direct[i].under += w * e.under;
    direct[i].over += w * e.over;
    direct[i].reports += 1;
  }
  // Monotonic propagation: less heat never dries better, more heat never runs cooler.
  for (let i = 0; i < L.length; i++) {
    G[i] += direct[i].good;
    U[i] += direct[i].under;
    O[i] += direct[i].over;
    for (let j = 0; j < i; j++) U[j] += 0.5 * direct[i].under;
    for (let j = i + 1; j < L.length; j++) O[j] += 0.5 * direct[i].over;
  }

  const n = L.map((_, i) => G[i] + U[i] + O[i]);
  const pGood = L.map((_, i) => (G[i] + 0.5) / (n[i] + 1.5));
  const pOver = L.map((_, i) => O[i] / (n[i] + 1.5));
  const pUnder = L.map((_, i) => U[i] / (n[i] + 1.5));

  const ladder: LadderRow[] = L.map((setting, i) => {
    const d = direct[i];
    const tot = d.good + d.under + d.over;
    let verdict: LadderRow["verdict"] = "none";
    if (tot >= 0.05) {
      const max = Math.max(d.good, d.under, d.over);
      const share = max / tot;
      verdict = share < 0.6 ? "mixed" : max === d.over ? "over" : max === d.under ? "under" : "good";
    }
    return { setting, good: d.good, under: d.under, over: d.over, reports: d.reports, verdict };
  });

  const avoid = L.flatMap((setting, i) =>
    O[i] >= 0.5 && pOver[i] >= 0.35 ? [{ setting, reports: direct[i].reports }] : [],
  );

  const hasData = n.some((x) => x >= 0.05);
  if (!hasData) {
    return { setting: DEFAULT_SETTING, basis: "default", confidence: "none", tips: [], avoid: [], ladder };
  }

  // Safety first: among near-equal candidates, the cooler setting wins.
  let best = -1;
  for (let i = 0; i < L.length; i++) {
    if (n[i] < 0.5 || pOver[i] >= 0.25) continue;
    if (best < 0 || pGood[i] > pGood[best] + 0.05) best = i;
  }

  const tips: string[] = [];
  if (best >= 0 && pGood[best] >= 0.5) {
    if (pUnder[best] >= 0.3) tips.push("May need extra time");
    return { setting: L[best], basis: "reports", confidence: confidenceFor(n[best]), tips, avoid, ladder };
  }

  // No setting is clearly good. Aim just above the hottest setting known to under-dry,
  // but stay below the coolest setting known to run hot.
  let lowestOver: number = L.length;
  for (let i = 0; i < L.length; i++)
    if (pOver[i] >= 0.25 && n[i] >= 0.5) {
      lowestOver = i;
      break;
    }
  let highestUnder = -1;
  for (let i = 0; i < L.length; i++) if (pUnder[i] >= 0.3 && n[i] >= 0.5) highestUnder = i;

  let pick: number;
  if (highestUnder + 1 < lowestOver) {
    pick = Math.max(highestUnder + 1, Math.min(idx(DEFAULT_SETTING), lowestOver - 1));
    if (highestUnder >= 0 && pick === highestUnder + 1 && n[pick] < 0.5) tips.push(`${SETTING_LABEL[L[highestUnder]]} leaves clothes damp`);
  } else {
    pick = Math.max(0, lowestOver - 1);
    tips.push("Clothes often come out damp: add extra time");
  }
  return { setting: L[pick], basis: "reports", confidence: n[pick] >= 1 ? "low" : "none", tips, avoid, ladder };
}

/**
 * For dryers with no setting reports, suggest the middle of what the other dryers in the room settled on.
 * Uses the lower median (the cooler pick when the room is split) because an untested dryer might run hot.
 * Needs at least two sibling dryers with report-based recommendations.
 */
export function applyRoomFallback(recs: Recommendation[]): Recommendation[] {
  const idx = (s: DryerSetting) => DRYER_SETTINGS.indexOf(s);
  const informed = recs
    .filter((r) => r.basis === "reports" && r.confidence !== "none")
    .map((r) => idx(r.setting))
    .sort((a, b) => a - b);
  if (informed.length < 2) return recs;
  const pick = DRYER_SETTINGS[informed[Math.floor((informed.length - 1) / 2)]];
  const roomRange = { min: DRYER_SETTINGS[informed[0]], max: DRYER_SETTINGS[informed[informed.length - 1]] };
  return recs.map((r) => (r.basis === "default" ? { ...r, setting: pick, basis: "room", roomMachines: informed.length, roomRange } : r));
}
