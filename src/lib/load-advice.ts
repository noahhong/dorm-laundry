// Load-based suggestions: "what's in your load?" → the setting to use on this machine. Pure: no DB, no Date.now().
// The rules are documented in PLAN.md §6.7; keep the two in sync. The per-fabric limits come from admin Settings.

import { DRYER_SETTINGS, FABRIC_NOUN, SETTING_LABEL, WASHER_SETTINGS, type DryerSetting, type Fabric, type MachineKind, type WasherSetting } from "./labels";
import { defaultSetting, type Recommendation } from "./status";

export interface FabricRule {
  /** Hottest dryer setting this fabric should see. */
  maxDryer: DryerSetting;
  /** Hottest wash water this fabric should see. */
  wash: WasherSetting;
}
export type FabricRules = Record<Fabric, FabricRule>;

export interface LoadInput {
  fabrics: readonly Fabric[];
  size: "small" | "medium" | "full" | "overstuffed" | null;
}

export interface LoadAdvice {
  setting: string;
  /** One line explaining the pick, e.g. "Athletic wear shouldn't go above Low." */
  why: string;
  /** True when the load forced a cooler setting than the machine's usual best. */
  cooler: boolean;
  tips: string[];
}

const dIdx = (s: string) => DRYER_SETTINGS.indexOf(s as DryerSetting);
const wIdx = (s: string) => WASHER_SETTINGS.indexOf(s as WasherSetting);

/** The fabrics with the coolest limit (on a tie, all of them), and that limit. */
function coolest<T extends string>(fabrics: readonly Fabric[], limit: (f: Fabric) => T, rank: (s: T) => number) {
  let best: T | null = null;
  let who: Fabric[] = [];
  for (const f of fabrics) {
    const l = limit(f);
    if (best === null || rank(l) < rank(best)) {
      best = l;
      who = [f];
    } else if (rank(l) === rank(best)) who.push(f);
  }
  return { limit: best, who };
}

const nouns = (fs: readonly Fabric[]) => {
  const n = fs.map((f) => FABRIC_NOUN[f]);
  return n.length <= 1 ? (n[0] ?? "") : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Care tips that apply whatever the machine, in a stable order. */
function fabricTips(kind: MachineKind, fabrics: readonly Fabric[]): string[] {
  const has = (f: Fabric) => fabrics.includes(f);
  const tips: string[] = [];
  if (has("prints")) tips.push("Turn graphic tees inside out to protect the print");
  if (kind === "washer" && has("delicates")) tips.push("Put delicates in a mesh bag");
  if (kind === "washer" && has("jeans")) tips.push("Wash jeans inside out so they fade less");
  if (kind === "dryer" && has("wool")) tips.push("Wool is safest dried flat on a rack");
  return tips;
}

/**
 * Suggest a setting for this load on this machine.
 *
 * Dryers start from the machine's own learned recommendation (so a dryer that runs hot stays cool) and step down
 * to the coolest limit among the load's fabrics. Settings the room doesn't have, or that residents say run hot
 * on this dryer, are skipped. Washers pick the coolest water any fabric allows.
 * Returns null when nothing is selected: the machine's normal recommendation already covers that.
 */
export function suggestForLoad(
  kind: MachineKind,
  load: LoadInput,
  rules: FabricRules,
  rec: Recommendation | null,
  offered: readonly DryerSetting[] = DRYER_SETTINGS,
): LoadAdvice | null {
  if (load.fabrics.length === 0 && !load.size) return null;
  const fabrics = [...new Set(load.fabrics)];
  const tips = fabricTips(kind, fabrics);

  if (kind === "washer") {
    if (fabrics.length === 0) return null;
    const { limit, who } = coolest(fabrics, (f) => rules[f].wash, wIdx);
    const setting = limit!;
    if (fabrics.length > 1 && fabrics.some((f) => rules[f].wash !== setting)) tips.push(`Mixed load: ${SETTING_LABEL[setting]} is safe for all of it`);
    if (load.size === "overstuffed") tips.push("Packed washer: clothes won't get clean. Leave a hand's width free at the top");
    return { setting, why: `${SETTING_LABEL[setting]} water is right for ${nouns(who)}.`, cooler: false, tips };
  }

  const ladder = DRYER_SETTINGS.filter((s) => offered.includes(s));
  if (ladder.length === 0) return null;
  const avoid = new Set<string>(rec?.avoid.map((a) => a.setting) ?? []);
  const base = rec?.setting && ladder.includes(rec.setting) ? rec.setting : defaultSetting(ladder);
  const { limit, who } = coolest(fabrics, (f) => rules[f].maxDryer, dIdx);

  // Hottest offered setting at or below both the machine's best and the fabric limit, skipping ones that run hot here.
  const ceiling = Math.min(dIdx(base), limit ? dIdx(limit) : Infinity);
  const allowed = ladder.filter((s) => dIdx(s) <= ceiling);
  const safe = allowed.filter((s) => !avoid.has(s));
  const setting = safe[safe.length - 1] ?? allowed[0] ?? ladder[0];
  const cooler = dIdx(setting) < dIdx(base);

  let why: string;
  if (limit && dIdx(limit) < dIdx(base)) {
    why = `${cap(nouns(who))} shouldn't go above ${SETTING_LABEL[limit]}.`;
    if (dIdx(setting) < dIdx(limit)) {
      why += avoid.has(limit) ? ` ${SETTING_LABEL[limit]} runs hot on this dryer, so go one cooler.` : ` The dryers here don't have ${SETTING_LABEL[limit]}, so use the next one down.`;
    }
    if (dIdx(setting) > dIdx(limit)) why += ` This room has nothing cooler: hang the ${nouns(who)} to dry instead.`;
  } else if (setting !== base) {
    why = `${SETTING_LABEL[base]} runs hot on this dryer, so go one cooler.`;
  } else if (rec?.basis === "reports") {
    why = fabrics.length ? `This dryer's usual best setting is fine for ${nouns(fabrics)}.` : "This dryer's usual best setting.";
  } else {
    why = fabrics.length ? `A safe start for ${nouns(fabrics)} until this dryer has more reports.` : "A safe start until this dryer has more reports.";
  }

  // Cooler than what dries well here: say so, and suggest splitting a mixed load.
  if (cooler) {
    tips.push("Expect it to take longer than usual");
    const hardy = fabrics.filter((f) => dIdx(rules[f].maxDryer) > dIdx(setting));
    if (hardy.length > 0) tips.push(`Or dry the ${nouns(who)} separately and the ${nouns(hardy)} on ${SETTING_LABEL[base]}`);
  }
  if (load.size === "full" && !cooler) tips.push("Full load: expect it to take longer");
  if (load.size === "overstuffed") tips.push("Packed drum: clothes dry unevenly and stay damp in the middle. Split it into two loads if you can");
  if (load.size === "small" && dIdx(setting) >= dIdx("medium")) tips.push("Small load: check it early, small loads over-dry");
  return { setting, why, cooler, tips };
}
