import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink, Page } from "@/components/chrome";
import { DryerIcon, WasherIcon } from "@/components/icons";
import { PrintButton } from "@/components/print-button";
import { requireAdmin } from "@/lib/admin-auth";
import { machineUrl, qrSvg, siteOrigin } from "@/lib/qr";
import { getRoomById } from "@/lib/queries";

export const metadata: Metadata = { title: "QR sheet", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function QrSheet(props: PageProps<"/admin/rooms/[id]/qr">) {
  await requireAdmin();
  const { id } = await props.params;
  const data = await getRoomById(id);
  if (!data) notFound();
  const origin = await siteOrigin();
  const cards = await Promise.all(
    data.machines.map(async (m) => {
      const url = machineUrl(origin, m.code);
      return { m, url, svg: await qrSvg(url) };
    }),
  );
  const shortHost = origin.replace(/^https?:\/\//, "");

  return (
    <Page className="max-w-4xl print:max-w-none print:p-0">
      <div className="no-print mt-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <BackLink href={`/admin/rooms/${id}`}>{data.room.name}</BackLink>
          <h1 className="text-title">QR stickers</h1>
          <p className="text-label text-text-3">
            US Letter, 3 × 4 per page. Print at 100% scale, cut, and stick one on each machine near the controls.
          </p>
          {!process.env.PUBLIC_BASE_URL && (
            <p className="mt-1 text-label font-semibold text-caution-fg">
              PUBLIC_BASE_URL isn&apos;t set; codes point at {origin}. Set it before printing for real.
            </p>
          )}
        </div>
        <PrintButton />
      </div>

      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 print:mt-0 print:grid-cols-3 print:gap-[0.15in]">
        {cards.map(({ m, url, svg }) => (
          <li
            key={m.id}
            className="flex break-inside-avoid flex-col items-center rounded-[12px] border border-dashed border-neutral-400 bg-white p-3 text-center text-black print:h-[2.35in] print:justify-center print:rounded-none"
          >
            <div className="flex items-center gap-1.5 text-[17px] font-bold leading-tight">
              {m.kind === "dryer" ? <DryerIcon size={18} /> : <WasherIcon size={18} />}
              {m.label}
            </div>
            <div className="mt-1 w-[1.35in] max-w-full [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
            <div className="mt-1 text-[11px] font-semibold leading-tight">Broken? Best setting? Scan → 3 taps</div>
            <div className="text-[9px] leading-tight text-neutral-600">
              {shortHost}/m/{m.code}
            </div>
            <span className="sr-only">{url}</span>
          </li>
        ))}
      </ul>
    </Page>
  );
}
