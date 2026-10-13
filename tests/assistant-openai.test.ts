import { describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";
import { askOpenAI } from "../src/lib/assistant-openai";
import { DEFAULT_CONFIG, toFabricRules } from "../src/lib/config";
import { type AssistantRoom } from "../src/lib/assistant";

const room: AssistantRoom = {
  roomName: "Laundry", buildingName: "Summit", offered: ["low", "medium", "high"], minutesPerCycle: 45, focusCode: null,
  machines: [
    { code: "broken", kind: "dryer", label: "Dryer 1", status: { level: "broken", reason: null, confidence: "high" }, recommendation: null, weak: false },
    { code: "good", kind: "dryer", label: "Dryer 2", status: { level: "works", reason: null, confidence: "high" }, recommendation: null, weak: false },
  ],
};
const rules = toFabricRules(DEFAULT_CONFIG);
const turns = [{ role: "user" as const, content: "Which dryer for my leggings?" }];
const call = (args: string, name = "plan_load") => ({ type: "function_call", call_id: "call_1", name, arguments: args });
const response = (output: unknown[], output_text = "") => ({ status: "completed", output, output_text });
const client = (create: ReturnType<typeof vi.fn>) => ({ responses: { create } }) as unknown as OpenAI;

describe("OpenAI laundry helper", () => {
  it("preserves streamed tools and text when the terminal plan response has empty output", async () => {
    const streams = [
      [{ type: "response.output_item.done", output_index: 0, item: call(JSON.stringify({ fabrics: ["athletic"], size: "small", thickness: "thin", care: "standard" })) }, { type: "response.completed", response: response([]) }],
      [{ type: "response.output_item.done", output_index: 0, item: { type: "message", content: [{ type: "output_text", text: "Use the settings shown for this load." }] } }, { type: "response.completed", response: response([]) }],
    ];
    const create = vi.fn().mockImplementation(async () => (async function* () { for (const event of streams.shift()!) yield event; })());
    const result = await askOpenAI(client(create), "plan-model", room, rules, "Laundry", turns, true);
    expect(result.plan?.picks[0]).toMatchObject({ code: "good", setting: "Low" });
    expect(result.reply).toBe("Use the settings shown for this load.");
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][0].input).toContainEqual(expect.objectContaining({ type: "function_call_output", call_id: "call_1" }));
  });
  it("returns an adaptive care question instead of inventing machine settings", async () => {
    const question = { question: "What does the jacket's care label say?", options: ["Machine washable", "Dry clean only", "Not sure"] };
    const create = vi.fn().mockResolvedValue(response([call(JSON.stringify(question), "clarify_load")]));
    const result = await askOpenAI(client(create), "test-model", room, rules, "Laundry", turns);
    expect(result.question).toEqual(question);
    expect(result.plan).toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("keeps no-tumble-dry loads out of every dryer result", async () => {
    const create = vi.fn().mockResolvedValueOnce(response([call(JSON.stringify({ fabrics: ["athletic"], size: "small", thickness: "thin", care: "air_dry" }))])).mockResolvedValueOnce(response([], "Air dry these items."));
    const result = await askOpenAI(client(create), "test-model", room, rules, "Laundry", turns);
    expect(result.plan).toMatchObject({ care: "air_dry", picks: [], options: [] });
  });
  it("streams subscription requests with namespace tools and no unsupported output limit", async () => {
    const streams = [
      [{ type: "response.completed", response: response([call(JSON.stringify({ fabrics: ["athletic"], size: "small", thickness: "thin" }))]) }],
      [{ type: "response.completed", response: response([{ type: "message", content: [{ type: "output_text", text: "Use Dryer 2 on Low." }] }]) }],
    ];
    const create = vi.fn().mockImplementation(async () => (async function* () { for (const event of streams.shift()!) yield event; })());
    const result = await askOpenAI(client(create), "plan-model", room, rules, "Laundry", turns, true);
    expect(result.reply).toBe("Use Dryer 2 on Low.");
    expect(result.plan?.picks[0].code).toBe("good");
    expect(create.mock.calls[0][0]).toMatchObject({ stream: true, store: false, tools: [{ type: "namespace", name: "laundry" }] });
    expect(create.mock.calls[0][0]).not.toHaveProperty("max_output_tokens");
  });
  it("doesn't accept a subscription stream that ends before completion", async () => {
    const create = vi.fn().mockImplementation(async () => (async function* () { yield { type: "response.output_text.delta", delta: "Use Dryer" }; })());
    await expect(askOpenAI(client(create), "plan-model", room, rules, "Laundry", turns, true)).rejects.toThrow("before the answer completed");
  });
  it("reports subscription stream failure instead of switching billing providers", async () => {
    const create = vi.fn().mockImplementation(async () => (async function* () { yield { type: "response.failed" }; })());
    await expect(askOpenAI(client(create), "plan-model", room, rules, "Laundry", turns, true)).rejects.toThrow("Check your plan usage");
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("executes the load tool, avoids broken dryers and caps heat for athletic clothes", async () => {
    const create = vi.fn().mockResolvedValueOnce(response([call(JSON.stringify({ fabrics: ["athletic"], size: "small", thickness: "thin" }))]))
      .mockResolvedValueOnce(response([], "Use Dryer 2 on Low."));
    const result = await askOpenAI(client(create), "test-model", room, rules, "Laundry", turns);
    expect(result.plan?.picks).toEqual([expect.objectContaining({ code: "good", setting: "Low" })]);
    const second = create.mock.calls[1][0];
    expect(second.input).toContainEqual(expect.objectContaining({ type: "function_call_output", call_id: "call_1", output: expect.stringContaining("Broken dryers, do not use: Dryer 1") }));
    expect(second.store).toBe(false);
    expect(result.reply).toBe("Use Dryer 2 on Low.");
  });

  it("passes malformed or unknown tool calls back as errors without generating picks", async () => {
    const create = vi.fn().mockResolvedValueOnce(response([call("not json", "unknown")]))
      .mockResolvedValueOnce(response([], "What clothes are in the load?"));
    const result = await askOpenAI(client(create), "test-model", room, rules, "Laundry", turns);
    expect(result.plan).toBeNull();
    expect(create.mock.calls[1][0].input).toContainEqual(expect.objectContaining({ output: expect.stringContaining("Invalid input") }));
  });

  it("caps tool rounds even if the model keeps requesting tools", async () => {
    const create = vi.fn().mockResolvedValue(response([call('{}')]));
    const result = await askOpenAI(client(create), "test-model", room, rules, "Laundry", turns);
    expect(create).toHaveBeenCalledTimes(4);
    expect(create.mock.calls[3][0].tool_choice).toBe("none");
    expect(result.plan).toBeNull();
  });

  it("doesn't present an incomplete answer as a successful recommendation", async () => {
    const create = vi.fn().mockResolvedValue({ status: "incomplete", output: [], output_text: "Use Dryer" });
    await expect(askOpenAI(client(create), "test-model", room, rules, "Laundry", turns)).rejects.toThrow("did not complete");
  });
});
