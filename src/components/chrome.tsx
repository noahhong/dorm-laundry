import Link from "next/link";
import { getConfig } from "@/lib/config-server";
import { ChevronLeft } from "./icons";
import { ThemeToggle } from "./theme-toggle";

export async function AppHeader() {
  const { siteName, announcement } = await getConfig();
  return (
    <>
    <header className="no-print mx-auto flex w-full max-w-2xl items-center justify-between px-4 pt-3">
      <Link href="/" className="inline-flex h-11 items-center gap-2 text-label font-semibold text-text-2">
        <span className="grid h-7 w-7 place-items-center rounded-[9px] bg-accent text-[13px] font-bold text-accent-fg" aria-hidden>
          DL
        </span>
        <span className="truncate">{siteName}</span>
      </Link>
      <div className="flex items-center">
        <ThemeToggle />
        <Link href="/about" className="inline-flex h-11 items-center px-2 text-label text-text-3 hover:text-text">
          About
        </Link>
      </div>
    </header>
    {announcement && (
      <div role="status" className="no-print mx-auto mt-2 w-full max-w-2xl px-4">
        <p className="rounded-[12px] border border-caution-icon/40 bg-caution-tint px-3.5 py-2.5 text-label font-medium text-caution-fg">{announcement}</p>
      </div>
    )}
    </>
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="-ml-1.5 inline-flex h-10 items-center gap-0.5 rounded-lg pr-2 text-label text-text-2 hover:text-text">
      <ChevronLeft />
      <span className="truncate">{children}</span>
    </Link>
  );
}

export function Page({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <main className={`mx-auto w-full max-w-2xl flex-1 px-4 pb-16 ${className}`}>{children}</main>;
}
