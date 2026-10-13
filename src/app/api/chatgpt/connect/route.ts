import { NextResponse } from "next/server";
import { canUseChatGPT, beginChatGPT } from "@/lib/chatgpt-server";
import { PENDING_COOKIE } from "@/lib/chatgpt-oauth";

export const runtime = "nodejs";
export async function POST(req: Request) {
  const origin = new URL(req.url).origin;
  if (req.headers.get("origin") !== origin || !(await canUseChatGPT())) return new Response("Local admin access required", { status: 403 });
  try {
    const fd = await req.formData();
    const result = await beginChatGPT(origin, fd.get("mode") === "add");
    const response = NextResponse.redirect(result.url, 303);
    response.cookies.set(PENDING_COOKIE, result.binding, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch {
    return NextResponse.redirect(`${origin}/admin/settings?chatgpt=failed`, 303);
  }
}
