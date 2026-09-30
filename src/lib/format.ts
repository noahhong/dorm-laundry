export function timeAgo(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.round(d / 30)}mo ago`;
}

export function timeAgoLong(ts: number, now = Date.now()): string {
  const short = timeAgo(ts, now);
  return short
    .replace(/(\d+) min ago/, (_, n) => `${n} minute${n === "1" ? "" : "s"} ago`)
    .replace(/(\d+)h ago/, (_, n) => `${n} hour${n === "1" ? "" : "s"} ago`)
    .replace(/(\d+)d ago/, (_, n) => `${n} day${n === "1" ? "" : "s"} ago`);
}

export function isoTime(ts: number) {
  return new Date(ts).toISOString();
}

export function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
