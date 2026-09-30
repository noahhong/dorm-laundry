import { AppHeader } from "@/components/chrome";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader />
      {children}
    </>
  );
}
