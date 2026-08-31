"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "./ui";
import { cx } from "@/lib/format";

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(["a[href]","button:not([disabled])","input:not([disabled])","select:not([disabled])","textarea:not([disabled])","[tabindex]:not([tabindex='-1'])"].join(",")));
}

export function Modal({ title, description, open, onClose, children }: { title: string; description?: string; open: boolean; onClose: () => void; children: ReactNode }) {
  const [rendered, setRendered] = useState(open);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const titleId = "modal-title";
  const descriptionId = "modal-description";
  const isCustomerForm = title === "Yeni müşteri" || title === "Müşteriyi düzenle";

  useEffect(() => {
    if (open) {
      previousActiveElement.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setRendered(true);
      const frame = window.requestAnimationFrame(() => getFocusableElements(dialogRef.current as HTMLElement)[0]?.focus());
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
      if (!focusable.length) { event.preventDefault(); return; }
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
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} className={cx("glass-elevated relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] px-5 pt-5 pb-[max(20px,env(safe-area-inset-bottom))] sm:max-h-[90vh] sm:rounded-[28px] sm:p-7", isCustomerForm ? "sm:max-w-[760px] sm:p-8" : "sm:max-w-lg", open ? "animate-sheet-in sm:animate-rise-in" : "animate-sheet-out")}>
        <div className={cx("mb-6", isCustomerForm && "mb-5 border-b border-[var(--line)] pb-5")}>
          <h2 id={titleId} className="text-[20px] font-semibold tracking-[-0.03em] text-[var(--ink)] sm:text-[22px]">{title}</h2>
          {description ? <p id={descriptionId} className="mt-1.5 text-sm leading-6 text-[var(--muted)]">{description}</p> : null}
        </div>
        {children}
      </div>
    </div>
  );
}

export function Drawer(props: Parameters<typeof Modal>[0]) { return <Modal {...props} />; }

export function ConfirmDialog({ open, title, description, confirmLabel = "Sil", loading, onConfirm, onClose }: { open: boolean; title: string; description: string; confirmLabel?: string; loading?: boolean; onConfirm: () => void; onClose: () => void }) {
  return <Modal open={open} onClose={onClose} title={title} description={description}>
    <div className="flex justify-end gap-3">
      <Button variant="secondary" onClick={onClose} disabled={loading}>Vazgeç</Button>
      <Button variant="danger" disabled={loading} aria-busy={loading} onClick={onConfirm}>{loading ? "İşleniyor..." : confirmLabel}</Button>
    </div>
  </Modal>;
}
