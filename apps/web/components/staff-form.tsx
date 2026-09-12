"use client";

import type { FormEventHandler } from "react";

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
  Select,
  TextArea,
  TextInput,
} from "@/components/ui";
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
}: Props) {
  const setField = <K extends keyof StaffEditorState>(key: K, value: StaffEditorState[K]) => {
    onChange({ ...form, [key]: value });
  };

  return (
    <form onSubmit={onSubmit} className="flex min-h-0 flex-col">
      <FormStepper steps={steps} current={step} onStepChange={onStepChange} />

      <div className="mt-5 min-h-[360px] overflow-y-auto pr-1">
        {step === 0 ? (
          <FormSection title="Kişisel Bilgiler" description="Kimlik, İletişim Ve Adres Bilgileri.">
            <FormGrid>
              <Field label="Ad" required><TextInput required value={form.firstName} onChange={(event) => setField("firstName", event.target.value)} /></Field>
              <Field label="Soyad" required><TextInput required value={form.lastName} onChange={(event) => setField("lastName", event.target.value)} /></Field>
              <Field label="T.C. Kimlik No"><TextInput value={form.profile.identityNumber ?? ""} onChange={(event) => onProfileChange("identityNumber", event.target.value)} /></Field>
              <Field label="Doğum Tarihi"><TextInput type="date" value={form.profile.birthDate ?? ""} onChange={(event) => onProfileChange("birthDate", event.target.value)} /></Field>
              <Field label="Doğum Yeri"><TextInput value={form.profile.birthPlace ?? ""} onChange={(event) => onProfileChange("birthPlace", event.target.value)} /></Field>
              <Field label="Uyruk"><TextInput value={form.profile.nationality ?? "Türkiye Cumhuriyeti"} onChange={(event) => onProfileChange("nationality", event.target.value)} /></Field>
              <Field label="Cinsiyet">
                <Select value={form.profile.gender ?? ""} onChange={(event) => onProfileChange("gender", event.target.value)}>
                  <option value="">Seçiniz</option><option value="Kadın">Kadın</option><option value="Erkek">Erkek</option><option value="Belirtmek istemiyorum">Belirtmek İstemiyorum</option>
                </Select>
              </Field>
              <Field label="Medeni Durum">
                <Select value={form.profile.maritalStatus ?? ""} onChange={(event) => onProfileChange("maritalStatus", event.target.value)}>
                  <option value="">Seçiniz</option><option value="Bekar">Bekar</option><option value="Evli">Evli</option><option value="Diğer">Diğer</option>
                </Select>
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
              <Field label="İşe Giriş Tarihi"><TextInput type="date" value={form.profile.hireDate ?? ""} onChange={(event) => onProfileChange("hireDate", event.target.value)} /></Field>
              <Field label="Çalışma Tipi">
                <Select value={form.profile.employmentType ?? ""} onChange={(event) => onProfileChange("employmentType", event.target.value)}>
                  <option value="">Seçiniz</option><option value="Tam zamanlı">Tam Zamanlı</option><option value="Yarı zamanlı">Yarı Zamanlı</option><option value="Freelance">Serbest Çalışan</option><option value="Deneme süresi">Deneme Süresi</option>
                </Select>
              </Field>
              <Field label="Sözleşme Tipi">
                <Select value={form.profile.contractType ?? ""} onChange={(event) => onProfileChange("contractType", event.target.value)}>
                  <option value="">Seçiniz</option><option value="Belirsiz süreli">Belirsiz Süreli</option><option value="Belirli süreli">Belirli Süreli</option><option value="Hizmet sözleşmesi">Hizmet Sözleşmesi</option>
                </Select>
              </Field>
            </FormGrid>
            <FormHint title="Hizmet Yetkinlikleri" tone="info">
              Personelin Uygulayabildiği Hizmetler, Hizmet Yetkinlikleri Alanından Ayrıca Yönetilir.
            </FormHint>
          </FormSection>
        ) : null}

        {step === 2 ? (
          <FormSection title="Özlük Ve Finans" description="Sözleşme, Ücret Ve Banka Bilgileri.">
            <FormGrid>
              <Field label="Maaş Tipi">
                <Select value={form.profile.salaryType ?? ""} onChange={(event) => onProfileChange("salaryType", event.target.value)}>
                  <option value="">Seçiniz</option><option value="Aylık">Aylık</option><option value="Saatlik">Saatlik</option><option value="Günlük">Günlük</option>
                </Select>
              </Field>
              <Field label="Maaş"><TextInput type="number" min={0} value={form.profile.salary ?? ""} onChange={(event) => onProfileChange("salary", event.target.value === "" ? undefined : Number(event.target.value))} placeholder="0" /></Field>
              <Field label="Banka"><TextInput value={form.profile.bankName ?? ""} onChange={(event) => onProfileChange("bankName", event.target.value)} /></Field>
              <Field label="IBAN"><TextInput value={form.profile.iban ?? ""} onChange={(event) => onProfileChange("iban", event.target.value)} placeholder="TR00 0000 0000 0000 0000 0000 00" /></Field>
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

      <FormActions className="sm:justify-between">
        <Button variant="secondary" type="button" onClick={() => step === 0 ? onCancel() : onStepChange(Math.max(0, step - 1))} disabled={saving}>
          {step === 0 ? "Vazgeç" : "Geri"}
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>İptal</Button>
          {step < steps.length - 1 ? (
            <Button type="button" onClick={() => onStepChange(Math.min(steps.length - 1, step + 1))}>Devam Et →</Button>
          ) : (
            <FormSubmitButton saving={saving} idleLabel={editing ? "Değişiklikleri Kaydet" : "Personeli Oluştur"} />
          )}
        </div>
      </FormActions>
    </form>
  );
}
