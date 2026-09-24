"use client";

import { useEffect, useMemo, useState } from "react";

import { DatePicker } from "@/components/date-picker";
import { cx } from "@/lib/format";

type DateTimePickerProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  min?: string;
  max?: string;
  className?: string;
  ariaLabel?: string;
};

const DATE_TIME_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/;

function splitValue(value: string) {
  const match = DATE_TIME_PATTERN.exec(value);
  if (!match) {
    return {
      date: value.includes("T") ? value.split("T")[0] ?? "" : "",
      time: "09:00",
    };
  }

  return {
    date: match[1],
    time: `${match[2]}:${match[3]}`,
  };
}

function normalizeTime(value: string) {
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(value);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatTimeDraft(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function addMinutes(time: string, amount: number) {
  const normalized = normalizeTime(time);
  if (!normalized) return "09:00";

  const [hour, minute] = normalized.split(":").map(Number);
  const total = (hour * 60 + minute + amount + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function DateTimePicker({
  value,
  onChange,
  disabled = false,
  min,
  max,
  className,
  ariaLabel = "Tarih ve saat seçin",
}: DateTimePickerProps) {
  const parts = useMemo(() => splitValue(value), [value]);
  const [timeDraft, setTimeDraft] = useState(parts.time);

  useEffect(() => {
    setTimeDraft(parts.time);
  }, [parts.time]);

  const minDate = min ? splitValue(min).date : undefined;
  const maxDate = max ? splitValue(max).date : undefined;

  function commitTime(nextTime: string) {
    const normalized = normalizeTime(nextTime);
    if (!normalized) {
      setTimeDraft(parts.time);
      return;
    }

    setTimeDraft(normalized);
    if (parts.date) {
      onChange(`${parts.date}T${normalized}`);
    }
  }

  function changeDate(nextDate: string) {
    const normalized = normalizeTime(timeDraft) ?? parts.time ?? "09:00";
    onChange(`${nextDate}T${normalized}`);
  }

  return (
    <div
      className={cx(
        "grid min-w-0 grid-cols-[minmax(0,1fr)_112px] gap-2",
        className,
      )}
    >
      <DatePicker
        value={parts.date}
        onChange={changeDate}
        disabled={disabled}
        min={minDate}
        max={maxDate}
        ariaLabel={`${ariaLabel} - tarih`}
      />

      <div
        className={cx(
          "control flex min-h-[42px] min-w-0 items-center gap-2 px-3",
          "transition-[border-color,box-shadow,background-color] duration-[180ms]",
          "focus-within:border-[var(--accent)] focus-within:ring-4 focus-within:ring-[var(--accent-soft)]",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <span className="shrink-0 text-[var(--muted)]">
          <ClockIcon />
        </span>

        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled}
          aria-label={`${ariaLabel} - saat`}
          value={timeDraft}
          placeholder="09:00"
          onChange={(event) => setTimeDraft(formatTimeDraft(event.target.value))}
          onBlur={() => commitTime(timeDraft)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitTime(timeDraft);
              event.currentTarget.blur();
              return;
            }

            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              const next = addMinutes(timeDraft, event.key === "ArrowUp" ? 15 : -15);
              setTimeDraft(next);
              if (parts.date) onChange(`${parts.date}T${next}`);
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-center text-[13px] font-semibold tabular-nums text-[var(--ink)] outline-none placeholder:text-[var(--muted-soft)]"
        />
      </div>
    </div>
  );
}

function ClockIcon() {
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
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}
