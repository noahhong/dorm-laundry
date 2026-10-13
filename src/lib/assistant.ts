// The laundry assistant's grounding: the prompt, the one tool Claude can call, and what that tool returns.
// Pure: no DB, no network, no Date.now(). The Claude call itself lives in assistant-server.ts. See PLAN.md §6.8.
//
// Claude's job is only to turn "my gym leggings and a wool sweater" into fabric categories and talk to the
// resident. Which machine and which setting always come from the site's own rules (load-advice.ts) and the
// room's live status, so the assistant can't invent a setting the dryers don't have.

import { DRYER_SETTINGS, FABRICS, FABRIC_LABEL, SETTING_LABEL, THICKNESSES, type DryerSetting, type Fabric, type MachineKind, type Thickness } from "./labels";
import { suggestForLoad, type FabricRules, type Learned, type LoadInput } from "./load-advice";
import type { Confidence, MachineStatus, Recommendation, StatusLevel } from "./status";

export const ASSISTANT_LIMITS = {
  /** Turns kept from the conversation (user + assistant). Older ones are dropped. */
  maxMessages: 12,
  maxChars: 4000,
  /** Tool round trips per question before giving up. */
  maxToolRounds: 3,
} as const;

export interface AssistantMachine {
  code: string;
  kind: MachineKind;
  label: string;
  status: Pick<MachineStatus, "level" | "reason" | "confidence">;
  recommendation: Recommendation | null;
  weak: boolean;
}

export interface AssistantRoom {
  roomName: string;
  buildingName: string;
  offered: readonly DryerSetting[];
  minutesPerCycle: number | null;
  machines: AssistantMachine[];
  /** Set on a machine page: the machine the resident is standing at. */
  focusCode: string | null;
  /** What this room's past loads say per fabric and thickness (PLAN.md §6.7). */
  learned?: Learned;
}

export interface MachinePick {
  code: string;
  label: string;
  kind: MachineKind;
  setting: string;
  why: string;
  tips: string[];
  evidence?: string;
}

export interface LoadPlan {
  load: LoadInput;
  /** Best machine of each kind for this load, when the room has a usable one. */
  picks: MachinePick[];
  options: MachinePick[];
  care: "standard" | "air_dry" | "no_machine";
  /** Machine-readable summary handed back to Claude as the tool result. */
  text: string;
}

export const LOAD_TOOL = {
  name: "plan_load",
  description:
    "Look up which washer and dryer in this laundry room to use, and on which setting, for a load. Always call this before " +
    "recommending a machine or setting; never guess settings yourself. Map what the resident describes onto these fabric " +
    "categories: everyday (t-shirts, hoodies, sweatpants, socks, underwear, cotton), towels (towels, sheets, bedding, " +
    "blankets), jeans (denim, jeans, jackets made of denim), athletic (leggings, gym shorts, sports bras, jerseys, " +
    "spandex, nylon, polyester workout wear, swimwear), delicates (lace, silk, satin, bras, lingerie, rayon blouses), " +
    "wool (sweaters, cardigans, merino, cashmere, knit beanies), prints (graphic tees, screen-printed or heat-transfer " +
    "shirts). Include every category present; mixed loads are fine. Set thickness to how thick most of the load is: thick " +
    "for hoodies, sweatshirts, towels, heavy denim, fleece or blankets; thin for t-shirts, leggings, silk or light " +
    "synthetics; regular otherwise; unknown if you can't tell.",
  input_schema: {
    type: "object" as const,
    properties: {
      fabrics: { type: "array", items: { type: "string", enum: [...FABRICS] }, description: "Fabric categories in the load." },
      size: { type: "string", enum: ["small", "medium", "full", "overstuffed", "unknown"], description: "How full the drum will be, if the resident said." },
      thickness: { type: "string", enum: [...THICKNESSES, "unknown"], description: "How thick most of the load is." },
      care: { type: "string", enum: ["standard", "air_dry", "no_machine"], description: "Use air_dry when any item cannot tumble dry (including wool unless its label explicitly allows it). Use no_machine for dry-clean-only, hand-wash-only, leather, suede or otherwise unsuitable items still in the load. Ask about separating them first if needed." },
    },
    required: ["fabrics", "size", "thickness", "care"],
    additionalProperties: false,
  },
  strict: true,
};

