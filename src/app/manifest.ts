import type { MetadataRoute } from "next";
import { getConfig } from "@/lib/config-server";

export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { siteName, tagline } = await getConfig();
  return {
    name: siteName,
    short_name: siteName.length > 12 ? siteName.slice(0, 12).trim() : siteName,
    description: tagline,
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: "#2e5bff",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png" },
      { src: "/pwa-icon/512-maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
