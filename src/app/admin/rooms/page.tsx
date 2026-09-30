import type { Metadata } from "next";
import Link from "next/link";
import { StatefulForm, SubmitButton } from "@/components/admin/forms";
import { Card, Empty, PageHeader, Pill } from "@/components/admin/ui";
import { ChevronRight } from "@/components/icons";
import { requireAdmin } from "@/lib/admin-auth";
import { DRYER_SETTINGS, SETTING_LABEL } from "@/lib/labels";
import { listBuildingsWithRooms } from "@/lib/queries";
import { offeredSettings } from "@/lib/rooms";
import { createBuilding, createRoom, deleteBuilding, updateBuilding } from "../actions";
import { input, label } from "../styles";

export const metadata: Metadata = { title: "Admin · Rooms & machines", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function RoomsAdmin() {
  await requireAdmin();
  const buildings = await listBuildingsWithRooms();
  return (
    <>
      <PageHeader title="Rooms & machines" subtitle="Buildings hold rooms; rooms hold washers and dryers. Each machine gets its own QR sticker." />

      <div className="space-y-4">
        {buildings.length === 0 && (
          <Card>
            <Empty>No buildings yet. Add your first one below.</Empty>
          </Card>
        )}
        {buildings.map((b) => (
          <Card key={b.id} title={b.name} description={`/b/${b.slug}${b.campus ? ` · ${b.campus}` : ""}`} flush>
            <ul className="divide-y divide-border border-t border-border">
              {b.rooms.map((r) => {
                const offered = offeredSettings(r.dryerSettings);
                return (
                  <li key={r.id}>
                    <Link href={`/admin/rooms/${r.id}`} className="pressable flex min-h-14 items-center justify-between gap-3 px-4 py-2.5 hover:bg-surface-2">
                      <span className="min-w-0">
                        <span className="block font-semibold">{r.name}</span>
                        <span className="block truncate text-caption text-text-3">
                          /b/{b.slug}/{r.slug}
                          {r.locationHint ? ` · ${r.locationHint}` : ""}
                        </span>
                      </span>
                      <span className="hidden flex-wrap justify-end gap-1 sm:flex">
                        {offered.length === DRYER_SETTINGS.length ? <Pill>All dryer settings</Pill> : offered.map((s) => <Pill key={s} tone="accent">{SETTING_LABEL[s]}</Pill>)}
                        {r.minutesPerCycle ? <Pill>{r.minutesPerCycle} min / payment</Pill> : null}
                      </span>
                      <ChevronRight className="shrink-0 text-text-3" />
                    </Link>
                  </li>
                );
              })}
              {b.rooms.length === 0 && <li className="px-4 py-3 text-label text-text-3">No rooms yet.</li>}
            </ul>
            <div className="grid gap-3 border-t border-border p-4 md:grid-cols-2">
              <details>
                <summary className="cursor-pointer py-1 text-label font-semibold text-accent">Add a room</summary>
                <StatefulForm action={createRoom} className="mt-3 grid gap-3">
                  <input type="hidden" name="buildingId" value={b.id} />
                  <label className={label}>
                    Name
                    <input name="name" required placeholder="Laundry room" className={input} />
                  </label>
                  <label className={label}>
                    URL slug (optional)
                    <input name="slug" placeholder="laundry" className={input} />
                  </label>
                  <label className={label}>
                    Where is it? (optional)
                    <input name="locationHint" placeholder="Ground floor, past the mailroom" className={input} />
                  </label>
                  <label className={label}>
                    WASH-Connect room code (optional)
                    <input name="washLocationCode" inputMode="numeric" placeholder="8 digits" className={input} />
                  </label>
                  <div>
                    <SubmitButton>Create room</SubmitButton>
                  </div>
                </StatefulForm>
              </details>
              <details>
                <summary className="cursor-pointer py-1 text-label font-semibold text-text-2">Edit or delete building</summary>
                <StatefulForm action={updateBuilding} className="mt-3 grid gap-3">
                  <input type="hidden" name="buildingId" value={b.id} />
                  <label className={label}>
                    Name
                    <input name="name" required defaultValue={b.name} className={input} />
                  </label>
                  <label className={label}>
                    Campus
                    <input name="campus" defaultValue={b.campus ?? ""} className={input} />
                  </label>
                  <div>
                    <SubmitButton variant="secondary">Save building</SubmitButton>
                  </div>
                </StatefulForm>
                <StatefulForm action={deleteBuilding} className="mt-4 grid gap-2 rounded-[12px] border border-broken-icon/30 bg-broken-tint p-3">
                  <input type="hidden" name="buildingId" value={b.id} />
                  <p className="text-label text-broken-fg">
                    <b>Delete building.</b> This permanently removes its rooms, machines and all their reports.
                  </p>
                  <input name="confirm" placeholder={`Type “${b.name}” to confirm`} className={input} autoComplete="off" />
                  <div>
                    <SubmitButton variant="danger">Delete building</SubmitButton>
                  </div>
                </StatefulForm>
              </details>
            </div>
          </Card>
        ))}

        <Card title="Add a building" description="Campus is optional; the URL slug is made from the name if you leave it empty.">
          <StatefulForm action={createBuilding} className="grid gap-3 sm:grid-cols-3">
            <label className={label}>
              Name
              <input name="name" required placeholder="Hedrick Summit" className={input} />
            </label>
            <label className={label}>
              URL slug (optional)
              <input name="slug" placeholder="hedrick-summit" className={input} />
            </label>
            <label className={label}>
              Campus (optional)
              <input name="campus" placeholder="UCLA" className={input} />
            </label>
            <div className="sm:col-span-3">
              <SubmitButton>Add building</SubmitButton>
            </div>
          </StatefulForm>
        </Card>
      </div>
    </>
  );
}