export interface LoadQuestion { question: string; options: string[] }
export const CLARIFY_TOOL = {
  name: "clarify_load",
  description: "Ask one focused question before planning when an unknown care label, material, unusual item or mixed load changes whether machine washing/drying is appropriate. Offer two to four useful answers. The resident can also type an answer. Do not ask questions already answered.",
  input_schema: {
    type: "object" as const,
    properties: { question: { type: "string" }, options: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 } },
    required: ["question", "options"], additionalProperties: false,
  }, strict: true,
};
export function parseLoadQuestion(raw: unknown): LoadQuestion | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as { question?: unknown; options?: unknown };
  if (typeof v.question !== "string" || !v.question.trim() || v.question.length > 300 || !Array.isArray(v.options) || v.options.length < 2 || v.options.length > 4) return null;
  if (!v.options.every((x) => typeof x === "string" && x.trim() && x.length <= 160)) return null;
  return { question: v.question.trim(), options: [...new Set(v.options as string[])] };
}
export function loadCare(raw: unknown): LoadPlan["care"] {
  const care = raw && typeof raw === "object" ? (raw as { care?: unknown }).care : null;
  return care === "air_dry" || care === "no_machine" ? care : "standard";
}

/** Validate the tool input Claude sent. Unknown fabrics are dropped rather than failing the turn. */
export function parseLoadToolInput(raw: unknown): LoadInput | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as { fabrics?: unknown; size?: unknown; thickness?: unknown };
  if (!Array.isArray(v.fabrics)) return null;
  const fabrics = [...new Set(v.fabrics.filter((f): f is Fabric => FABRICS.includes(f as Fabric)))];
  const size = v.size === "small" || v.size === "medium" || v.size === "full" || v.size === "overstuffed" ? v.size : null;
  const thickness = THICKNESSES.includes(v.thickness as Thickness) ? (v.thickness as Thickness) : null;
  return { fabrics, size, thickness };
}

const LEVEL_RANK: Record<StatusLevel, number> = { works: 0, unknown: 1, caution: 2, broken: 3 };
const CONF_RANK: Record<Confidence, number> = { high: 0, medium: 1, low: 2, none: 3 };

/**
 * Machines of one kind, best first: working beats untested beats caution; broken machines are left out. Weak dryers
 * sink below healthy ones, and among equals the one with more trustworthy setting data wins. The machine the
 * resident is standing at wins ties, so we don't send them across the room for nothing.
 */
export function rankMachines(machines: readonly AssistantMachine[], kind: MachineKind, focusCode: string | null): AssistantMachine[] {
  const score = (m: AssistantMachine) => [
    LEVEL_RANK[m.status.level],
    m.weak ? 1 : 0,
    m.recommendation ? CONF_RANK[m.recommendation.confidence] : CONF_RANK[m.status.confidence],
    m.code === focusCode ? 0 : 1,
  ];
  return machines
    .filter((m) => m.kind === kind && m.status.level !== "broken")
    .map((m) => ({ m, s: score(m) }))
    .sort((a, b) => {
      for (let i = 0; i < a.s.length; i++) if (a.s[i] !== b.s[i]) return a.s[i] - b.s[i];
      return 0;
    })
    .map((x) => x.m);
}

const statusText = (m: AssistantMachine) => `${m.status.level}${m.status.reason ? ` (${m.status.reason})` : ""}${m.weak ? ", dries worse than the others" : ""}`;

