"use client";

import { useState } from "react";

const OPTIONS = [
  { value: "all", label: "All" },
  { value: "washer", label: "Washers" },
  { value: "dryer", label: "Dryers" },
] as const;

/** Segmented control; filtering is pure CSS via the data-filter attribute, so no refetch. */
export function KindFilter({ children }: { children: React.ReactNode }) {
  const [filter, setFilter] = useState<(typeof OPTIONS)[number]["value"]>("all");
  return (
    <div data-filter={filter} className="group/filter">
      <div className="sticky top-0 z-10 -mx-4 bg-bg/85 px-4 py-2 backdrop-blur-md">
        <div role="radiogroup" aria-label="Show machines" className="grid grid-cols-3 rounded-[12px] bg-surface-2 p-1">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={filter === o.value}
              onClick={() => setFilter(o.value)}
              className={`pressable h-10 rounded-[9px] text-label font-semibold ${
                filter === o.value ? "bg-surface text-text shadow-e1" : "text-text-2 hover:text-text"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}
