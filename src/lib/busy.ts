// Busy hours: how full the room usually is at each hour of the week, from residents' "I started it" taps.
// Pure: no DB, no Date.now(). See PLAN.md §6.10.

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export interface BusyRun {
  startedAt: number;
  endsAt: number;
  /** Set when the timer was stopped early or replaced. */
  endedAt: number | null;
}

export interface BusyWeek {
  /** [day 0 = Sunday … 6][hour 0–23]: average share of the room's machines running, 0–1. */
  share: number[][];
  /** Runs the averages are built from. */
  runs: number;
  /** Local day of week and hour for `now`. */
  today: number;
  hour: number;
}

/** Minutes to add to UTC to get local time in `timeZone` at `at` (falls back to UTC for an unknown zone). */
export function tzOffsetMinutes(at: number, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    }).formatToParts(new Date(at));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    const local = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
    return Math.round((local - Math.floor(at / MIN) * MIN) / MIN);
  } catch {
    return 0;
  }
}

/**
 * Average share of machines in use per weekday and hour over the last `weeks` weeks (or since the first run, if
 * sooner). Each run counts from its start until it was stopped or its estimate ran out, split across the hours it
 * spans in the room's time zone.
 */
export function busyWeek(runs: readonly BusyRun[], machineCount: number, now: number, timeZone: string, weeks: number): BusyWeek {
  const share = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  const nowOffset = tzOffsetMinutes(now, timeZone) * MIN;
  const nowLocal = new Date(now + nowOffset);
  const today = nowLocal.getUTCDay();
  const hour = nowLocal.getUTCHours();
  const since = now - weeks * 7 * DAY;
  const counted = runs.filter((r) => r.startedAt >= since && r.startedAt < now);
  if (counted.length === 0 || machineCount <= 0) return { share, runs: 0, today, hour };

  for (const r of counted) {
    const offset = tzOffsetMinutes(r.startedAt, timeZone) * MIN;
    const end = Math.min(r.endedAt ?? r.endsAt, r.endsAt, now);
    // Walk the run hour by hour in local time.
    let t = r.startedAt + offset;
    const stop = end + offset;
    while (t < stop) {
      const next = Math.min(stop, Math.floor(t / HOUR) * HOUR + HOUR);
      const d = new Date(t);
      share[d.getUTCDay()][d.getUTCHours()] += (next - t) / HOUR;
      t = next;
    }
  }

  // How many of each weekday the window covers, so a room with two weeks of data isn't averaged over four.
  const first = Math.min(...counted.map((r) => r.startedAt));
  const seen = new Array<number>(7).fill(0);
  const firstDay = Math.floor((Math.max(since, first) + tzOffsetMinutes(first, timeZone) * MIN) / DAY);
  const lastDay = Math.floor((now + nowOffset) / DAY);
  for (let d = firstDay; d <= lastDay; d++) seen[new Date(d * DAY).getUTCDay()] += 1;
  share.forEach((row, dow) => {
    for (let h = 0; h < 24; h++) row[h] = Math.min(1, row[h] / Math.max(1, seen[dow]) / machineCount);
  });
  return { share, runs: counted.length, today, hour };
}

export type BusyLevel = "quiet" | "busy" | "packed";

export function busyLevel(share: number): BusyLevel {
  if (share >= 0.6) return "packed";
  if (share >= 0.25) return "busy";
  return "quiet";
}

/** "9am", "12pm", "10pm". */
export function hourLabel(h: number): string {
  const n = h % 12 === 0 ? 12 : h % 12;
  return `${n}${h < 12 || h === 24 ? "am" : "pm"}`;
}

/**
 * The quietest stretch of at least `span` hours between `from` and `to` (local hours, `to` exclusive) on one day,
 * or null when every hour is busy. Ties go to the earliest.
 */
export function quietestWindow(day: readonly number[], from: number, to: number, span = 2): { start: number; end: number } | null {
  let best: { start: number; end: number; avg: number } | null = null;
  for (let s = from; s + span <= to; s++) {
    const avg = day.slice(s, s + span).reduce((a, b) => a + b, 0) / span;
    if (!best || avg < best.avg - 1e-9) best = { start: s, end: s + span, avg };
  }
  return best && busyLevel(best.avg) !== "packed" ? { start: best.start, end: best.end } : null;
}