/** Run the site's load rules against every usable machine in the room and pick the best of each kind. */
export function planLoad(room: AssistantRoom, load: LoadInput, rules: FabricRules, care: LoadPlan["care"] = "standard"): LoadPlan {
  const lines: string[] = [];
  const picks: MachinePick[] = [];
  const options: MachinePick[] = [];
  if (care === "no_machine") return { load, picks, options, care, text: "Do not put this load into a machine. Follow the items' care labels; remove unsuitable items and plan the remaining load separately." };
  if (load.fabrics.length === 0) {
    return { load, picks, options, care, text: "No fabric categories given. Ask the resident what is in the load." };
  }
  lines.push(`Load: ${load.fabrics.map((f) => FABRIC_LABEL[f]).join(", ")}${load.thickness ? `; mostly ${load.thickness}` : ""}${load.size ? `; ${load.size} load` : ""}.`);

  for (const kind of ["washer", "dryer"] as const) {
    if (kind === "dryer" && (care === "air_dry" || load.fabrics.includes("wool"))) {
      care = "air_dry";
      lines.push("Air dry this load; no dryer recommendation. Dry wool flat. Separate items that can tumble dry and plan those separately.");
      continue;
    }
    const all = room.machines.filter((m) => m.kind === kind);
    if (all.length === 0) continue;
    const ranked = rankMachines(room.machines, kind, room.focusCode);
    const broken = all.filter((m) => m.status.level === "broken").map((m) => m.label);
    if (ranked.length === 0) {
      lines.push(`${kind === "washer" ? "Washers" : "Dryers"}: every one is broken right now. Say so and suggest another room.`);
      continue;
    }
    for (const machine of ranked) {
      const option = suggestForLoad(kind, load, rules, machine.recommendation, room.offered, room.learned);
      if (!option) continue;
      if (kind === "dryer" && (load.fabrics.some((fabric) => DRYER_SETTINGS.indexOf(option.setting as DryerSetting) > DRYER_SETTINGS.indexOf(rules[fabric].maxDryer)) || machine.recommendation?.avoid.some((avoid) => avoid.setting === option.setting))) continue;
      const condition = machine.status.level === "unknown" ? "Recent condition is unconfirmed." : `Reported ${machine.status.level}${machine.status.reason ? `: ${machine.status.reason}` : "."}`;
      const evidence = `${condition} ${machine.recommendation?.basis === "reports" ? "Settings informed by machine reports." : "Limited setting reports; using fabric rules."}`;
      options.push({ code: machine.code, label: machine.label, kind, setting: `${SETTING_LABEL[option.setting] ?? option.setting}${kind === "washer" ? " water" : ""}`, why: option.why, tips: option.tips, evidence });
    }
    const best = ranked.find((machine) => options.some((option) => option.code === machine.code));
    if (!best) {
      lines.push(`No suitable ${kind} setting is available for this load. ${kind === "dryer" ? "Air dry instead." : "Follow the care labels or use another room."}`);
      if (kind === "dryer") care = "air_dry";
      continue;
    }
    const advice = suggestForLoad(kind, load, rules, best.recommendation, room.offered, room.learned);
    if (!advice) continue;
    const setting = `${SETTING_LABEL[advice.setting] ?? advice.setting}${kind === "washer" ? " water" : ""}`;
    picks.push(options.find((option) => option.code === best.code)!);
    lines.push(
      `Best ${kind}: ${best.label} (${statusText(best)}) on ${setting}. Why: ${advice.why}` +
        (advice.tips.length ? ` Tips: ${advice.tips.join("; ")}.` : ""),
    );
    const others = ranked.filter((m) => m.code !== best.code && options.some((option) => option.code === m.code)).map((m) => `${m.label} (${statusText(m)})`);
    if (others.length) lines.push(`Other usable ${kind}s, worse first choice: ${others.join(", ")}.`);
    if (broken.length) lines.push(`Broken ${kind}s, do not use: ${broken.join(", ")}.`);
    const focus = all.find((m) => m.code === room.focusCode);
    if (focus && focus.code !== best.code) {
      const here = options.find((option) => option.code === focus.code);
      lines.push(
        here
          ? `The resident is at ${focus.label} (${statusText(focus)}); if they use it anyway, use ${here.setting}. ${here.why}`
          : `The resident is at ${focus.label}, which ${focus.status.level === "broken" ? "is broken" : "has no suitable setting for this load"}.`,
      );
    }
  }
  if (room.minutesPerCycle) lines.push(`One dryer payment runs about ${room.minutesPerCycle} minutes here.`);
  return { load, picks, options, care, text: lines.join("\n") };
}

