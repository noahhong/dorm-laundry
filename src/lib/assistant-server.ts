import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { ASSISTANT_LIMITS, LOAD_TOOL, parseLoadToolInput, planLoad, systemPrompt, type AssistantRoom, type ChatTurn, type LoadPlan } from "./assistant";
import type { FabricRules } from "./load-advice";

/** Claude Opus 5.5 by default; set ANTHROPIC_MODEL (e.g. claude-sonnet-5-5) to trade some quality for cost. */
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

/** The chat only exists when the server has credentials for it. */
export function assistantConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic({ timeout: 45_000, maxRetries: 1 }));

export interface AssistantAnswer {
  reply: string;
  /** The last load Claude planned this turn, so the page can show machine links and pre-fill "What's in your load?". */
  plan: Pick<LoadPlan, "load" | "picks"> | null;
}

const FALLBACK_REPLY = "Sorry, I couldn't work that out. Try describing the clothes a bit differently.";

/**
 * One resident question: Claude reads the conversation, calls plan_load (our rules, run locally) as needed, and
 * answers. A short manual loop, capped at a few tool rounds.
 */
export async function askAssistant(room: AssistantRoom, rules: FabricRules, siteName: string, turns: ChatTurn[]): Promise<AssistantAnswer> {
  const messages: Anthropic.Beta.BetaMessageParam[] = turns.map((t) => ({ role: t.role, content: t.content }));
  const system = systemPrompt(room, siteName);
  let plan: LoadPlan | null = null;

  for (let round = 0; round <= ASSISTANT_LIMITS.maxToolRounds; round++) {
    const response = await getClient().beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      // Short chat answers: low effort keeps it quick and cheap.
      output_config: { effort: "low" },
      system,
      tools: [LOAD_TOOL],
      // Out of tools: make Claude answer with what it has.
      tool_choice: round === ASSISTANT_LIMITS.maxToolRounds ? { type: "none" } : { type: "auto" },
      messages,
      // If a safety classifier declines, retry on the fallback model the API picks.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });

    if (response.stop_reason === "refusal") return { reply: "Sorry, I can only help with laundry here.", plan: null };

    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      const text = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { reply: text || FALLBACK_REPLY, plan: plan && { load: plan.load, picks: plan.picks } };
    }

    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const use of toolUses) {
      const load = use.name === LOAD_TOOL.name ? parseLoadToolInput(use.input) : null;
      if (!load) {
        results.push({ type: "tool_result", tool_use_id: use.id, content: "Invalid input: send fabrics (array) and size.", is_error: true });
        continue;
      }
      plan = planLoad(room, load, rules);
      results.push({ type: "tool_result", tool_use_id: use.id, content: plan.text });
    }
    messages.push({ role: "user", content: results });
  }
  return { reply: FALLBACK_REPLY, plan: null };
}
