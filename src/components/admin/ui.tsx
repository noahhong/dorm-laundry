import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 pb-4">
      <div className="min-w-0">
        <h1 className="text-title text-text">{title}</h1>
        {subtitle && <p className="mt-0.5 text-label text-text-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  className = "",
  flush = false,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  flush?: boolean;
  id?: string;
}) {
  return (
    <section aria-labelledby={id ? `${id}-h` : undefined} id={id} className={`min-w-0 rounded-[var(--radius-md)] border border-border bg-surface shadow-e1 ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-2 px-4 pt-4">
          <div>
            {title && (
              <h2 id={id ? `${id}-h` : undefined} className="text-headline text-text">
                {title}
              </h2>
            )}
            {description && <p className="mt-0.5 text-label text-text-3">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className={flush ? "mt-3" : "p-4"}>{children}</div>
    </section>
  );
}

const TONES = {
  works: "bg-works-tint text-works-fg border-works-icon/40",
  caution: "bg-caution-tint text-caution-fg border-caution-icon/40",
  broken: "bg-broken-tint text-broken-fg border-broken-icon/40",
  unknown: "bg-unknown-tint text-unknown-fg border-unknown-icon/40 border-dashed",
  accent: "bg-accent-tint text-accent border-accent/30",
  neutral: "bg-surface-2 text-text-2 border-border",
} as const;
export type Tone = keyof typeof TONES;

export function Pill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex h-6 items-center whitespace-nowrap rounded-full border px-2.5 text-caption font-semibold ${TONES[tone]}`}>{children}</span>;
}

export function Stat({ label, value, delta, hint, tone }: { label: string; value: ReactNode; delta?: number | null; hint?: ReactNode; tone?: Tone }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-surface p-4 shadow-e1">
      <p className="text-caption uppercase tracking-wide text-text-3">{label}</p>
      <p className={`mt-1 text-display ${tone === "broken" ? "text-broken-fg" : tone === "caution" ? "text-caution-fg" : tone === "works" ? "text-works-fg" : "text-text"}`}>{value}</p>
      <p className="mt-0.5 min-h-4 text-caption text-text-3">
        {delta !== undefined && delta !== null && (
          <span className={delta > 0 ? "font-semibold text-works-fg" : delta < 0 ? "font-semibold text-text-2" : ""}>
            {delta > 0 ? "▲" : delta < 0 ? "▼" : "•"} {Math.abs(delta)}{" "}
          </span>
        )}
        {hint}
      </p>
    </div>
  );
}

/** Table wrapper: horizontal scroll on phones, sticky header, zebra-free dense rows. */
export function Table({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table aria-label={label} className="w-full min-w-[560px] border-collapse text-label">
        {children}
      </table>
    </div>
  );
}
export const th = "whitespace-nowrap border-b border-border px-2 py-2 text-left text-caption font-semibold uppercase tracking-wide text-text-3";
export const td = "border-b border-border px-2 py-2.5 align-top";

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-[12px] border border-dashed border-border-strong/40 px-4 py-6 text-center text-label text-text-3">{children}</p>;
}

export function Pager({ page, pages, hrefFor }: { page: number; pages: number; hrefFor: (p: number) => string }) {
  if (pages <= 1) return null;
  const link = "pressable inline-flex h-10 items-center rounded-[10px] border border-border bg-surface px-3 text-label font-semibold";
  return (
    <nav aria-label="Pagination" className="mt-3 flex items-center justify-between gap-2">
      {page > 1 ? (
        <a className={link} href={hrefFor(page - 1)}>
          ← Newer
        </a>
      ) : (
        <span />
      )}
      <span className="text-label text-text-3">
        Page {page} of {pages}
      </span>
      {page < pages ? (
        <a className={link} href={hrefFor(page + 1)}>
          Older →
        </a>
      ) : (
        <span />
      )}
    </nav>
  );
}

export function BarChart({ data, label }: { data: { label: string; count: number }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const w = 560;
  const h = 140;
  const bw = w / data.length;
  return (
    <figure>
      <svg viewBox={`0 0 ${w} ${h + 22}`} role="img" aria-label={`${label}: ${data.map((d) => `${d.label} ${d.count}`).join(", ")}`} className="w-full">
        {[0.5, 1].map((f) => (
          <line key={f} x1="0" x2={w} y1={h - f * (h - 8)} y2={h - f * (h - 8)} stroke="var(--border)" strokeDasharray="3 4" />
        ))}
        {data.map((d, i) => {
          const bh = (d.count / max) * (h - 8);
          return (
            <g key={d.label}>
              <rect x={i * bw + bw * 0.16} y={h - bh} width={bw * 0.68} height={Math.max(bh, d.count ? 2 : 0)} rx="4" fill="var(--accent)" opacity={d.count ? 1 : 0.15} />
              {d.count > 0 && (
                <text x={i * bw + bw / 2} y={h - bh - 4} textAnchor="middle" fontSize="10" fill="var(--text-2)">
                  {d.count}
                </text>
              )}
              {i % 2 === 1 && (
                <text x={i * bw + bw / 2} y={h + 14} textAnchor="middle" fontSize="10" fill="var(--text-3)">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
