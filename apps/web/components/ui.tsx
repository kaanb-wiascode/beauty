import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cx } from "@/lib/format";

export function Alert({
  tone = "error",
  children,
  onClose,
}: {
  tone?: "error" | "success";
  children: ReactNode;
  onClose?: () => void;
}) {
  const isError = tone === "error";

  return (
    <div
      role="alert"
      className={cx(
        "flex items-start justify-between gap-4 rounded-[20px] px-4 py-3.5 text-sm leading-6",
        isError
          ? "bg-[rgba(143,61,61,0.08)] text-[#7a3333]"
          : "bg-[rgba(47,122,86,0.10)] text-[#2d5c45]",
      )}
    >
      <p>{children}</p>

      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="Uyarıyı kapat"
          className="shrink-0 rounded-lg px-1 py-0.5 text-xs font-medium opacity-60 transition-opacity duration-[180ms] hover:opacity-100 focus-visible:opacity-100"
        >
          Kapat
        </button>
      ) : null}
    </div>
  );
}

export function Spinner({
  label = "Yükleniyor...",
}: {
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center gap-4 py-20 text-[var(--muted)]"
    >
      <span
        aria-hidden="true"
        className="h-7 w-7 animate-spin rounded-full border-[1.5px] border-[rgba(28,25,23,0.12)] border-t-[var(--accent)]"
      />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-5">
      <div className="min-w-0 max-w-xl">
        <h1 className="text-[30px] font-semibold leading-[1.08] tracking-[-0.035em] text-[var(--ink)] sm:text-[40px]">
          {title}
        </h1>

        {description ? (
          <p className="mt-2 text-[14px] leading-6 text-[var(--muted)] sm:text-[15px] sm:leading-7">
            {description}
          </p>
        ) : null}

        {action ? (
          <div className="mt-4 flex w-fit max-w-full sm:hidden">
            {action}
          </div>
        ) : null}
      </div>

      {action ? (
        <div className="hidden shrink-0 sm:block">
          {action}
        </div>
      ) : null}
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
};

export function Button({
  children,
  type = "button",
  variant = "primary",
  disabled,
  className,
  ...props
}: ButtonProps) {
  const variants = {
    primary:
      "border border-[#DED9D3] bg-[#F3F1EE] text-[#514A43] shadow-[0_2px_8px_rgba(81,74,67,0.06)] hover:bg-[#EAE7E3] active:bg-[#E4E0DB]",
    secondary:
      "bg-white/70 text-[var(--ink)] shadow-[inset_0_0_0_1px_var(--line)] hover:bg-white",
    ghost:
      "text-[var(--muted)] hover:bg-black/[0.04] hover:text-[var(--ink)]",
    danger:
      "text-[#8f3d3d] hover:bg-[rgba(143,61,61,0.08)] hover:text-[#7a3333]",
  };

  return (
    <button
      {...props}
      type={type}
      disabled={disabled}
      className={cx(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-[14px] px-4 py-2.5 text-[14px] font-medium tracking-[-0.01em] transition-[transform,background-color,border-color,opacity,color,box-shadow] duration-[180ms] [transition-timing-function:var(--ease-out)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100",
        "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-soft)]",
        variants[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[13px] font-medium text-[var(--muted)]">
        {label}
        {required ? (
          <span className="ml-1 text-[var(--accent)]" aria-hidden="true">
            *
          </span>
        ) : null}
      </span>
      {children}
    </label>
  );
}

export function TextInput({
  "aria-invalid": ariaInvalid,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      aria-invalid={ariaInvalid}
      className={cx(
        "control",
        ariaInvalid &&
          "border-[rgba(143,61,61,0.35)] focus:border-[rgba(143,61,61,0.45)] focus:ring-[rgba(143,61,61,0.10)]",
        props.className,
      )}
    />
  );
}

export function TextArea({
  "aria-invalid": ariaInvalid,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      aria-invalid={ariaInvalid}
      className={cx(
        "control resize-none",
        ariaInvalid &&
          "border-[rgba(143,61,61,0.35)] focus:border-[rgba(143,61,61,0.45)] focus:ring-[rgba(143,61,61,0.10)]",
        props.className,
      )}
    />
  );
}

export function Select({
  "aria-invalid": ariaInvalid,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      aria-invalid={ariaInvalid}
      className={cx(
        "control",
        ariaInvalid &&
          "border-[rgba(143,61,61,0.35)] focus:border-[rgba(143,61,61,0.45)] focus:ring-[rgba(143,61,61,0.10)]",
        props.className,
      )}
    />
  );
}

/**
 * Kept as a compatibility export for existing screens.
 * The actual control remains accessible native select for now.
 */
export function Dropdown(
  props: SelectHTMLAttributes<HTMLSelectElement>,
) {
  return <Select {...props} />;
}

export function StatusBadge({
  status,
  label,
}: {
  status: string;
  label: string;
}) {
  const tone =
    status === "ACTIVE" ||
    status === "CONFIRMED" ||
    status === "COMPLETED"
      ? "bg-[rgba(47,122,86,0.10)] text-[#2d5c45]"
      : status === "SCHEDULED"
        ? "bg-[rgba(90,112,140,0.12)] text-[#3d4d63]"
        : status === "CANCELLED" ||
            status === "ARCHIVED" ||
            status === "NO_SHOW"
          ? "bg-[rgba(143,61,61,0.08)] text-[#7a3333]"
          : "bg-black/[0.04] text-[var(--muted)]";

  return (
    <span
      className={cx(
        "inline-flex rounded-full px-2.5 py-1 text-[12px] font-medium tracking-[-0.01em]",
        tone,
      )}
    >
      {label}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="px-6 py-20 text-center">
      <div
        aria-hidden="true"
        className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]"
      >
        <span className="h-2.5 w-2.5 rounded-full bg-current" />
      </div>

      <h3 className="text-[17px] font-semibold tracking-[-0.02em] text-[var(--ink)]">
        {title}
      </h3>

      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--muted)]">
        {description}
      </p>

      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-3 px-5 py-4 text-sm text-[var(--muted)]">
      <span>
        Sayfa {page} / {totalPages}
      </span>

      <div className="flex gap-2">
        <Button
          variant="secondary"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Önceki
        </Button>

        <Button
          variant="secondary"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Sonraki
        </Button>
      </div>
    </div>
  );
}

export function Panel({ children }: { children: ReactNode }) {
  return (
    <section className="surface overflow-hidden rounded-[28px]">
      {children}
    </section>
  );
}

export function GlassCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <article
      className={cx(
        "glass-elevated rounded-[28px] p-7",
        className,
      )}
    >
      {children}
    </article>
  );
}

