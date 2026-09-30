import type { Metadata } from "next";
import Link from "next/link";
import { Page } from "@/components/chrome";
import { StatefulForm, SubmitButton } from "@/components/admin-ui";
import { ChevronRight } from "@/components/icons";
import { requireAdmin } from "@/lib/admin-auth";
import { listBuildingsWithRooms } from "@/lib/queries";
import { createBuilding, createRoom, logout } from "./actions";
import { card, input, label } from "./styles";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminHome() {
  await requireAdmin();
  const buildings = await listBuildingsWithRooms();
  return (
    <Page>
      <div className="mt-4 flex items-center justify-between">
        <h1 className="text-title">Admin</h1>
        <form action={logout}>
          <SubmitButton variant="secondary">Log out</SubmitButton>
        </form>
      </div>

      <section className="mt-5 space-y-4" aria-label="Buildings">
        {buildings.map((b) => (
          <div key={b.id} className={card}>
            <h2 className="text-headline">
              {b.name} <span className="text-caption text-text-3">/{b.slug}</span>
            </h2>
            <ul className="mt-2 divide-y divide-border">
              {b.rooms.map((r) => (
                <li key={r.id}>
                  <Link href={`/admin/rooms/${r.id}`} className="flex min-h-12 items-center justify-between gap-2 py-2 hover:text-accent">
                    <span>
                      {r.name} <span className="text-caption text-text-3">/b/{b.slug}/{r.slug}</span>
                    </span>
                    <ChevronRight className="text-text-3" />
                  </Link>
                </li>
              ))}
            </ul>
            <details className="mt-2">
              <summary className="cursor-pointer py-2 text-label font-semibold text-accent">Add a room</summary>
              <StatefulForm action={createRoom} className="mt-2 grid gap-3 sm:grid-cols-2">
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
                <div className="sm:col-span-2">
                  <SubmitButton>Create room</SubmitButton>
                </div>
              </StatefulForm>
            </details>
          </div>
        ))}
      </section>

      <section className={`${card} mt-4`} aria-labelledby="new-building">
        <h2 id="new-building" className="text-headline">
          Add a building
        </h2>
        <StatefulForm action={createBuilding} className="mt-3 grid gap-3 sm:grid-cols-3">
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
      </section>
    </Page>
  );
}
