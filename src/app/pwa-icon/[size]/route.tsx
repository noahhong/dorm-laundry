import { brandIconResponse } from "@/lib/brand-icon";

const SIZES = ["192", "512", "512-maskable"] as const;

export const dynamic = "force-static";
export function generateStaticParams() {
  return SIZES.map((size) => ({ size }));
}

export async function GET(_req: Request, ctx: RouteContext<"/pwa-icon/[size]">) {
  const { size } = await ctx.params;
  if (!(SIZES as readonly string[]).includes(size)) return new Response("Not found", { status: 404 });
  return brandIconResponse(parseInt(size, 10), { maskable: size.endsWith("maskable") });
}
