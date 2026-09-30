"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="pressable h-11 rounded-[10px] bg-accent px-4 text-label font-semibold text-accent-fg">
      Print
    </button>
  );
}
