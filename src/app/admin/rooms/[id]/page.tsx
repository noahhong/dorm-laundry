import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatefulForm, SubmitButton } from "@/components/admin/forms";
import { Card, Empty, PageHeader, Pill, Stat } from "@/components/admin/ui";
import { BackLink } from "@/components/chrome";
import { QrIcon } from "@/components/icons";
import { StatusBadge } from "@/components/status";
import { requireAdmin } from "@/lib/admin-auth";
import { watchersByMachine } from "@/lib/admin-queries";
import { timeAgo } from "@/lib/format";
import { DRYER_SETTINGS, OUTCOME_LABEL, SETTING_LABEL, SYMPTOM_LABEL } from "@/lib/labels";
import { getRoomById, recentReportsForRoom } from "@/lib/queries";
import {
  addMachines,
  clearOutOfOrder,
  deleteRoom,
  markFixed,
  restoreMachine,
  retireMachine,
  setOutOfOrder,
  setReportHidden,
  updateMachine,
  updateRoom,
} from "../../actions";
import { input, label } from "../../styles";

export const metadata: Metadata = { title: "Admin · Room", robots: { index: false } };
export const dynamic = "force-dynamic";

const HINT: Record<string, string> = {
  no_heat: "Air only, no heat",
  delicates: "Coolest heat",
  low: "",
  medium: "",
  high: "Hottest",
};

