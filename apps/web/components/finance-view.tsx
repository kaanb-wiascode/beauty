"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

import { CardInfo } from "@/components/card-info";
import { getCardHelp } from "@/lib/card-help";
import { cx } from "@/lib/format";
import { userLabel } from "@/lib/user-language";

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
    <article className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_7px_22px_rgba(17,70,104,0.04)] sm:rounded-[20px] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-medium text-[var(--muted)]">{label}</p>
        <div className="flex shrink-0 items-center gap-2">
          <span aria-hidden="true" className={cx("h-2.5 w-2.5 rounded-full", tones[tone])} />
          <CardInfo help={getCardHelp(label, typeof detail === "string" ? detail : undefined)} />
        </div>
      </div>
      <div className="mt-1.5 text-[23px] font-semibold tracking-[-0.04em] text-[var(--ink)] sm:mt-2 sm:text-[26px]">{value}</div>
      {detail ? <div className="mt-1 text-[11px] text-[var(--muted-soft)]">{detail}</div> : null}
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
    <section className={cx("overflow-hidden rounded-[16px] border border-[var(--line)] bg-[var(--surface)] shadow-[0_7px_22px_rgba(17,70,104,0.04)] sm:rounded-[22px]", className)}>
      <div className="flex flex-col gap-2.5 border-b border-[var(--line)] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--ink)]">{title}</h2>
            <CardInfo help={getCardHelp(title, description)} />
          </div>
          {description ? <p className="mt-1 text-[11px] text-[var(--muted)]">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

export function FinanceTabs({ children }: { children: ReactNode }) {
  return <div className="flex flex-nowrap gap-1 overflow-x-auto rounded-[14px] border border-[var(--line)] bg-[var(--surface)] p-1.5 sm:flex-wrap sm:rounded-[16px]">{children}</div>;
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
        "shrink-0 rounded-[10px] px-3 py-2 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-soft)]",
        active
          ? "border border-[rgba(22,116,189,.16)] bg-[var(--accent-soft)] text-[var(--accent)] shadow-[0_1px_4px_rgba(17,70,104,.08)]"
          : "border border-transparent text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]",
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

  const visibleLabel = children ?? (typeof label === "string" ? userLabel(label) : label) ?? userLabel(status);

  return <span className={cx("inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold", tone)}>{visibleLabel}</span>;
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
      <p className="text-[12px] font-semibold text-[var(--ink)]">{children ?? title ?? "Kayıt Bulunamadı."}</p>
      {description ? <p className="mx-auto mt-1 max-w-md text-[10px] leading-5 text-[var(--muted)]">{description}</p> : null}
    </div>
  );
}
