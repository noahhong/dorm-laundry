import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dorm Laundry",
    short_name: "Laundry",
    description: "Which laundry machines work, and the dryer setting that won't wreck your clothes.",
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
