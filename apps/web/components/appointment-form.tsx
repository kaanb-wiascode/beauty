"use client";

import type { AppointmentStatus, Customer, Service, Staff } from "@/lib/types";
import { fullName } from "@/lib/format";
import { Field, Select, TextArea, TextInput } from "@/components/ui";
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
            <Select
              value={value.customerId}
              onChange={(event) => onChange({ ...value, customerId: event.target.value })}
              disabled={loadingRefs}
            >
              <option value="">Müşteri seçin</option>
              {customers.map((item) => (
                <option key={item.id} value={item.id}>
                  {fullName(item.firstName, item.lastName)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Personel" required>
            <Select
              value={value.staffId}
              onChange={(event) => onChange({ ...value, staffId: event.target.value })}
              disabled={loadingRefs}
            >
              <option value="">Personel seçin</option>
              {staff.filter((item) => item.status === "ACTIVE").map((item) => (
                <option key={item.id} value={item.id}>
                  {fullName(item.firstName, item.lastName)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Hizmet" required>
            <Select
              value={value.serviceId}
              onChange={(event) => onChange({ ...value, serviceId: event.target.value })}
              disabled={loadingRefs}
            >
              <option value="">Hizmet seçin</option>
              {services.filter((item) => item.status === "ACTIVE").map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </Select>
          </Field>
          {editing ? (
            <Field label="Durum">
              <Select
                value={value.status}
                onChange={(event) => onChange({ ...value, status: event.target.value as AppointmentStatus })}
              >
                <option value="SCHEDULED">Planlandı</option>
                <option value="CONFIRMED">Onaylandı</option>
                <option value="COMPLETED">Tamamlandı</option>
                <option value="NO_SHOW">Gelmedi</option>
              </Select>
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
            <TextInput
              type="datetime-local"
              value={value.startAt}
              onChange={(event) => onChange({ ...value, startAt: event.target.value })}
            />
          </Field>
          <Field label="Bitiş" required>
            <TextInput
              type="datetime-local"
              value={value.endAt}
              onChange={(event) => onChange({ ...value, endAt: event.target.value })}
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
            <Select
              value={method}
              onChange={(event) => onMethodChange(event.target.value as "CASH" | "CARD" | "TRANSFER")}
            >
              <option value="CARD">Kart</option>
              <option value="CASH">Nakit</option>
              <option value="TRANSFER">Havale / EFT</option>
            </Select>
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
