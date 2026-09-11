"use client";

import type { Dispatch, FormEvent, SetStateAction } from "react";

import {
  CheckboxField,
  FormActions,
  FormGrid,
  FormHint,
  FormSection,
  FormStepper,
  FormSubmitButton,
} from "@/components/form-system";
import { Alert, Button, Field, Select, TextInput } from "@/components/ui";

export type CustomerSource = "INSTAGRAM" | "GOOGLE" | "REFERRAL" | "WALK_IN" | "OTHER";

export type CustomerFormState = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  birthDate: string;
  customerSource: CustomerSource | "";
};

export type CustomerConsentState = {
  kvkkAcknowledgement: boolean;
  explicitConsent: boolean;
  membershipAgreement: boolean;
  healthFormCompletion: boolean;
  healthDataConsent: boolean;
  marketingSms: boolean;
  marketingEmail: boolean;
  marketingPhone: boolean;
};

export type CustomerHealthFormState = {
  allergies: string;
  sensitivities: string;
  medications: string;
  conditions: string;
  notes: string;
};

export const customerSourceLabels: Record<CustomerSource, string> = {
  INSTAGRAM: "Instagram",
  GOOGLE: "Google",
  REFERRAL: "Tavsiye",
  WALK_IN: "Doğrudan",
  OTHER: "Diğer",
};

const customerSteps = [
  { key: "info", label: "Bilgiler", description: "Kimlik ve iletişim" },
  { key: "consent", label: "Onaylar", description: "KVKK ve sözleşme" },
  { key: "health", label: "Sağlık", description: "Opsiyonel sağlık profili" },
] as const;

export function hasCustomerHealthData(form: CustomerHealthFormState) {
  return Object.values(form).some((value) => value.trim().length > 0);
}

