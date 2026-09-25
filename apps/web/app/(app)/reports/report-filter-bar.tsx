"use client";

import { DatePicker } from "@/components/date-picker";
import { Field, Panel } from "@/components/ui";

export type ReportDateRange = {
  from: string;
  to: string;
};

type ReportFilterBarProps = ReportDateRange & {
  onChange: (range: ReportDateRange) => void;
  presets?: readonly { label: string; days: number }[];
};

const DEFAULT_PRESETS = [
  { label: "Bugün", days: 0 },
  { label: "Dün", days: 1 },
  { label: "7 Gün", days: 6 },
  { label: "30 Gün", days: 29 },
  { label: "90 Gün", days: 89 },
] as const;

const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function reportDateInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isValidDateInput(value: string) {
  if (!DATE_INPUT_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export function getReportRangeError({ from, to }: ReportDateRange) {
  if (!from || !to) return "Başlangıç ve bitiş tarihleri zorunludur.";
  if (!isValidDateInput(from) || !isValidDateInput(to)) {
    return "Geçerli bir tarih aralığı seçin.";
  }
  if (from > to) return "Başlangıç tarihi bitiş tarihinden sonra olamaz.";
  return null;
}

export function reportRangeIsInvalid(range: ReportDateRange) {
  return getReportRangeError(range) !== null;
}

export function reportRangeToQuery(range: ReportDateRange) {
  const error = getReportRangeError(range);
  if (error) throw new Error(error);

  return {
    from: new Date(`${range.from}T00:00:00`).toISOString(),
    to: new Date(`${range.to}T23:59:59.999`).toISOString(),
  };
}

export function ReportFilterBar({
  from,
  to,
  onChange,
  presets = DEFAULT_PRESETS,
}: ReportFilterBarProps) {
  function presetRange(days: number) {
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - days);

    return {
      from: reportDateInputValue(start),
      to: reportDateInputValue(end),
    };
  }

  function applyPreset(days: number) {
    onChange(presetRange(days));
  }

  return (
    <Panel>
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          {presets.map((preset) => {
            const presetValue = presetRange(preset.days);
            const active = presetValue.from === from && presetValue.to === to;

            return (
              <button
                key={preset.label}
                type="button"
                aria-pressed={active}
                onClick={() => applyPreset(preset.days)}
                className={
                  active
                    ? "rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] px-3.5 py-2 text-[12px] font-semibold text-[var(--accent)] shadow-[0_3px_10px_rgba(22,116,189,.08)]"
                    : "rounded-xl border border-[var(--line)] bg-white px-3.5 py-2 text-[12px] font-medium text-[var(--muted)] transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
                }
              >
                {preset.label}
              </button>
            );
          })}
          <span className="hidden h-5 w-px bg-[var(--line)] sm:block" />
          <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
            <Field label="Başlangıç">
              <DatePicker
                value={from}
                max={to || undefined}
                ariaLabel="Başlangıç tarihi"
                onChange={(nextFrom) => onChange({ from: nextFrom, to })}
              />
            </Field>
            <Field label="Bitiş">
              <DatePicker
                value={to}
                min={from || undefined}
                ariaLabel="Bitiş tarihi"
                onChange={(nextTo) => onChange({ from, to: nextTo })}
              />
            </Field>
          </div>
        </div>
      </div>
    </Panel>
  );
}
