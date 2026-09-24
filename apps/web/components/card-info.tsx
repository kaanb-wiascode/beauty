"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { CardHelpContent } from "@/lib/card-help";
import { cx } from "@/lib/format";

type PopoverPosition = {
  top: number;
  left: number;
};

const POPOVER_WIDTH = 320;
const POPOVER_ESTIMATED_HEIGHT = 270;
const VIEWPORT_GAP = 12;
const TRIGGER_GAP = 8;

export function CardInfo({
  help,
  className,
}: {
  help: CardHelpContent;
  className?: string;
}) {
  const tooltipId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PopoverPosition>({ top: 0, left: 0 });

  function updatePosition() {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const availableWidth = Math.min(POPOVER_WIDTH, window.innerWidth - VIEWPORT_GAP * 2);
    const left = Math.min(
      Math.max(VIEWPORT_GAP, rect.right - availableWidth),
      Math.max(VIEWPORT_GAP, window.innerWidth - availableWidth - VIEWPORT_GAP),
    );
    const roomBelow = window.innerHeight - rect.bottom;
    const top =
      roomBelow >= POPOVER_ESTIMATED_HEIGHT + TRIGGER_GAP
        ? rect.bottom + TRIGGER_GAP
        : Math.max(
            VIEWPORT_GAP,
            rect.top - POPOVER_ESTIMATED_HEIGHT - TRIGGER_GAP,
          );

    setPosition({ top, left });
  }

  function show() {
    updatePosition();
    setOpen(true);
  }

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const reposition = () => updatePosition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);

    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  const tooltip =
    mounted && open
      ? createPortal(
          <div
            id={tooltipId}
            role="tooltip"
            className="pointer-events-none fixed z-[10000] rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-4 text-left shadow-[0_20px_60px_rgba(17,70,104,.22)]"
            style={{
              top: position.top,
              left: position.left,
              width: `min(${POPOVER_WIDTH}px, calc(100vw - ${VIEWPORT_GAP * 2}px))`,
            }}
          >
            <p className="text-[13px] font-semibold tracking-[-0.01em] text-[var(--ink)]">
              {help.title}
            </p>

            <p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">
              {help.description}
            </p>

            {help.calculation ? (
              <div className="mt-3 border-t border-[var(--line)] pt-3">
                <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--muted-soft)]">
                  Nasıl hesaplanır?
                </p>
                <p className="mt-1 text-[11px] leading-5 text-[var(--ink)]">
                  {help.calculation}
                </p>
              </div>
            ) : null}

            {help.interpretation ? (
              <div className="mt-3">
                <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--muted-soft)]">
                  Nasıl yorumlanır?
                </p>
                <p className="mt-1 text-[11px] leading-5 text-[var(--ink)]">
                  {help.interpretation}
                </p>
              </div>
            ) : null}

            {help.source || help.updateFrequency ? (
              <div className="mt-3 border-t border-[var(--line)] pt-3 text-[10px] leading-4 text-[var(--muted-soft)]">
                {help.source ? <p>Veri kaynağı: {help.source}</p> : null}
                {help.updateFrequency ? <p>Güncelleme: {help.updateFrequency}</p> : null}
              </div>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`${help.title} hakkında bilgi`}
        aria-describedby={open ? tooltipId : undefined}
        title={`${help.title} hakkında bilgi`}
        className={cx(
          "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[11px] font-semibold text-[var(--muted)] shadow-[0_1px_3px_rgba(17,70,104,.06)] transition hover:border-[var(--line-strong)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-soft)]",
          className,
        )}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") show();
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") setOpen(false);
        }}
        onPointerDown={(event) => {
          if (event.pointerType !== "mouse") {
            event.preventDefault();
            if (open) setOpen(false);
            else show();
          }
        }}
        onFocus={show}
        onBlur={() => setOpen(false)}
        onClick={(event) => event.preventDefault()}
      >
        i
      </button>
      {tooltip}
    </>
  );
}
