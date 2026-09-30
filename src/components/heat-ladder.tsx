import { SETTING_LABEL } from "@/lib/labels";
import type { LadderRow, Recommendation } from "@/lib/status";
import { StarIcon } from "./icons";

const VERDICT: Record<LadderRow["verdict"], { text: string; cls: string }> = {
  good: { text: "Dries well", cls: "text-works-fg" },
  under: { text: "Too damp", cls: "text-text-2" },
  over: { text: "Too hot", cls: "text-broken-fg" },
  mixed: { text: "Mixed", cls: "text-caution-fg" },
  none: { text: "No data", cls: "text-text-3" },
};

/** Per-setting evidence, hottest first, so students can see *why* a setting is recommended. */
export function HeatLadder({ rec }: { rec: Recommendation }) {
  const rows = [...rec.ladder].reverse();
  const maxTotal = Math.max(1, ...rows.map((r) => r.good + r.under + r.over));
  const avoid = new Set(rec.avoid.map((a) => a.setting));
  return (
    <table className="w-full border-separate border-spacing-y-1.5 text-label">
      <caption className="sr-only">Reports per dryer setting</caption>
      <thead className="sr-only">
        <tr>
          <th>Setting</th>
          <th>Evidence</th>
          <th>Verdict</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const total = r.good + r.under + r.over;
          const pct = (x: number) => `${(x / maxTotal) * 100}%`;
          const best = rec.basis === "reports" && r.setting === rec.setting;
          const v = VERDICT[r.verdict];
          return (
            <tr key={r.setting} className={best ? "font-semibold" : ""}>
              <th scope="row" className="w-[92px] py-0.5 pr-2 text-left font-medium text-text">
                <span className="inline-flex items-center gap-1">
                  {SETTING_LABEL[r.setting]}
                  {best && <StarIcon className="text-accent" aria-label="recommended" />}
                </span>
              </th>
              <td className="py-0.5">
                <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden>
                  {total > 0 && (
                    <>
                      <span className="h-full bg-works-icon" style={{ width: pct(r.good) }} />
                      <span className="h-full bg-unknown-icon" style={{ width: pct(r.under) }} />
                      <span className="h-full bg-broken-icon" style={{ width: pct(r.over) }} />
                    </>
                  )}
                </div>
              </td>
              <td className={`w-[104px] py-0.5 pl-3 text-right ${v.cls}`}>
                {avoid.has(r.setting) && r.verdict === "none" ? <span className="text-broken-fg">Likely hot</span> : v.text}
                {r.reports > 0 && <span className="ml-1 text-caption text-text-3">·{r.reports}</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function LadderLegend() {
  const items = [
    { cls: "bg-works-icon", label: "dry" },
    { cls: "bg-unknown-icon", label: "damp/wet" },
    { cls: "bg-broken-icon", label: "too hot" },
  ];
  return (
    <div className="flex gap-3 text-caption text-text-3" aria-hidden>
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1">
          <span className={`h-2 w-2 rounded-full ${i.cls}`} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

