"use client";

import type { FormEventHandler } from "react";

import { DatePicker } from "@/components/date-picker";
import {
  FormActions,
  FormGrid,
  FormHint,
  FormSection,
  FormStepper,
  FormSubmitButton,
} from "@/components/form-system";
import {
  Alert,
  Button,
  Field,
  TextArea,
  TextInput,
} from "@/components/ui";
import { ValooMultiSelect, ValooSelect } from "@/components/valoo-controls";
import type { StaffProfile } from "@/lib/types";

export type StaffEditorState = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  profile: StaffProfile;
};

type Props = {
  form: StaffEditorState;
  step: number;
  saving: boolean;
  editing: boolean;
  error?: string;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onChange: (next: StaffEditorState) => void;
  onProfileChange: <K extends keyof StaffProfile>(key: K, value: StaffProfile[K]) => void;
  onStepChange: (step: number) => void;
  onCancel: () => void;
  serviceOptions: readonly { value: string; label: string; description?: string }[];
};

const steps = [
  { key: "personal", label: "Kişisel", description: "Kimlik Ve İletişim" },
  { key: "work", label: "İş Bilgileri", description: "Pozisyon Ve Çalışma" },
  { key: "finance", label: "Özlük Ve Finans", description: "Sözleşme Ve Maaş" },
  { key: "emergency", label: "Acil Durum", description: "Yakın Kişi Bilgileri" },
  { key: "notes", label: "Notlar", description: "Ek Bilgiler" },
] as const;

