import Link from "next/link";
import { AdminNav } from "@/components/admin/nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { isAdmin } from "@/lib/admin-auth";
import { getConfig } from "@/lib/config-server";
import { logout } from "./actions";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [admin, { siteName }] = await Promise.all([isAdmin(), getConfig()]);
  if (!admin) return <div className="mx-auto w-full max-w-md flex-1 px-4">{children}</div>;

  const brand = (
    <Link href="/admin" className="flex items-center gap-2 text-label font-semibold text-text">
      <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-accent text-[13px] font-bold text-accent-fg" aria-hidden>
        DL
      </span>
      <span className="min-w-0 truncate">{siteName}</span>
      <span className="shrink-0 rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-semibold text-text-2">Admin</span>
    </Link>
  );
  const actions = (
    <div className="flex flex-wrap items-center gap-1 lg:flex-col lg:items-stretch">
      <ThemeToggle />
      <Link href="/" className="inline-flex h-10 items-center whitespace-nowrap rounded-[10px] px-3 text-label text-text-2 hover:bg-surface-2 hover:text-text" target="_blank">
        View site ↗
      </Link>
      <form action={logout}>
        <button type="submit" className="inline-flex h-10 w-full items-center whitespace-nowrap rounded-[10px] px-3 text-label text-text-2 hover:bg-surface-2 hover:text-text">
          Log out
        </button>
      </form>
    </div>
  );

  return (
    <div className="flex min-h-full flex-1 flex-col lg:flex-row">
      {/* Desktop sidebar */}
      <aside className="no-print hidden w-64 shrink-0 flex-col justify-between border-r border-border bg-surface p-3 lg:flex">
        <div className="space-y-4">
          <div className="px-2 pt-1">{brand}</div>
          <AdminNav orientation="side" />
        </div>
        <div className="border-t border-border pt-2">{actions}</div>
      </aside>
      {/* Mobile top bar */}
      <header className="no-print sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          {brand}
        </div>
        <AdminNav orientation="top" />
      </header>
      <div className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-5 lg:px-8">{children}</div>
        <div className="no-print mx-auto flex max-w-6xl justify-end gap-2 px-4 pb-6 lg:hidden">{actions}</div>
      </div>
    </div>
  );
}
