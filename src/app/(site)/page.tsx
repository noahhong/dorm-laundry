import Link from "next/link";
import { redirect } from "next/navigation";
import { Page } from "@/components/chrome";
import { ChevronRight, QrIcon } from "@/components/icons";
import { getConfig } from "@/lib/config-server";
import { resolveHome, roomHref } from "@/lib/home";
import { listBuildingsWithRooms } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [buildings, { tagline }] = await Promise.all([listBuildingsWithRooms(), getConfig()]);
  const home = resolveHome(buildings);
  if (home.kind === "room") redirect(home.href);
  // One building: list its rooms under its name, with no building headings.
  const shown = home.kind === "building" ? [home.building] : home.kind === "all" ? home.buildings : [];
  return (
    <Page>
      <h1 className="mt-6 text-title text-text">{home.kind === "building" ? home.building.name : "Laundry rooms"}</h1>
      <p className="mt-1 text-body text-text-2">{tagline}</p>

      {shown.length === 0 ? (
        <div className="mt-8 rounded-[var(--radius-md)] border border-dashed border-border-strong/50 bg-surface p-6 text-center">
          <p className="text-headline">No rooms yet</p>
          <p className="mt-1 text-label text-text-2">
            An admin can add buildings and rooms at{" "}
            <Link className="text-accent underline" href="/admin">
              /admin
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {shown.map((b) => (
            <section key={b.id} aria-label={b.name}>
              {home.kind === "all" && (
                <h2 className="mb-2 text-caption uppercase tracking-wide text-text-3">
                  {b.name}
                  {b.campus ? ` · ${b.campus}` : ""}
                </h2>
              )}
              <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface shadow-e1">
                {b.rooms.map((r) => (
                  <li key={r.id}>
                    <Link href={roomHref(b, r)} className="pressable flex min-h-14 items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2">
                      <span>
                        <span className="block text-headline">{r.name}</span>
                        {r.locationHint && <span className="block text-label text-text-3">{r.locationHint}</span>}
                      </span>
                      <ChevronRight className="text-text-3" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <p className="mt-10 flex items-center justify-center gap-2 text-label text-text-3">
        <QrIcon /> Tip: scan the sticker on any machine to report in 3 taps.
      </p>
    </Page>
  );
}
