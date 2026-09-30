// The resident's last "What's in your load?" picks, kept on their phone only (never sent until they report).
// Shared by the machine page's load picker and the report sheet, which pre-fills them.

import { FABRICS, THICKNESSES, type Fabric, type Thickness } from "./labels";
import type { LoadInput } from "./load-advice";

const KEY = "dl:load";
const EVENT = "dl:load";
const SIZES = ["small", "medium", "full", "overstuffed"] as const;

/** Raw stored string, so useSyncExternalStore gets a stable snapshot. */
export function readLoadRaw(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function parseLoad(raw: string | null): LoadInput {
  try {
    const v = raw ? JSON.parse(raw) : null;
    const fabrics = Array.isArray(v?.fabrics) ? (v.fabrics as unknown[]).filter((f): f is Fabric => FABRICS.includes(f as Fabric)) : [];
    const size = SIZES.includes(v?.size) ? (v.size as LoadInput["size"]) : null;
    const thickness = THICKNESSES.includes(v?.thickness) ? (v.thickness as Thickness) : null;
    return { fabrics, size, thickness };
  } catch {
    return { fabrics: [], size: null, thickness: null };
  }
}

export function writeLoad(load: LoadInput) {
  try {
    if (load.fabrics.length === 0 && !load.size && !load.thickness) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(load));
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeLoad(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