/** The system prompt: fixed instructions first, then this room's machines. */
export function systemPrompt(room: AssistantRoom, siteName: string): string {
  const focus = room.machines.find((m) => m.code === room.focusCode);
  const roster = room.machines
    .map((m) => {
      const rec = m.recommendation ? `, usual best setting ${SETTING_LABEL[m.recommendation.setting]} (from ${m.recommendation.basis})` : "";
      return `- ${m.label} (${m.kind}): ${statusText(m)}${rec}`;
    })
    .join("\n");
  return `You are the laundry helper on ${siteName}, a student-run site that tracks which washers and dryers work in college dorm laundry rooms and which settings are safe for clothes.

Help the resident decide which machine to use and which setting, based on the clothes they describe.
- Before recommending any machine or setting, call plan_load. Use only the machines and settings it returns; never make up a setting or a machine.
- This is a guided selection tool, not an open-ended chat. If a detail changes the care decision, use clarify_load to ask one short question with selectable answers. Otherwise plan immediately and state assumptions briefly.
- Handle arbitrary descriptions, unusual items, mixed fabrics, stains and care-label instructions. Never force an unsuitable or unknown item into an everyday fabric category. Ask about its material/care label or advise separating it. The care label always wins.
- Set plan_load care to air_dry for loads containing items that cannot tumble dry, and no_machine for loads still containing items that cannot machine wash. Do not contradict that restriction in your summary.
- Machine reports describe performance, not current occupancy. Never claim a recommended machine is free; residents check in person.
- If they mention something that should not go in a machine at all (dry-clean-only, leather, suede, anything with a care label that says hand wash), say so plainly. A garment's own care label beats the general rules.
- The interface shows machine/settings cards from the tool. Keep your summary to one to three sentences about assumptions, separation, stain treatment or care precautions; don't repeat every card.
- You only help with laundry in this room. Politely decline anything else.
- Nothing you say changes the site. To tell others how a machine did, residents scan its sticker and report.

Room: ${room.roomName}, ${room.buildingName}.
Dryer settings on the dryers here: ${room.offered.map((s) => SETTING_LABEL[s]).join(", ")}. Washers have Cold, Warm and Hot water.
Machines:
${roster || "- none"}
${focus ? `The resident is planning from ${focus.label}'s page.` : "The resident is planning from the room page."}`;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Clean the conversation the browser sent: keep the newest turns, trim long ones, drop empty ones, and make sure it
 * starts and ends with the resident. Returns null when there is no question to answer.
 */
export function cleanConversation(raw: readonly ChatTurn[]): ChatTurn[] | null {
  const turns = raw
    .filter((t) => (t.role === "user" || t.role === "assistant") && typeof t.content === "string" && t.content.trim())
    .map((t) => ({ role: t.role, content: t.content.trim().slice(0, ASSISTANT_LIMITS.maxChars) }))
    .slice(-ASSISTANT_LIMITS.maxMessages);
  while (turns.length && turns[0].role !== "user") turns.shift();
  if (turns.length === 0 || turns[turns.length - 1].role !== "user") return null;
  return turns;
}

/** Sliding-window rate limiter: at most `limit` hits per `windowMs` for each key. In memory, per server process. */
export class SlidingLimiter {
  private hits = new Map<string, number[]>();
  constructor(private windowMs: number) {}

  /** Record a hit if under `limit`; returns false (and records nothing) when the key is over. */
  take(key: string, limit: number, now: number): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => t > now - this.windowMs);
    if (recent.length >= limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 5000) this.sweep(now);
    return true;
  }

  private sweep(now: number) {
    for (const [k, ts] of this.hits) if (!ts.some((t) => t > now - this.windowMs)) this.hits.delete(k);
  }
}
