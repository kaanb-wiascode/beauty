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
    <section
      className={cx(
        "space-y-3 rounded-[16px] border border-[var(--line)] bg-white/70 p-3.5 shadow-[0_4px_16px_rgba(31,69,94,.025)] sm:space-y-4 sm:rounded-[18px] sm:p-5",
        className,
      )}
    >
      {title || description ? (
        <div>
          {title ? (
            <h3 className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--ink)] sm:text-[16px]">
              {title}
            </h3>
          ) : null}
          {description ? (
            <p className="mt-1 text-[12px] leading-5 text-[var(--muted)] sm:text-[13px]">
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
        "grid gap-3 sm:gap-5",
        columns === 2 && "min-[760px]:grid-cols-2",
        columns === 3 && "min-[760px]:grid-cols-2 min-[1120px]:grid-cols-3",
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
  sticky = false,
}: {
  children: ReactNode;
  className?: string;
  sticky?: boolean;
}) {
  return (
    <div
      className={cx(
        "mt-4 flex flex-col-reverse gap-2 border-t border-[var(--line)] pt-4 sm:mt-6 sm:flex-row sm:justify-end sm:gap-2.5 sm:pt-5",
        sticky &&
          "sticky bottom-0 z-30 -mx-1 rounded-t-[14px] border-t border-[var(--line)] bg-white/[0.97] px-1 pb-1 pt-3 shadow-[0_-10px_24px_rgba(31,69,94,.06)] backdrop-blur-xl sm:-mx-2 sm:rounded-t-[16px] sm:px-2 sm:pt-4",
        className,
      )}
    >
      {children}
    </div>
  );
}


export function FormFieldError({ children }: { children?: ReactNode }) {
  if (!children) return null;

  return (
    <p role="alert" className="mt-1.5 text-[11px] font-medium leading-4 text-[var(--danger)]">
      {children}
    </p>
  );
}

export function FormSummary({
  title = "Özet",
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
    <aside
      className={cx(
        "rounded-[14px] border border-[rgba(22,116,189,.14)] bg-[var(--accent-soft)]/45 p-3.5 sm:rounded-[16px] sm:p-4",
        className,
      )}
    >
      <div className="mb-3">
        <p className="text-[12px] font-semibold text-[var(--ink)]">{title}</p>
        {description ? (
          <p className="mt-1 text-[11px] leading-4 text-[var(--muted)]">{description}</p>
        ) : null}
      </div>
      <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2">{children}</div>
    </aside>
  );
}

export function FormSummaryItem({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted-soft)]">
        {label}
      </p>
      <div className="mt-1 truncate text-[13px] font-semibold text-[var(--ink)]">{value}</div>
      {detail ? <div className="mt-0.5 text-[10px] text-[var(--muted)]">{detail}</div> : null}
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
    <label className="flex cursor-pointer items-start gap-3 rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-3.5 sm:p-4 transition hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]/60">
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
  showDescription,
}: {
  step: FormStep;
  index: number;
  active: boolean;
  complete: boolean;
  showDescription: boolean;
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
        <span className="whitespace-normal text-[12px] font-semibold leading-4">{step.label}</span>
      </span>
      {step.description && showDescription ? (
        <span className="mt-1 block whitespace-normal pl-8 text-[10px] leading-4 text-[var(--muted)]">
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
      className="sticky top-0 z-20 mb-4 flex gap-1.5 overflow-x-auto rounded-[14px] border border-[var(--line)] bg-[rgba(247,250,252,.96)] p-1.5 shadow-[0_8px_24px_rgba(31,69,94,.05)] backdrop-blur-xl min-[700px]:grid min-[700px]:grid-cols-2 min-[1040px]:grid-cols-[repeat(var(--step-count),minmax(0,1fr))] sm:mb-5 sm:rounded-[16px]"
      style={{ "--step-count": steps.length } as CSSProperties}
    >
      {steps.map((step, index) => {
        const active = index === current;
        const complete = index < current;
        const showDescription = steps.length <= 4;
        const className = cx(
          "min-w-[150px] shrink-0 rounded-[11px] px-3 py-2.5 text-left transition min-[700px]:min-w-0 min-[700px]:shrink sm:rounded-[12px] sm:px-3.5 sm:py-3",
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
              <StepContent step={step} index={index} active={active} complete={complete} showDescription={showDescription} />
            </button>
          );
        }

        return (
          <div
            key={step.key}
            aria-current={active ? "step" : undefined}
            className={className}
          >
            <StepContent step={step} index={index} active={active} complete={complete} showDescription={showDescription} />
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