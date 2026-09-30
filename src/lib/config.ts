// Admin-editable settings. One descriptor list drives the defaults, validation and the settings form,
// so adding a knob is a one-line change. Pure (no DB): see config-server.ts for loading and saving.

import { DEFAULT_PARAMS, type Params } from "./status";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export type FieldKind = "int" | "float" | "bool" | "text" | "longtext";

interface Base<K extends string, V> {
  key: K;
  group: GroupId;
  label: string;
  help: string;
  kind: FieldKind;
  default: V;
}
type NumField<K extends string> = Base<K, number> & { kind: "int" | "float"; min: number; max: number; step: number; unit?: string };
type BoolField<K extends string> = Base<K, boolean> & { kind: "bool" };
type TextField<K extends string> = Base<K, string> & { kind: "text" | "longtext"; max: number };

export const GROUPS = [
  { id: "site", title: "Site", blurb: "What students see around the pages." },
  { id: "status", title: "Machine status", blurb: "How reports turn into Works / Caution / Broken." },
  { id: "settings", title: "Dryer settings", blurb: "How reports turn into a recommended dryer setting." },
  { id: "outliers", title: "Weak-dryer detection", blurb: "Flags a dryer that dries much worse than its room-mates." },
  { id: "abuse", title: "Reports & abuse limits", blurb: "Rate limits and spam speed bumps for anonymous reports." },
] as const;
export type GroupId = (typeof GROUPS)[number]["id"];

export const FIELDS = [
  { key: "siteName", group: "site", kind: "text", max: 40, default: "Dorm Laundry", label: "Site name", help: "Shown in the header, the browser tab and when installed to the home screen." },
  { key: "tagline", group: "site", kind: "text", max: 120, default: "Which machines work, and the dryer setting that won't wreck your clothes.", label: "Tagline", help: "One line under the room list title." },
  { key: "announcement", group: "site", kind: "longtext", max: 240, default: "", label: "Announcement banner", help: "Shown at the top of every public page, e.g. “Room closed for vent cleaning until Friday”. Leave empty for none." },
  { key: "notesPublic", group: "site", kind: "bool", default: true, label: "Show report notes publicly", help: "When off, residents' free-text notes are visible to admins only (they are still collected)." },
  { key: "roomFallbackEnabled", group: "site", kind: "bool", default: true, label: "Suggest a setting for untested dryers", help: "A dryer with no reports borrows the middle setting of the other dryers in its room." },

  { key: "brokenMinReporters", group: "status", kind: "int", min: 1, max: 5, step: 1, default: 1, label: "Reports needed to mark Broken", help: "1 = a single fresh “didn't work” report flips a machine to Broken (fast warnings, but easier to abuse). 2+ = it shows “Caution: reported broken, not yet confirmed” until that many different devices agree. Admins can always mark out of order directly.", unit: "devices" },
  { key: "statusHalfLifeHours", group: "status", kind: "int", min: 6, max: 720, step: 6, default: 72, label: "Status memory", help: "Every this many hours a report counts half as much. Shorter = status reacts faster but forgets sooner.", unit: "hours" },
  { key: "windowDays", group: "status", kind: "int", min: 14, max: 365, step: 1, default: 60, label: "Report window", help: "Reports older than this are ignored completely.", unit: "days" },
  { key: "newestBoost", group: "status", kind: "float", min: 1, max: 3, step: 0.1, default: 1.5, label: "Newest-report boost", help: "Extra weight on the single most recent report, so a later “works now” beats an earlier “broken”. 1 = off.", unit: "×" },

  { key: "settingHalfLifeDays", group: "settings", kind: "int", min: 3, max: 120, step: 1, default: 21, label: "Setting memory", help: "Dryers change slowly (vents clog, thermostats drift), so this is longer than status memory.", unit: "days" },

  { key: "outlierEnabled", group: "outliers", kind: "bool", default: true, label: "Detect weak dryers", help: "Show a “Dries worse than the other dryers here” banner with a link to WASH's service request." },
  { key: "outlierMinReports", group: "outliers", kind: "int", min: 2, max: 20, step: 1, default: 3, label: "Reports needed on the dryer", help: "Different devices, Medium/High loads only.", unit: "reports" },
  { key: "outlierRate", group: "outliers", kind: "float", min: 0.2, max: 0.95, step: 0.05, default: 0.45, label: "Damp share to flag", help: "Share of the dryer's Medium/High loads that came out damp or wet (wet counts fully, damp half).", unit: "0–1" },
  { key: "outlierSiblingRate", group: "outliers", kind: "float", min: 0.05, max: 0.6, step: 0.05, default: 0.25, label: "Max damp share of the others", help: "If the rest of the room is also damp this often, it's the room, not the machine, so nothing is flagged.", unit: "0–1" },
  { key: "outlierGap", group: "outliers", kind: "float", min: 0.1, max: 0.8, step: 0.05, default: 0.3, label: "Minimum gap", help: "How much worse than its room-mates the dryer must be.", unit: "0–1" },

  { key: "rateMachineMinutes", group: "abuse", kind: "int", min: 0, max: 120, step: 1, default: 3, label: "Cooldown per device per machine", help: "A phone can report the same machine once per this many minutes. 0 = no cooldown.", unit: "min" },
  { key: "rateDevicePerDay", group: "abuse", kind: "int", min: 1, max: 500, step: 1, default: 30, label: "Reports per device per day", help: "", unit: "reports" },
  { key: "rateIpPerDay", group: "abuse", kind: "int", min: 10, max: 5000, step: 10, default: 300, label: "Reports per network per day", help: "A whole dorm can share one address, so keep this generous; it is a backstop against scripts.", unit: "reports" },
  { key: "minElapsedMs", group: "abuse", kind: "int", min: 0, max: 5000, step: 100, default: 800, label: "Minimum time to fill a report", help: "Reports submitted faster than this after opening the sheet are silently dropped (bots).", unit: "ms" },
  { key: "undoWindowMinutes", group: "abuse", kind: "int", min: 1, max: 60, step: 1, default: 5, label: "Undo window", help: "How long a reporter can take back their own report.", unit: "min" },
] as const satisfies readonly (NumField<string> | BoolField<string> | TextField<string>)[];

