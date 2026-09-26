"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "./ui";
import { cx } from "@/lib/format";

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(["a[href]","button:not([disabled])","input:not([disabled])","select:not([disabled])","textarea:not([disabled])","[tabindex]:not([tabindex='-1'])"].join(",")));
}

export function Modal({
  title,
  description,
  open,
  onClose,
  children,
  size = "md",
}: {
  title: string;
  description?: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const [rendered, setRendered] = useState(open);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const isCustomerForm = title === "Yeni müşteri" || title === "Müşteriyi düzenle";
  const isStaffForm = title === "Yeni personel" || title === "Personeli düzenle";
  const sizeClass =
    size === "xl"
      ? "sm:max-w-[1120px]"
      : size === "lg" || isCustomerForm || isStaffForm
        ? "sm:max-w-[940px]"
        : size === "sm"
          ? "sm:max-w-md"
          : "sm:max-w-[680px]";

  useEffect(() => {
    if (open) {
      previousActiveElement.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setRendered(true);
      const frame = window.requestAnimationFrame(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        (getFocusableElements(dialog)[0] ?? dialog).focus();
      });
      return () => window.cancelAnimationFrame(frame);
    }
    const timeout = window.setTimeout(() => setRendered(false), 240);
    return () => window.clearTimeout(timeout);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab") return;
      const container = dialogRef.current;
      if (!container) return;
      const focusable = getFocusableElements(container);
      if (!focusable.length) { event.preventDefault(); container.focus(); return; }
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKeyDown); previousActiveElement.current?.focus(); previousActiveElement.current = null; };
  }, [open, onClose]);

  if (!rendered) return null;
  return (
    <div className={cx("fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6", open ? "animate-fade-in" : "pointer-events-none opacity-0")}>
      <button type="button" aria-label="Kapat" tabIndex={-1} className="absolute inset-0 cursor-default bg-[rgba(26,23,20,0.28)] backdrop-blur-[10px]" onClick={onClose} />
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} className={cx("glass-elevated relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[20px] sm:max-h-[92vh] sm:rounded-[var(--radius-dialog)]", sizeClass, open ? "animate-sheet-in sm:animate-rise-in" : "animate-sheet-out")}>
        <div className={cx("shrink-0 border-b border-[var(--line)] px-4 py-4 sm:px-7 sm:py-6", (isCustomerForm || isStaffForm || size === "lg" || size === "xl") && "sm:px-8")}>
          <div className="flex items-start justify-between gap-5">
            <div className="min-w-0">
              <h2 id={titleId} className="text-[18px] font-semibold tracking-[-0.03em] text-[var(--ink)] sm:text-[22px]">{title}</h2>
              {description ? <p id={descriptionId} className="mt-1 max-w-[760px] text-[12px] leading-5 text-[var(--muted)] sm:mt-1.5 sm:text-sm sm:leading-6">{description}</p> : null}
            </div>
            <button type="button" onClick={onClose} aria-label="Kapat" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] sm:h-[42px] sm:w-[42px] sm:rounded-[12px] border border-[var(--line)] bg-white text-[20px] leading-none text-[var(--muted)] transition hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-soft)]">×</button>
          </div>
        </div>
        <div className={cx("min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 [scrollbar-gutter:stable] sm:px-7 sm:py-6", (isCustomerForm || isStaffForm || size === "lg" || size === "xl") && "sm:px-8")}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function Drawer(props: Parameters<typeof Modal>[0]) { return <Modal {...props} />; }

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onClose?: () => void;
  onCancel?: () => void;
};

export function ConfirmDialog({ open, title, description, confirmLabel = "Sil", loading, onConfirm, onClose, onCancel }: ConfirmDialogProps) {
  const handleClose = onClose ?? onCancel ?? (() => undefined);
  return <Modal open={open} onClose={handleClose} title={title} description={description}>
    <div className="flex justify-end gap-3">
      <Button variant="secondary" onClick={handleClose} disabled={loading}>Vazgeç</Button>
      <Button variant="danger" disabled={loading} aria-busy={loading} onClick={onConfirm}>{loading ? "İşleniyor..." : confirmLabel}</Button>
    </div>
  </Modal>;
}
