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
            <h3 className="text-[16px] font-semibold tracking-[-0.02em] text-[var(--ink)]">
              {title}
            </h3>
          ) : null}
          {description ? (
            <p className="mt-1 text-[13px] leading-5 text-[var(--muted)]">
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
        "grid gap-4 sm:gap-5",
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
        "mt-6 flex flex-col-reverse gap-2.5 border-t border-[var(--line)] pt-5 sm:flex-row sm:justify-end",
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
    <div className={cx("rounded-[12px] border p-4 text-[12px] leading-5", tones[tone])}>
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
    <label className="flex cursor-pointer items-start gap-3 rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-4 transition hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]/60">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-[18px] w-[18px] rounded-[5px] border-[var(--line)] accent-[var(--accent)]"
      />
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-[var(--ink)]">{label}</span>
        {description ? (
          <span className="mt-1 block text-[12px] leading-5 text-[var(--muted)]">{description}</span>
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

function StepContent({
  step,
  index,
  active,
  complete,
}: {
  step: FormStep;
  index: number;
  active: boolean;
  complete: boolean;
}) {
  return (
    <>
      <span className="flex items-center gap-2">
        <span
          className={cx(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
            active
              ? "bg-[var(--accent)] text-white"
              : complete
                ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                : "bg-white text-[var(--muted-soft)]",
          )}
        >
          {complete ? "✓" : index + 1}
        </span>
        <span className="truncate text-[12px] font-semibold">{step.label}</span>
      </span>
      {step.description ? (
        <span className="mt-1 block truncate pl-8 text-[11px] text-[var(--muted)]">
          {step.description}
        </span>
      ) : null}
    </>
  );
}

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
    <nav
      aria-label="Form adımları"
      className="grid gap-2 rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)]/70 p-1.5 sm:grid-cols-2 lg:grid-cols-[repeat(var(--step-count),minmax(0,1fr))]"
      style={{ "--step-count": steps.length } as CSSProperties}
    >
      {steps.map((step, index) => {
        const active = index === current;
        const complete = index < current;
        const className = cx(
          "min-w-0 rounded-[12px] px-3.5 py-3 text-left transition",
          active
            ? "bg-white text-[var(--ink)] shadow-sm"
            : "text-[var(--muted)] hover:bg-white/60",
        );

        if (onStepChange) {
          return (
            <button
              key={step.key}
              type="button"
              aria-current={active ? "step" : undefined}
              onClick={() => onStepChange(index)}
              className={className}
            >
              <StepContent step={step} index={index} active={active} complete={complete} />
            </button>
          );
        }

        return (
          <div
            key={step.key}
            aria-current={active ? "step" : undefined}
            className={className}
          >
            <StepContent step={step} index={index} active={active} complete={complete} />
          </div>
        );
      })}
    </nav>
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