export type FieldKey = (typeof FIELDS)[number]["key"];
export type Field = (typeof FIELDS)[number];
export type Config = { [F in Field as F["key"]]: F["default"] extends boolean ? boolean : F["default"] extends string ? string : number };

export const DEFAULT_CONFIG = Object.fromEntries(FIELDS.map((f) => [f.key, f.default])) as Config;

/** Validate one raw value against its field; returns the cleaned value or undefined if invalid. */
export function cleanValue(f: Field, raw: unknown): boolean | number | string | undefined {
  switch (f.kind) {
    case "bool":
      if (typeof raw === "boolean") return raw;
      if (raw === "on" || raw === "true" || raw === "1") return true;
      if (raw === "off" || raw === "false" || raw === "0" || raw === "" || raw === null || raw === undefined) return false;
      return undefined;
    case "int":
    case "float": {
      if (raw === "" || raw === null || raw === undefined || typeof raw === "boolean") return undefined;
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n) || n < f.min || n > f.max) return undefined;
      return f.kind === "int" ? (Number.isInteger(n) ? n : undefined) : Math.round(n * 1000) / 1000;
    }
    default:
      if (typeof raw !== "string") return undefined;
      return raw.trim().length <= f.max ? raw.trim() : undefined;
  }
}

/** Stored rows → a full Config. Missing or invalid values fall back to the defaults, so a bad row can't break the site. */
export function resolveConfig(rows: { key: string; value: unknown }[]): Config {
  const out: Record<string, unknown> = { ...DEFAULT_CONFIG };
  for (const row of rows) {
    const f = FIELDS.find((x) => x.key === row.key);
    if (!f) continue;
    const v = cleanValue(f, row.value);
    if (v !== undefined) out[f.key] = v;
  }
  return out as Config;
}

export type FormErrors = Partial<Record<FieldKey, string>>;

/** Parse the settings form. Returns every field's new value, or per-field errors. */
export function parseSettingsForm(fd: { get(name: string): FormDataEntryValue | null }): { values: Config; errors: FormErrors } {
  const values: Record<string, unknown> = {};
  const errors: FormErrors = {};
  for (const f of FIELDS) {
    const raw = fd.get(f.key);
    const v = cleanValue(f, f.kind === "bool" ? (raw === null ? false : raw) : raw);
    if (v === undefined) {
      errors[f.key] = f.kind === "int" || f.kind === "float" ? `Enter a ${f.kind === "int" ? "whole " : ""}number from ${f.min} to ${f.max}.` : `Keep it under ${(f as TextField<string>).max} characters.`;
      values[f.key] = f.default;
    } else values[f.key] = v;
  }
  // Cross-field sanity: a flag threshold below the room's threshold would flag everything.
  const c = values as Config;
  if (c.outlierSiblingRate >= c.outlierRate && !errors.outlierSiblingRate) errors.outlierSiblingRate = "Must be lower than “Damp share to flag”.";
  return { values: c, errors };
}

/** Config → the algorithm's parameter object. */
export function toParams(c: Config): Params {
  return {
    windowMs: c.windowDays * DAY,
    statusHalfLifeMs: c.statusHalfLifeHours * HOUR,
    settingHalfLifeMs: c.settingHalfLifeDays * DAY,
    newestBoost: c.newestBoost,
    brokenMinReporters: c.brokenMinReporters,
    outlier: { enabled: c.outlierEnabled, minReports: c.outlierMinReports, rate: c.outlierRate, siblingRate: c.outlierSiblingRate, gap: c.outlierGap },
  };
}

/** Fields whose value differs from the defaults, for the "changed" badges in the admin. */
export function changedFromDefault(c: Config): FieldKey[] {
  return FIELDS.filter((f) => c[f.key] !== f.default).map((f) => f.key);
}

// Sanity: the defaults must reproduce the algorithm's built-in parameters exactly.
export const _defaultParamsMatch = JSON.stringify(toParams(DEFAULT_CONFIG)) === JSON.stringify(DEFAULT_PARAMS);
