import type { SVGProps } from "react";
import type { StatusLevel } from "@/lib/status";

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 20, props: P) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
  ...props,
});

/** Each status has its own silhouette so it reads without color (PLAN.md §9.2). */
export function StatusIcon({ level, size = 20, ...props }: P & { level: StatusLevel }) {
  switch (level) {
    case "works":
      return (
        <svg {...base(size, props)}>
          <circle cx="12" cy="12" r="9.5" fill="currentColor" stroke="none" />
          <path d="M7.5 12.5l3 3 6-6.5" stroke="var(--surface)" strokeWidth="2.4" />
        </svg>
      );
    case "caution":
      return (
        <svg {...base(size, props)}>
          <path d="M12 2.8 22 20.2H2L12 2.8Z" fill="currentColor" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12 9.5v4.5" stroke="var(--surface)" strokeWidth="2.4" />
          <circle cx="12" cy="17.2" r="1.3" fill="var(--surface)" stroke="none" />
        </svg>
      );
    case "broken":
      return (
        <svg {...base(size, props)}>
          <path d="M8.1 2.5h7.8l5.6 5.6v7.8l-5.6 5.6H8.1l-5.6-5.6V8.1z" fill="currentColor" stroke="none" />
          <path d="m8.8 8.8 6.4 6.4m0-6.4-6.4 6.4" stroke="var(--surface)" strokeWidth="2.4" />
        </svg>
      );
    default:
      return (
        <svg {...base(size, props)}>
          <circle cx="12" cy="12" r="9" strokeDasharray="3.2 2.6" strokeWidth="1.8" />
          <path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2-2.4 3.4" strokeWidth="2" />
          <circle cx="12" cy="17" r="1.1" fill="currentColor" stroke="none" />
        </svg>
      );
  }
}

export const ThermometerIcon = ({ size = 16, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M14 14.8V4.5a2 2 0 0 0-4 0v10.3a4 4 0 1 0 4 0Z" />
    <path d="M12 17.5V11" />
  </svg>
);
export const WasherIcon = ({ size = 20, ...p }: P) => (
  <svg {...base(size, p)}>
    <rect x="4" y="2.5" width="16" height="19" rx="2.5" />
    <circle cx="12" cy="13.5" r="4.5" />
    <path d="M7.5 6h.01M10.5 6h.01" strokeWidth="2.5" />
    <path d="M9.5 14.5c1.2.8 3.8.8 5 0" />
  </svg>
);
export const DryerIcon = ({ size = 20, ...p }: P) => (
  <svg {...base(size, p)}>
    <rect x="4" y="2.5" width="16" height="19" rx="2.5" />
    <circle cx="12" cy="13.5" r="4.5" />
    <path d="M7.5 6h.01M10.5 6h.01" strokeWidth="2.5" />
    <path d="M11 11.5c-.8 1 .8 1.5 0 2.5m2.2-2.5c-.8 1 .8 1.5 0 2.5" strokeWidth="1.6" />
  </svg>
);
export const ChevronLeft = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="m15 18-6-6 6-6" />
  </svg>
);
export const ChevronRight = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="m9 18 6-6-6-6" />
  </svg>
);
export const StarIcon = ({ size = 14, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8z" fill="currentColor" strokeWidth="1.2" />
  </svg>
);
export const DropIcon = ({ size = 22, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M12 3.2s6 6.4 6 10.6a6 6 0 0 1-12 0c0-4.2 6-10.6 6-10.6Z" />
  </svg>
);
export const DropletsIcon = ({ size = 22, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M8 6.5s4 4.2 4 7a4 4 0 0 1-8 0c0-2.8 4-7 4-7Z" />
    <path d="M16.5 3s3 3.2 3 5.3a3 3 0 0 1-6 0C13.5 6.2 16.5 3 16.5 3Z" />
  </svg>
);
export const FlameIcon = ({ size = 22, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M12 21a6 6 0 0 0 6-6c0-4-3-6-3.5-9.5C12 7 10 9.5 10 12c-1-.5-1.8-1.6-2-3-1.3 1.4-2 3.5-2 6a6 6 0 0 0 6 6Z" />
  </svg>
);
export const ScissorsIcon = ({ size = 22, ...p }: P) => (
  <svg {...base(size, p)}>
    <circle cx="6" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12" />
  </svg>
);
export const SunIcon = ({ size = 22, ...p }: P) => (
  <svg {...base(size, p)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
export const SparkleIcon = ({ size = 22, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M12 3v4m0 10v4M3 12h4m10 0h4M6.3 6.3l2.2 2.2m7 7 2.2 2.2m0-11.4-2.2 2.2m-7 7-2.2 2.2" />
  </svg>
);
export const XIcon = ({ size = 22, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);
export const CheckIcon = ({ size = 22, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
export const AlertIcon = ({ size = 16, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M12 3 22 20H2L12 3Z" />
    <path d="M12 10v4m0 3h.01" />
  </svg>
);
export const BellIcon = ({ size = 20, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);
export const ExternalIcon = ({ size = 14, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </svg>
);
export const QrIcon = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" />
  </svg>
);

export const ClockIcon = ({ size = 16, ...p }: P) => (
  <svg {...base(size, p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
