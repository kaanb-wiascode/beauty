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
        "glass-elevated flex items-start justify-between gap-4 rounded-[18px] px-4 py-3.5 text-sm leading-6",
        isError
          ? "border-[rgba(211,86,114,0.16)] bg-[rgba(255,245,248,0.80)] text-[#8f3e52]"
          : "border-[rgba(31,157,111,0.14)] bg-[rgba(241,252,247,0.82)] text-[#277a5c]",
      )}
    >
      <p>{children}</p>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="Uyarıyı kapat"
          className="shrink-0 rounded-[10px] px-2 py-1 text-xs font-medium text-current opacity-60 transition hover:bg-black/[0.035] hover:opacity-100 focus-visible:ring-4 focus-visible:ring-[var(--accent-soft)]"
        >
          Kapat
        </button>
      ) : null}
    </div>
  );
}

export function Spinner({ label = "Yükleniyor..." }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center justify-center gap-4 py-20 text-[var(--muted)]">
      <span aria-hidden="true" className="h-7 w-7 animate-spin rounded-full border-[1.5px] border-[rgba(118,87,232,0.12)] border-t-[var(--accent)] shadow-[0_0_0_6px_rgba(118,87,232,0.04)]" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 max-w-2xl">
        <h1 className="text-[32px] font-semibold leading-[1.08] tracking-[-0.045em] text-[var(--ink)] sm:text-[40px]">{title}</h1>
        {description ? <p className="mt-2 text-[14px] leading-6 text-[var(--muted)] sm:text-[15px]">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" };

export function Button({ children, type = "button", variant = "primary", disabled, className, ...props }: ButtonProps) {
  const variants = {
    primary: "border border-[rgba(118,87,232,0.10)] bg-gradient-to-br from-[#7c5df0] to-[#6948db] text-white shadow-[0_10px_24px_rgba(118,87,232,0.20)] hover:-translate-y-px hover:shadow-[0_14px_28px_rgba(118,87,232,0.23)]",
    secondary: "border border-[rgba(92,74,148,0.10)] bg-[rgba(255,255,255,0.72)] text-[var(--ink)] shadow-[0_5px_16px_rgba(67,52,118,0.05)] hover:bg-white",
    ghost: "text-[var(--muted)] hover:bg-[rgba(118,87,232,0.06)] hover:text-[var(--accent)]",
    danger: "border border-[rgba(211,86,114,0.10)] bg-[rgba(255,245,248,0.72)] text-[#b2455f] hover:bg-[rgba(211,86,114,0.10)]",
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
    >{children}</button>
  );
}

export function Field({ label, children, required }: { label: string; children: ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[12px] font-medium tracking-[-0.01em] text-[var(--muted)]">
        {label}{required ? <span className="ml-1 text-[var(--accent)]" aria-hidden="true">*</span> : null}
      </span>
      {children}
    </label>
  );
}

export function TextInput({ "aria-invalid": ariaInvalid, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} aria-invalid={ariaInvalid} className={cx("control", ariaInvalid && "border-[rgba(211,86,114,0.30)] focus:border-[rgba(211,86,114,0.45)] focus:ring-[rgba(211,86,114,0.09)]", props.className)} />;
}

export function TextArea({ "aria-invalid": ariaInvalid, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} aria-invalid={ariaInvalid} className={cx("control resize-none", ariaInvalid && "border-[rgba(211,86,114,0.30)] focus:border-[rgba(211,86,114,0.45)] focus:ring-[rgba(211,86,114,0.09)]", props.className)} />;
}

export function Select({ "aria-invalid": ariaInvalid, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} aria-invalid={ariaInvalid} className={cx("control appearance-none", ariaInvalid && "border-[rgba(211,86,114,0.30)] focus:border-[rgba(211,86,114,0.45)] focus:ring-[rgba(211,86,114,0.09)]", props.className)} />;
}

export function Dropdown(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <Select {...props} />;
}

export function StatusBadge({ status, label }: { status: string; label: string }) {
  const tone = status === "ACTIVE" || status === "CONFIRMED" || status === "COMPLETED"
    ? "bg-[var(--success-soft)] text-[#19785a] border-[rgba(31,157,111,0.10)]"
    : status === "SCHEDULED"
      ? "bg-[rgba(118,87,232,0.07)] text-[var(--accent)] border-[rgba(118,87,232,0.10)]"
      : status === "CANCELLED" || status === "ARCHIVED" || status === "NO_SHOW"
        ? "bg-[var(--danger-soft)] text-[#b2455f] border-[rgba(211,86,114,0.10)]"
        : "bg-[rgba(92,74,148,0.05)] text-[var(--muted)] border-[rgba(92,74,148,0.08)]";
  return <span className={cx("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium", tone)}><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{label}</span>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="px-6 py-20 text-center">
      <div aria-hidden="true" className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-[18px] border border-[rgba(118,87,232,0.10)] bg-[linear-gradient(145deg,rgba(118,87,232,0.10),rgba(22,160,123,0.08))] text-[var(--accent)] shadow-[0_10px_28px_rgba(67,52,118,0.06)]">
        <span className="h-2.5 w-2.5 rounded-full bg-current shadow-[0_0_0_7px_rgba(118,87,232,0.08)]" />
      </div>
      <h3 className="text-[17px] font-semibold tracking-[-0.02em] text-[var(--ink)]">{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--muted)]">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Pagination({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (page: number) => void }) {
  if (totalPages <= 1) return null;
  return <div className="flex items-center justify-between gap-3 px-5 py-4 text-sm text-[var(--muted)]"><span>Sayfa {page} / {totalPages}</span><div className="flex gap-2"><Button variant="secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Önceki</Button><Button variant="secondary" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Sonraki</Button></div></div>;
}

export function Panel({ children }: { children: ReactNode }) {
  return <section className="surface overflow-hidden rounded-[24px]">{children}</section>;
}

export function GlassCard({ children, className }: { children: ReactNode; className?: string }) {
  return <article className={cx("glass-elevated rounded-[24px] p-7", className)}>{children}</article>;
}

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto"><table className="data-table min-w-full text-left text-[14px]">{children}</table></div>;
}

