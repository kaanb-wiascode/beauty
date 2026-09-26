"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cx } from "@/lib/format";

type DatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  min?: string;
  max?: string;
  className?: string;
  ariaLabel?: string;
};

type Position = {
  top: number;
  left: number;
  width: number;
};

const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"] as const;
const POPOVER_WIDTH = 312;
const VIEWPORT_GAP = 12;
const TRIGGER_GAP = 8;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseValue(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function displayDate(value: string) {
  const date = parseValue(value);
  if (!date) return "";

  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
    .format(date)
    .replaceAll(".", "");
}

function monthLabel(date: Date) {
  const raw = new Intl.DateTimeFormat("tr-TR", {
    month: "long",
    year: "numeric",
  }).format(date);

  return raw.charAt(0).toLocaleUpperCase("tr-TR") + raw.slice(1);
}

function startOfCalendar(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayIndex = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - mondayIndex);
  return start;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function withinBounds(value: string, min?: string, max?: string) {
  if (min && value < min) return false;
  if (max && value > max) return false;
  return true;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Tarih seçin",
  disabled = false,
  min,
  max,
  className,
  ariaLabel = "Tarih seçin",
}: DatePickerProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => parseValue(value), [value]);
  const today = useMemo(() => {
    const current = new Date();
    return new Date(current.getFullYear(), current.getMonth(), current.getDate());
  }, []);

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(
    () => selected ?? new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [position, setPosition] = useState<Position>({
    top: 0,
    left: 0,
    width: POPOVER_WIDTH,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const next = selected ?? today;
    setMonth(new Date(next.getFullYear(), next.getMonth(), 1));
  }, [open, selected, today]);

  function updatePosition() {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const width = Math.min(
      POPOVER_WIDTH,
      Math.max(280, window.innerWidth - VIEWPORT_GAP * 2),
    );
    const left = Math.min(
      Math.max(VIEWPORT_GAP, rect.left),
      Math.max(VIEWPORT_GAP, window.innerWidth - width - VIEWPORT_GAP),
    );

    const estimatedHeight = 356;
    const roomBelow = window.innerHeight - rect.bottom;
    const top =
      roomBelow >= estimatedHeight + TRIGGER_GAP
        ? rect.bottom + TRIGGER_GAP
        : Math.max(VIEWPORT_GAP, rect.top - estimatedHeight - TRIGGER_GAP);

    setPosition({ top, left, width });
  }

  useEffect(() => {
    if (!open) return;

    updatePosition();

    const onViewportChange = () => updatePosition();
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (triggerRef.current?.contains(event.target)) return;
      if (popoverRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const days = useMemo(() => {
    const start = startOfCalendar(month);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [month]);

  function selectDate(date: Date) {
    const next = toValue(date);
    if (!withinBounds(next, min, max)) return;
    onChange(next);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function moveMonth(offset: number) {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  const popover =
    mounted && open
      ? createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Takvim"
            className="fixed z-[10020] rounded-[16px] border border-[#dce7f0] bg-white/[0.98] p-3.5 shadow-[0_18px_52px_rgba(31,69,94,.16)] backdrop-blur-xl sm:rounded-[20px] sm:p-4"
            style={{
              top: position.top,
              left: position.left,
              width: position.width,
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                aria-label="Önceki ay"
                onClick={() => moveMonth(-1)}
                className="flex h-9 w-9 items-center justify-center rounded-[11px] text-[#6f8090] transition hover:bg-[#f2f7fb] hover:text-[#1674bd] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(22,116,189,.12)]"
              >
                <ChevronLeft />
              </button>

              <p className="text-[14px] font-semibold tracking-[-0.02em] text-[#1f2a35]">
                {monthLabel(month)}
              </p>

              <button
                type="button"
                aria-label="Sonraki ay"
                onClick={() => moveMonth(1)}
                className="flex h-9 w-9 items-center justify-center rounded-[11px] text-[#6f8090] transition hover:bg-[#f2f7fb] hover:text-[#1674bd] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(22,116,189,.12)]"
              >
                <ChevronRight />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-7 gap-1 sm:mt-4">
              {WEEKDAYS.map((day) => (
                <div
                  key={day}
                  className="flex h-8 items-center justify-center text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8a98a6]"
                >
                  {day}
                </div>
              ))}

              {days.map((date) => {
                const dateValue = toValue(date);
                const isSelected = selected ? sameDay(date, selected) : false;
                const isToday = sameDay(date, today);
                const isCurrentMonth = date.getMonth() === month.getMonth();
                const enabled = withinBounds(dateValue, min, max);

                return (
                  <button
                    key={dateValue}
                    type="button"
                    disabled={!enabled}
                    aria-pressed={isSelected}
                    onClick={() => selectDate(date)}
                    className={cx(
                      "relative flex h-8 items-center justify-center rounded-[10px] text-[11px] font-medium transition sm:h-9 sm:rounded-[11px] sm:text-[12px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(22,116,189,.12)]",
                      isSelected
                        ? "bg-[var(--accent)] text-white shadow-[0_6px_16px_rgba(22,116,189,.20)]"
                        : isCurrentMonth
                          ? "text-[#27323d] hover:bg-[#f2f7fb] hover:text-[#1674bd]"
                          : "text-[#b3bdc6] hover:bg-[#f7fafc]",
                      !enabled && "cursor-not-allowed opacity-30 hover:bg-transparent",
                    )}
                  >
                    {date.getDate()}
                    {isToday && !isSelected ? (
                      <span className="absolute bottom-1 h-1 w-1 rounded-full bg-[var(--accent)]" />
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-[#e7eef4] pt-3 sm:mt-4">
              <button
                type="button"
                onClick={() => selectDate(today)}
                disabled={!withinBounds(toValue(today), min, max)}
                className="rounded-[10px] px-3 py-2 text-[11px] font-semibold text-[var(--accent)] transition hover:bg-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Bugün
              </button>

              <span className="text-[10px] text-[#8796a5]">
                {selected ? displayDate(value) : "Tarih seçilmedi"}
              </span>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (disabled) return;
          updatePosition();
          setOpen((current) => !current);
        }}
        className={cx(
          "control flex min-h-[42px] w-full items-center gap-2.5 text-left sm:gap-3",
          "transition-[border-color,box-shadow,background-color] duration-[180ms]",
          open && "border-[var(--accent)] ring-4 ring-[var(--accent-soft)]",
          disabled && "cursor-not-allowed opacity-50",
          className,
        )}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-[var(--surface-2)] text-[var(--muted)] sm:h-8 sm:w-8 sm:rounded-[10px]">
          <CalendarIcon />
        </span>

        <span
          className={cx(
            "min-w-0 flex-1 truncate text-[13px] font-medium",
            value ? "text-[var(--ink)]" : "text-[var(--muted)]",
          )}
        >
          {value ? displayDate(value) : placeholder}
        </span>

        <span className="shrink-0 text-[var(--muted-soft)]">
          <ChevronDown />
        </span>
      </button>
      {popover}
    </>
  );
}

function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-4 w-4"
    >
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M7.5 3v4M16.5 3v4M3.5 9.5h17" />
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-4 w-4"
    >
      <path d="m7 10 5 5 5-5" />
    </svg>
  );
}

function ChevronLeft() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-4 w-4"
    >
      <path d="m15 6-6 6 6 6" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-4 w-4"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
