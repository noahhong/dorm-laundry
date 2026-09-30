import type { Metadata } from "next";
import { Card, Empty, PageHeader, Pager, Table, td, th } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin-auth";
import { listAudit } from "@/lib/admin-queries";
import { describeAudit, summarizeDetail } from "@/lib/audit-format";
import { timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Admin · Activity log", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AuditPage(props: PageProps<"/admin/audit">) {
  await requireAdmin();
  const sp = await props.searchParams;
  const page = Math.max(1, Number(Array.isArray(sp.page) ? sp.page[0] : sp.page) || 1);
  const { rows, total, pages, now } = await listAudit(page);
  return (
    <>
      <PageHeader title="Activity log" subtitle={`${total.toLocaleString()} recorded admin action${total === 1 ? "" : "s"}. Who-did-what for moderation and settings.`} />
      <Card flush>
        <div className="px-4 pb-4">
          {rows.length === 0 ? (
            <Empty>No admin activity yet.</Empty>
          ) : (
            <>
              <Table label="Admin activity">
                <thead>
                  <tr>
                    <th className={th}>When</th>
                    <th className={th}>Action</th>
                    <th className={th}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id}>
                      <td className={`${td} whitespace-nowrap text-text-2`}>
                        <time dateTime={new Date(a.at).toISOString()} title={new Date(a.at).toLocaleString()}>
                          {timeAgo(a.at, now)}
                        </time>
                      </td>
                      <td className={`${td} whitespace-nowrap font-semibold`}>{describeAudit(a.action)}</td>
                      <td className={`${td} max-w-[520px] break-words text-text-2`}>{summarizeDetail(a.action, a.detail) || <span className="text-text-3">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <Pager page={page} pages={pages} hrefFor={(p) => `/admin/audit?page=${p}`} />
            </>
          )}
        </div>
      </Card>
    </>
  );
}
