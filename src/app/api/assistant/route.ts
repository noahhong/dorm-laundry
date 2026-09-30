import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { ASSISTANT_LIMITS, SlidingLimiter, cleanConversation, type AssistantRoom } from "@/lib/assistant";
import { askAssistant, assistantConfigured } from "@/lib/assistant-server";
import { toFabricRules } from "@/lib/config";
import { getConfig } from "@/lib/config-server";
import { ipHash } from "@/lib/device";
import { getRoomById } from "@/lib/queries";

export const dynamic = "force-dynamic";

const HOUR = 3_600_000;
// In memory: fine for one server process (the pilot runs one). Restarting resets the counts.
const perIp = new SlidingLimiter(HOUR);
const perSite = new SlidingLimiter(24 * HOUR);

const bodySchema = z.object({
  roomId: z.string().min(1).max(64),
  machineCode: z.string().max(64).nullish(),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .min(1)
    .max(ASSISTANT_LIMITS.maxMessages * 2),
});

const fail = (status: number, error: string) => Response.json({ error }, { status });

export async function POST(req: Request) {
  const config = await getConfig();
  if (!assistantConfigured() || !config.assistantEnabled) return fail(404, "The laundry helper is turned off.");

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, "Something about that message didn't look right.");
  const turns = cleanConversation(parsed.data.messages);
  if (!turns) return fail(400, "Ask a question first.");

  const data = await getRoomById(parsed.data.roomId);
  if (!data) return fail(404, "That room isn't in our list.");

  const now = Date.now();
  if (!perIp.take(await ipHash(now), config.assistantPerIpPerHour, now)) {
    return fail(429, "Lots of questions from this network. Try again in a bit, or use “What's in your load?” on a machine page.");
  }
  if (!perSite.take("site", config.assistantPerDay, now)) {
    return fail(429, "The helper is taking a break for today. “What's in your load?” on each machine page still works.");
  }

  const room: AssistantRoom = {
    roomName: data.room.name,
    buildingName: data.building.name,
    offered: data.offered,
    minutesPerCycle: data.room.minutesPerCycle,
    focusCode: parsed.data.machineCode ?? null,
    machines: data.machines.map((m) => ({
      code: m.code,
      kind: m.kind,
      label: m.label,
      status: m.status,
      recommendation: m.recommendation,
      weak: m.weak != null,
    })),
  };

  try {
    const answer = await askAssistant(room, toFabricRules(config), config.siteName, turns);
    return Response.json(answer, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return fail(503, "The helper is busy. Try again in a minute.");
    if (err instanceof Anthropic.AuthenticationError) console.error("laundry helper: ANTHROPIC_API_KEY was rejected");
    else console.error("laundry helper failed", err);
    return fail(502, "The helper couldn't answer just now. Try again in a minute.");
  }
}
