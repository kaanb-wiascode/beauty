"use client";

import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";

import { cx } from "@/lib/format";

export function DataView({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        "overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)] shadow-[0_10px_30px_rgba(17,70,104,0.045)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function DataViewToolbar({
  search,
  actions,
  filters,
}: {
  search: ReactNode;
  actions?: ReactNode;
  filters?: ReactNode;
}) {
  return (
    <div className="border-b border-[var(--line)] px-4 py-4 sm:px-5 sm:py-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">{search}</div>

        {actions ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            {actions}
          </div>
        ) : null}
      </div>

      {filters ? (
        <div className="mt-3 flex flex-wrap gap-2 sm:mt-4">
          {filters}
        </div>
      ) : null}
    </div>
  );
}

export function SearchField({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={cx("relative block", className)}>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-3.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center text-[var(--muted-soft)]"
      >
        <SearchIcon />
      </span>

      <input
        {...props}
        type={props.type ?? "search"}
        className={cx(
          "h-11 w-full rounded-[14px] border border-transparent bg-[var(--surface-2)]/70 pl-11 pr-10 text-[13px] text-[var(--ink)] outline-none transition",
          "placeholder:text-[var(--muted-soft)] hover:bg-[var(--surface-2)] focus:border-[rgba(22,116,189,.22)] focus:bg-white focus:ring-4 focus:ring-[var(--accent-soft)]",
          props.className,
        )}
      />

      {props.value ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[9px] font-medium text-[var(--muted-soft)]"
        >
          ESC
        </span>
      ) : null}
    </label>
  );
}

export function ToolbarSelect({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className={cx("relative inline-flex", className)}>
      <select
        {...props}
        className={cx(
          "h-10 min-w-[132px] appearance-none rounded-[12px] border border-[var(--line)] bg-[var(--surface)] px-3 pr-8 text-[11px] font-medium text-[var(--muted)] outline-none transition",
          "hover:bg-[var(--surface-2)] focus:border-[rgba(22,116,189,.20)] focus:text-[var(--ink)] focus:ring-4 focus:ring-[var(--accent-soft)]",
          props.className,
        )}
      >
        {children}
      </select>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-[var(--muted-soft)]"
      >
        ▾
      </span>
    </label>
  );
}

export function FilterChip({
  active = false,
  count,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  count?: number;
}) {
  return (
    <button
      {...props}
      type={props.type ?? "button"}
      className={cx(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-40",
        active
          ? "border-[var(--ink)] bg-[var(--ink)] text-white"
          : "border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:border-[rgba(22,116,189,.18)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]",
        className,
      )}
    >
      <span>{children}</span>
      {typeof count === "number" ? (
        <span
          className={cx(
            "rounded-full px-1.5 py-0.5 text-[9px] leading-none",
            active
              ? "bg-white/15 text-white"
              : "bg-[var(--surface-2)] text-[var(--muted-soft)]",
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

export function ToolbarButton({
  active = false,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
}) {
  return (
    <button
      {...props}
      type={props.type ?? "button"}
      className={cx(
        "inline-flex h-10 items-center justify-center gap-2 rounded-[12px] border px-3 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-40",
        active
          ? "border-[rgba(22,116,189,.18)] bg-[var(--accent-soft)] text-[var(--accent)]"
          : "border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function DataViewMeta({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] bg-[var(--surface-2)]/30 px-4 py-3 text-[10px] text-[var(--muted)] sm:px-5">
      {children}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
