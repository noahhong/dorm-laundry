import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { canUseChatGPT, finishChatGPT } from "@/lib/chatgpt-server";
import { PENDING_COOKIE } from "@/lib/chatgpt-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!(await canUseChatGPT())) return new Response("Complete sign-in from your local admin browser", { status: 403 });
  let status = "connected";
  try {
    await finishChatGPT(url.searchParams.get("state") || "", (await cookies()).get(PENDING_COOKIE)?.value || "");
  } catch { status = "failed"; }
  const response = NextResponse.redirect(`${url.origin}/admin/settings?chatgpt=${status}`, 303);
  response.cookies.delete(PENDING_COOKIE);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
