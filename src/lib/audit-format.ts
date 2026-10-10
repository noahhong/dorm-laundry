/** Human wording for audit-log action codes. Unknown codes fall back to the raw code. */
const LABELS: Record<string, string> = {
  "admin.login": "Admin logged in",
  "admin.logout": "Admin logged out",
  "building.create": "Added a building",
  "building.update": "Edited a building",
  "building.delete": "Deleted a building",
  "room.create": "Added a room",
  "room.update": "Edited a room",
  "room.delete": "Deleted a room",
  "machine.add": "Added machines",
  "machine.update": "Edited a machine",
  "machine.out_of_order": "Marked a machine out of order",
  "machine.clear_out_of_order": "Cleared out-of-order",
  "machine.mark_fixed": "Marked a machine fixed",
  "machine.retire": "Retired a machine",
  "machine.restore": "Restored a machine",
  "report.hide": "Hid a report",
  "report.unhide": "Unhid a report",
  "report.bulk_hide": "Hid several reports",
  "report.bulk_unhide": "Unhid several reports",
  "report.keep": "Kept a flagged report",
  "report.auto_hide": "Residents' flags hid a report",
  "settings.update": "Changed settings",
  "settings.reset": "Reset settings to defaults",
  "assistant.key.save": "Saved the laundry helper API key",
  "assistant.key.remove": "Removed the laundry helper API key",
};

export const describeAudit = (action: string) => LABELS[action] ?? action;

/** One-line summary of an audit entry's detail payload. */
export function summarizeDetail(action: string, detail: Record<string, unknown> | null): string {
  if (!detail) return "";
  if (action === "settings.update") {
    return Object.entries(detail)
      .map(([k, v]) => {
        const d = v as { from: unknown; to: unknown };
        return `${k}: ${JSON.stringify(d.from)} → ${JSON.stringify(d.to)}`;
      })
      .join(" · ");
  }
  return Object.entries(detail)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : typeof v === "object" && v ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}
