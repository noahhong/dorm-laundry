import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink, Page } from "@/components/chrome";
import { HeatLadder, LadderLegend } from "@/components/heat-ladder";
import { AlertIcon, DryerIcon, ExternalIcon, StatusIcon, ThermometerIcon, WasherIcon } from "@/components/icons";
import { ReportSheet } from "@/components/report-sheet";
import { CONF_LABEL, ConfidenceDots, STATUS_LABEL, TONE } from "@/components/status";
import { isoTime, plural, timeAgo } from "@/lib/format";
import { OUTCOME_LABEL, SETTING_LABEL, SYMPTOM_LABEL, WASH_LINKS } from "@/lib/labels";
import { getMachine, type PublicReport } from "@/lib/queries";
import { turnstileSiteKey } from "@/lib/turnstile";
import type { StatusLevel } from "@/lib/status";
import { statusEvidence } from "@/lib/status";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/m/[code]">): Promise<Metadata> {
  const { code } = await props.params;
  const data = await getMachine(code);
  return { title: data ? `${data.machine.label} · ${data.room.name}` : "Machine not found", robots: { index: false } };
}

function reportLevel(kind: "washer" | "dryer", r: PublicReport): StatusLevel {
  const e = statusEvidence(kind, r);
  if (e.broken) return "broken";
  if (e.caution || r.outcome === "damp" || r.outcome === "wet") return "caution";
  return "works";
}

