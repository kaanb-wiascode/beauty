"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cx } from "@/lib/format";

export function FinanceMetric({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  const tones = {
    neutral: "bg-[var(--surface-2)] text-[var(--muted)]",
    success: "bg-[var(--success-soft)] text-[var(--success)]",
    warning: "bg-[var(--warning-soft)] text-[var(--warning)]",
    danger: "bg-[var(--danger-soft)] text-[var(--danger)]",
    info: "bg-[var(--accent-soft)] text-[var(--accent)]",
  };

  return (
    <article className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_8px_24px_rgba(17,70,104,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-medium text-[var(--muted)]">{label}</p>
        <span aria-hidden="true" className={cx("h-2.5 w-2.5 rounded-full", tones[tone])} />
      </div>
      <div className="mt-2 text-[26px] font-semibold tracking-[-0.04em] text-[var(--ink)]">{value}</div>
      {detail ? <div className="mt-1 text-[10px] text-[var(--muted-soft)]">{detail}</div> : null}
    </article>
  );
}

export function FinancePanel({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--surface)] shadow-[0_10px_30px_rgba(17,70,104,0.04)]", className)}>
      <div className="flex flex-col gap-3 border-b border-[var(--line)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--ink)]">{title}</h2>
          {description ? <p className="mt-1 text-[11px] text-[var(--muted)]">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function FinanceTabs({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-1 rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-1.5">{children}</div>;
}

export function FinanceTab({
  active = false,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      {...props}
      type={props.type ?? "button"}
      className={cx(
        "rounded-[11px] px-3.5 py-2 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-soft)]",
        active
          ? "bg-[var(--ink)] text-white shadow-sm"
          : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function FinanceStatus({
  status,
  label,
  children,
}: {
  status: string;
  label?: ReactNode;
  children?: ReactNode;
}) {
  const tone =
    status === "MATCHED" || status === "PROCESSED"
      ? "bg-[var(--success-soft)] text-[var(--success)]"
      : status === "FAILED" || status === "DEAD_LETTER"
        ? "bg-[var(--danger-soft)] text-[var(--danger)]"
        : status === "RETRY_PENDING" || status === "ENRICHMENT_PENDING" || status === "PROCESSING"
          ? "bg-[var(--warning-soft)] text-[var(--warning)]"
          : "bg-[var(--surface-2)] text-[var(--muted)]";

  return <span className={cx("inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold", tone)}>{children ?? label ?? status}</span>;
}

export function FinanceEmpty({
  title,
  description,
  children,
}: {
  title?: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-[16px] border border-dashed border-[var(--line)] bg-[var(--surface-2)]/35 px-5 py-8 text-center">
      <p className="text-[12px] font-semibold text-[var(--ink)]">{children ?? title ?? "Kayıt bulunamadı."}</p>
      {description ? <p className="mx-auto mt-1 max-w-md text-[10px] leading-5 text-[var(--muted)]">{description}</p> : null}
    </div>
  );
}
