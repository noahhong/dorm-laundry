import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink, Page } from "@/components/chrome";
import { StatusIcon, QrIcon } from "@/components/icons";
import { KindFilter } from "@/components/kind-filter";
import { LaundryHelper } from "@/components/laundry-helper";
import { MachineCard } from "@/components/machine-card";
import { TONE } from "@/components/status";
import { assistantConfigured } from "@/lib/assistant-server";
import { getConfig } from "@/lib/config-server";
import { homeLinkLabel, resolveHome } from "@/lib/home";
import { getRoom, listBuildingsWithRooms, type MachineView } from "@/lib/queries";
import type { StatusLevel } from "@/lib/status";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/b/[building]/[room]">): Promise<Metadata> {
  const { building, room } = await props.params;
  const data = await getRoom(building, room);
  return { title: data ? `${data.room.name} · ${data.building.name}` : "Room not found" };
}

function Summary({ machines }: { machines: MachineView[] }) {
  const count = (l: StatusLevel) => machines.filter((m) => m.status.level === l).length;
  const items: { level: StatusLevel; n: number; label: string }[] = [
    { level: "works", n: count("works"), label: "working" },
    { level: "caution", n: count("caution"), label: "caution" },
    { level: "broken", n: count("broken"), label: "broken" },
    { level: "unknown", n: count("unknown"), label: "no reports" },
  ];
  return (
    <ul aria-label="Room summary" className="mt-4 grid grid-cols-4 gap-2">
      {items.map((it) => (
        <li key={it.level} className={`flex flex-col items-start rounded-[12px] border px-2.5 py-2 ${TONE[it.level].tint} ${TONE[it.level].ring}`}>
          <span className={`flex items-center gap-1 text-title ${TONE[it.level].fg}`}>
            <StatusIcon level={it.level} size={16} className={TONE[it.level].icon} />
            {it.n}
          </span>
          <span className={`text-caption ${TONE[it.level].fg}`}>{it.label}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function RoomPage(props: PageProps<"/b/[building]/[room]">) {
  const { building, room } = await props.params;
  const [data, buildings] = await Promise.all([getRoom(building, room), listBuildingsWithRooms()]);
  if (!data) notFound();
  // With one building and one room, "/" is this page, so the back link would go nowhere.
  const backLabel = homeLinkLabel(resolveHome(buildings), { building, room });
  const now = data.now;
  const dryers = data.machines.filter((m) => m.kind === "dryer");
  const washers = data.machines.filter((m) => m.kind === "washer");
  const empty = data.totalReports === 0;
  const helper = assistantConfigured() && (await getConfig()).assistantEnabled && data.machines.length > 0;

  return (
    <Page>
      <div className="mt-2">
        {backLabel ? (
          <BackLink href="/">{backLabel}</BackLink>
        ) : (
          <p className="mt-2 text-caption uppercase tracking-wide text-text-3">{data.building.name}</p>
        )}
        <h1 className="text-title text-text">{data.room.name}</h1>
        {data.room.locationHint && <p className="text-label text-text-3">{data.room.locationHint}</p>}
      </div>

      {data.machines.length > 0 && <Summary machines={data.machines} />}

      {empty && data.machines.length > 0 && (
        <div className="animate-fade-up mt-4 flex gap-3 rounded-[var(--radius-md)] border border-dashed border-border-strong/50 bg-surface p-4">
          <StatusIcon level="unknown" size={28} className="shrink-0 text-unknown-icon" />
          <div>
            <p className="text-headline">No reports yet</p>
            <p className="mt-0.5 text-label text-text-2">
              Be the first: scan the QR sticker on a machine after your load and tap how it went. Three taps, no login.
            </p>
          </div>
        </div>
      )}

      {/* AI helper: clothes → machine and setting (PLAN.md §6.8) */}
      {helper && <LaundryHelper roomId={data.room.id} />}

      {data.machines.length === 0 ? (
        <p className="mt-8 text-center text-label text-text-3">No machines in this room yet.</p>
      ) : (
        <div className="mt-3">
          <KindFilter>
            {[
              { kind: "dryer", title: "Dryers", list: dryers },
              { kind: "washer", title: "Washers", list: washers },
            ].map((sec) =>
              sec.list.length ? (
                <section
                  key={sec.kind}
                  aria-label={sec.title}
                  className={`mt-3 ${sec.kind === "dryer" ? "group-data-[filter=washer]/filter:hidden" : "group-data-[filter=dryer]/filter:hidden"}`}
                >
                  <h2 className="mb-2 text-caption uppercase tracking-wide text-text-3">{sec.title}</h2>
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {sec.list.map((m, i) => (
                      <MachineCard key={m.id} m={m} now={now} index={i} />
                    ))}
                  </ul>
                </section>
              ) : null,
            )}
          </KindFilter>
        </div>
      )}

      <p className="mt-10 flex items-center justify-center gap-2 text-center text-label text-text-3">
        <QrIcon /> Scan the sticker on a machine to report how it went.
      </p>
    </Page>
  );
}
