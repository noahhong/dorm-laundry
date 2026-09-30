import type { Metadata } from "next";
import Link from "next/link";
import { SubmitButton } from "@/components/admin/forms";
import { Card, Empty, PageHeader, Pager, Pill, Table, td, th } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin-auth";
import { listAllRooms, listReports } from "@/lib/admin-queries";
import { ALL_OUTCOMES, parseFilters, STATES } from "./filters";
import { timeAgo } from "@/lib/format";
import { OUTCOME_LABEL, SETTING_LABEL, SYMPTOM_LABEL, damageSummary, loadSummary } from "@/lib/labels";
import { bulkSetReportsHidden, toggleReportHidden } from "../actions";
import { input } from "../styles";

export const metadata: Metadata = { title: "Admin · Reports", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ReportsAdmin(props: PageProps<"/admin/reports">) {
  await requireAdmin();
  const sp = await props.searchParams;
  const { page, ...filters } = parseFilters(sp);
  const [{ rows, total, pages, now }, allRooms] = await Promise.all([listReports(filters, page), listAllRooms()]);

  const qs = (over: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const base: Record<string, string | undefined> = { q: filters.q, room: filters.roomId, kind: filters.kind, outcome: filters.outcome, state: filters.state, range: filters.range };
    for (const [k, v] of Object.entries({ ...base, ...over })) if (v !== undefined && v !== "") p.set(k, String(v));
    return p.toString();
  };

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle={`${total.toLocaleString()} matching report${total === 1 ? "" : "s"}`}
        actions={
          <a href={`/admin/reports/export?${qs({})}`} className="pressable inline-flex h-10 items-center rounded-[10px] border border-border bg-surface px-4 text-label font-semibold">
            Download CSV
          </a>
        }
      />

      <Card>
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
          <label className="grid gap-1 text-label text-text-2 lg:col-span-2">
            Search notes, error codes, machine
            <input name="q" defaultValue={filters.q ?? ""} placeholder="e.g. burnt, OE, Dryer 3" className={input} />
          </label>
          <label className="grid gap-1 text-label text-text-2">
            Room
            <select name="room" defaultValue={filters.roomId ?? ""} className={input}>
              <option value="">All rooms</option>
              {allRooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.building} · {r.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-label text-text-2">
            Kind
            <select name="kind" defaultValue={filters.kind ?? ""} className={input}>
              <option value="">Washers & dryers</option>
              <option value="dryer">Dryers</option>
              <option value="washer">Washers</option>
            </select>
          </label>
          <label className="grid gap-1 text-label text-text-2">
            Outcome
            <select name="outcome" defaultValue={filters.outcome ?? ""} className={input}>
              <option value="">Any</option>
              {ALL_OUTCOMES.map((o) => (
                <option key={o} value={o}>
                  {OUTCOME_LABEL[o]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-label text-text-2">
            State
            <select name="state" defaultValue={filters.state} className={input}>
              {STATES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-label text-text-2">
            Period
            <select name="range" defaultValue={filters.range} className={input}>
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="all">All time</option>
            </select>
          </label>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
            <SubmitButton>Apply</SubmitButton>
            <Link href="/admin/reports" className="pressable inline-flex h-11 items-center rounded-[10px] border border-border px-4 text-label font-semibold text-text-2">
              Reset
            </Link>
          </div>
        </form>
      </Card>

      <Card className="mt-4" flush>
        {rows.length === 0 ? (
          <div className="p-4">
            <Empty>No reports match these filters.</Empty>
          </div>
        ) : (
          <div className="px-4 pb-4">
            <form id="bulk-form" action={bulkSetReportsHidden} className="flex flex-wrap items-center gap-2 pb-2">
              <button name="hide" value="1" type="submit" className="pressable h-10 rounded-[10px] border border-border bg-surface px-3 text-label font-semibold">
                Hide selected
              </button>
              <button name="hide" value="0" type="submit" className="pressable h-10 rounded-[10px] border border-border bg-surface px-3 text-label font-semibold">
                Unhide selected
              </button>
              <span className="text-caption text-text-3">Tick rows, then choose an action.</span>
            </form>
            <Table label="Reports">
              <thead>
                <tr>
                  <th className={th} />
                  <th className={th}>When</th>
                  <th className={th}>Machine</th>
                  <th className={th}>Report</th>
                  <th className={th}>Note</th>
                  <th className={th}>Device</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ report: r, machineLabel, machineCode, roomName, buildingName, roomId, hasPhoto }) => (
                  <tr key={r.id} className={r.hiddenAt || r.undoneAt ? "opacity-55" : ""}>
                    <td className={td}>
                      <input type="checkbox" form="bulk-form" name="reportId" value={r.id} aria-label={`Select report on ${machineLabel}`} className="h-4 w-4 accent-[var(--accent)]" />
                    </td>
                    <td className={`${td} whitespace-nowrap text-text-2`}>
                      <time dateTime={new Date(r.createdAt).toISOString()} title={new Date(r.createdAt).toLocaleString()}>
                        {timeAgo(r.createdAt, now)}
                      </time>
                    </td>
                    <td className={td}>
                      <Link href={`/m/${machineCode}`} target="_blank" className="font-semibold hover:text-accent">
                        {machineLabel}
                      </Link>
                      <span className="block text-caption text-text-3">
                        <Link href={`/admin/rooms/${roomId}`} className="hover:text-accent">
                          {roomName}
                        </Link>{" "}
                        · {buildingName}
                      </span>
                    </td>
                    <td className={td}>
                      <span className="font-semibold">{OUTCOME_LABEL[r.outcome] ?? r.outcome}</span>
                      {r.setting ? ` · ${SETTING_LABEL[r.setting] ?? r.setting}` : ""}
                      {r.minutes ? ` · ${r.minutes} min` : ""}
                      {r.symptoms.length > 0 && <span className="block text-caption text-text-2">{r.symptoms.map((s) => SYMPTOM_LABEL[s] ?? s).join(", ")}</span>}
                      {r.errorCode && <span className="block text-caption text-text-2">Error code {r.errorCode}</span>}
                      {damageSummary(r) && <span className="block text-caption font-semibold text-broken-fg">{damageSummary(r)}</span>}
                      {loadSummary(r) && <span className="block text-caption text-text-2">{loadSummary(r)}</span>}
                      {hasPhoto ? (
                        <a href={`/api/photos/${r.id}`} target="_blank" rel="noopener noreferrer" className="mt-1 block w-fit" aria-label="Open load photo">
                          {/* eslint-disable-next-line @next/next/no-img-element -- small DB-served JPEG, no optimizer needed */}
                          <img src={`/api/photos/${r.id}`} alt="Load photo" loading="lazy" className="h-16 w-16 rounded-[8px] border border-border object-cover" />
                        </a>
                      ) : null}
                      <span className="mt-0.5 flex gap-1">
                        {r.hiddenAt && <Pill tone="caution">Hidden</Pill>}
                        {r.undoneAt && <Pill>Undone</Pill>}
                      </span>
                    </td>
                    <td className={`${td} max-w-[260px] break-words text-text-2`}>{r.note ? `“${r.note}”` : <span className="text-text-3">—</span>}</td>
                    <td className={`${td} whitespace-nowrap font-mono text-caption text-text-3`} title="Anonymous device hash (first 8 characters)">
                      {r.deviceHash.slice(0, 8)}
                    </td>
                    <td className={`${td} text-right`}>
                      <form action={toggleReportHidden}>
                        <input type="hidden" name="toggle" value={r.id} />
                        <button
                          type="submit"
                          className="pressable h-9 rounded-[8px] border border-border px-3 text-caption font-semibold text-text-2 hover:bg-surface-2"
                          aria-label={`${r.hiddenAt ? "Unhide" : "Hide"} report on ${machineLabel}`}
                        >
                          {r.hiddenAt ? "Unhide" : "Hide"}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pager page={page} pages={pages} hrefFor={(p) => `/admin/reports?${qs({ page: p })}`} />
          </div>
        )}
      </Card>
    </>
  );
}
