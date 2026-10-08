"use client";

import { DateTimePicker } from "@/components/date-time-picker";
import type { AppointmentStatus, Customer, Service, Staff } from "@/lib/types";
import { fullName } from "@/lib/format";
import { Button, Field, TextArea, TextInput } from "@/components/ui";
import { ValooSegmentedControl, ValooSelect } from "@/components/valoo-controls";
import {
  FormActions,
  FormGrid,
  FormHint,
  FormSection,
  FormSubmitButton,
} from "@/components/form-system";

export type AppointmentEditorValue = {
  customerId: string;
  staffId: string;
  serviceId: string;
  startAt: string;
  endAt: string;
  notes: string;
  status: AppointmentStatus;
};

export function AppointmentEditorForm({
  value,
  onChange,
  customers,
  staff,
  services,
  editing,
  loadingRefs,
  saving,
  onCancel,
  onSubmit,
}: {
  value: AppointmentEditorValue;
  onChange: (value: AppointmentEditorValue) => void;
  customers: Customer[];
  staff: Staff[];
  services: Service[];
  editing: boolean;
  loadingRefs: boolean;
  saving: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div>
      <FormSection
        title="Randevu bilgileri"
        description="Müşteri, personel ve hizmet seçimini tamamlayın."
      >
        <FormGrid>
          <Field label="Müşteri" required>
            <ValooSelect
              value={value.customerId}
              onChange={(customerId) => onChange({ ...value, customerId })}
              disabled={loadingRefs}
              loading={loadingRefs}
              placeholder="Müşteri seçin"
              searchPlaceholder="Müşteri ara…"
              options={customers.map((item) => ({
                value: item.id,
                label: fullName(item.firstName, item.lastName),
                keywords: [item.phone, item.email].filter(Boolean).join(" "),
              }))}
            />
          </Field>
          <Field label="Personel" required>
            <ValooSelect
              value={value.staffId}
              onChange={(staffId) => onChange({ ...value, staffId })}
              disabled={loadingRefs}
              loading={loadingRefs}
              placeholder="Personel seçin"
              searchPlaceholder="Personel ara…"
              options={staff
                .filter((item) => item.status === "ACTIVE")
                .map((item) => ({
                  value: item.id,
                  label: fullName(item.firstName, item.lastName),
                }))}
            />
          </Field>
          <Field label="Hizmet" required>
            <ValooSelect
              value={value.serviceId}
              onChange={(serviceId) => onChange({ ...value, serviceId })}
              disabled={loadingRefs}
              loading={loadingRefs}
              placeholder="Hizmet seçin"
              searchPlaceholder="Hizmet ara…"
              options={services
                .filter((item) => item.status === "ACTIVE")
                .map((item) => ({
                  value: item.id,
                  label: item.name,
                  description:
                    typeof item.durationMinutes === "number"
                      ? `${item.durationMinutes} dk`
                      : undefined,
                }))}
            />
          </Field>
          {editing ? (
            <Field label="Durum">
              <ValooSelect
                value={value.status}
                onChange={(status) =>
                  onChange({ ...value, status: status as AppointmentStatus })
                }
                searchable={false}
                options={[
                  { value: "SCHEDULED", label: "Planlandı" },
                  { value: "CONFIRMED", label: "Onaylandı" },
                  { value: "COMPLETED", label: "Tamamlandı" },
                  { value: "NO_SHOW", label: "Gelmedi" },
                ]}
              />
            </Field>
          ) : null}
        </FormGrid>
      </FormSection>

      <FormSection
        title="Zamanlama"
        description="Başlangıç ve bitiş zamanlarını kontrol edin."
        className="mt-5"
      >
        <FormGrid>
          <Field label="Başlangıç" required>
            <DateTimePicker
              value={value.startAt}
              max={value.endAt || undefined}
              ariaLabel="Randevu başlangıcı"
              onChange={(startAt) => onChange({ ...value, startAt })}
            />
          </Field>
          <Field label="Bitiş" required>
            <DateTimePicker
              value={value.endAt}
              min={value.startAt || undefined}
              ariaLabel="Randevu bitişi"
              onChange={(endAt) => onChange({ ...value, endAt })}
            />
          </Field>
        </FormGrid>
        <Field label="Not">
          <TextArea
            rows={3}
            value={value.notes}
            onChange={(event) => onChange({ ...value, notes: event.target.value })}
            placeholder="Randevuya özel not..."
          />
        </Field>
      </FormSection>

      <FormHint tone="info" title="Takvim">
        Randevu kaydedildiğinde günlük program ve personel takvimi aynı veri kaynağından güncellenir.
      </FormHint>

      <FormActions>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
          Vazgeç
        </Button>
        <FormSubmitButton
          type="button"
          saving={saving}
          idleLabel={editing ? "Değişiklikleri kaydet" : "Randevuyu oluştur"}
          onClick={onSubmit}
        />
      </FormActions>
    </div>
  );
}

export function AppointmentPaymentForm({
  amount,
  method,
  saving,
  onAmountChange,
  onMethodChange,
  onCancel,
  onSubmit,
}: {
  amount: string;
  method: "CASH" | "CARD" | "TRANSFER";
  saving: boolean;
  onAmountChange: (value: string) => void;
  onMethodChange: (value: "CASH" | "CARD" | "TRANSFER") => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div>
      <FormSection title="Tahsilat" description="Randevu için alınan ödeme tutarı ve yöntemi.">
        <FormGrid>
          <Field label="Tutar" required>
            <TextInput
              type="number"
              min={0.01}
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(event) => onAmountChange(event.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Ödeme yöntemi">
            <ValooSegmentedControl
              value={method}
              onChange={onMethodChange}
              ariaLabel="Ödeme yöntemi"
              options={[
                { value: "CARD", label: "Kart" },
                { value: "CASH", label: "Nakit" },
                { value: "TRANSFER", label: "Havale / EFT" },
              ]}
            />
          </Field>
        </FormGrid>
      </FormSection>

      <FormHint tone="info" title="Finansal kayıt">
        Bu işlem randevuya bağlı bir tahsilat oluşturur. İnternet bankacılığı kullanıcı adı veya parola bilgisi istenmez.
      </FormHint>

      <FormActions>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="inline-flex min-h-10 items-center justify-center rounded-[14px] px-4 py-2.5 text-[14px] font-medium text-[var(--muted)] transition hover:bg-black/[0.04] disabled:opacity-40"
        >
          Vazgeç
        </button>
        <FormSubmitButton
          type="button"
          saving={saving}
          idleLabel="Ödemeyi kaydet"
          onClick={onSubmit}
        />
      </FormActions>
    </div>
  );
}
