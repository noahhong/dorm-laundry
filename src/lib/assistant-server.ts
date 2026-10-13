import "server-only";
import OpenAI from "openai";
import { canUseChatGPT, chatGPTSummary, chatGPTInference } from "./chatgpt-server";
import { askOpenAI } from "./assistant-openai";
import { getConfig } from "./config-server";
import Anthropic from "@anthropic-ai/sdk";
import { ASSISTANT_LIMITS, CLARIFY_TOOL, LOAD_TOOL, loadCare, parseLoadQuestion, parseLoadToolInput, planLoad, systemPrompt, type AssistantRoom, type ChatTurn, type LoadQuestion, type LoadPlan } from "./assistant";
import { getAnthropicKey, getProviderKey, type AssistantProvider } from "./api-key";
import type { FabricRules } from "./load-advice";

/** Claude Opus 5.5 by default; set ANTHROPIC_MODEL (e.g. claude-sonnet-5-5) to trade some quality for cost. */
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

/** The chat only exists when there is an API key, from the environment or saved in admin Settings. */
export async function activeAssistantKey() {
  const config = await getConfig();
  if (config.assistantProvider === "chatgpt") {
    const allowed = await canUseChatGPT();
    const summary = allowed ? await chatGPTSummary() : null;
    return { provider: "chatgpt" as const, source: "admin" as const, key: summary?.connected && summary.model ? "connected" : null };
  }
  if (config.assistantProvider === "openai" || config.assistantProvider === "anthropic") {
    const provider = config.assistantProvider;
    return { provider, ...(await getProviderKey(provider)) };
  }
  const anthropic = await getAnthropicKey();
  return anthropic.key ? { provider: "anthropic" as const, ...anthropic } : { provider: "openai" as const, ...(await getProviderKey("openai")) };
}

export async function assistantConfigured(): Promise<boolean> {
  return (await activeAssistantKey()).key !== null;
}

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";

export async function testProviderKey(provider: AssistantProvider, key: string): Promise<string | null> {
  if (provider === "anthropic") return testAnthropicKey(key);
  try {
    await new OpenAI({ apiKey: key, timeout: 15_000, maxRetries: 0 }).models.retrieve(OPENAI_MODEL);
    return null;
  } catch (err) {
    if (err instanceof OpenAI.AuthenticationError) return "OpenAI rejected this key.";
    if (err instanceof OpenAI.PermissionDeniedError) return "This key can't use the helper's model.";
    if (err instanceof OpenAI.NotFoundError) return `The model ${OPENAI_MODEL} wasn't found for this key.`;
    if (err instanceof OpenAI.APIConnectionError) return "Couldn't reach OpenAI from the server.";
    if (err instanceof OpenAI.APIError) return `OpenAI returned an error (${err.status ?? "unknown"}).`;
    return "Couldn't check the key.";
  }
}

// One client per key, so saving a new key in Settings takes effect on the next question.
let client: { key: string; api: Anthropic } | null = null;
async function getClient(): Promise<Anthropic> {
  const { key } = await getAnthropicKey();
  if (!key) throw new Error("No Anthropic API key");
  if (client?.key !== key) client = { key, api: new Anthropic({ apiKey: key, timeout: 45_000, maxRetries: 1 }) };
  return client.api;
}

/** Check a key works by looking up the helper's model: no tokens used. Returns an error message, or null if fine. */
export async function testAnthropicKey(key: string): Promise<string | null> {
  try {
    await new Anthropic({ apiKey: key, timeout: 15_000, maxRetries: 0 }).models.retrieve(MODEL);
    return null;
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return "Anthropic rejected this key.";
    if (err instanceof Anthropic.PermissionDeniedError) return "This key can't use the helper's model.";
    if (err instanceof Anthropic.NotFoundError) return `The model ${MODEL} wasn't found for this key.`;
    if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach Anthropic from the server.";
    if (err instanceof Anthropic.APIError) return `Anthropic returned an error (${err.status ?? "unknown"}).`;
    return "Couldn't check the key.";
  }
}

export interface AssistantAnswer {
  reply: string;
  question?: LoadQuestion;
  /** The last load Claude planned this turn, so the page can show machine links and pre-fill "What's in your load?". */
  plan: Pick<LoadPlan, "load" | "picks" | "options" | "care"> | null;
}

const FALLBACK_REPLY = "Sorry, I couldn't work that out. Try describing the clothes a bit differently.";

/**
 * One resident question: Claude reads the conversation, calls plan_load (our rules, run locally) as needed, and
 * answers. A short manual loop, capped at a few tool rounds.
 */
export async function askAssistant(room: AssistantRoom, rules: FabricRules, siteName: string, turns: ChatTurn[]): Promise<AssistantAnswer> {
  const active = await activeAssistantKey();
  if (!active.key) throw new Error("No API key for selected provider");
  if (active.provider === "chatgpt") {
    const connection = await chatGPTInference();
    return askOpenAI(new OpenAI({ apiKey: connection.accessToken, baseURL: "https://api.openai.com/v1", timeout: 45_000, maxRetries: 0 }), connection.model, room, rules, siteName, turns, true);
  }
  if (active.provider === "openai") {
    return askOpenAI(new OpenAI({ apiKey: active.key, timeout: 45_000, maxRetries: 1 }), OPENAI_MODEL, room, rules, siteName, turns);
  }
  const messages: Anthropic.Beta.BetaMessageParam[] = turns.map((t) => ({ role: t.role, content: t.content }));
  const system = systemPrompt(room, siteName);
  let plan: LoadPlan | null = null;

  for (let round = 0; round <= ASSISTANT_LIMITS.maxToolRounds; round++) {
    const response = await (await getClient()).beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      // Short chat answers: low effort keeps it quick and cheap.
      output_config: { effort: "low" },
      system,
      tools: [LOAD_TOOL, CLARIFY_TOOL],
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
      return { reply: text || FALLBACK_REPLY, plan: plan && { load: plan.load, picks: plan.picks, options: plan.options, care: plan.care } };
    }

    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    const clarification = toolUses.find((use) => use.name === CLARIFY_TOOL.name);
    const question = clarification ? parseLoadQuestion(clarification.input) : null;
    if (question) return { reply: question.question, question, plan: null };
    for (const use of toolUses) {
      const load = use.name === LOAD_TOOL.name ? parseLoadToolInput(use.input) : null;
      if (!load) {
        results.push({ type: "tool_result", tool_use_id: use.id, content: "Invalid input: send fabrics (array) and size.", is_error: true });
        continue;
      }
      plan = planLoad(room, load, rules, loadCare(use.input));
      results.push({ type: "tool_result", tool_use_id: use.id, content: plan.text });
    }
    messages.push({ role: "user", content: results });
  }
  return { reply: FALLBACK_REPLY, plan: null };
}