export function StaffEditorForm({
  form,
  step,
  saving,
  editing,
  error,
  onSubmit,
  onChange,
  onProfileChange,
  onStepChange,
  onCancel,
  serviceOptions,
}: Props) {
  const setField = <K extends keyof StaffEditorState>(key: K, value: StaffEditorState[K]) => {
    onChange({ ...form, [key]: value });
  };

  return (
    <form onSubmit={onSubmit} className="flex min-h-0 flex-col">
      <FormStepper steps={steps} current={step} onStepChange={onStepChange} />

      <div className="space-y-5">
        {step === 0 ? (
          <FormSection title="Kişisel Bilgiler" description="Kimlik, İletişim Ve Adres Bilgileri.">
            <FormGrid>
              <Field label="Ad" required><TextInput required value={form.firstName} onChange={(event) => setField("firstName", event.target.value)} /></Field>
              <Field label="Soyad" required><TextInput required value={form.lastName} onChange={(event) => setField("lastName", event.target.value)} /></Field>
              <Field label="T.C. Kimlik No"><TextInput value={form.profile.identityNumber ?? ""} onChange={(event) => onProfileChange("identityNumber", event.target.value)} /></Field>
              <Field label="Doğum Tarihi"><DatePicker value={form.profile.birthDate ?? ""} max={new Date().toISOString().slice(0, 10)} ariaLabel="Doğum Tarihi" onChange={(value) => onProfileChange("birthDate", value)} /></Field>
              <Field label="Doğum Yeri"><TextInput value={form.profile.birthPlace ?? ""} onChange={(event) => onProfileChange("birthPlace", event.target.value)} /></Field>
              <Field label="Uyruk"><TextInput value={form.profile.nationality ?? "Türkiye Cumhuriyeti"} onChange={(event) => onProfileChange("nationality", event.target.value)} /></Field>
              <Field label="Cinsiyet">
                <ValooSelect
                  value={form.profile.gender ?? ""}
                  onChange={(gender) => onProfileChange("gender", gender)}
                  searchable={false}
                  placeholder="Seçiniz"
                  options={[
                    { value: "Kadın", label: "Kadın" },
                    { value: "Erkek", label: "Erkek" },
                    { value: "Belirtmek istemiyorum", label: "Belirtmek istemiyorum" },
                  ]}
                />
              </Field>
              <Field label="Medeni durum">
                <ValooSelect
                  value={form.profile.maritalStatus ?? ""}
                  onChange={(maritalStatus) => onProfileChange("maritalStatus", maritalStatus)}
                  searchable={false}
                  placeholder="Seçiniz"
                  options={[
                    { value: "Bekar", label: "Bekar" },
                    { value: "Evli", label: "Evli" },
                    { value: "Diğer", label: "Diğer" },
                  ]}
                />
              </Field>
              <Field label="Telefon" required><TextInput value={form.phone} onChange={(event) => setField("phone", event.target.value)} /></Field>
              <Field label="E-Posta"><TextInput type="email" value={form.email} onChange={(event) => setField("email", event.target.value)} /></Field>
              <div className="sm:col-span-2"><Field label="Adres"><TextArea rows={3} value={form.profile.address ?? ""} onChange={(event) => onProfileChange("address", event.target.value)} placeholder="Açık Adres..." /></Field></div>
              <Field label="İl"><TextInput value={form.profile.city ?? ""} onChange={(event) => onProfileChange("city", event.target.value)} /></Field>
              <Field label="İlçe"><TextInput value={form.profile.district ?? ""} onChange={(event) => onProfileChange("district", event.target.value)} /></Field>
              <Field label="Posta Kodu"><TextInput value={form.profile.postalCode ?? ""} onChange={(event) => onProfileChange("postalCode", event.target.value)} /></Field>
            </FormGrid>
          </FormSection>
        ) : null}

        {step === 1 ? (
          <FormSection title="İş Bilgileri" description="Pozisyon, Çalışma Modeli Ve İşe Giriş Bilgileri.">
            <FormGrid>
              <Field label="Sicil / Personel No"><TextInput value={form.profile.personnelNumber ?? ""} onChange={(event) => onProfileChange("personnelNumber", event.target.value)} placeholder="PR-0001" /></Field>
              <Field label="Pozisyon"><TextInput value={form.profile.position ?? ""} onChange={(event) => onProfileChange("position", event.target.value)} placeholder="Güzellik Uzmanı" /></Field>
              <Field label="Departman"><TextInput value={form.profile.department ?? ""} onChange={(event) => onProfileChange("department", event.target.value)} placeholder="Güzellik" /></Field>
              <Field label="İşe Giriş Tarihi"><DatePicker value={form.profile.hireDate ?? ""} ariaLabel="İşe Giriş Tarihi" onChange={(value) => onProfileChange("hireDate", value)} /></Field>
              <Field label="Çalışma tipi">
                <ValooSelect
                  value={form.profile.employmentType ?? ""}
                  onChange={(employmentType) => onProfileChange("employmentType", employmentType)}
                  searchable={false}
                  placeholder="Seçiniz"
                  options={[
                    { value: "Tam zamanlı", label: "Tam zamanlı" },
                    { value: "Yarı zamanlı", label: "Yarı zamanlı" },
                    { value: "Freelance", label: "Serbest çalışan" },
                    { value: "Deneme süresi", label: "Deneme süresi" },
                  ]}
                />
              </Field>
              <Field label="Sözleşme tipi">
                <ValooSelect
                  value={form.profile.contractType ?? ""}
                  onChange={(contractType) => onProfileChange("contractType", contractType)}
                  searchable={false}
                  placeholder="Seçiniz"
                  options={[
                    { value: "Belirsiz süreli", label: "Belirsiz süreli" },
                    { value: "Belirli süreli", label: "Belirli süreli" },
                    { value: "Hizmet sözleşmesi", label: "Hizmet sözleşmesi" },
                  ]}
                />
              </Field>
            </FormGrid>
            <div className="mt-4">
              <Field label="Hizmet yetkinlikleri">
                <ValooMultiSelect
                  values={form.profile.services ?? []}
                  onChange={(services) => onProfileChange("services", services)}
                  options={serviceOptions}
                  placeholder="Personelin uygulayabildiği hizmetleri seçin"
                  searchPlaceholder="Hizmet ara…"
                  emptyLabel="Aktif hizmet bulunamadı."
                />
              </Field>
            </div>
            <FormHint title="Hizmet yetkinlikleri" tone="info">
              Bu seçim randevu planlamada personel-hizmet eşleşmesini desteklemek için personel profilinde saklanır.
            </FormHint>
          </FormSection>
        ) : null}

        {step === 2 ? (
          <FormSection title="Özlük Ve Finans" description="Sözleşme, Ücret Ve Banka Bilgileri.">
            <FormGrid>
              <Field label="Maaş tipi">
                <ValooSelect
                  value={form.profile.salaryType ?? ""}
                  onChange={(salaryType) => onProfileChange("salaryType", salaryType)}
                  searchable={false}
                  placeholder="Seçiniz"
                  options={[
                    { value: "Aylık", label: "Aylık" },
                    { value: "Saatlik", label: "Saatlik" },
                    { value: "Günlük", label: "Günlük" },
                  ]}
                />
              </Field>
              <Field label="Maaş"><TextInput type="number" min={0} value={form.profile.salary ?? ""} onChange={(event) => onProfileChange("salary", event.target.value === "" ? undefined : Number(event.target.value))} placeholder="0" /></Field>
              <Field label="Banka"><TextInput value={form.profile.bankName ?? ""} onChange={(event) => onProfileChange("bankName", event.target.value)} /></Field>
              <Field label="IBAN"><TextInput value={form.profile.iban ?? ""} onChange={(event) => { const normalized = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 26); onProfileChange("iban", normalized.replace(/(.{4})/g, "$1 ").trim()); }} placeholder="TR00 0000 0000 0000 0000 0000 00" /></Field>
            </FormGrid>
            <FormHint title="Hassas Özlük Verileri" tone="warning">
              Maaş Ve IBAN Gibi Finansal Personel Verilerine Erişim Yetkili Rollerle Sınırlandırılmalıdır. Bu Form İnternet Bankacılığı Kullanıcı Adı Veya Parola Toplamaz.
            </FormHint>
          </FormSection>
        ) : null}

        {step === 3 ? (
          <FormSection title="Acil Durum" description="Personel İçin Gerektiğinde Ulaşılacak Kişi.">
            <FormGrid>
              <Field label="Ad Soyad"><TextInput value={form.profile.emergencyName ?? ""} onChange={(event) => onProfileChange("emergencyName", event.target.value)} /></Field>
              <Field label="Yakınlık"><TextInput value={form.profile.emergencyRelation ?? ""} onChange={(event) => onProfileChange("emergencyRelation", event.target.value)} placeholder="Eş, Anne, Baba..." /></Field>
              <Field label="Telefon"><TextInput value={form.profile.emergencyPhone ?? ""} onChange={(event) => onProfileChange("emergencyPhone", event.target.value)} /></Field>
            </FormGrid>
          </FormSection>
        ) : null}

        {step === 4 ? (
          <FormSection title="Notlar" description="Özlük Dosyasına Eklemek İstediğiniz Diğer Bilgiler.">
            <Field label="Ek Notlar"><TextArea rows={6} value={form.profile.notes ?? ""} onChange={(event) => onProfileChange("notes", event.target.value)} placeholder="Personel Hakkında Ek Bilgiler..." /></Field>
            <FormGrid>
              <FormHint title="Özlük Dosyası">Temel Personel Kaydı Hazır.</FormHint>
              <FormHint title="Sonraki Aşama" tone="info">Belge Ve Personel-Hizmet İlişkilendirme Alanları Bu Kayıt Üzerinden Yönetilebilir.</FormHint>
            </FormGrid>
          </FormSection>
        ) : null}
      </div>

      {error ? <div className="mt-4"><Alert>{error}</Alert></div> : null}

      <FormActions sticky className="sm:justify-between">
        <div>
          {step > 0 ? (
            <Button
              variant="secondary"
              type="button"
              onClick={() => onStepChange(Math.max(0, step - 1))}
              disabled={saving}
            >
              Geri
            </Button>
          ) : null}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
            İptal
          </Button>
          {step < steps.length - 1 ? (
            <Button type="button" onClick={() => onStepChange(Math.min(steps.length - 1, step + 1))}>
              Devam et →
            </Button>
          ) : (
            <FormSubmitButton
              saving={saving}
              idleLabel={editing ? "Değişiklikleri kaydet" : "Personeli oluştur"}
            />
          )}
        </div>
      </FormActions>
    </form>
  );
}
