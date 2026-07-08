// Shared page scaffold. Every authenticated screen uses these so the app reads
// as ONE product: one container width system, one page-title treatment, one
// stat-tile, one section card. Before this existed, every route hand-rolled its
// own <header>/<h1>/container — the source of the "different fonts and screens"
// incoherence.
import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

type ContainerSize = "default" | "wide" | "reading" | "form";

const SIZE_CLASS: Record<ContainerSize, string> = {
  default: "max-w-6xl",
  wide: "max-w-7xl",
  reading: "max-w-3xl",
  form: "max-w-2xl",
};

/** Standard content column: one width scale, one padding, one vertical rhythm. */
export function PageContainer({
  size = "default",
  className,
  children,
}: {
  size?: ContainerSize;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn("mx-auto w-full space-y-6 px-4 py-8 sm:px-6", SIZE_CLASS[size], className)}
    >
      {children}
    </section>
  );
}

/**
 * The one page-title block. Eyebrow (with the signature amber tick), a serif
 * title, an optional description, and a right-aligned actions slot. This is the
 * SINGLE source of a page's title — the top bar no longer repeats it.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}
    >
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <span aria-hidden className="h-2.5 w-2.5 rounded-[3px] bg-brand" />
            {eyebrow}
          </div>
        )}
        <h1 className="font-display text-3xl leading-tight tracking-tight text-foreground">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
    </div>
  );
}

type Tone = "default" | "success" | "warning" | "danger" | "info" | "brand";

const TONE_CLASS: Record<Tone, string> = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
  info: "text-info",
  brand: "text-brand",
};

/** One metric tile. Eyebrow label + icon, a big tabular number, a sub-label. */
export function StatCard({
  label,
  value,
  sublabel,
  icon: Icon,
  tone = "default",
  className,
}: {
  label: string;
  value: ReactNode;
  sublabel?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border bg-card p-4 shadow-sm", className)}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </div>
      <div
        className={cn("mt-2 text-2xl font-semibold tabular-nums leading-none", TONE_CLASS[tone])}
      >
        {value}
      </div>
      {sublabel && <div className="mt-1.5 text-xs text-muted-foreground">{sublabel}</div>}
    </div>
  );
}

/** Responsive grid for StatCards. Defaults to 4-up on large screens. */
export function StatGrid({
  columns = 4,
  className,
  children,
}: {
  columns?: 2 | 3 | 4;
  className?: string;
  children: ReactNode;
}) {
  const cols = {
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-2 lg:grid-cols-3",
    4: "sm:grid-cols-2 lg:grid-cols-4",
  }[columns];
  return <div className={cn("grid grid-cols-1 gap-3", cols, className)}>{children}</div>;
}

/** A titled content card. Uppercase eyebrow header + body. */
export function Section({
  title,
  actions,
  className,
  children,
}: {
  title: string;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("rounded-xl border bg-card p-5 shadow-sm", className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}
