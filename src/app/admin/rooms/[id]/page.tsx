import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BackLink, Page } from "@/components/chrome";
import { StatefulForm, SubmitButton } from "@/components/admin-ui";
import { QrIcon } from "@/components/icons";
import { StatusBadge } from "@/components/status";
import { requireAdmin } from "@/lib/admin-auth";
import { timeAgo } from "@/lib/format";
import { OUTCOME_LABEL, SETTING_LABEL, SYMPTOM_LABEL } from "@/lib/labels";
import { getRoomById, recentReportsForRoom } from "@/lib/queries";
import { addMachines, clearOutOfOrder, markFixed, restoreMachine, retireMachine, setOutOfOrder, setReportHidden, updateMachine } from "../../actions";
import { card, input, label } from "../../styles";

export const metadata: Metadata = { title: "Manage room", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminRoom(props: PageProps<"/admin/rooms/[id]">) {
  await requireAdmin();
  const { id } = await props.params;
  const data = await getRoomById(id, undefined, { includeRetired: true });
  if (!data) notFound();
  const reports = await recentReportsForRoom(id);
  const now = data.now;
  const nextNumber = (kind: "washer" | "dryer") => data.machines.filter((m) => m.kind === kind).length + 1;

  return (
    <Page>
      <div className="mt-2">
        <BackLink href="/admin">Admin</BackLink>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-title">{data.room.name}</h1>
            <p className="text-label text-text-3">
              {data.building.name} ·{" "}
              <Link className="text-accent underline" href={`/b/${data.building.slug}/${data.room.slug}`}>
                public page
              </Link>
            </p>
          </div>
          <Link href={`/admin/rooms/${id}/qr`} className="pressable inline-flex h-11 items-center gap-2 rounded-[10px] bg-accent px-4 text-label font-semibold text-accent-fg">
            <QrIcon /> Print QR sheet
          </Link>
        </div>
      </div>

      <section className={`${card} mt-4`} aria-labelledby="add-machines">
        <h2 id="add-machines" className="text-headline">
          Add machines
        </h2>
        <StatefulForm action={addMachines} className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5 sm:items-end">
          <input type="hidden" name="roomId" value={id} />
          <label className={label}>
            Kind
            <select name="kind" className={input} defaultValue="dryer">
              <option value="dryer">Dryer</option>
              <option value="washer">Washer</option>
            </select>
          </label>
          <label className={label}>
            Label prefix
            <input name="prefix" placeholder="Dryer" className={input} />
          </label>
          <label className={label}>
            From #
            <input name="from" type="number" min={0} defaultValue={nextNumber("dryer")} className={input} />
          </label>
          <label className={label}>
            To #
            <input name="to" type="number" min={0} defaultValue={nextNumber("dryer")} className={input} />
          </label>
          <SubmitButton>Add</SubmitButton>
        </StatefulForm>
        <p className="mt-2 text-caption text-text-3">Labels should match the numbers physically on the machines, e.g. &ldquo;Dryer 3&rdquo;.</p>
      </section>

      <section className="mt-4 space-y-3" aria-label="Machines">
        {data.machines.map((m) => (
          <div key={m.id} className={`${card} ${m.retiredAt ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-headline">{m.label}</span>
                <span className="text-caption text-text-3">
                  {m.kind} · <Link className="underline" href={`/m/${m.code}`}>/m/{m.code}</Link>
                </span>
              </div>
              {m.retiredAt ? <span className="text-label text-text-3">Retired</span> : <StatusBadge level={m.status.level} reason={m.status.reason} />}
            </div>

            <details className="mt-2">
              <summary className="cursor-pointer py-1 text-label font-semibold text-accent">Edit</summary>
              <form action={updateMachine} className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:items-end">
                <input type="hidden" name="machineId" value={m.id} />
                <label className={label}>
                  Label
                  <input name="label" defaultValue={m.label} required className={input} />
                </label>
                <label className={label}>
                  WASH machine #
                  <input name="washMachineNumber" defaultValue={m.washMachineNumber ?? ""} className={input} />
                </label>
                <label className={label}>
                  Sort order
                  <input name="position" type="number" defaultValue={m.position} className={input} />
                </label>
                <SubmitButton variant="secondary">Save</SubmitButton>
              </form>
            </details>

            <div className="mt-3 flex flex-wrap items-end gap-2">
              {m.adminState === "out_of_order" ? (
                <form action={clearOutOfOrder}>
                  <input type="hidden" name="machineId" value={m.id} />
                  <SubmitButton variant="secondary">Clear out-of-order</SubmitButton>
                </form>
              ) : (
                <form action={setOutOfOrder} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="machineId" value={m.id} />
                  <input name="note" placeholder="Note, e.g. WASH ticket #123" className={`${input} w-56`} aria-label={`Out-of-order note for ${m.label}`} />
                  <SubmitButton variant="danger">Out of order</SubmitButton>
                </form>
              )}
              <form action={markFixed}>
                <input type="hidden" name="machineId" value={m.id} />
                <SubmitButton variant="secondary">Mark fixed</SubmitButton>
              </form>
              <form action={m.retiredAt ? restoreMachine : retireMachine}>
                <input type="hidden" name="machineId" value={m.id} />
                <SubmitButton variant="secondary">{m.retiredAt ? "Restore" : "Retire"}</SubmitButton>
              </form>
            </div>
          </div>
        ))}
      </section>

      <section className={`${card} mt-4`} aria-labelledby="reports">
        <h2 id="reports" className="text-headline">
          Recent reports
        </h2>
        <ul className="mt-2 divide-y divide-border">
          {reports.map(({ report: r, label: ml }) => (
            <li key={r.id} className={`flex items-start justify-between gap-3 py-2.5 ${r.hiddenAt ? "opacity-50" : ""}`}>
              <div className="min-w-0 text-label">
                <span className="font-semibold">{ml}</span> · {r.setting ? `${SETTING_LABEL[r.setting]} · ` : ""}
                {OUTCOME_LABEL[r.outcome] ?? r.outcome}
                {r.symptoms.length > 0 && <> · {r.symptoms.map((s) => SYMPTOM_LABEL[s] ?? s).join(", ")}</>}
                {r.errorCode && <> · code {r.errorCode}</>}
                <span className="text-text-3"> · {timeAgo(r.createdAt, now)} · device {r.deviceHash.slice(0, 6)}</span>
                {r.note && <p className="break-words text-text-2">&ldquo;{r.note}&rdquo;</p>}
              </div>
              <form action={setReportHidden}>
                <input type="hidden" name="reportId" value={r.id} />
                <input type="hidden" name="hide" value={r.hiddenAt ? "0" : "1"} />
                <SubmitButton variant="secondary">{r.hiddenAt ? "Unhide" : "Hide"}</SubmitButton>
              </form>
            </li>
          ))}
          {reports.length === 0 && <li className="py-2 text-label text-text-3">No reports yet.</li>}
        </ul>
      </section>
    </Page>
  );
}
