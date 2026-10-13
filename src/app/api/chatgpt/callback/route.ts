import { NextResponse } from "next/server";
import { chatGPTLocalOrigin, stageChatGPTCallback } from "@/lib/chatgpt-server";
import { callbackRequestUrl } from "@/lib/chatgpt-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const origin = chatGPTLocalOrigin();
  if (!origin) return new Response("Local connection only", { status: 403 });
  try {
    const result = await stageChatGPTCallback(callbackRequestUrl(req, origin));
    const response = NextResponse.redirect(result.cancelled ? `${result.origin}/admin/settings?chatgpt=cancelled` : `${result.origin}/api/chatgpt/complete?state=${encodeURIComponent(result.state)}`, 303);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch {
    const response = NextResponse.redirect(`${origin}/admin/settings?chatgpt=failed`, 303);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }
}