export default async function AdminRoom(props: PageProps<"/admin/rooms/[id]">) {
  await requireAdmin();
  const { id } = await props.params;
  const data = await getRoomById(id, undefined, { includeRetired: true });
  if (!data) notFound();
  const [reports, watchers] = await Promise.all([recentReportsForRoom(id), watchersByMachine(id)]);
  const now = data.now;
  const live = data.machines.filter((m) => !m.retiredAt);
  const count = (l: string) => live.filter((m) => m.status.level === l).length;
  const nextNumber = (kind: "washer" | "dryer") => data.machines.filter((m) => m.kind === kind).length + 1;

  return (
    <>
      <div>
        <BackLink href="/admin/rooms">Rooms &amp; machines</BackLink>
      </div>
      <PageHeader
        title={data.room.name}
        subtitle={
          <>
            {data.building.name} ·{" "}
            <Link className="text-accent underline" href={`/b/${data.building.slug}/${data.room.slug}`} target="_blank">
              public page ↗
            </Link>
          </>
        }
        actions={
          <Link href={`/admin/rooms/${id}/qr`} className="pressable inline-flex h-10 items-center gap-2 rounded-[10px] bg-accent px-4 text-label font-semibold text-accent-fg">
            <QrIcon /> Print QR sheet
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Machines" value={live.length} hint={`${live.filter((m) => m.kind === "dryer").length} dryers · ${live.filter((m) => m.kind === "washer").length} washers`} />
        <Stat label="Working" value={count("works")} tone="works" />
        <Stat label="Caution" value={count("caution")} tone="caution" />
        <Stat label="Broken" value={count("broken")} tone={count("broken") ? "broken" : undefined} hint={`${count("unknown")} with no data`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Room settings" description="The dryer settings you tick here are the only ones residents can report and get recommended.">
          <StatefulForm action={updateRoom} className="grid gap-3">
            <input type="hidden" name="roomId" value={id} />
            <label className={label}>
              Name
              <input name="name" required defaultValue={data.room.name} className={input} />
            </label>
            <label className={label}>
              Where is it?
              <input name="locationHint" defaultValue={data.room.locationHint ?? ""} placeholder="Ground floor, past the mailroom" className={input} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className={label}>
                WASH-Connect room code
                <input name="washLocationCode" defaultValue={data.room.washLocationCode ?? ""} inputMode="numeric" placeholder="8 digits" className={input} />
              </label>
              <label className={label}>
                Minutes per payment
                <input name="minutesPerCycle" type="number" min={1} max={240} defaultValue={data.room.minutesPerCycle ?? ""} placeholder="e.g. 45" className={input} />
              </label>
            </div>
            <fieldset>
              <legend className="mb-1.5 text-label text-text-2">Dryer settings these dryers have</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {DRYER_SETTINGS.map((s) => (
                  <label key={s} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[10px] border border-border bg-surface-2 px-3 text-label has-[:checked]:border-accent has-[:checked]:bg-accent-tint">
                    <input type="checkbox" name="dryerSetting" value={s} defaultChecked={data.offered.includes(s)} className="h-4 w-4 accent-[var(--accent)]" />
                    <span>
                      <span className="block font-semibold">{SETTING_LABEL[s]}</span>
                      {HINT[s] && <span className="block text-caption text-text-3">{HINT[s]}</span>}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <SubmitButton>Save room</SubmitButton>
            </div>
          </StatefulForm>
        </Card>

        <Card title="Add machines" description="Labels should match the numbers physically on the machines, e.g. “Dryer 3”.">
          <StatefulForm action={addMachines} className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:items-end">
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
            <div className="col-span-2 sm:col-span-4">
              <SubmitButton>Add machines</SubmitButton>
            </div>
          </StatefulForm>
          <p className="mt-3 text-caption text-text-3">Adding 1–40 at a time. Each gets a unique QR code automatically.</p>
        </Card>
      </div>

      <h2 className="mb-2 mt-6 text-headline">Machines</h2>
      <div className="space-y-3" role="list" aria-label="Machines">
        {data.machines.map((m) => (
          <div role="listitem" key={m.id} className={`rounded-[var(--radius-md)] border border-border bg-surface p-4 shadow-e1 ${m.retiredAt ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-headline">{m.label}</span>
                <span className="text-caption text-text-3">
                  {m.kind} ·{" "}
                  <Link className="underline" href={`/m/${m.code}`} target="_blank">
                    /m/{m.code}
                  </Link>
                  {m.washMachineNumber ? ` · WASH #${m.washMachineNumber}` : ""}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {m.weak && <Pill tone="caution">Weak dryer</Pill>}
                {m.retiredAt ? <Pill>Retired</Pill> : <StatusBadge level={m.status.level} reason={m.status.reason} />}
              </div>
            </div>
            <p className="mt-1 text-caption text-text-3">
              {m.status.lastReportAt ? `Last report ${timeAgo(m.status.lastReportAt, now)}` : "No reports yet"}
              {m.adminNote ? ` · note: ${m.adminNote}` : ""}
              {watchers.get(m.id) ? ` · ${watchers.get(m.id)} waiting to hear it's fixed` : ""}
            </p>

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
        {data.machines.length === 0 && <Empty>No machines yet. Add some above.</Empty>}
      </div>

      <Card className="mt-6" title="Recent reports in this room" description="Hide spam or mistaken reports; hidden reports stop counting immediately." id="reports">
        <ul className="divide-y divide-border">
          {reports.map(({ report: r, label: ml }) => (
            <li key={r.id} className={`flex items-start justify-between gap-3 py-2.5 ${r.hiddenAt ? "opacity-50" : ""}`}>
              <div className="min-w-0 text-label">
                <span className="font-semibold">{ml}</span> · {r.setting ? `${SETTING_LABEL[r.setting]} · ` : ""}
                {OUTCOME_LABEL[r.outcome] ?? r.outcome}
                {r.symptoms.length > 0 && <> · {r.symptoms.map((s) => SYMPTOM_LABEL[s] ?? s).join(", ")}</>}
                {r.errorCode && <> · code {r.errorCode}</>}
                <span className="text-text-3">
                  {" "}
                  · {timeAgo(r.createdAt, now)} · device {r.deviceHash.slice(0, 6)}
                </span>
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
        <Link href={`/admin/reports?room=${id}`} className="mt-3 inline-flex text-label font-semibold text-accent">
          All reports for this room →
        </Link>
      </Card>

      <Card className="mt-4 border-broken-icon/30" title="Danger zone">
        <StatefulForm action={deleteRoom} className="grid gap-2 sm:max-w-md">
          <input type="hidden" name="roomId" value={id} />
          <p className="text-label text-text-2">
            Deleting the room permanently removes its machines and every report. Retire machines instead if you just want them hidden.
          </p>
          <input name="confirm" placeholder={`Type “${data.room.name}” to confirm`} className={input} autoComplete="off" />
          <div>
            <SubmitButton variant="danger">Delete room</SubmitButton>
          </div>
        </StatefulForm>
      </Card>
    </>
  );
}
