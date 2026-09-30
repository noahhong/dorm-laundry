import "server-only";
import QRCode from "qrcode";
import { headers } from "next/headers";

/** Absolute site origin for QR codes. Prefer PUBLIC_BASE_URL so printed stickers never point at a preview URL. */
export async function siteOrigin(): Promise<string> {
  const env = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "");
  if (env) return env;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export function machineUrl(origin: string, code: string) {
  return `${origin}/m/${code}?r=1`;
}

export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#000000", light: "#ffffff" } });
}