function ReportRow({ r, kind, now }: { r: PublicReport; kind: "washer" | "dryer"; now: number }) {
  const level = reportLevel(kind, r);
  const bits = [
    r.setting ? SETTING_LABEL[r.setting] : null,
    OUTCOME_LABEL[r.outcome] ?? r.outcome,
    r.minutes ? `${r.minutes} min` : null,
  ].filter(Boolean);
  return (
    <li className="flex gap-3 py-3">
      <StatusIcon level={level} size={18} className={`mt-0.5 shrink-0 ${TONE[level].icon}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-label font-semibold text-text">{bits.join(" · ")}</span>
          <time dateTime={isoTime(r.createdAt)} className="shrink-0 text-caption text-text-3">
            {timeAgo(r.createdAt, now)}
          </time>
        </div>
        {r.symptoms.length > 0 && <p className="text-label text-text-2">{r.symptoms.map((s) => SYMPTOM_LABEL[s] ?? s).join(", ")}</p>}
        {r.errorCode && <p className="text-label text-text-2">Error code {r.errorCode}</p>}
        {r.note && <p className="mt-0.5 break-words text-label text-text-2">&ldquo;{r.note}&rdquo;</p>}
      </div>
    </li>
  );
}

export default async function MachinePage(props: PageProps<"/m/[code]">) {
  const { code } = await props.params;
  const sp = await props.searchParams;
  const data = await getMachine(code);
  if (!data) notFound();
  const { machine, room, building, view, recent } = data;
  const now = data.now;
  const s = view.status;
  const t = TONE[s.level];
  const rec = view.recommendation;
  const roomHref = `/b/${building.slug}/${room.slug}`;

  return (
    <Page className="pb-32">
      <div className="mt-2">
        <BackLink href={roomHref}>
          {room.name} · {building.name}
        </BackLink>
        <div className="flex items-end justify-between gap-2">
          <h1 className="flex items-center gap-2 text-title text-text">
            {machine.kind === "dryer" ? <DryerIcon className="text-text-3" /> : <WasherIcon className="text-text-3" />}
            {machine.label}
          </h1>
          {machine.washMachineNumber && <span className="text-caption text-text-3">WASH #{machine.washMachineNumber}</span>}
        </div>
      </div>

      {data.retired && (
        <p className="mt-3 rounded-[12px] bg-surface-2 p-3 text-label text-text-2">This machine has been removed from the room.</p>
      )}

      {/* Status hero */}
      <section
        aria-label="Status"
        className={`animate-fade-up mt-4 rounded-[var(--radius-lg)] border p-5 ${t.tint} ${t.ring}`}
      >
        <div className="flex items-start gap-3">
          <StatusIcon level={s.level} size={40} className={`shrink-0 ${t.icon}`} />
          <div className="min-w-0">
            <p className={`text-display ${t.fg}`}>{STATUS_LABEL[s.level]}</p>
            {s.reason && <p className={`text-headline ${t.fg}`}>{s.reason}</p>}
            <p className={`mt-1 flex flex-wrap items-center gap-x-2 text-label ${t.fg} opacity-90`}>
              {s.source === "admin" ? (
                <span>Marked out of order by a room admin</span>
              ) : s.level === "unknown" ? (
                <span>
                  {s.staleHint
                    ? `Last report ${timeAgo(s.staleHint.at, now)}: ${OUTCOME_LABEL[s.staleHint.outcome] ?? s.staleHint.outcome}`
                    : "Nobody has reported this machine yet."}
                </span>
              ) : (
                <>
                  <span>
                    {plural(s.reporters, "report")}
                    {s.lastReportAt && <> · last {timeAgo(s.lastReportAt, now)}</>}
                  </span>
                  <span className="inline-flex items-center gap-1" title={CONF_LABEL[s.confidence]}>
                    <ConfidenceDots confidence={s.confidence} />
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
      </section>

      {/* Outlier: this dryer is much weaker than its room-mates */}
      {view.weak && (
        <section aria-labelledby="weak-dryer" className="animate-fade-up mt-4 rounded-[var(--radius-lg)] border border-caution-icon/40 bg-caution-tint p-5">
          <h2 id="weak-dryer" className="flex items-center gap-2 text-headline text-caution-fg">
            <AlertIcon size={18} className="shrink-0" /> Dries worse than the other dryers here
          </h2>
          <p className="mt-1 text-label text-caution-fg">
            {Math.round(view.weak.rate * 100)}% of Medium/High loads came out damp or wet here, versus {Math.round(view.weak.siblingRate * 100)}% on the
            other dryers ({plural(view.weak.reports, "recent report")}). More time or heat may not fix it: it is likely a clogged vent or a heating
            fault. Reporting it to WASH gets it repaired.
          </p>
          <a
            href={WASH_LINKS.serviceRequest}
            target="_blank"
            rel="noopener noreferrer"
            className="pressable mt-3 inline-flex h-11 items-center gap-1.5 rounded-full border border-caution-icon/40 bg-surface px-4 text-label font-semibold text-caution-fg"
          >
            Report to WASH{machine.washMachineNumber ? ` (machine #${machine.washMachineNumber})` : ""} <ExternalIcon />
          </a>
        </section>
      )}

      {/* Recommended setting */}
      {rec && (
        <section aria-labelledby="best-setting" className="animate-fade-up mt-4 rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-e1" style={{ ["--i" as string]: 1 }}>
          <h2 id="best-setting" className="text-caption uppercase tracking-wide text-text-3">
            {s.level === "broken" ? "Best setting once it's fixed" : "Best setting"}
          </h2>
          {s.level === "broken" && (
            <p className="mt-2 rounded-[10px] bg-broken-tint px-3 py-2 text-label font-medium text-broken-fg">
              Use another dryer until this one is fixed.
            </p>
          )}
          <div className="mt-1 flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-[14px] bg-accent-tint text-accent">
              <ThermometerIcon size={26} />
            </span>
            <div>
              <p className="text-title text-text">
                {rec.basis === "reports" ? SETTING_LABEL[rec.setting] : `Try ${SETTING_LABEL[rec.setting]}`}
              </p>
              <p className="flex items-center gap-2 text-label text-text-2">
                {rec.basis === "default" ? (
                  "No setting reports yet. Tell us how it goes."
                ) : rec.basis === "room" ? (
                  rec.roomRange && rec.roomRange.min !== rec.roomRange.max
                    ? `No reports for this dryer yet. The other ${rec.roomMachines} dryers here range ${SETTING_LABEL[rec.roomRange.min]}–${SETTING_LABEL[rec.roomRange.max]}; start in the middle.`
                    : `No reports for this dryer yet. The other ${rec.roomMachines} dryers here all use ${SETTING_LABEL[rec.setting]}.`
                ) : (
                  <>
                    Based on residents&apos; reports <ConfidenceDots confidence={rec.confidence} />
                  </>
                )}
              </p>
            </div>
          </div>
          {room.minutesPerCycle ? (
            <p className="mt-2 text-caption text-text-3">One payment runs about {room.minutesPerCycle} minutes on the dryers here.</p>
          ) : null}
          {(rec.tips.length > 0 || rec.avoid.length > 0) && (
            <ul className="mt-3 space-y-1.5">
              {rec.avoid.map((a) => (
                <li key={a.setting} className="flex items-center gap-2 rounded-[10px] bg-broken-tint px-3 py-2 text-label font-medium text-broken-fg">
                  <AlertIcon className="shrink-0" />
                  Avoid {SETTING_LABEL[a.setting]}: runs hot{a.reports ? ` (${plural(a.reports, "report")})` : " (even hotter than the one above)"}
                </li>
              ))}
              {rec.tips.map((tip) => (
                <li key={tip} className="flex items-center gap-2 rounded-[10px] bg-caution-tint px-3 py-2 text-label font-medium text-caution-fg">
                  <AlertIcon className="shrink-0" />
                  {tip}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4">
            <HeatLadder rec={rec} />
            <div className="mt-1">
              <LadderLegend />
            </div>
          </div>
        </section>
      )}

      {/* Recent reports */}
      <section aria-labelledby="recent" className="animate-fade-up mt-4 rounded-[var(--radius-lg)] border border-border bg-surface px-5 py-4 shadow-e1" style={{ ["--i" as string]: 2 }}>
        <h2 id="recent" className="text-caption uppercase tracking-wide text-text-3">
          Recent reports
        </h2>
        {recent.length === 0 ? (
          <p className="py-3 text-label text-text-3">No reports in the last 60 days.</p>
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((r) => (
              <ReportRow key={r.id} r={r} kind={machine.kind} now={now} />
            ))}
          </ul>
        )}
      </section>

      {/* WASH help */}
      <section aria-labelledby="wash-help" className="mt-4 rounded-[var(--radius-lg)] border border-border bg-surface-2 p-5">
        <h2 id="wash-help" className="text-headline text-text">
          Machine ate your money?
        </h2>
        <p className="mt-1 text-label text-text-2">
          We can&apos;t issue refunds. WASH can: in the WASH-Connect app go to <b>Support → Request a Refund</b>, or use the links below.
          Reporting it here warns the next person.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={WASH_LINKS.refundRequest} target="_blank" rel="noopener noreferrer" className="pressable inline-flex h-11 items-center gap-1.5 rounded-full border border-border bg-surface px-4 text-label font-semibold text-text">
            Refund request <ExternalIcon />
          </a>
          <a href={WASH_LINKS.serviceRequest} target="_blank" rel="noopener noreferrer" className="pressable inline-flex h-11 items-center gap-1.5 rounded-full border border-border bg-surface px-4 text-label font-semibold text-text">
            Service request <ExternalIcon />
          </a>
          <a href={`tel:${WASH_LINKS.refundPhone}`} className="pressable inline-flex h-11 items-center rounded-full border border-border bg-surface px-4 text-label font-semibold text-text">
            Call {WASH_LINKS.refundPhoneLabel}
          </a>
        </div>
        {machine.washMachineNumber && <p className="mt-2 text-caption text-text-3">Mention machine #{machine.washMachineNumber} in {room.name}.</p>}
      </section>

      {!data.retired && (
        <ReportSheet
          machine={{ code: machine.code, label: machine.label, kind: machine.kind, level: s.level, reason: s.reason }}
          autoOpen={sp.r === "1"}
          turnstileSiteKey={turnstileSiteKey()}
          dryerSettings={machine.kind === "dryer" ? data.offered : undefined}
        />
      )}
    </Page>
  );
}
