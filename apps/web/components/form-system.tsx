import type {
  ButtonHTMLAttributes,
  CSSProperties,
  ReactNode,
} from "react";

import { Button } from "@/components/ui";
import { cx } from "@/lib/format";

export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("space-y-4", className)}>
      {title || description ? (
        <div>
          {title ? (
            <h3 className="text-[14px] font-semibold tracking-[-0.02em] text-[var(--ink)]">
              {title}
            </h3>
          ) : null}
          {description ? (
            <p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">
              {description}
            </p>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function FormGrid({
  children,
  columns = 2,
  className,
}: {
  children: ReactNode;
  columns?: 1 | 2 | 3;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "grid gap-4",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function FormActions({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "mt-5 flex flex-col-reverse gap-2 border-t border-[var(--line)] pt-4 sm:flex-row sm:justify-end",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function FormHint({
  title,
  children,
  tone = "neutral",
}: {
  title?: string;
  children: ReactNode;
  tone?: "neutral" | "info" | "warning";
}) {
  const tones = {
    neutral: "border-[var(--line)] bg-[var(--surface-2)]/55 text-[var(--muted)]",
    info: "border-[rgba(22,116,189,.14)] bg-[var(--accent-soft)]/60 text-[var(--muted)]",
    warning: "border-[rgba(190,116,37,.16)] bg-[rgba(190,116,37,.06)] text-[var(--muted)]",
  };

  return (
    <div className={cx("rounded-[13px] border p-3.5 text-[11px] leading-5", tones[tone])}>
      {title ? <strong className="mb-1 block text-[var(--ink)]">{title}</strong> : null}
      {children}
    </div>
  );
}

export function CheckboxField({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-[13px] border border-[var(--line)] bg-[var(--surface)] p-3.5 transition hover:bg-[var(--surface-2)]/45">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-[var(--line)] accent-[var(--accent)]"
      />
      <span className="min-w-0">
        <span className="block text-[12px] font-medium text-[var(--ink)]">{label}</span>
        {description ? (
          <span className="mt-1 block text-[10px] leading-4 text-[var(--muted)]">{description}</span>
        ) : null}
      </span>
    </label>
  );
}

export type FormStep = {
  key: string;
  label: string;
  description?: string;
};

export function FormStepper({
  steps,
  current,
  onStepChange,
}: {
  steps: readonly FormStep[];
  current: number;
  onStepChange?: (index: number) => void;
}) {
  return (
    <div
      className="grid gap-2 rounded-[14px] bg-[var(--surface-2)]/70 p-1.5 sm:grid-cols-2 lg:grid-cols-[repeat(var(--step-count),minmax(0,1fr))]"
      style={{ "--step-count": steps.length } as CSSProperties}
    >
      {steps.map((step, index) => {
        const active = index === current;
        const complete = index < current;
        const Component = onStepChange ? "button" : "div";

        return (
          <Component
            key={step.key}
            {...(onStepChange
              ? {
                  type: "button" as const,
                  onClick: () => onStepChange(index),
                }
              : {})}
            className={cx(
              "min-w-0 rounded-[11px] px-3 py-2.5 text-left transition",
              active
                ? "bg-white text-[var(--ink)] shadow-sm"
                : "text-[var(--muted)] hover:bg-white/60",
            )}
          >
            <span className="flex items-center gap-2">
              <span
                className={cx(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold",
                  active
                    ? "bg-[var(--accent)] text-white"
                    : complete
                      ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "bg-white text-[var(--muted-soft)]",
                )}
              >
                {complete ? "✓" : index + 1}
              </span>
              <span className="truncate text-[10px] font-semibold">{step.label}</span>
            </span>
            {step.description ? (
              <span className="mt-1 block truncate pl-7 text-[8px] text-[var(--muted-soft)]">
                {step.description}
              </span>
            ) : null}
          </Component>
        );
      })}
    </div>
  );
}

export function FormSubmitButton({
  saving,
  idleLabel,
  savingLabel = "Kaydediliyor...",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  saving: boolean;
  idleLabel: string;
  savingLabel?: string;
}) {
  return (
    <Button {...props} type={props.type ?? "submit"} disabled={props.disabled || saving}>
      {saving ? savingLabel : idleLabel}
    </Button>
  );
}
