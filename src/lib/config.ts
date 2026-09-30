// Admin-editable settings. One descriptor list drives the defaults, validation and the settings form,
// so adding a knob is a one-line change. Pure (no DB): see config-server.ts for loading and saving.

import { DRYER_SETTINGS, FABRICS, SETTING_LABEL, WASHER_SETTINGS, type DryerSetting, type WasherSetting } from "./labels";
import type { FabricRules } from "./load-advice";
import { DEFAULT_PARAMS, type Params } from "./status";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export type FieldKind = "int" | "float" | "bool" | "text" | "longtext" | "choice";

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
type ChoiceField<K extends string> = Base<K, string> & { kind: "choice"; options: readonly string[] };

export const GROUPS = [
  { id: "site", title: "Site", blurb: "What students see around the pages." },
  { id: "status", title: "Machine status", blurb: "How reports turn into Works / Caution / Broken." },
  { id: "settings", title: "Dryer settings", blurb: "How reports turn into a recommended dryer setting." },
  { id: "load", title: "Load advice", blurb: "Limits per fabric for “What's in your load?”. A dryer's own learned setting is used unless the load needs something cooler." },
  { id: "assistant", title: "Laundry helper chat", blurb: "An AI chat on room and machine pages that turns “what I'm washing” into a machine and setting, using the rules above. Only shows when the server has an ANTHROPIC_API_KEY." },
  { id: "outliers", title: "Weak-dryer detection", blurb: "Flags a dryer that dries much worse than its room-mates." },
  { id: "timer", title: "“I started it” timer", blurb: "Residents tap “I started it” so others can see when a machine should be free." },
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

  { key: "loadAdviceEnabled", group: "load", kind: "bool", default: true, label: "Show “What's in your load?”", help: "Residents pick fabrics and load size on a machine page and get a setting for that machine. It never adds steps to reporting." },
  { key: "everydayMaxDryer", group: "load", kind: "choice", options: DRYER_SETTINGS, default: "high", label: "Everyday cotton: hottest dryer setting", help: "Cotton tolerates High but shrinks a little." },
  { key: "everydayWash", group: "load", kind: "choice", options: WASHER_SETTINGS, default: "warm", label: "Everyday cotton: hottest wash water", help: "" },
  { key: "towelsMaxDryer", group: "load", kind: "choice", options: DRYER_SETTINGS, default: "high", label: "Towels & bedding: hottest dryer setting", help: "Hot water and High heat are fine." },
  { key: "towelsWash", group: "load", kind: "choice", options: WASHER_SETTINGS, default: "hot", label: "Towels & bedding: hottest wash water", help: "" },
  { key: "jeansMaxDryer", group: "load", kind: "choice", options: DRYER_SETTINGS, default: "medium", label: "Jeans: hottest dryer setting", help: "Cold keeps the dye in; Medium limits shrinking." },
  { key: "jeansWash", group: "load", kind: "choice", options: WASHER_SETTINGS, default: "cold", label: "Jeans: hottest wash water", help: "" },
  { key: "athleticMaxDryer", group: "load", kind: "choice", options: DRYER_SETTINGS, default: "low", label: "Athletic / stretch: hottest dryer setting", help: "Spandex and nylon lose stretch or turn shiny above about 150°F; bonded seams soften even lower." },
  { key: "athleticWash", group: "load", kind: "choice", options: WASHER_SETTINGS, default: "cold", label: "Athletic / stretch: hottest wash water", help: "" },
  { key: "delicatesMaxDryer", group: "load", kind: "choice", options: DRYER_SETTINGS, default: "delicates", label: "Delicates: hottest dryer setting", help: "" },
  { key: "delicatesWash", group: "load", kind: "choice", options: WASHER_SETTINGS, default: "cold", label: "Delicates: hottest wash water", help: "" },
  { key: "woolMaxDryer", group: "load", kind: "choice", options: DRYER_SETTINGS, default: "no_heat", label: "Wool & sweaters: hottest dryer setting", help: "Heat plus tumbling felts and shrinks wool." },
  { key: "woolWash", group: "load", kind: "choice", options: WASHER_SETTINGS, default: "cold", label: "Wool & sweaters: hottest wash water", help: "" },
  { key: "printsMaxDryer", group: "load", kind: "choice", options: DRYER_SETTINGS, default: "low", label: "Graphic tees: hottest dryer setting", help: "Screen prints crack or peel on high heat." },
  { key: "printsWash", group: "load", kind: "choice", options: WASHER_SETTINGS, default: "cold", label: "Graphic tees: hottest wash water", help: "" },

  { key: "assistantEnabled", group: "assistant", kind: "bool", default: true, label: "Show the laundry helper chat", help: "Residents describe their clothes and get a machine and setting. Settings always come from the load rules and the room's reports, never from the AI alone." },
  { key: "assistantPerIpPerHour", group: "assistant", kind: "int", min: 1, max: 200, step: 1, default: 20, label: "Questions per network per hour", help: "A whole dorm can share one address, so keep this generous.", unit: "questions" },
  { key: "assistantPerDay", group: "assistant", kind: "int", min: 10, max: 20000, step: 10, default: 1000, label: "Questions per day, whole site", help: "Caps what the chat can cost. Each question is one to four AI calls. Counts reset when the server restarts.", unit: "questions" },

  { key: "outlierEnabled", group: "outliers", kind: "bool", default: true, label: "Detect weak dryers", help: "Show a “Dries worse than the other dryers here” banner with a link to WASH's service request." },
  { key: "outlierMinReports", group: "outliers", kind: "int", min: 2, max: 20, step: 1, default: 3, label: "Reports needed on the dryer", help: "Different devices, Medium/High loads only.", unit: "reports" },
  { key: "outlierRate", group: "outliers", kind: "float", min: 0.2, max: 0.95, step: 0.05, default: 0.45, label: "Damp share to flag", help: "Share of the dryer's Medium/High loads that came out damp or wet (wet counts fully, damp half).", unit: "0–1" },
  { key: "outlierSiblingRate", group: "outliers", kind: "float", min: 0.05, max: 0.6, step: 0.05, default: 0.25, label: "Max damp share of the others", help: "If the rest of the room is also damp this often, it's the room, not the machine, so nothing is flagged.", unit: "0–1" },
  { key: "outlierGap", group: "outliers", kind: "float", min: 0.1, max: 0.8, step: 0.05, default: 0.3, label: "Minimum gap", help: "How much worse than its room-mates the dryer must be.", unit: "0–1" },

  { key: "runWasherMinutes", group: "timer", kind: "int", min: 5, max: 120, step: 1, default: 35, label: "Washer cycle length", help: "Pre-filled when someone starts a washer. They can change it before tapping.", unit: "min" },
  { key: "runDryerMinutes", group: "timer", kind: "int", min: 5, max: 120, step: 1, default: 45, label: "Dryer cycle length", help: "Pre-filled for dryers in rooms that don't set their own minutes per payment.", unit: "min" },
  { key: "runGraceMinutes", group: "timer", kind: "int", min: 0, max: 120, step: 1, default: 15, label: "“Should be done” time", help: "After the estimate, the machine shows “should be done” for this long (clothes may still be inside), then shows as free.", unit: "min" },

  { key: "rateMachineMinutes", group: "abuse", kind: "int", min: 0, max: 120, step: 1, default: 3, label: "Cooldown per device per machine", help: "A phone can report the same machine once per this many minutes. 0 = no cooldown.", unit: "min" },
  { key: "rateDevicePerDay", group: "abuse", kind: "int", min: 1, max: 500, step: 1, default: 30, label: "Reports per device per day", help: "", unit: "reports" },
  { key: "rateIpPerDay", group: "abuse", kind: "int", min: 10, max: 5000, step: 10, default: 300, label: "Reports per network per day", help: "A whole dorm can share one address, so keep this generous; it is a backstop against scripts.", unit: "reports" },
  { key: "minElapsedMs", group: "abuse", kind: "int", min: 0, max: 5000, step: 100, default: 800, label: "Minimum time to fill a report", help: "Reports submitted faster than this after opening the sheet are silently dropped (bots).", unit: "ms" },
  { key: "undoWindowMinutes", group: "abuse", kind: "int", min: 1, max: 60, step: 1, default: 5, label: "Undo window", help: "How long a reporter can take back their own report.", unit: "min" },
] as const satisfies readonly (NumField<string> | BoolField<string> | TextField<string> | ChoiceField<string>)[];

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
    case "choice":
      return typeof raw === "string" && (f.options as readonly string[]).includes(raw) ? raw : undefined;
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
      errors[f.key] =
        f.kind === "int" || f.kind === "float"
          ? `Enter a ${f.kind === "int" ? "whole " : ""}number from ${f.min} to ${f.max}.`
          : f.kind === "choice"
            ? "Pick one of the options."
            : `Keep it under ${(f as TextField<string>).max} characters.`;
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
    run: { washerMinutes: c.runWasherMinutes, dryerMinutes: c.runDryerMinutes, graceMs: c.runGraceMinutes * 60_000 },
  };
}

/** Config → the per-fabric limits used by load-based suggestions (src/lib/load-advice.ts). */
export function toFabricRules(c: Config): FabricRules {
  const cfg = c as unknown as Record<string, string>;
  return Object.fromEntries(
    FABRICS.map((f) => [f, { maxDryer: cfg[`${f}MaxDryer`] as DryerSetting, wash: cfg[`${f}Wash`] as WasherSetting }]),
  ) as FabricRules;
}

/** Display label for a choice field's option. */
export const optionLabel = (v: string) => SETTING_LABEL[v] ?? v;

/** Fields whose value differs from the defaults, for the "changed" badges in the admin. */
export function changedFromDefault(c: Config): FieldKey[] {
  return FIELDS.filter((f) => c[f.key] !== f.default).map((f) => f.key);
}

// Sanity: the defaults must reproduce the algorithm's built-in parameters exactly.
export const _defaultParamsMatch = JSON.stringify(toParams(DEFAULT_CONFIG)) === JSON.stringify(DEFAULT_PARAMS);
