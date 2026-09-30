import type { Metadata, Viewport } from "next";
import { getConfig } from "@/lib/config-server";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const { siteName, tagline } = await getConfig();
  return {
    title: { default: siteName, template: `%s · ${siteName}` },
    description: `${tagline} Crowdsourced by residents.`,
    applicationName: siteName,
  };
}

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
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col font-sans text-body">
        {children}
      </body>
    </html>
  );
}