export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="data-table min-w-full text-left text-[14px]">
        {children}
      </table>
    </div>
  );
}

export function Th({ children }: { children: ReactNode }) {
  return (
    <th
      scope="col"
      className="whitespace-nowrap px-5 py-3.5 text-[12px] font-medium tracking-[0.04em] text-[var(--muted)]"
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  label,
  actions,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
  actions?: boolean;
}) {
  return (
    <td
      data-label={label}
      className={cx(
        "whitespace-nowrap px-5 py-4 text-[var(--ink)]",
        actions && "td-actions",
        className,
      )}
    >
      {children}
    </td>
  );
}

export function Tooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <span className="group relative inline-flex">
      {children}

      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[var(--ink)] px-2.5 py-1.5 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity duration-[180ms] group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}

export function IconButton({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--ink)] transition-[background-color,color,transform] duration-[180ms] hover:bg-black/[0.05] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40",
        "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-soft)]",
        className,
      )}
    />
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/25 p-4 backdrop-blur-[3px]"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[0_24px_80px_rgba(28,25,23,0.18)]">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[20px] font-semibold tracking-[-0.03em] text-[var(--ink)]">
              {title}
            </h2>

            {description ? (
              <p className="mt-1.5 text-[13px] leading-5 text-[var(--muted)]">
                {description}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[20px] text-[var(--muted)] transition-colors hover:bg-black/[0.05] hover:text-[var(--ink)]"
          >
            ×
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}
