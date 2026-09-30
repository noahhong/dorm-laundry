import { getMachine } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/machines/[code]">) {
  const { code } = await ctx.params;
  const data = await getMachine(code);
  if (!data || data.retired) return Response.json({ error: "not_found" }, { status: 404 });
  const { view, recent, room, building } = data;
  return Response.json(
    {
      building: { slug: building.slug, name: building.name },
      room: { id: room.id, slug: room.slug, name: room.name },
      machine: { code: view.code, label: view.label, kind: view.kind, washMachineNumber: view.washMachineNumber },
      status: view.status,
      inUse: view.inUse && { state: view.inUse.state, startedAt: view.inUse.startedAt, endsAt: view.inUse.endsAt },
      recommendation: view.recommendation,
      recentReports: recent,
    },
    { headers: { "Cache-Control": "public, max-age=15, stale-while-revalidate=60" } },
  );
}
