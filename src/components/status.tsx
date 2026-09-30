import type { Confidence, MachineStatus, Recommendation, StatusLevel } from "@/lib/status";
import { SETTING_LABEL } from "@/lib/labels";
import { StatusIcon, ThermometerIcon } from "./icons";

export const STATUS_LABEL: Record<StatusLevel, string> = {
  works: "Works",
  caution: "Caution",
  broken: "Broken",
  unknown: "No reports",
};

export const TONE: Record<StatusLevel, { fg: string; tint: string; icon: string; ring: string }> = {
  works: { fg: "text-works-fg", tint: "bg-works-tint", icon: "text-works-icon", ring: "border-works-icon/40" },
  caution: { fg: "text-caution-fg", tint: "bg-caution-tint", icon: "text-caution-icon", ring: "border-caution-icon/40" },
  broken: { fg: "text-broken-fg", tint: "bg-broken-tint", icon: "text-broken-icon", ring: "border-broken-icon/40" },
  unknown: { fg: "text-unknown-fg", tint: "bg-unknown-tint", icon: "text-unknown-icon", ring: "border-unknown-icon/40 border-dashed" },
};

export function StatusBadge({ level, reason, size = "sm" }: { level: StatusLevel; reason?: string | null; size?: "sm" | "lg" }) {
  const t = TONE[level];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold ${t.tint} ${t.fg} ${t.ring} ${
        size === "lg" ? "h-10 px-3.5 text-body" : "h-7 px-2.5 text-label"
      }`}
    >
      <StatusIcon level={level} size={size === "lg" ? 20 : 16} className={t.icon} />
      <span>
        {STATUS_LABEL[level]}
        {reason ? <span className="font-medium">: {reason}</span> : null}
      </span>
    </span>
  );
}

export function StatusTile({ level, size = 44 }: { level: StatusLevel; size?: number }) {
  const t = TONE[level];
  return (
    <span
      className={`inline-grid shrink-0 place-items-center rounded-[12px] border ${t.tint} ${t.icon} ${t.ring}`}
      style={{ width: size, height: size }}
    >
      <StatusIcon level={level} size={Math.round(size * 0.55)} />
    </span>
  );
}

const CONF_DOTS: Record<Confidence, number> = { none: 0, low: 1, medium: 2, high: 3 };
export const CONF_LABEL: Record<Confidence, string> = {
  none: "no reports yet",
  low: "low confidence",
  medium: "medium confidence",
  high: "high confidence",
};

export function ConfidenceDots({ confidence }: { confidence: Confidence }) {
  const n = CONF_DOTS[confidence];
  return (
    <span className="inline-flex items-center gap-[3px]" role="img" aria-label={CONF_LABEL[confidence]}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${i < n ? "bg-current" : "bg-current opacity-25"}`} />
      ))}
    </span>
  );
}

export function SettingChip({ rec, compact = false }: { rec: Recommendation; compact?: boolean }) {
  const label = SETTING_LABEL[rec.setting];
  if (rec.basis !== "reports") {
    return (
      <span className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border border-dashed border-border-strong/60 px-2.5 text-label text-text-2">
        <ThermometerIcon className="text-text-3" />
        Try {label}
      </span>
    );
  }
  return (
    <span className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-surface-2 px-2.5 text-label font-semibold text-text">
      <ThermometerIcon className="text-accent" />
      {label}
      {!compact && <ConfidenceDots confidence={rec.confidence} />}
      {compact && <span className="sr-only">({CONF_LABEL[rec.confidence]})</span>}
    </span>
  );
}

export function statusSentence(label: string, s: MachineStatus, rec: Recommendation | null, ago: string | null) {
  const parts = [`${label}, ${STATUS_LABEL[s.level]}${s.reason ? `: ${s.reason}` : ""}`];
  if (ago) parts.push(`last report ${ago}`);
  if (rec) {
    if (rec.basis === "reports") parts.push(`recommended ${SETTING_LABEL[rec.setting]}`);
    else if (rec.basis === "room") parts.push(`no reports for this dryer yet, try ${SETTING_LABEL[rec.setting]}`);
    else parts.push(`no setting data yet, try ${SETTING_LABEL[rec.setting]}`);
  }
  return parts.join(". ") + ".";
}
