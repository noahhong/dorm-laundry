// Enums and human-facing copy shared by the algorithm, validation and UI. See PLAN.md §4–5.

export const MACHINE_KINDS = ["washer", "dryer"] as const;
export type MachineKind = (typeof MACHINE_KINDS)[number];

/** Heat ladder, coolest → hottest. Order matters for the recommendation algorithm. */
export const DRYER_SETTINGS = ["no_heat", "delicates", "low", "medium", "high"] as const;
export type DryerSetting = (typeof DRYER_SETTINGS)[number];

export const WASHER_SETTINGS = ["cold", "warm", "hot"] as const;
export type WasherSetting = (typeof WASHER_SETTINGS)[number];

export const DRYER_OUTCOMES = ["dry", "damp", "wet", "too_hot", "damaged", "not_working"] as const;
export const WASHER_OUTCOMES = ["good", "soaking", "dirty", "not_working"] as const;
export type DryerOutcome = (typeof DRYER_OUTCOMES)[number];
export type WasherOutcome = (typeof WASHER_OUTCOMES)[number];
export type Outcome = DryerOutcome | WasherOutcome;

export const WASHER_SYMPTOMS = [
  "took_money",
  "wont_start",
  "door_lock",
  "wont_drain",
  "no_spin",
  "leaking",
  "no_hot_water",
  "stopped_midcycle",
  "loud",
  "dispenser",
  "error_code",
  "other",
] as const;

export const DRYER_SYMPTOMS = [
  "took_money",
  "wont_start",
  "no_heat",
  "too_hot",
  "not_tumbling",
  "stopped_early",
  "burnt_smell",
  "lint_screen",
  "door",
  "loud",
  "error_code",
  "other",
] as const;

export type Symptom = (typeof WASHER_SYMPTOMS)[number] | (typeof DRYER_SYMPTOMS)[number];

/** Symptoms that make a machine unusable. Everything else is "caution". */
export const BROKEN_SYMPTOMS: ReadonlySet<string> = new Set([
  "took_money",
  "wont_start",
  "door_lock",
  "wont_drain",
  "no_spin",
  "leaking",
  "no_heat",
  "not_tumbling",
  "burnt_smell",
  "door",
]);

export const LOAD_SIZES = ["small", "medium", "full", "overstuffed"] as const;
export type LoadSize = (typeof LOAD_SIZES)[number];

/** What's in the load, for load-based suggestions (PLAN.md §6.7). Admins set each fabric's limits in Settings. */
export const FABRICS = ["everyday", "towels", "jeans", "athletic", "delicates", "wool", "prints"] as const;
export type Fabric = (typeof FABRICS)[number];

export const FABRIC_LABEL: Record<string, string> = {
  everyday: "Everyday cotton",
  towels: "Towels & bedding",
  jeans: "Jeans",
  athletic: "Athletic / stretch",
  delicates: "Delicates",
  wool: "Wool & sweaters",
  prints: "Graphic tees",
};

/** Lower-case form for use mid-sentence ("Use Low for athletic wear"). */
export const FABRIC_NOUN: Record<string, string> = {
  everyday: "everyday clothes",
  towels: "towels and bedding",
  jeans: "jeans",
  athletic: "athletic wear",
  delicates: "delicates",
  wool: "wool",
  prints: "graphic tees",
};

export const SETTING_LABEL: Record<string, string> = {
  no_heat: "No heat",
  delicates: "Delicates",
  low: "Low",
  medium: "Medium",
  high: "High",
  cold: "Cold",
  warm: "Warm",
  hot: "Hot",
};

export const OUTCOME_LABEL: Record<string, string> = {
  dry: "Dry",
  damp: "Still damp",
  wet: "Soaking wet",
  too_hot: "Too hot",
  damaged: "Damaged clothes",
  not_working: "Didn't work",
  good: "Worked fine",
  soaking: "Didn't spin",
  dirty: "Still dirty",
};

export const SYMPTOM_LABEL: Record<string, string> = {
  took_money: "Took money, didn't start",
  wont_start: "Won't start",
  door_lock: "Door lock error",
  wont_drain: "Won't drain",
  no_spin: "Didn't spin",
  leaking: "Leaking",
  no_hot_water: "No hot water",
  stopped_midcycle: "Stopped mid-cycle",
  loud: "Loud / shaking",
  dispenser: "Soap dispenser",
  error_code: "Error code",
  other: "Something else",
  no_heat: "No heat",
  too_hot: "Runs too hot",
  not_tumbling: "Drum doesn't turn",
  stopped_early: "Stops early",
  burnt_smell: "Burning smell",
  lint_screen: "Lint screen full/torn",
  door: "Door won't latch",
};

export const LOAD_SIZE_LABEL: Record<string, string> = {
  small: "Small",
  medium: "Medium",
  full: "Full",
  overstuffed: "Overstuffed",
};

export function outcomesFor(kind: MachineKind): readonly Outcome[] {
  return kind === "dryer" ? DRYER_OUTCOMES : WASHER_OUTCOMES;
}
export function settingsFor(kind: MachineKind): readonly string[] {
  return kind === "dryer" ? DRYER_SETTINGS : WASHER_SETTINGS;
}
export function symptomsFor(kind: MachineKind): readonly string[] {
  return kind === "dryer" ? DRYER_SYMPTOMS : WASHER_SYMPTOMS;
}

/** Where to send people whose machine ate their money. Confirmed WASH channels (PLAN.md §2.1). */
export const WASH_LINKS = {
  serviceRequest: "https://www.wash.com/service-request",
  refundRequest: "https://www.wash.com/refund-request",
  refundPhone: "+18003425932",
  refundPhoneLabel: "(800) 342-5932",
};
