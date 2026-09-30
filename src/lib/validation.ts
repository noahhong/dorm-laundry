import { z } from "zod";
import { PHOTO_MAX_DATA_URL } from "./photo";
import { DAMAGE_KINDS, DRYER_OUTCOMES, FABRICS, DRYER_SETTINGS, DRYER_SYMPTOMS, LOAD_SIZES, WASHER_OUTCOMES, WASHER_SETTINGS, WASHER_SYMPTOMS } from "./labels";

export const reportSchema = z.object({
  code: z.string().min(4).max(16),
  outcome: z.string(),
  setting: z.string().nullable().optional(),
  symptoms: z.array(z.string()).max(6).default([]),
  errorCode: z
    .string()
    .trim()
    .max(8)
    .transform((s) => s.toUpperCase().replace(/[^A-Z0-9-]/g, "") || null)
    .nullable()
    .optional(),
  minutes: z.coerce.number().int().min(1).max(240).nullable().optional(),
  loadSize: z.enum(LOAD_SIZES).nullable().optional(),
  fabrics: z
    .array(z.enum(FABRICS))
    .max(FABRICS.length)
    .transform((a) => (a.length ? [...new Set(a)] : null))
    .nullable()
    .optional(),
  /** On a "damaged" report: which kinds of clothing, and how they were damaged. */
  damagedItems: z.array(z.enum(FABRICS)).max(FABRICS.length).nullable().optional(),
  damageKinds: z.array(z.enum(DAMAGE_KINDS)).max(DAMAGE_KINDS.length).nullable().optional(),
  /** Optional load photo as a JPEG data URL; checked byte-for-byte by decodePhoto. */
  photo: z.string().max(PHOTO_MAX_DATA_URL).nullable().optional(),
  note: z
    .string()
    .trim()
    .max(280)
    .transform((s) => s || null)
    .nullable()
    .optional(),
  /** Honeypot: humans never see this field. */
  website: z.string().max(500).optional(),
  /** ms the sheet was open; bots submit instantly. */
  elapsedMs: z.number().int().min(0).max(86_400_000),
  /** Cloudflare Turnstile token; required only when TURNSTILE_SECRET_KEY is set. */
  turnstileToken: z.string().max(4096).optional(),
});
export type ReportPayload = z.input<typeof reportSchema>;

/** Kind-specific enum checks the generic schema can't express. Returns an error message or null. */
export function checkForKind(
  kind: "washer" | "dryer",
  p: z.output<typeof reportSchema>,
  /** The dryer settings this room actually has (admin-configured). */
  offeredDryerSettings: readonly string[] = DRYER_SETTINGS,
): string | null {
  const outcomes: readonly string[] = kind === "dryer" ? DRYER_OUTCOMES : WASHER_OUTCOMES;
  const settings: readonly string[] = kind === "dryer" ? offeredDryerSettings : WASHER_SETTINGS;
  const symptoms: readonly string[] = kind === "dryer" ? DRYER_SYMPTOMS : WASHER_SYMPTOMS;
  if (!outcomes.includes(p.outcome)) return "Pick how it went.";
  if (p.setting && !settings.includes(p.setting)) return "Unknown setting.";
  if (p.symptoms.some((s) => !symptoms.includes(s))) return "Unknown problem type.";
  if (kind === "dryer" && p.outcome !== "not_working" && !p.setting) return "Which setting did you use?";
  return null;
}

/** "I started it": which machine, and how many minutes the resident says it will run. */
export const runSchema = z.object({
  code: z.string().min(4).max(16),
  minutes: z.number().int().min(5).max(120),
});
export type RunPayload = z.input<typeof runSchema>;
