// The laundry assistant's grounding: the prompt, the one tool Claude can call, and what that tool returns.
// Pure: no DB, no network, no Date.now(). The Claude call itself lives in assistant-server.ts. See PLAN.md §6.8.
//
// Claude's job is only to turn "my gym leggings and a wool sweater" into fabric categories and talk to the
// resident. Which machine and which setting always come from the site's own rules (load-advice.ts) and the
// room's live status, so the assistant can't invent a setting the dryers don't have.

import { FABRICS, FABRIC_LABEL, SETTING_LABEL, type DryerSetting, type Fabric, type MachineKind } from "./labels";
import { suggestForLoad, type FabricRules, type LoadInput } from "./load-advice";
import type { Confidence, MachineStatus, Recommendation, StatusLevel } from "./status";

export const ASSISTANT_LIMITS = {
  /** Turns kept from the conversation (user + assistant). Older ones are dropped. */
  maxMessages: 12,
  maxChars: 600,
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
}

export interface MachinePick {
  code: string;
  label: string;
  kind: MachineKind;
  setting: string;
  why: string;
  tips: string[];
}

export interface LoadPlan {
  load: LoadInput;
  /** Best machine of each kind for this load, when the room has a usable one. */
  picks: MachinePick[];
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
    "shirts). Include every category present; mixed loads are fine.",
  input_schema: {
    type: "object" as const,
    properties: {
      fabrics: { type: "array", items: { type: "string", enum: [...FABRICS] }, description: "Fabric categories in the load." },
      size: { type: "string", enum: ["small", "medium", "full", "unknown"], description: "How big the load is, if the resident said." },
    },
    required: ["fabrics", "size"],
    additionalProperties: false,
  },
  strict: true,
};

/** Validate the tool input Claude sent. Unknown fabrics are dropped rather than failing the turn. */
export function parseLoadToolInput(raw: unknown): LoadInput | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as { fabrics?: unknown; size?: unknown };
  if (!Array.isArray(v.fabrics)) return null;
  const fabrics = [...new Set(v.fabrics.filter((f): f is Fabric => FABRICS.includes(f as Fabric)))];
  const size = v.size === "small" || v.size === "medium" || v.size === "full" ? v.size : null;
  return { fabrics, size };
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
export function planLoad(room: AssistantRoom, load: LoadInput, rules: FabricRules): LoadPlan {
  const lines: string[] = [];
  const picks: MachinePick[] = [];
  if (load.fabrics.length === 0) {
    return { load, picks, text: "No fabric categories given. Ask the resident what is in the load." };
  }
  lines.push(`Load: ${load.fabrics.map((f) => FABRIC_LABEL[f]).join(", ")}${load.size ? `; ${load.size} load` : ""}.`);

  for (const kind of ["washer", "dryer"] as const) {
    const all = room.machines.filter((m) => m.kind === kind);
    if (all.length === 0) continue;
    const ranked = rankMachines(room.machines, kind, room.focusCode);
    const broken = all.filter((m) => m.status.level === "broken").map((m) => m.label);
    if (ranked.length === 0) {
      lines.push(`${kind === "washer" ? "Washers" : "Dryers"}: every one is broken right now. Say so and suggest another room.`);
      continue;
    }
    const best = ranked[0];
    const advice = suggestForLoad(kind, load, rules, best.recommendation, room.offered);
    if (!advice) continue;
    const setting = `${SETTING_LABEL[advice.setting] ?? advice.setting}${kind === "washer" ? " water" : ""}`;
    picks.push({ code: best.code, label: best.label, kind, setting, why: advice.why, tips: advice.tips });
    lines.push(
      `Best ${kind}: ${best.label} (${statusText(best)}) on ${setting}. Why: ${advice.why}` +
        (advice.tips.length ? ` Tips: ${advice.tips.join("; ")}.` : ""),
    );
    const others = ranked.slice(1).map((m) => `${m.label} (${statusText(m)})`);
    if (others.length) lines.push(`Other usable ${kind}s, worse first choice: ${others.join(", ")}.`);
    if (broken.length) lines.push(`Broken ${kind}s, do not use: ${broken.join(", ")}.`);
    const focus = all.find((m) => m.code === room.focusCode);
    if (focus && focus.code !== best.code) {
      const here = focus.status.level === "broken" ? null : suggestForLoad(kind, load, rules, focus.recommendation, room.offered);
      lines.push(
        here
          ? `The resident is at ${focus.label} (${statusText(focus)}); if they use it anyway, use ${SETTING_LABEL[here.setting]}. ${here.why}`
          : `The resident is at ${focus.label}, which is broken.`,
      );
    }
  }
  if (room.minutesPerCycle) lines.push(`One dryer payment runs about ${room.minutesPerCycle} minutes here.`);
  return { load, picks, text: lines.join("\n") };
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
- If the load is unclear, ask one short question (for example, whether the sweater is wool or cotton), or call plan_load with your best reading and say what you assumed.
- If they mention something that should not go in a machine at all (dry-clean-only, leather, suede, anything with a care label that says hand wash), say so plainly. A garment's own care label beats the general rules.
- Keep replies short: two to four sentences, plain text, no markdown headings or tables. Name the machine and setting first.
- You only help with laundry in this room. Politely decline anything else.
- Nothing you say changes the site. To tell others how a machine did, residents scan its sticker and report.

Room: ${room.roomName}, ${room.buildingName}.
Dryer settings on the dryers here: ${room.offered.map((s) => SETTING_LABEL[s]).join(", ")}. Washers have Cold, Warm and Hot water.
Machines:
${roster || "- none"}
${focus ? `The resident opened this chat from ${focus.label}'s page.` : "The resident opened this chat from the room page."}`;
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
