"use client";

import type { FormEvent, ReactNode } from "react";

import { FormActions, FormStepper, FormSubmitButton, type FormStep } from "@/components/form-system";
import { Modal } from "@/components/modal";
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
    <Modal open onClose={onClose} title={title} description={description} size="xl">
      <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="mb-3 text-[10px] font-semibold uppercase tracking-[.14em] text-[var(--accent)] sm:mb-4 sm:text-[11px] sm:tracking-[.16em]">
          {eyebrow}
        </div>

        <div className="border-y border-[var(--line)] py-2 sm:py-3">
          <FormStepper steps={steps} current={activeStep} onStepChange={onStepChange} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto py-4 sm:py-6">
          <div className="mx-auto max-w-[920px]">{children}</div>
        </div>

        <FormActions className="mt-0 border-t border-[var(--line)] py-3 sm:py-4">
          <span className="hidden mr-auto self-center text-[11px] text-[var(--muted)] sm:inline">
            * zorunlu alanlar · bilgiler kayıt geçmişine işlenir
          </span>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Vazgeç
          </Button>
          <FormSubmitButton saving={saving} idleLabel={submitLabel} />
        </FormActions>
      </form>
    </Modal>
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
    <Modal open onClose={onClose} title={title}>
      <form onSubmit={onSubmit}>
        {children}
        <FormActions>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Vazgeç
          </Button>
          <FormSubmitButton saving={saving} idleLabel={submitLabel} />
        </FormActions>
      </form>
    </Modal>
  );
}