export function Th({ children }: { children: ReactNode }) {
  return <th scope="col" className="whitespace-nowrap px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">{children}</th>;
}

export function Td({ children, className, label, actions }: { children: ReactNode; className?: string; label?: string; actions?: boolean }) {
  return <td data-label={label} className={cx("whitespace-nowrap px-5 py-4 text-[var(--ink)]", actions && "td-actions", className)}>{children}</td>;
}

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return <span className="group relative inline-flex">{children}<span role="tooltip" className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-[10px] bg-[#27243a] px-2.5 py-1.5 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity duration-[180ms] group-hover:opacity-100 group-focus-within:opacity-100">{label}</span></span>;
}

export function IconButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={cx("inline-flex h-10 w-10 items-center justify-center rounded-full border border-transparent bg-white/54 text-[var(--ink)] transition hover:border-[rgba(118,87,232,0.09)] hover:bg-white/84 hover:text-[var(--accent)] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40", "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-soft)]", className)} />;
}

export function Modal({ open, onClose, title, description, children }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(73,60,110,0.12)] p-4 backdrop-blur-[8px]" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="glass-elevated max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-[24px] border-white/80 p-6 shadow-[0_28px_90px_rgba(67,52,118,0.18)]">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div><h2 className="text-[20px] font-semibold tracking-[-0.03em] text-[var(--ink)]">{title}</h2>{description ? <p className="mt-1.5 text-[13px] leading-5 text-[var(--muted)]">{description}</p> : null}</div>
          <button type="button" onClick={onClose} aria-label="Kapat" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[20px] text-[var(--muted)] transition hover:bg-white/70 hover:text-[var(--accent)]">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
