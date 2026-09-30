import { Page } from "@/components/chrome";
import { MachineCardSkeleton } from "@/components/machine-card";

export default function Loading() {
  return (
    <Page>
      <div className="mt-2 space-y-2" aria-busy="true" aria-label="Loading room">
        <span className="skeleton block h-4 w-28" />
        <span className="skeleton block h-7 w-44" />
        <div className="grid grid-cols-4 gap-2 pt-2">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="skeleton block h-14" />
          ))}
        </div>
        <span className="skeleton mt-3 block h-12" />
        <ul className="grid gap-3 pt-2 sm:grid-cols-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <MachineCardSkeleton key={i} />
          ))}
        </ul>
      </div>
    </Page>
  );
}
