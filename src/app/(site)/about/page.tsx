import type { Metadata } from "next";
import { BackLink, Page } from "@/components/chrome";
import { StatusBadge } from "@/components/status";
import { getConfig } from "@/lib/config-server";
import { WASH_LINKS } from "@/lib/labels";

export const metadata: Metadata = { title: "About" };
export const dynamic = "force-dynamic";

export default async function About() {
  const { siteName } = await getConfig();
  return (
    <Page>
      <div className="mt-2">
        <BackLink href="/">Rooms</BackLink>
        <h1 className="text-title">How it works</h1>
      </div>
      <div className="mt-4 space-y-5 text-body text-text-2 [&_h2]:mb-1 [&_h2]:text-headline [&_h2]:text-text">
        <section>
          <h2>Residents report, everyone benefits</h2>
          <p>
            Each machine has a QR sticker. After your load, scan it and tap how it went. That&apos;s it: no account, no app.
            We combine recent reports into a status and, for dryers, the setting that actually dries without cooking your clothes.
          </p>
        </section>
        <section>
          <h2>What the statuses mean</h2>
          <ul className="mt-2 space-y-2">
            <li className="flex flex-wrap items-center gap-2"><StatusBadge level="works" /> Recent reports say it works.</li>
            <li className="flex flex-wrap items-center gap-2"><StatusBadge level="caution" /> Works, but runs hot, leaves clothes damp, or reports disagree.</li>
            <li className="flex flex-wrap items-center gap-2"><StatusBadge level="broken" /> Recent reports (or an admin) say it doesn&apos;t work. Skip it.</li>
            <li className="flex flex-wrap items-center gap-2"><StatusBadge level="unknown" /> No recent reports. Be the first!</li>
          </ul>
          <p className="mt-2">
            Newer reports count more; a report loses half its weight every 3 days. Each phone counts once per machine, so one
            person can&apos;t flood a status.
          </p>
        </section>
        <section>
          <h2>Why dryers differ</h2>
          <p>
            Identical-looking dryers can run very differently: clogged vents, thermostat drift, or gas vs electric. &ldquo;Medium&rdquo;
            might leave clothes damp on one and melt a waistband on the next. Spandex, nylon, athletic wear and printed shirts are the
            most heat-sensitive: when in doubt, go cooler and add time.
          </p>
        </section>
        <section>
          <h2>Refunds and repairs</h2>
          <p>
            We&apos;re students, not WASH. For refunds use the WASH-Connect app (Support → Request a Refund), the{" "}
            <a className="text-accent underline" href={WASH_LINKS.refundRequest} target="_blank" rel="noopener noreferrer">refund form</a>, or call{" "}
            {WASH_LINKS.refundPhoneLabel}. Report repairs with the{" "}
            <a className="text-accent underline" href={WASH_LINKS.serviceRequest} target="_blank" rel="noopener noreferrer">service request form</a>.
          </p>
        </section>
        <section>
          <h2>Privacy</h2>
          <p>
            No accounts. We set one random cookie so each phone counts once, and store only a hash of it. Your IP address is never
            stored; a daily-salted hash is kept for rate limiting. Notes you write are public, so please don&apos;t include names.
            If you use the laundry helper chat, what you type is sent to Anthropic&apos;s AI to answer it; we don&apos;t store it.
          </p>
        </section>
        <p className="rounded-[12px] bg-surface-2 p-3 text-label">
          {siteName} is an independent student project. It is not affiliated with WASH Multifamily Laundry Systems or any university.
        </p>
      </div>
    </Page>
  );
}
