import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../src/lib/chatgpt-server", () => ({ canUseChatGPT: vi.fn(), chatGPTSummary: vi.fn(), chatGPTInference: vi.fn() }));
vi.mock("../src/lib/api-key", () => ({ getAnthropicKey: vi.fn(), getProviderKey: vi.fn() }));
vi.mock("../src/lib/config-server", () => ({ getConfig: vi.fn() }));
import { getAnthropicKey, getProviderKey } from "../src/lib/api-key";
import { canUseChatGPT, chatGPTSummary } from "../src/lib/chatgpt-server";
import { getConfig } from "../src/lib/config-server";
import { activeAssistantKey, assistantConfigured } from "../src/lib/assistant-server";
import { DEFAULT_CONFIG } from "../src/lib/config";

const none = { source: null, key: null } as const;
const key = { source: "admin", key: "test-only" } as const;
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getConfig).mockResolvedValue(DEFAULT_CONFIG);
  vi.mocked(getAnthropicKey).mockResolvedValue(none);
  vi.mocked(getProviderKey).mockResolvedValue(none);
});

describe("assistant provider selection", () => {
  it("does not expose the admin subscription to other visitors", async () => {
    vi.mocked(getConfig).mockResolvedValue({ ...DEFAULT_CONFIG, assistantProvider: "chatgpt" });
    vi.mocked(canUseChatGPT).mockResolvedValue(false);
    expect(await assistantConfigured()).toBe(false);
    expect(chatGPTSummary).not.toHaveBeenCalled();
  });
  it("uses the selected ChatGPT connection when authorized and a model is saved", async () => {
    vi.mocked(getConfig).mockResolvedValue({ ...DEFAULT_CONFIG, assistantProvider: "chatgpt" });
    vi.mocked(canUseChatGPT).mockResolvedValue(true);
    vi.mocked(chatGPTSummary).mockResolvedValue({ connected: true, model: "available-model", activeId: "client", accounts: [] });
    expect(await assistantConfigured()).toBe(true);
    expect((await activeAssistantKey()).provider).toBe("chatgpt");
    expect(getAnthropicKey).not.toHaveBeenCalled();
    expect(getProviderKey).not.toHaveBeenCalled();
  });
  it("preserves existing Anthropic configuration in automatic mode", async () => {
    vi.mocked(getAnthropicKey).mockResolvedValue(key);
    expect(await activeAssistantKey()).toEqual({ provider: "anthropic", ...key });
  });
  it("uses OpenAI automatically when only its key is configured", async () => {
    vi.mocked(getProviderKey).mockResolvedValue(key);
    expect(await activeAssistantKey()).toEqual({ provider: "openai", ...key });
    expect(getProviderKey).toHaveBeenCalledWith("openai");
  });
  it("uses the explicitly selected provider even when both keys exist", async () => {
    vi.mocked(getConfig).mockResolvedValue({ ...DEFAULT_CONFIG, assistantProvider: "openai" });
    vi.mocked(getAnthropicKey).mockResolvedValue(key);
    vi.mocked(getProviderKey).mockResolvedValue(key);
    expect((await activeAssistantKey()).provider).toBe("openai");
    expect(getAnthropicKey).not.toHaveBeenCalled();
  });
  it("doesn't silently switch providers when the selected one has no key", async () => {
    vi.mocked(getConfig).mockResolvedValue({ ...DEFAULT_CONFIG, assistantProvider: "openai" });
    vi.mocked(getAnthropicKey).mockResolvedValue(key);
    expect(await assistantConfigured()).toBe(false);
  });
});
