import { ChatGPTPlanError } from "./chatgpt-oauth";
import type OpenAI from "openai";
import type { ResponseInputItem, ResponseOutputItem } from "openai/resources/responses/responses";
import { ASSISTANT_LIMITS, CLARIFY_TOOL, LOAD_TOOL, loadCare, parseLoadQuestion, parseLoadToolInput, planLoad, systemPrompt, type AssistantRoom, type ChatTurn, type LoadPlan } from "./assistant";
import type { FabricRules } from "./load-advice";
import type { AssistantAnswer } from "./assistant-server";

/** Uses the same grounded load tool as Claude; no model chooses settings independently. */
export async function askOpenAI(api: OpenAI, model: string, room: AssistantRoom, rules: FabricRules, siteName: string, turns: ChatTurn[], subscription = false): Promise<AssistantAnswer> {
  const input: ResponseInputItem[] = turns.map((turn) => ({ role: turn.role, content: turn.content }));
  let plan: LoadPlan | null = null;
  for (let round = 0; round <= ASSISTANT_LIMITS.maxToolRounds; round++) {
    const params = {
      model,
      instructions: systemPrompt(room, siteName),
      input,
      store: false,
      include: ["reasoning.encrypted_content" as const],
      tools: subscription
        ? [{ type: "namespace" as const, name: "laundry", description: "Laundry load rules and machine reports", tools: [LOAD_TOOL, CLARIFY_TOOL].map((tool) => ({ type: "function" as const, name: tool.name, description: tool.description, parameters: tool.input_schema, strict: true })) }]
        : [LOAD_TOOL, CLARIFY_TOOL].map((tool) => ({ type: "function" as const, name: tool.name, description: tool.description, parameters: tool.input_schema, strict: true })),
      tool_choice: round === ASSISTANT_LIMITS.maxToolRounds ? "none" as const : "auto" as const,
      ...(!subscription ? { max_output_tokens: 4000 } : {}),
    };
    let response;
    if (subscription) {
      const completedItems = new Map<number, ResponseOutputItem>();
      const stream = await api.responses.create({ ...params, stream: true });
      for await (const event of stream) {
        if (event.type === "response.output_item.done") completedItems.set(event.output_index, event.item);
        if (event.type === "response.failed" || event.type === "response.incomplete" || event.type === "error") throw new ChatGPTPlanError("ChatGPT couldn't finish this request. Check your plan usage or reconnect in Settings.");
        if (event.type === "response.completed") response = event.response;
      }
      if (!response) throw new ChatGPTPlanError("ChatGPT connection ended before the answer completed.");
      // Plan streams can leave terminal output empty. Completed item events contain
      // the tool calls, reasoning and text that must be carried into the next round.
      if (!response.output.length) response.output = [...completedItems.entries()].sort(([a], [b]) => a - b).map(([, item]) => item);
      response.output_text = response.output.filter((item) => item.type === "message").flatMap((item) => item.content.filter((block) => block.type === "output_text").map((block) => block.text)).join("\n");
    } else {
      response = await api.responses.create(params);
    }
    if (response.status === "failed" || response.status === "incomplete") throw new Error("OpenAI did not complete its answer");
    const calls = response.output.filter((item) => item.type === "function_call");
    if (calls.length === 0) {
      return { reply: response.output_text.trim() || "I couldn't work that out. Try describing the clothes a bit differently.", plan: plan && { load: plan.load, picks: plan.picks, options: plan.options, care: plan.care } };
    }
    for (const item of response.output) {
      if (item.type === "message" || item.type === "reasoning" || item.type === "function_call") input.push(item);
    }
    for (const call of calls) {
      let raw: unknown;
      try { raw = JSON.parse(call.arguments); } catch { raw = null; }
      const question = call.name === CLARIFY_TOOL.name ? parseLoadQuestion(raw) : null;
      if (question) return { reply: question.question, question, plan: null };
      const load = call.name === LOAD_TOOL.name ? parseLoadToolInput(raw) : null;
      if (!load) {
        input.push({ type: "function_call_output", call_id: call.call_id, output: "Invalid input: send fabrics (array), size and thickness." });
        continue;
      }
      plan = planLoad(room, load, rules, loadCare(raw));
      input.push({ type: "function_call_output", call_id: call.call_id, output: plan.text });
    }
  }
  return { reply: "I couldn't work that out. Try describing the clothes a bit differently.", plan: null };
}
