"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

import { cx } from "@/lib/format";

export type ValooOption = {
  value: string;
  label: string;
  description?: string;
  keywords?: string;
  disabled?: boolean;
};

type SharedSelectProps = {
  options: readonly ValooOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  loading?: boolean;
  searchable?: boolean;
  ariaLabel?: string;
  className?: string;
};

function normalize(value: string) {
  return value.toLocaleLowerCase("tr-TR").trim();
}

function matches(option: ValooOption, query: string) {
  if (!query.trim()) return true;
  const haystack = normalize(
    `${option.label} ${option.description ?? ""} ${option.keywords ?? ""}`,
  );
  return haystack.includes(normalize(query));
}

function useFloatingPanel(
  triggerRef: React.RefObject<HTMLElement | null>,
  open: boolean,
) {
  const [style, setStyle] = useState<CSSProperties>({});

  useEffect(() => {
    if (!open) return;

    function update() {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const estimatedHeight = 336;
      const gap = 8;
      const canOpenDown =
        rect.bottom + gap + estimatedHeight <= window.innerHeight ||
        rect.bottom < window.innerHeight / 2;

      setStyle({
        position: "fixed",
        left: Math.max(12, rect.left),
        width: Math.min(rect.width, window.innerWidth - 24),
        ...(canOpenDown
          ? { top: rect.bottom + gap }
          : { bottom: window.innerHeight - rect.top + gap }),
      });
    }

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, triggerRef]);

  return style;
}

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
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

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx(
        "transition-transform duration-[var(--motion-base)]",
        open && "rotate-180",
      )}
    >
      <path d="m7 10 5 5 5-5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function SelectPanel({
  id,
  query,
  setQuery,
  options,
  selectedValues,
  activeIndex,
  onSelect,
  searchable,
  searchPlaceholder,
  emptyLabel,
  loading,
  style,
}: {
  id: string;
  query: string;
  setQuery: (query: string) => void;
  options: readonly ValooOption[];
  selectedValues: readonly string[];
  activeIndex: number;
  onSelect: (option: ValooOption) => void;
  searchable: boolean;
  searchPlaceholder: string;
  emptyLabel: string;
  loading: boolean;
  style: CSSProperties;
}) {
  return createPortal(
    <div
      id={id}
      role="listbox"
      aria-multiselectable={selectedValues.length > 1 ? true : undefined}
      className="z-[220] overflow-hidden rounded-[16px] border border-[var(--line)] bg-white shadow-[0_22px_64px_rgba(17,70,104,0.18)]"
      style={style}
    >
      {searchable ? (
        <div className="border-b border-[var(--line)] p-2.5">
          <label className="relative block">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]">
              <SearchIcon />
            </span>
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              className="h-10 w-full rounded-[12px] border border-transparent bg-[var(--surface-2)] pl-9 pr-3 text-[13px] text-[var(--ink)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--line-strong)] focus:bg-white focus:ring-4 focus:ring-[var(--accent-soft)]"
            />
          </label>
        </div>
      ) : null}

      <div className="max-h-[280px] overflow-y-auto p-1.5">
        {loading ? (
          <div className="px-3 py-7 text-center text-[12px] text-[var(--muted)]">
            Seçenekler yükleniyor…
          </div>
        ) : options.length ? (
          options.map((option, index) => {
            const selected = selectedValues.includes(option.value);
            const active = index === activeIndex;

            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={option.disabled}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onSelect(option)}
                className={cx(
                  "flex min-h-11 w-full items-center gap-3 rounded-[12px] px-3 py-2 text-left transition",
                  active && "bg-[var(--surface-2)]",
                  selected && "bg-[var(--accent-soft)] text-[var(--accent)]",
                  !selected &&
                    "text-[var(--ink)] hover:bg-[var(--surface-2)]",
                  option.disabled && "cursor-not-allowed opacity-45",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">
                    {option.label}
                  </span>
                  {option.description ? (
                    <span className="mt-0.5 block truncate text-[12px] leading-4 text-[var(--muted)]">
                      {option.description}
                    </span>
                  ) : null}
                </span>
                {selected ? (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[var(--accent)] shadow-sm">
                    <CheckIcon />
                  </span>
                ) : null}
              </button>
            );
          })
        ) : (
          <div className="px-3 py-7 text-center text-[12px] text-[var(--muted)]">
            {emptyLabel}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function ValooSelect({
  value,
  onChange,
  options,
  placeholder = "Seçin",
  searchPlaceholder = "Ara…",
  emptyLabel = "Sonuç bulunamadı.",
  disabled = false,
  loading = false,
  searchable = true,
  ariaLabel,
  className,
}: SharedSelectProps & {
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () => options.filter((option) => matches(option, query)),
    [options, query],
  );
  const selected = options.find((option) => option.value === value);
  const selectedIndex = filtered.findIndex((option) => option.value === value);
  const [activeIndex, setActiveIndex] = useState(
    selectedIndex >= 0 ? selectedIndex : 0,
  );
  const floatingStyle = useFloatingPanel(triggerRef, open);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);

    function closeOnOutside(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      const panel = document.getElementById(id);
      if (panel?.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener("mousedown", closeOnOutside);
    return () => document.removeEventListener("mousedown", closeOnOutside);
  }, [id, open, selectedIndex]);

  function close() {
    setOpen(false);
    setQuery("");
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function select(option: ValooOption) {
    if (option.disabled) return;
    onChange(option.value);
    close();
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    if (!open && (event.key === "ArrowDown" || event.key === "Enter")) {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;

    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) =>
        Math.min(filtered.length - 1, Math.max(0, current + 1)),
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(0, current - 1));
      return;
    }
    if (event.key === "Enter") {
      const option = filtered[activeIndex];
      if (option) {
        event.preventDefault();
        select(option);
      }
    }
  }

  return (
    <div
      ref={rootRef}
      className={cx("relative", className)}
      onKeyDown={onKeyDown}
    >
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          setQuery("");
          setOpen((current) => !current);
        }}
        className={cx(
          "flex min-h-11 w-full items-center gap-3 rounded-[var(--radius-control)] border border-[var(--line)] bg-white px-3.5 py-2.5 text-left text-[14px] text-[var(--ink)] shadow-[0_1px_2px_rgba(17,70,104,.025)] outline-none transition",
          "hover:border-[var(--line-strong)] focus-visible:border-[rgba(22,116,189,.46)] focus-visible:ring-4 focus-visible:ring-[var(--accent-soft)]",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <span
          className={cx(
            "min-w-0 flex-1 truncate",
            !selected && "text-[var(--muted)]",
          )}
        >
          {selected?.label ?? placeholder}
        </span>
        <span className="shrink-0 text-[var(--muted)]">
          <ChevronIcon open={open} />
        </span>
      </button>

      {open ? (
        <SelectPanel
          id={id}
          query={query}
          setQuery={setQuery}
          options={filtered}
          selectedValues={value ? [value] : []}
          activeIndex={activeIndex}
          onSelect={select}
          searchable={searchable}
          searchPlaceholder={searchPlaceholder}
          emptyLabel={emptyLabel}
          loading={loading}
          style={floatingStyle}
        />
      ) : null}
    </div>
  );
}

export function ValooMultiSelect({
  values,
  onChange,
  options,
  placeholder = "Seçim yapın",
  searchPlaceholder = "Ara…",
  emptyLabel = "Sonuç bulunamadı.",
  disabled = false,
  loading = false,
  searchable = true,
  ariaLabel,
  className,
  maxSelections,
}: SharedSelectProps & {
  values: readonly string[];
  onChange: (values: string[]) => void;
  maxSelections?: number;
}) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () => options.filter((option) => matches(option, query)),
    [options, query],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const floatingStyle = useFloatingPanel(triggerRef, open);
  const selected = options.filter((option) => values.includes(option.value));

  useEffect(() => {
    if (!open) return;

    function closeOnOutside(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      const panel = document.getElementById(id);
      if (panel?.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener("mousedown", closeOnOutside);
    return () => document.removeEventListener("mousedown", closeOnOutside);
  }, [id, open]);

  function toggle(option: ValooOption) {
    if (option.disabled) return;
    if (values.includes(option.value)) {
      onChange(values.filter((value) => value !== option.value));
      return;
    }
    if (maxSelections && values.length >= maxSelections) return;
    onChange([...values, option.value]);
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    if (!open && (event.key === "ArrowDown" || event.key === "Enter")) {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setQuery("");
      window.requestAnimationFrame(() => triggerRef.current?.focus());
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) =>
        Math.min(filtered.length - 1, Math.max(0, current + 1)),
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(0, current - 1));
      return;
    }
    if (event.key === "Enter") {
      const option = filtered[activeIndex];
      if (option) {
        event.preventDefault();
        toggle(option);
      }
    }
  }

  return (
    <div
      ref={rootRef}
      className={cx("relative", className)}
      onKeyDown={onKeyDown}
    >
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((current) => !current)}
        className={cx(
          "flex min-h-11 w-full items-center gap-2 rounded-[var(--radius-control)] border border-[var(--line)] bg-white px-2.5 py-2 text-left text-[14px] shadow-[0_1px_2px_rgba(17,70,104,.025)] outline-none transition",
          "hover:border-[var(--line-strong)] focus-visible:border-[rgba(22,116,189,.46)] focus-visible:ring-4 focus-visible:ring-[var(--accent-soft)]",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {selected.length ? (
            selected.slice(0, 3).map((option) => (
              <span
                key={option.value}
                className="max-w-full truncate rounded-[8px] bg-[var(--accent-soft)] px-2 py-1 text-[12px] font-medium text-[var(--accent)]"
              >
                {option.label}
              </span>
            ))
          ) : (
            <span className="px-1 text-[var(--muted)]">{placeholder}</span>
          )}
          {selected.length > 3 ? (
            <span className="rounded-[8px] bg-[var(--surface-2)] px-2 py-1 text-[12px] font-medium text-[var(--muted)]">
              +{selected.length - 3}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-[var(--muted)]">
          <ChevronIcon open={open} />
        </span>
      </button>

      {open ? (
        <SelectPanel
          id={id}
          query={query}
          setQuery={setQuery}
          options={filtered}
          selectedValues={values}
          activeIndex={activeIndex}
          onSelect={toggle}
          searchable={searchable}
          searchPlaceholder={searchPlaceholder}
          emptyLabel={emptyLabel}
          loading={loading}
          style={floatingStyle}
        />
      ) : null}
    </div>
  );
}

export function ValooSegmentedControl<T extends string>({
  value,
  onChange,
  options,
  disabled = false,
  ariaLabel,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cx(
        "grid min-h-11 gap-1 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-2)] p-1",
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cx(
              "min-h-9 rounded-[10px] px-3 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-50",
              active
                ? "bg-white text-[var(--accent)] shadow-[0_1px_4px_rgba(17,70,104,.10)]"
                : "text-[var(--muted)] hover:bg-white/70 hover:text-[var(--ink)]",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
