import Link from "next/link";
import { redirect } from "next/navigation";
import { Page } from "@/components/chrome";
import { ChevronRight, QrIcon } from "@/components/icons";
import { getConfig } from "@/lib/config-server";
import { listBuildingsWithRooms } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [buildings, { tagline }] = await Promise.all([listBuildingsWithRooms(), getConfig()]);
  const allRooms = buildings.flatMap((b) => b.rooms.map((r) => ({ ...r, building: b })));
  if (allRooms.length === 1) {
    const r = allRooms[0];
    redirect(`/b/${r.building.slug}/${r.slug}`);
  }
  return (
    <Page>
      <h1 className="mt-6 text-title text-text">Laundry rooms</h1>
      <p className="mt-1 text-body text-text-2">{tagline}</p>

      {buildings.length === 0 ? (
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
          {buildings.map((b) => (
            <section key={b.id} aria-labelledby={`b-${b.id}`}>
              <h2 id={`b-${b.id}`} className="mb-2 text-caption uppercase tracking-wide text-text-3">
                {b.name}
                {b.campus ? ` · ${b.campus}` : ""}
              </h2>
              <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface shadow-e1">
                {b.rooms.map((r) => (
                  <li key={r.id}>
                    <Link href={`/b/${b.slug}/${r.slug}`} className="pressable flex min-h-14 items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2">
                      <span>
                        <span className="block text-headline">{r.name}</span>
                        {r.locationHint && <span className="block text-label text-text-3">{r.locationHint}</span>}
                      </span>
                      <ChevronRight className="text-text-3" />
                    </Link>
                  </li>
                ))}
                {b.rooms.length === 0 && <li className="px-4 py-3 text-label text-text-3">No rooms yet</li>}
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
