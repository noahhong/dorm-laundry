// A stand-in for the Claude Messages API so e2e can exercise the laundry helper without a real key or network.
// First call: ask to run plan_load for the fabrics named in the question. After the tool result: answer in text.
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_ANTHROPIC_PORT ?? 3101);
const WORDS = { leggings: "athletic", towels: "towels", sweater: "wool", jeans: "jeans", hoodie: "everyday" };

const message = (content, stop_reason) => ({
  id: `msg_${Math.random().toString(36).slice(2)}`,
  type: "message",
  role: "assistant",
  model: "mock",
  content,
  stop_reason,
  stop_sequence: null,
  usage: { input_tokens: 1, output_tokens: 1 },
});

createServer((req, res) => {
  res.setHeader("content-type", "application/json");
  // Keys containing "bad" are rejected, like a revoked key.
  if (String(req.headers["x-api-key"] ?? "").includes("bad")) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }));
  }
  if (req.method === "GET") {
    const id = req.url?.match(/^\/v1\/models\/(.+)$/)?.[1];
    return res.end(JSON.stringify(id ? { type: "model", id, display_name: id, created_at: "2026-01-01T00:00:00Z" } : { ok: true }));
  }
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const body = JSON.parse(raw);
    const last = body.messages.at(-1);
    let out;
    if (Array.isArray(last.content) && last.content[0]?.type === "tool_result") {
      const best = /Best dryer: (.+?) \(.*? on (\w+)/.exec(last.content[0].content);
      out = message([{ type: "text", text: best ? `Use ${best[1]} on ${best[2]}.` : "No dryer works right now." }], "end_turn");
    } else {
      const q = String(last.content).toLowerCase();
      const fabrics = Object.entries(WORDS).filter(([w]) => q.includes(w)).map(([, f]) => f);
      out = fabrics.length
        ? message([{ type: "tool_use", id: "toolu_1", name: "plan_load", input: { fabrics, size: "unknown", thickness: q.includes("thick") ? "thick" : "unknown" } }], "tool_use")
        : message([{ type: "text", text: "What's in the load?" }], "end_turn");
    }
    res.end(JSON.stringify(out));
  });
}).listen(PORT);
