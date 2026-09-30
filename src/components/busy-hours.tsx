"use client";

import { useState } from "react";
import { busyLevel, hourLabel, quietestWindow, type BusyLevel } from "@/lib/busy";
import { ClockIcon } from "./icons";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** Hours shown: 6am to midnight, when people actually do laundry. */
const FIRST = 6;
const LAST = 24;
const LEVEL_TEXT: Record<BusyLevel, string> = { quiet: "usually quiet", busy: "usually busy", packed: "usually packed" };

type Props = { share: number[][]; today: number; hour: number; runs: number };

/** "When is it busy?": a bar per hour for one weekday, from residents' "I started it" taps (PLAN.md §6.10). */
export function BusyHours({ share, today, hour, runs }: Props) {
  const [day, setDay] = useState(today);
  const row = share[day];
  // One scale for the whole week so switching days compares fairly; at least half the room so a quiet week looks quiet.
  const top = Math.max(0.5, ...share.flat());
  const isToday = day === today;
  const quiet = quietestWindow(row, isToday ? Math.max(FIRST, Math.min(hour + 1, LAST - 2)) : FIRST, LAST);
  const hours = Array.from({ length: LAST - FIRST }, (_, i) => FIRST + i);

  return (
    <section aria-labelledby="busy-hours" className="animate-fade-up mt-4 rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-e1">
      <h2 id="busy-hours" className="text-caption uppercase tracking-wide text-text-3">
        When is it busy?
      </h2>
      <p className="mt-1 flex items-center gap-1.5 text-headline text-text">
        <ClockIcon className="shrink-0 text-accent" />
        {isToday && hour >= FIRST ? `Right now: ${LEVEL_TEXT[busyLevel(row[hour])]}` : `${DAY_NAMES[day]}s`}
      </p>
      <p className="text-label text-text-2">
        {quiet
          ? `Quietest ${isToday ? "later today" : `on ${DAY_NAMES[day]}s`}: ${hourLabel(quiet.start)}–${hourLabel(quiet.end)}`
          : `Busy all ${isToday ? "evening" : "day"}. Try another day.`}
      </p>

      <div role="radiogroup" aria-label="Day" className="mt-3 grid grid-cols-7 gap-1 rounded-[12px] bg-surface-2 p-1">
        {DAYS.map((d, i) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={day === i}
            onClick={() => setDay(i)}
            className={`pressable h-9 rounded-[9px] text-caption font-semibold ${day === i ? "bg-surface text-text shadow-e1" : "text-text-2"}`}
          >
            {i === today ? "Today" : d}
          </button>
        ))}
      </div>

      <ul aria-label={`Busy hours, ${DAY_NAMES[day]}`} className="mt-5 flex h-24 items-end gap-[2px]">
        {hours.map((h) => {
          const v = row[h];
          const now = isToday && h === hour;
          const label = `${hourLabel(h)}: ${LEVEL_TEXT[busyLevel(v)].replace("usually ", "")}, about ${Math.round(v * 100)}% of machines in use`;
          return (
            <li key={h} title={label} aria-label={label} className="group flex h-full flex-1 items-end">
              <span
                className={`relative block w-full rounded-t-[4px] ${now ? "bg-accent" : "bg-accent/45 group-hover:bg-accent/70"}`}
                style={{ height: `${Math.max(3, (v / top) * 100)}%` }}
              >
                {now && <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-accent">now</span>}
              </span>
            </li>
          );
        })}
      </ul>
      <div aria-hidden className="mt-1 flex justify-between text-caption text-text-3">
        {[6, 9, 12, 15, 18, 21, 24].map((h) => (
          <span key={h}>{hourLabel(h)}</span>
        ))}
      </div>
      <p className="mt-2 text-caption text-text-3">From {runs} “I started it” taps in the last few weeks. Tap “I started it” on a machine to make this better.</p>
    </section>
  );
}