export function CustomerEditorForm({
  editing,
  form,
  setForm,
  consents,
  setConsents,
  healthForm,
  setHealthForm,
  formStep,
  setFormStep,
  error,
  saving,
  onClose,
  onSubmit,
}: {
  editing: boolean;
  form: CustomerFormState;
  setForm: Dispatch<SetStateAction<CustomerFormState>>;
  consents: CustomerConsentState;
  setConsents: Dispatch<SetStateAction<CustomerConsentState>>;
  healthForm: CustomerHealthFormState;
  setHealthForm: Dispatch<SetStateAction<CustomerHealthFormState>>;
  formStep: 1 | 2 | 3;
  setFormStep: Dispatch<SetStateAction<1 | 2 | 3>>;
  error: string;
  saving: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const healthDataPresent = hasCustomerHealthData(healthForm);

  return (
    <form onSubmit={onSubmit}>
      {!editing ? (
        <FormStepper
          steps={customerSteps}
          current={formStep - 1}
          onStepChange={(index) => setFormStep((index + 1) as 1 | 2 | 3)}
        />
      ) : null}

      <FormSection
        title="Müşteri bilgileri"
        description="Kimlik, iletişim ve müşteri kaynağı bilgileri."
        className={editing ? "" : "mt-5"}
      >
        <FormGrid>
          <Field label="Ad" required>
            <TextInput
              required
              value={form.firstName}
              onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))}
            />
          </Field>
          <Field label="Soyad" required>
            <TextInput
              required
              value={form.lastName}
              onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))}
            />
          </Field>
        </FormGrid>

        {(editing || formStep === 1) ? (
          <FormGrid>
            <Field label="Telefon">
              <TextInput
                value={form.phone}
                onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
              />
            </Field>
            <Field label="E-posta">
              <TextInput
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              />
            </Field>
            <Field label="Doğum tarihi">
              <TextInput
                type="date"
                value={form.birthDate}
                onChange={(event) => setForm((current) => ({ ...current, birthDate: event.target.value }))}
              />
            </Field>
            <Field label="Müşteri kaynağı">
              <Select
                value={form.customerSource}
                onChange={(event) => setForm((current) => ({
                  ...current,
                  customerSource: event.target.value as CustomerFormState["customerSource"],
                }))}
              >
                <option value="">Seçin</option>
                {Object.entries(customerSourceLabels).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </Select>
            </Field>
          </FormGrid>
        ) : null}
      </FormSection>

      {!editing && formStep === 2 ? (
        <FormSection
          title="Onaylar ve sözleşmeler"
          description="Zorunlu bilgilendirmeler ile isteğe bağlı açık rıza durumlarını yönetin."
          className="mt-5"
        >
          <div className="space-y-3">
            <CheckboxField
              checked={consents.kvkkAcknowledgement}
              onChange={(checked) => setConsents((current) => ({ ...current, kvkkAcknowledgement: checked }))}
              label="KVKK Aydınlatma Metni bilgilendirmesi"
              description="Müşterinin aydınlatma metnini gördüğünü kaydeder."
            />
            <CheckboxField
              checked={consents.membershipAgreement}
              onChange={(checked) => setConsents((current) => ({ ...current, membershipAgreement: checked }))}
              label="Üyelik Sözleşmesi"
              description="Müşteri üyelik sözleşmesini kabul eder."
            />
            <CheckboxField
              checked={consents.explicitConsent}
              onChange={(checked) => setConsents((current) => ({ ...current, explicitConsent: checked }))}
              label="Açık rıza"
              description="İlgili açık rıza metninin kabul durumunu kaydeder."
            />
          </div>
          <FormHint tone="info" title="Veri minimizasyonu">
            Yalnızca müşteri ilişkisinin gerektirdiği kişisel verileri kaydedin. Sağlık verileri ayrı ve daha hassas bir veri kategorisidir.
          </FormHint>
        </FormSection>
      ) : null}

      {!editing && formStep === 3 ? (
        <FormSection
          title="Sağlık profili"
          description="Bu alanlar opsiyoneldir ve yalnızca hizmet güvenliği için gerektiğinde doldurulmalıdır."
          className="mt-5"
        >
          <FormGrid>
            <Field label="Alerjiler">
              <TextInput value={healthForm.allergies} onChange={(event) => setHealthForm((current) => ({ ...current, allergies: event.target.value }))} />
            </Field>
            <Field label="Hassasiyetler">
              <TextInput value={healthForm.sensitivities} onChange={(event) => setHealthForm((current) => ({ ...current, sensitivities: event.target.value }))} />
            </Field>
            <Field label="İlaçlar">
              <TextInput value={healthForm.medications} onChange={(event) => setHealthForm((current) => ({ ...current, medications: event.target.value }))} />
            </Field>
            <Field label="Rahatsızlıklar">
              <TextInput value={healthForm.conditions} onChange={(event) => setHealthForm((current) => ({ ...current, conditions: event.target.value }))} />
            </Field>
          </FormGrid>
          <Field label="Sağlık notları">
            <TextInput value={healthForm.notes} onChange={(event) => setHealthForm((current) => ({ ...current, notes: event.target.value }))} />
          </Field>

          {healthDataPresent ? (
            <div className="space-y-3">
              <CheckboxField
                checked={consents.healthFormCompletion}
                onChange={(checked) => setConsents((current) => ({ ...current, healthFormCompletion: checked }))}
                label="Sağlık bilgilerinin doğruluk beyanı"
              />
              <CheckboxField
                checked={consents.healthDataConsent}
                onChange={(checked) => setConsents((current) => ({ ...current, healthDataConsent: checked }))}
                label="Sağlık verilerinin işlenmesine açık rıza"
                description="Sağlık verisi girildiğinde bu onay zorunlu tutulur."
              />
            </div>
          ) : (
            <FormHint>
              Sağlık profili boş bırakılırsa sağlık verisi ve buna bağlı açık rıza kaydı oluşturulmaz.
            </FormHint>
          )}
        </FormSection>
      ) : null}

      {error ? <div className="mt-4"><Alert>{error}</Alert></div> : null}

      <FormActions>
        <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
          Vazgeç
        </Button>
        {!editing && formStep > 1 ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => setFormStep((formStep - 1) as 1 | 2 | 3)}
            disabled={saving}
          >
            Geri
          </Button>
        ) : null}
        <FormSubmitButton
          saving={saving}
          idleLabel={editing || formStep === 3 ? "Kaydet" : "Devam et"}
        />
      </FormActions>
    </form>
  );
}
