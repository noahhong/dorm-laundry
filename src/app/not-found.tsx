import Link from "next/link";
import { AppHeader, Page } from "@/components/chrome";
import { StatusIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <>
    <AppHeader />
    <Page className="grid place-items-center text-center">
      <div className="mt-16">
        <StatusIcon level="unknown" size={48} className="mx-auto text-unknown-icon" />
        <h1 className="mt-3 text-title">Not found</h1>
        <p className="mt-1 text-body text-text-2">That machine or room isn&apos;t in our list. The sticker may be out of date.</p>
        <Link href="/" className="pressable mt-5 inline-flex h-12 items-center rounded-[14px] bg-accent px-5 text-headline text-accent-fg">
          See all rooms
        </Link>
      </div>
    </Page>
    </>
  );
}
