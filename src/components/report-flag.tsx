"use client";

import { useState, useTransition } from "react";
import { flagReport, unflagReport } from "@/app/actions";
import { FLAG_REASONS, FLAG_REASON_LABEL, type FlagReason } from "@/lib/flags";

/** "Flag" under someone else's report (PLAN.md §19): pick a reason, and an admin takes a look. No login. */
export function ReportFlag({ reportId, flagged: initial }: { reportId: string; flagged: boolean }) {
  const [flagged, setFlagged] = useState(initial);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const flag = (reason: FlagReason) =>
    startTransition(async () => {
      setError(null);
      const res = await flagReport({ reportId, reason });
      if (res.ok) {
        setFlagged(true);
        setOpen(false);
      } else setError(res.error);
    });
  const undo = () =>
    startTransition(async () => {
      setError(null);
      const res = await unflagReport(reportId);
      if (res.ok) setFlagged(false);
      else setError(res.error);
    });

  const link = "inline-flex h-9 items-center text-caption font-semibold text-text-3 hover:text-text disabled:opacity-60";
  return (
    <div className="mt-1" aria-live="polite">
      {flagged ? (
        <p className="flex flex-wrap items-center gap-x-2 text-caption text-text-3">
          <span>Flagged. Thanks, an admin will take a look.</span>
          <button type="button" onClick={undo} disabled={pending} className={link}>
            Undo
          </button>
        </p>
      ) : open ? (
        <div role="group" aria-label="What's wrong with this report?" className="mt-1 rounded-[12px] border border-border bg-surface-2 p-2">
          <p className="px-1 pb-1.5 text-caption font-semibold text-text-2">What&apos;s wrong with this report?</p>
          <div className="flex flex-wrap gap-1.5">
            {FLAG_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                disabled={pending}
                onClick={() => flag(r)}
                className="pressable inline-flex h-9 items-center rounded-full border border-border bg-surface px-3 text-caption font-semibold text-text disabled:opacity-60"
              >
                {FLAG_REASON_LABEL[r]}
              </button>
            ))}
            <button type="button" onClick={() => setOpen(false)} className={`${link} px-2`}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className={link} aria-label="Flag this report">
          Flag
        </button>
      )}
      {error && (
        <p role="alert" className="mt-1 text-caption text-broken-fg">
          {error}
        </p>
      )}
    </div>
  );
}
