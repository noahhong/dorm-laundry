import { Page } from "@/components/chrome";

export default function Loading() {
  return (
    <Page>
      <div className="mt-2 space-y-3" aria-busy="true" aria-label="Loading machine">
        <span className="skeleton block h-4 w-40" />
        <span className="skeleton block h-7 w-32" />
        <span className="skeleton block h-32 rounded-[var(--radius-lg)]" />
        <span className="skeleton block h-64 rounded-[var(--radius-lg)]" />
        <span className="skeleton block h-40 rounded-[var(--radius-lg)]" />
      </div>
    </Page>
  );
}
