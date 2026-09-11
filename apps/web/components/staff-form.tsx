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
  { key: "personal", label: "Kişisel", description: "Kimlik ve iletişim" },
  { key: "work", label: "İş Bilgileri", description: "Pozisyon ve çalışma" },
  { key: "finance", label: "Özlük & Finans", description: "Sözleşme ve maaş" },
  { key: "emergency", label: "Acil Durum", description: "Yakın kişi bilgileri" },
  { key: "notes", label: "Notlar", description: "Ek bilgiler" },
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
          <FormSection title="Kişisel bilgiler" description="Kimlik, iletişim ve adres bilgileri.">
            <FormGrid>
              <Field label="Ad" required>
                <TextInput required value={form.firstName} onChange={(event) => setField("firstName", event.target.value)} />
              </Field>
              <Field label="Soyad" required>
                <TextInput required value={form.lastName} onChange={(event) => setField("lastName", event.target.value)} />
              </Field>
              <Field label="T.C. Kimlik No">
                <TextInput value={form.profile.identityNumber ?? ""} onChange={(event) => onProfileChange("identityNumber", event.target.value)} />
              </Field>
              <Field label="Doğum tarihi">
                <TextInput type="date" value={form.profile.birthDate ?? ""} onChange={(event) => onProfileChange("birthDate", event.target.value)} />
              </Field>
              <Field label="Doğum yeri">
                <TextInput value={form.profile.birthPlace ?? ""} onChange={(event) => onProfileChange("birthPlace", event.target.value)} />
              </Field>
              <Field label="Uyruk">
                <TextInput value={form.profile.nationality ?? "Türkiye Cumhuriyeti"} onChange={(event) => onProfileChange("nationality", event.target.value)} />
              </Field>
              <Field label="Cinsiyet">
                <Select value={form.profile.gender ?? ""} onChange={(event) => onProfileChange("gender", event.target.value)}>
                  <option value="">Seçiniz</option>
                  <option value="Kadın">Kadın</option>
                  <option value="Erkek">Erkek</option>
                  <option value="Belirtmek istemiyorum">Belirtmek istemiyorum</option>
                </Select>
              </Field>
              <Field label="Medeni durum">
                <Select value={form.profile.maritalStatus ?? ""} onChange={(event) => onProfileChange("maritalStatus", event.target.value)}>
                  <option value="">Seçiniz</option>
                  <option value="Bekar">Bekar</option>
                  <option value="Evli">Evli</option>
                  <option value="Diğer">Diğer</option>
                </Select>
              </Field>
              <Field label="Telefon" required>
                <TextInput value={form.phone} onChange={(event) => setField("phone", event.target.value)} />
              </Field>
              <Field label="E-posta">
                <TextInput type="email" value={form.email} onChange={(event) => setField("email", event.target.value)} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Adres">
                  <TextArea rows={3} value={form.profile.address ?? ""} onChange={(event) => onProfileChange("address", event.target.value)} placeholder="Açık adres..." />
                </Field>
              </div>
              <Field label="İl">
                <TextInput value={form.profile.city ?? ""} onChange={(event) => onProfileChange("city", event.target.value)} />
              </Field>
              <Field label="İlçe">
                <TextInput value={form.profile.district ?? ""} onChange={(event) => onProfileChange("district", event.target.value)} />
              </Field>
              <Field label="Posta kodu">
                <TextInput value={form.profile.postalCode ?? ""} onChange={(event) => onProfileChange("postalCode", event.target.value)} />
              </Field>
            </FormGrid>
          </FormSection>
        ) : null}

        {step === 1 ? (
          <FormSection title="İş bilgileri" description="Pozisyon, çalışma modeli ve işe giriş bilgileri.">
            <FormGrid>
              <Field label="Sicil / Personel No">
                <TextInput value={form.profile.personnelNumber ?? ""} onChange={(event) => onProfileChange("personnelNumber", event.target.value)} placeholder="PR-0001" />
              </Field>
              <Field label="Pozisyon">
                <TextInput value={form.profile.position ?? ""} onChange={(event) => onProfileChange("position", event.target.value)} placeholder="Güzellik Uzmanı" />
              </Field>
              <Field label="Departman">
                <TextInput value={form.profile.department ?? ""} onChange={(event) => onProfileChange("department", event.target.value)} placeholder="Güzellik" />
              </Field>
              <Field label="İşe giriş tarihi">
                <TextInput type="date" value={form.profile.hireDate ?? ""} onChange={(event) => onProfileChange("hireDate", event.target.value)} />
              </Field>
              <Field label="Çalışma tipi">
                <Select value={form.profile.employmentType ?? ""} onChange={(event) => onProfileChange("employmentType", event.target.value)}>
                  <option value="">Seçiniz</option>
                  <option value="Tam zamanlı">Tam zamanlı</option>
                  <option value="Yarı zamanlı">Yarı zamanlı</option>
                  <option value="Freelance">Freelance</option>
                  <option value="Deneme süresi">Deneme süresi</option>
                </Select>
              </Field>
              <Field label="Sözleşme tipi">
                <Select value={form.profile.contractType ?? ""} onChange={(event) => onProfileChange("contractType", event.target.value)}>
                  <option value="">Seçiniz</option>
                  <option value="Belirsiz süreli">Belirsiz süreli</option>
                  <option value="Belirli süreli">Belirli süreli</option>
                  <option value="Hizmet sözleşmesi">Hizmet sözleşmesi</option>
                </Select>
              </Field>
            </FormGrid>
            <FormHint title="Hizmet yetkinlikleri" tone="info">
              Personel-hizmet eşleştirmesi ayrı bir veri ilişkisi olarak bağlanacak. Bu nedenle burada kayıt edilmeyen sahte checkbox seçenekleri göstermiyoruz.
            </FormHint>
          </FormSection>
        ) : null}

        {step === 2 ? (
          <FormSection title="Özlük & finans" description="Sözleşme, ücret ve banka bilgileri.">
            <FormGrid>
              <Field label="Maaş tipi">
                <Select value={form.profile.salaryType ?? ""} onChange={(event) => onProfileChange("salaryType", event.target.value)}>
                  <option value="">Seçiniz</option>
                  <option value="Aylık">Aylık</option>
                  <option value="Saatlik">Saatlik</option>
                  <option value="Günlük">Günlük</option>
                </Select>
              </Field>
              <Field label="Maaş">
                <TextInput type="number" min={0} value={form.profile.salary ?? ""} onChange={(event) => onProfileChange("salary", event.target.value === "" ? undefined : Number(event.target.value))} placeholder="0" />
              </Field>
              <Field label="Banka">
                <TextInput value={form.profile.bankName ?? ""} onChange={(event) => onProfileChange("bankName", event.target.value)} />
              </Field>
              <Field label="IBAN">
                <TextInput value={form.profile.iban ?? ""} onChange={(event) => onProfileChange("iban", event.target.value)} placeholder="TR00 0000 0000 0000 0000 0000 00" />
              </Field>
            </FormGrid>
            <FormHint title="Hassas özlük verileri" tone="warning">
              Maaş ve IBAN gibi finansal personel verilerinin erişimi rol ve yetkilerle sınırlandırılmalıdır. Bu form internet bankacılığı kullanıcı adı veya parola toplamaz.
            </FormHint>
          </FormSection>
        ) : null}

        {step === 3 ? (
          <FormSection title="Acil durum" description="Personel için gerektiğinde ulaşılacak kişi.">
            <FormGrid>
              <Field label="Ad soyad">
                <TextInput value={form.profile.emergencyName ?? ""} onChange={(event) => onProfileChange("emergencyName", event.target.value)} />
              </Field>
              <Field label="Yakınlık">
                <TextInput value={form.profile.emergencyRelation ?? ""} onChange={(event) => onProfileChange("emergencyRelation", event.target.value)} placeholder="Eş, anne, baba..." />
              </Field>
              <Field label="Telefon">
                <TextInput value={form.profile.emergencyPhone ?? ""} onChange={(event) => onProfileChange("emergencyPhone", event.target.value)} />
              </Field>
            </FormGrid>
          </FormSection>
        ) : null}

        {step === 4 ? (
          <FormSection title="Notlar" description="Özlük dosyasına eklemek istediğiniz diğer bilgiler.">
            <Field label="Ek notlar">
              <TextArea rows={6} value={form.profile.notes ?? ""} onChange={(event) => onProfileChange("notes", event.target.value)} placeholder="Personel hakkında ek bilgiler..." />
            </Field>
            <FormGrid>
              <FormHint title="Özlük dosyası">Temel personel kaydı hazır.</FormHint>
              <FormHint title="Sonraki aşama" tone="info">Belge ve personel-hizmet ilişkilendirme modülleri bu kayıt üzerine bağlanabilir.</FormHint>
            </FormGrid>
          </FormSection>
        ) : null}
      </div>

      {error ? <div className="mt-4"><Alert>{error}</Alert></div> : null}

      <FormActions className="sm:justify-between">
        <Button
          variant="secondary"
          type="button"
          onClick={() => step === 0 ? onCancel() : onStepChange(Math.max(0, step - 1))}
          disabled={saving}
        >
          {step === 0 ? "Vazgeç" : "Geri"}
        </Button>

        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>İptal</Button>
          {step < steps.length - 1 ? (
            <Button type="button" onClick={() => onStepChange(Math.min(steps.length - 1, step + 1))}>Devam et →</Button>
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
