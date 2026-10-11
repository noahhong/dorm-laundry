import type { Metadata } from "next";
import Link from "next/link";
import { BarChart, Card, Empty, PageHeader, Pill, Stat, Table, td, th } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin-auth";
import { getDashboard } from "@/lib/admin-queries";
import { changedFromDefault } from "@/lib/config";
import { timeAgo } from "@/lib/format";
import { OUTCOME_LABEL } from "@/lib/labels";
import { describeAudit } from "@/lib/audit-format";

export const metadata: Metadata = { title: "Admin · Dashboard", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Dashboard() {
  await requireAdmin();
  const d = await getDashboard();
  const { totals } = d;
  const changed = changedFromDefault(d.config);
  const tuned = d.config.brokenMinReporters;

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`Live from residents' reports · last 14 days · ${new Date(d.now).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`}
        actions={
          <Link href="/admin/reports" className="pressable inline-flex h-10 items-center rounded-[10px] border border-border bg-surface px-4 text-label font-semibold">
            Review reports
          </Link>
        }
      />

      {d.flagged > 0 && (
        <Link
          href="/admin/reports?state=flagged"
          className="pressable mb-4 flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-broken-icon/40 bg-broken-tint px-4 py-3 text-label font-semibold text-broken-fg"
        >
          <span>
            {d.flagged} flagged report{d.flagged === 1 ? "" : "s"} need{d.flagged === 1 ? "s" : ""} a look
          </span>
          <span aria-hidden>→</span>
        </Link>
      )}

      {totals.machines === 0 ? (
        <Card>
          <Empty>
            No machines yet. Start in{" "}
            <Link href="/admin/rooms" className="font-semibold text-accent underline">
              Rooms &amp; machines
            </Link>
            : add a building, a room, then your washers and dryers.
          </Empty>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Reports · 24h" value={d.today} delta={d.today - d.yesterday} hint="vs previous 24h" />
            <Stat label="Reports · 7 days" value={d.week} delta={d.week - d.prevWeek} hint="vs previous 7 days" />
            <Stat label="Machines" value={totals.machines} hint={`${totals.works} working · ${totals.unknown} no data`} />
            <Stat label="Needs attention" value={d.attention.filter((a) => a.severity >= 60).length} tone={d.attention.some((a) => a.severity >= 100) ? "broken" : d.attention.length ? "caution" : "works"} hint={`${totals.broken} broken · ${totals.caution} caution${totals.weak ? ` · ${totals.weak} weak` : ""}`} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card title="Reports per day" description="Visible reports, last 14 days" className="lg:col-span-2">
              <BarChart data={d.days} label="Reports per day" />
            </Card>
            <Card title="Top problems" description="Symptoms on “didn't work” reports, 30 days">
              {d.topProblems.length === 0 ? (
                <Empty>Nothing reported. 🎉</Empty>
              ) : (
                <ul className="space-y-2.5">
                  {d.topProblems.map((p) => (
                    <li key={p.key}>
                      <div className="flex justify-between text-label">
                        <span>{p.label}</span>
                        <span className="font-semibold tabular-nums">{p.count}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full rounded-full bg-broken-icon" style={{ width: `${(p.count / d.topProblems[0].count) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {d.outcomeCounts.size > 0 && (
                <p className="mt-4 border-t border-border pt-3 text-caption text-text-3">
                  30-day outcomes:{" "}
                  {[...d.outcomeCounts.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .map(([k, n]) => `${OUTCOME_LABEL[k] ?? k} ${n}`)
                    .join(" · ")}
                </p>
              )}
            </Card>
          </div>

          <Card className="mt-4" title="Needs attention" description="Broken, doubtful and silent machines, worst first" flush>
            {d.attention.length === 0 ? (
              <div className="px-4 pb-4">
                <Empty>Every machine looks healthy and recently reported.</Empty>
              </div>
            ) : (
              <div className="px-4 pb-2">
                <Table label="Machines needing attention">
                  <thead>
                    <tr>
                      <th className={th}>Machine</th>
                      <th className={th}>Room</th>
                      <th className={th}>Why</th>
                      <th className={th}>Last report</th>
                      <th className={th} />
                    </tr>
                  </thead>
                  <tbody>
                    {d.attention.slice(0, 15).map((a) => (
                      <tr key={a.machineId}>
                        <td className={`${td} font-semibold`}>
                          <Link href={`/m/${a.code}`} className="hover:text-accent" target="_blank">
                            {a.label}
                          </Link>
                        </td>
                        <td className={`${td} text-text-2`}>
                          {a.roomName}
                          <span className="block text-caption text-text-3">{a.buildingName}</span>
                        </td>
                        <td className={td}>
                          <span className="flex flex-wrap gap-1">
                            {a.tags.map((t) => (
                              <Pill key={t.text} tone={t.tone}>
                                {t.text}
                              </Pill>
                            ))}
                          </span>
                        </td>
                        <td className={`${td} whitespace-nowrap text-text-3`}>{a.lastReportAt ? timeAgo(a.lastReportAt, d.now) : "never"}</td>
                        <td className={`${td} text-right`}>
                          <Link href={`/admin/rooms/${a.roomId}`} className="font-semibold text-accent">
                            Manage
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
                {d.attention.length > 15 && <p className="pb-2 pt-2 text-caption text-text-3">+ {d.attention.length - 15} more in the room pages.</p>}
              </div>
            )}
          </Card>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card title="Rooms" className="lg:col-span-2" flush>
              <div className="px-4 pb-2">
                <Table label="Rooms overview">
                  <thead>
                    <tr>
                      <th className={th}>Room</th>
                      <th className={th}>Machines</th>
                      <th className={th}>Working</th>
                      <th className={th}>Caution</th>
                      <th className={th}>Broken</th>
                      <th className={th}>No data</th>
                      <th className={th}>Last report</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.rooms.map((r) => (
                      <tr key={r.id}>
                        <td className={`${td} font-semibold`}>
                          <Link href={`/admin/rooms/${r.id}`} className="hover:text-accent">
                            {r.name}
                          </Link>
                          <span className="block text-caption font-normal text-text-3">{r.building}</span>
                        </td>
                        <td className={`${td} tabular-nums`}>{r.machines}</td>
                        <td className={`${td} tabular-nums text-works-fg`}>{r.works}</td>
                        <td className={`${td} tabular-nums text-caution-fg`}>{r.caution}</td>
                        <td className={`${td} tabular-nums ${r.broken ? "font-semibold text-broken-fg" : "text-text-3"}`}>{r.broken}</td>
                        <td className={`${td} tabular-nums text-text-3`}>{r.unknown}</td>
                        <td className={`${td} whitespace-nowrap text-text-3`}>{r.lastReportAt ? timeAgo(r.lastReportAt, d.now) : "never"}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </Card>

            <div className="space-y-4">
              <Card title="Rules in effect" description={changed.length ? `${changed.length} setting${changed.length === 1 ? "" : "s"} changed from the defaults` : "All defaults"}>
                <ul className="space-y-1.5 text-label text-text-2">
                  <li>
                    <b className="text-text">{tuned}</b> device{tuned === 1 ? "" : "s"} to mark Broken
                  </li>
                  <li>
                    Status fades over <b className="text-text">{d.config.statusHalfLifeHours} h</b>
                  </li>
                  <li>
                    Weak-dryer flag <b className="text-text">{d.config.outlierEnabled ? "on" : "off"}</b>
                  </li>
                  <li>
                    Notes <b className="text-text">{d.config.notesPublic ? "public" : "admin-only"}</b>
                  </li>
                </ul>
                <Link href="/admin/settings" className="mt-3 inline-flex text-label font-semibold text-accent">
                  Edit settings →
                </Link>
              </Card>
              <Card title="Recent admin activity" flush>
                <ul className="divide-y divide-border px-4 pb-2">
                  {d.audit.length === 0 && <li className="py-3 text-label text-text-3">Nothing yet.</li>}
                  {d.audit.map((a) => (
                    <li key={a.id} className="py-2 text-label">
                      <span className="text-text">{describeAudit(a.action)}</span>
                      <span className="block text-caption text-text-3">{timeAgo(a.at, d.now)}</span>
                    </li>
                  ))}
                </ul>
                <div className="px-4 pb-4">
                  <Link href="/admin/audit" className="text-label font-semibold text-accent">
                    Full activity log →
                  </Link>
                </div>
              </Card>
            </div>
          </div>
        </>
      )}
    </>
  );
}
