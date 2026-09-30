import type { Metadata, Viewport } from "next";
import { AppHeader } from "@/components/chrome";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Dorm Laundry", template: "%s · Dorm Laundry" },
  description: "Which laundry machines work, and the dryer setting that won't wreck your clothes. Crowdsourced by residents.",
  applicationName: "Dorm Laundry",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d10" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans text-body">
        <AppHeader />
        {children}
      </body>
    </html>
  );
}
