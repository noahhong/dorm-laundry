"use client";

import { useOptimistic, useState, useTransition } from "react";
import { voteOnReport } from "@/app/actions";
import type { VoteTally } from "@/lib/queries";

type Vote = "same" | "different";

/** Apply this browser's vote (or take it back) to the counts, the way the server will. */
function applyVote(t: VoteTally, vote: Vote): VoteTally {
  const next = { ...t };
  if (t.mine) next[t.mine] -= 1;
  if (t.mine === vote) return { ...next, mine: null };
  next[vote] += 1;
  return { ...next, mine: vote };
}

/** "Same here" / "Not for me" under someone else's report (PLAN.md §6.9). One tap, no login. */
export function ReportVotes({ reportId, votes, mine }: { reportId: string; votes: VoteTally; mine: boolean }) {
  const [shown, setOptimistic] = useOptimistic(votes, applyVote);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (mine) {
    return votes.same + votes.different > 0 ? <p className="mt-1 text-caption text-text-3">{summary(votes)}</p> : null;
  }

  const tap = (vote: Vote) =>
    startTransition(async () => {
      setError(null);
      setOptimistic(vote);
      const res = await voteOnReport({ reportId, vote });
      if (!res.ok) setError(res.error);
    });

  const btn = (vote: Vote, label: string, n: number) => {
    const on = shown.mine === vote;
    return (
      <button
        type="button"
        aria-pressed={on}
        disabled={pending}
        onClick={() => tap(vote)}
        className={`pressable inline-flex h-9 items-center gap-1 rounded-full border px-3 text-caption font-semibold ${
          on ? "border-accent bg-accent-tint text-accent" : "border-border bg-surface text-text-2 hover:text-text"
        }`}
      >
        {label}
        {n > 0 && <span className="tabular-nums">· {n}</span>}
      </button>
    );
  };

  return (
    <div className="mt-1.5">
      <div role="group" aria-label="Was it the same for you?" className="flex flex-wrap gap-1.5">
        {btn("same", "Same here", shown.same)}
        {btn("different", "Not for me", shown.different)}
      </div>
      {error && (
        <p role="alert" className="mt-1 text-caption text-broken-fg">
          {error}
        </p>
      )}
    </div>
  );
}

function summary(v: VoteTally) {
  const bits = [v.same ? `${v.same} said same here` : null, v.different ? `${v.different} said not for them` : null].filter(Boolean);
  return bits.join(" · ");
}
