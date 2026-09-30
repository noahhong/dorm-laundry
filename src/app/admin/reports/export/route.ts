import { isAdmin } from "@/lib/admin-auth";
import { exportReports } from "@/lib/admin-queries";
import { csvRow } from "@/lib/csv";
import { parseFilters } from "../filters";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await isAdmin())) return new Response("Unauthorized", { status: 401 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const { page: _page, ...filters } = parseFilters(sp);
  void _page;
  const rows = await exportReports(filters);
  const lines = [
    csvRow(["time_utc", "building", "room", "machine", "machine_code", "kind", "outcome", "setting", "symptoms", "error_code", "minutes", "load_size", "fabrics", "damaged_items", "damage_kinds", "photo", "note", "hidden", "undone", "device"]),
    ...rows.map(({ report: r, machineLabel, machineCode, kind, roomName, buildingName, hasPhoto }) =>
      csvRow([
        new Date(r.createdAt).toISOString(),
        buildingName,
        roomName,
        machineLabel,
        machineCode,
        kind,
        r.outcome,
        r.setting,
        r.symptoms.join(" "),
        r.errorCode,
        r.minutes,
        r.loadSize,
        r.fabrics?.join(" "),
        r.damagedItems?.join(" "),
        r.damageKinds?.join(" "),
        hasPhoto ? "yes" : "",
        r.note,
        r.hiddenAt ? "yes" : "",
        r.undoneAt ? "yes" : "",
        r.deviceHash.slice(0, 8),
      ]),
    ),
  ];
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="reports-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
