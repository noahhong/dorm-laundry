import Link from "next/link";
import type { MachineView } from "@/lib/queries";
import { timeAgo, timeAgoLong } from "@/lib/format";
import { OUTCOME_LABEL } from "@/lib/labels";
import { DryerIcon, WasherIcon } from "./icons";
import { SettingChip, StatusTile, TONE, statusSentence, STATUS_LABEL } from "./status";

export function MachineCard({ m, now, index = 0 }: { m: MachineView; now: number; index?: number }) {
  const s = m.status;
  const ago = s.lastReportAt ? timeAgo(s.lastReportAt, now) : null;
  const tone = TONE[s.level];
  let line: string;
  if (s.level === "unknown") {
    line = s.staleHint ? `Last: ${OUTCOME_LABEL[s.staleHint.outcome] ?? s.staleHint.outcome} · ${timeAgo(s.staleHint.at, now)}` : "No reports yet";
  } else {
    line = `${s.reason ?? STATUS_LABEL[s.level]}${ago ? ` · ${ago}` : ""}`;
  }
  return (
    <li className="animate-fade-up list-none" style={{ ["--i" as string]: index }}>
      <Link
        href={`/m/${m.code}`}
        aria-label={statusSentence(m.label, s, m.recommendation, s.lastReportAt ? timeAgoLong(s.lastReportAt, now) : null)}
        className={`pressable flex min-h-[88px] items-center gap-3 rounded-[var(--radius-md)] border bg-surface p-3.5 shadow-e1 hover:border-border-strong/50 ${
          s.level === "unknown" ? "border-dashed border-border-strong/40" : "border-border"
        }`}
      >
        <StatusTile level={s.level} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-headline text-text">
            {m.kind === "dryer" ? <DryerIcon size={16} className="text-text-3" /> : <WasherIcon size={16} className="text-text-3" />}
            <span className="truncate">{m.label}</span>
          </div>
          <div className={`mt-0.5 truncate text-label ${s.level === "unknown" ? "text-text-3" : tone.fg}`}>{line}</div>
        </div>
        {m.recommendation && s.level !== "broken" ? (
          <SettingChip rec={m.recommendation} />
        ) : s.level === "broken" ? (
          <span className="text-label text-text-3" aria-hidden>
            Skip it
          </span>
        ) : null}
      </Link>
    </li>
  );
}

export function MachineCardSkeleton() {
  return (
    <li className="flex min-h-[88px] list-none items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface p-3.5">
      <span className="skeleton h-11 w-11 rounded-[12px]" />
      <span className="flex-1 space-y-2">
        <span className="skeleton block h-4 w-24" />
        <span className="skeleton block h-3 w-36" />
      </span>
      <span className="skeleton h-8 w-20 rounded-full" />
    </li>
  );
}
