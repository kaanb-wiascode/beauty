"use client";

import type { FormEvent, ReactNode } from "react";

import { FormActions, FormStepper, FormSubmitButton, type FormStep } from "@/components/form-system";
import { Button } from "@/components/ui";

export function InventoryFormShell({
  eyebrow = "ENVANTER KARTI",
  title,
  description,
  steps,
  activeStep,
  onStepChange,
  onClose,
  onSubmit,
  saving,
  submitLabel,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  steps: readonly FormStep[];
  activeStep: number;
  onStepChange: (index: number) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  saving: boolean;
  submitLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/25 p-3 backdrop-blur-[4px]">
      <form
        onSubmit={onSubmit}
        className="flex max-h-[94vh] w-full max-w-[1080px] flex-col overflow-hidden rounded-[28px] border border-[var(--line)] bg-[var(--surface)] shadow-[0_30px_100px_rgba(17,70,104,.16)]"
      >
        <header className="flex items-start justify-between gap-5 border-b border-[var(--line)] px-6 py-5 md:px-8">
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[.16em] text-[var(--muted-soft)]">
              {eyebrow}
            </div>
            <h2 className="text-[23px] font-semibold tracking-[-.03em] text-[var(--ink)]">{title}</h2>
            <p className="mt-1 text-[12px] leading-5 text-[var(--muted)]">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Formu kapat"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[20px] text-[var(--muted)] transition hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            ×
          </button>
        </header>

        <div className="border-b border-[var(--line)] px-5 py-3 md:px-8">
          <FormStepper steps={steps} current={activeStep} onStepChange={onStepChange} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-7 md:px-8">
          <div className="mx-auto max-w-[920px]">{children}</div>
        </div>

        <div className="bg-[var(--surface-2)]/35 px-6 md:px-8">
          <FormActions className="mt-0 py-4">
            <span className="mr-auto self-center text-[10px] text-[var(--muted-soft)]">
              * zorunlu alanlar · bilgiler kayıt geçmişine işlenir
            </span>
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Vazgeç
            </Button>
            <FormSubmitButton saving={saving} idleLabel={submitLabel} />
          </FormActions>
        </div>
      </form>
    </div>
  );
}

export function InventorySimpleFormShell({
  title,
  onClose,
  onSubmit,
  saving = false,
  submitLabel,
  children,
}: {
  title: string;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  saving?: boolean;
  submitLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/25 p-4 backdrop-blur-[3px]">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-[620px] rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[0_24px_80px_rgba(17,70,104,.14)]"
      >
        <div className="mb-6 flex items-center justify-between gap-4">
          <h2 className="text-[20px] font-semibold text-[var(--ink)]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Formu kapat"
            className="text-xl text-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            ×
          </button>
        </div>
        {children}
        <FormActions>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Vazgeç
          </Button>
          <FormSubmitButton saving={saving} idleLabel={submitLabel} />
        </FormActions>
      </form>
    </div>
  );
}
