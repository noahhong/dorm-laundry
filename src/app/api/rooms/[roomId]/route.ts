import { getRoomById } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/rooms/[roomId]">) {
  const { roomId } = await ctx.params;
  const data = await getRoomById(roomId);
  if (!data) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(
    {
      building: { slug: data.building.slug, name: data.building.name },
      room: { id: data.room.id, slug: data.room.slug, name: data.room.name },
      machines: data.machines.map((m) => ({
        code: m.code,
        label: m.label,
        kind: m.kind,
        status: m.status,
        recommendation: m.recommendation && { setting: m.recommendation.setting, basis: m.recommendation.basis, confidence: m.recommendation.confidence, tips: m.recommendation.tips, avoid: m.recommendation.avoid },
      })),
    },
    { headers: { "Cache-Control": "public, max-age=15, stale-while-revalidate=60" } },
  );
}
