"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { CardInfo } from "@/components/card-info";
import { DataView, DataViewMeta } from "@/components/data-view";
import { DatePicker } from "@/components/date-picker";
import { FormActions, FormGrid, FormSection, FormSubmitButton } from "@/components/form-system";
import { Alert, Button, EmptyState, Modal, Spinner } from "@/components/ui";
import { ValooSelect } from "@/components/valoo-controls";
import { api, ApiError, withQuery } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import { getCardHelp } from "@/lib/card-help";
import { userErrorMessage, userLabel } from "@/lib/user-language";

type SectionKey = "employees" | "personnel-files" | "attendance" | "leaves" | "payroll" | "payments" | "sgk";
type SectionConfig = { title: string; get: string; post?: string; fields: readonly string[] };
type DataRow = Record<string, unknown> & { id?: string };
type StaffRow = DataRow & { id: string; firstName?: string; lastName?: string };
type FormState = Record<string, string | number | undefined>;

const SECTION_CONFIG: Record<SectionKey, SectionConfig> = {
  employees: { title: "Çalışan Kayıtları", get: "/hr/employees", post: "/hr/employees", fields: ["firstName","lastName","phone","email","personnelNumber","position","department","employmentType","hireDate","grossSalary","iban","bankName"] },
  "personnel-files": { title: "Özlük Dosyaları", get: "/hr/personnel-files", fields: ["firstName","lastName","identityNumber","department","position","hireDate","salary","iban","bankName"] },
  attendance: { title: "Puantaj", get: "/hr/attendance", post: "/hr/attendance", fields: ["staffId","workDate","checkIn","checkOut","breakMinutes","workedMinutes","overtimeMinutes","status","note"] },
  leaves: { title: "İzinler", get: "/hr/leaves", post: "/hr/leaves", fields: ["staffId","type","startDate","endDate","days","status","reason"] },
  payroll: { title: "Bordro", get: "/hr/payroll", post: "/hr/payroll/periods", fields: ["year","month"] },
  payments: { title: "Maaş Ödemeleri", get: "/hr/payments", post: "/hr/payments", fields: ["staffId","year","month","amount","method","status","paidAt","note"] },
  sgk: { title: "SGK İşlemleri", get: "/hr/sgk", post: "/hr/sgk", fields: ["staffId","year","month","status","documentNo","recordDate","note"] },
};

const FIELD_LABELS: Record<string, string> = {
  firstName: "Ad", lastName: "Soyad", phone: "Telefon", email: "E-posta", personnelNumber: "Sicil No",
  identityNumber: "T.C. Kimlik No", position: "Pozisyon", department: "Departman", employmentType: "Çalışma şekli",
  hireDate: "İşe giriş", salary: "Brüt maaş", grossSalary: "Brüt maaş", iban: "IBAN", bankName: "Banka",
  staffId: "Personel", workDate: "Tarih", checkIn: "Giriş", checkOut: "Çıkış", breakMinutes: "Mola süresi",
  workedMinutes: "Çalışma süresi", overtimeMinutes: "Fazla mesai süresi", status: "Durum", note: "Not",
  type: "İzin türü", startDate: "Başlangıç", endDate: "Bitiş", days: "Gün", reason: "Açıklama",
  year: "Yıl", month: "Ay", amount: "Tutar", method: "Ödeme şekli", paidAt: "Ödeme tarihi",
  documentNo: "Belge no", recordDate: "Kayıt tarihi",
};

const DATE_FIELDS = new Set(["hireDate","workDate","startDate","endDate","paidAt","recordDate"]);
const NUMBER_FIELDS = new Set(["salary","grossSalary","breakMinutes","workedMinutes","overtimeMinutes","days","year","month","amount"]);
const SELECT_VALUES: Record<string, readonly string[]> = {
  status: ["PENDING","APPROVED","PAID","PRESENT","ABSENT","DRAFT"],
  type: ["ANNUAL","SICK","EXCUSE","UNPAID","OTHER"],
  method: ["BANK","CASH"],
};
const PERIOD_SECTIONS = new Set<SectionKey>(["attendance","payroll","payments","sgk"]);
const EDITABLE_SECTIONS = new Set<SectionKey>(["employees","attendance","leaves"]);
const SENSITIVE_SECTIONS = new Set<SectionKey>(["personnel-files","payroll","payments","sgk"]);
const SENSITIVE_EMPLOYEE_FIELDS = new Set(["grossSalary","iban","bankName"]);

export default function HRSection() {
  const params = useParams<{ section: string }>();
  const section = isSectionKey(params.section) ? params.section : null;
  const config = section ? SECTION_CONFIG[section] : null;
  const now = new Date();

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rows, setRows] = useState<DataRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [form, setForm] = useState<FormState>({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [edit, setEdit] = useState<DataRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [canReadSensitive, setCanReadSensitive] = useState(false);

  useEffect(() => { setCanReadSensitive(hasPermission("hr_sensitive", "read")); }, []);

  async function load() {
    if (!section) return;
    const currentConfig = SECTION_CONFIG[section];
    if (SENSITIVE_SECTIONS.has(section) && !canReadSensitive) {
      setRows([]); setStaff([]); setLoading(false); return;
    }
    setLoading(true); setError("");
    try {
      const baseGet = section === "personnel-files" ? "/hr/personnel-files/sensitive" : currentConfig.get;
      const response = await api<unknown>(PERIOD_SECTIONS.has(section) ? withQuery(baseGet, { year, month }) : baseGet);
      const nextRows = rowsFromResponse(response);
      setRows(nextRows);
      if (section !== "employees" && section !== "personnel-files") {
        const employees = await api<unknown>("/hr/employees");
        setStaff(rowsFromResponse(employees).filter(isStaffRow));
      } else {
        setStaff(nextRows.filter(isStaffRow));
      }
    } catch (e) {
      setError(e instanceof ApiError ? userErrorMessage(e.message, "İnsan kaynakları bilgileri yüklenemedi.") : "İK verileri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [section, canReadSensitive, year, month]);

  const visibleFields = useMemo(
    () => config?.fields.filter((field) => canReadSensitive || !SENSITIVE_EMPLOYEE_FIELDS.has(field)).slice(0, 8) ?? [],
    [config, canReadSensitive],
  );
  const formFields = useMemo(
    () => config?.fields.filter((field) => canReadSensitive || !SENSITIVE_EMPLOYEE_FIELDS.has(field)) ?? [],
    [config, canReadSensitive],
  );
  const editable = section ? EDITABLE_SECTIONS.has(section) : false;

  function updateField(field: string, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function openCreate() {
    setEdit(null);
    setForm({ year, month });
    setError("");
    setFormOpen(true);
  }

  function startEdit(row: DataRow) {
    setEdit(row);
    const next: FormState = { year, month };
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === "string" || typeof value === "number") next[key] = value;
    }
    setForm(next);
    setFormOpen(true);
  }

  function closeForm() {
    if (saving) return;
    setEdit(null);
    setForm({ year, month });
    setFormOpen(false);
  }

  async function save() {
    if (!section || !config?.post) return;
    if (SENSITIVE_SECTIONS.has(section) && !canReadSensitive) {
      setError("Bu bilgileri değiştirmek için yetkiniz bulunmuyor.");
      return;
    }
    setSaving(true); setError(""); setNotice("");
    try {
      const patch = Boolean(edit && section !== "attendance");
      const endpoint = patch && edit?.id ? `${config.get}/${edit.id}` : config.post;
      await api(endpoint, { method: patch ? "PATCH" : "POST", body: normalizeForm(section, form, canReadSensitive) });
      setNotice(edit ? "Kayıt güncellendi." : "Yeni kayıt oluşturuldu.");
      setForm({ year, month });
      setEdit(null);
      setFormOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? userErrorMessage(e.message, "Bilgiler kaydedilemedi.") : "Kayıt kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!config || !id || !window.confirm("Bu kaydı kaldırmak istediğinize emin misiniz? Çalışan kayıtları kalıcı olarak silinmez, arşive alınır.")) return;
    try {
      await api(`${config.get}/${id}`, { method: "DELETE" });
      setNotice("Kayıt kaldırıldı.");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? userErrorMessage(e.message, "Kayıt kaldırılamadı.") : "Silme işlemi tamamlanamadı.");
    }
  }

  if (!section || !config) {
    return <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-8 text-[13px] text-[var(--muted)]">İnsan kaynakları bölümü bulunamadı.</div>;
  }

  if (SENSITIVE_SECTIONS.has(section) && !canReadSensitive) {
    return <div className="mx-auto max-w-[900px] py-8"><section className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-8"><p className="text-[11px] font-semibold uppercase tracking-[.15em] text-[var(--muted-soft)]">İnsan Kaynakları · Yetkili Erişim</p><h1 className="mt-2 text-2xl font-semibold text-[var(--ink)]">{config.title}</h1><p className="mt-3 max-w-2xl text-xs leading-6 text-[var(--muted)]">Bu bölüm kimlik, özlük, ücret, banka veya sosyal güvenlik gibi özel çalışan bilgileri içerir. Bu bilgileri yalnızca yetkili kullanıcılar görüntüleyebilir.</p><Link href="/hr/employees" className="mt-5 inline-block text-xs font-semibold text-[var(--accent)]">Çalışanlara dön →</Link></section></div>;
  }

  return <div className="mx-auto max-w-[1280px] space-y-5 pb-10">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[.15em] text-[var(--muted-soft)]">İnsan Kaynakları</p>
        <div className="mt-1 flex items-center gap-2">
          <h1 className="text-[30px] font-semibold tracking-[-.035em] text-[var(--ink)]">{config.title}</h1>
          <CardInfo help={getCardHelp(config.title)} />
        </div>
        <p className="mt-1 text-xs text-[var(--muted)]">Kayıtları görüntüleyin; yeni işlemleri sayfadan ayrılmadan başlatın.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {PERIOD_SECTIONS.has(section) ? <>
          <input className="control h-10 w-24" type="number" value={year} aria-label="Yıl" onChange={(event) => setYear(Number(event.target.value))} />
          <ValooSelect className="min-w-[140px]" value={String(month)} ariaLabel="Ay" searchable={false} onChange={(value) => setMonth(Number(value))} options={Array.from({ length: 12 }, (_, index) => ({ value: String(index + 1), label: `${index + 1}. Ay` }))} />
        </> : null}
        {config.post ? <Button onClick={openCreate}>+ Yeni Kayıt</Button> : null}
      </div>
    </header>

    {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
    {notice ? <Alert tone="success" onClose={() => setNotice("")}>{notice}</Alert> : null}

    <Modal
      open={formOpen}
      onClose={closeForm}
      title={edit ? "Kaydı Güncelle" : `Yeni ${config.title} Kaydı`}
      description="Gerekli alanları doldurun. Sistem içinde mevcut olan bilgiler seçim alanlarından alınır."
    >
      <div>
        <FormSection title={edit ? "Kayıt Bilgileri" : "Yeni Kayıt"} description="Yalnızca gerekli bilgileri girin; mevcut kayıtları seçim alanlarından kullanın.">
          <FormGrid columns={2} className="xl:grid-cols-2">
            {formFields.map((field) => <DynamicField key={field} field={field} value={form[field] ?? ""} staff={staff} onChange={(value) => updateField(field, value)} />)}
          </FormGrid>
        </FormSection>
        <FormActions>
          <Button type="button" variant="secondary" onClick={closeForm} disabled={saving}>Vazgeç</Button>
          <FormSubmitButton type="button" saving={saving} idleLabel={edit ? "Değişiklikleri Kaydet" : "Kaydı Oluştur"} savingLabel="Kaydediliyor…" onClick={() => void save()} />
        </FormActions>
      </div>
    </Modal>

    {loading ? <div className="flex h-56 items-center justify-center rounded-[20px] border border-[var(--line)] bg-[var(--surface)]"><Spinner /></div> : (
      <DataView>
        {rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs">
          <thead><tr className="border-b border-[var(--line)] bg-[var(--surface-2)]/40 text-[10px] uppercase tracking-[.08em] text-[var(--muted-soft)]">
            {visibleFields.map((field) => <th key={field} className="p-4 font-semibold">{FIELD_LABELS[field] ?? field}</th>)}
            <th className="p-4 text-right font-semibold">İşlem</th>
          </tr></thead>
          <tbody>{rows.map((row, index) => <tr key={row.id ?? `row-${index}`} className="border-b border-[var(--line)] last:border-0">
            {visibleFields.map((field) => <td key={field} className="p-4 text-[var(--muted)]">{field === "staffId" ? displayValue(row.firstName ? `${String(row.firstName)} ${String(row.lastName ?? "")}`.trim() : row[field]) : displayValue(row[field])}</td>)}
            <td className="p-4"><div className="flex justify-end gap-1.5">
              {section === "employees" && row.id ? <Link className="inline-flex h-8 items-center rounded-lg px-2.5 text-[10px] font-semibold text-[var(--accent)] hover:bg-[var(--accent-soft)]" href={`/hr/employees/${row.id}`}>360° Görünüm</Link> : null}
              {editable && row.id ? <Button size="sm" variant="ghost" onClick={() => startEdit(row)}>Düzenle</Button> : null}
              {(section === "employees" || section === "leaves") && row.id ? <Button size="sm" variant="ghost" onClick={() => void remove(row.id!)}>Kaldır</Button> : null}
            </div></td>
          </tr>)}</tbody>
        </table></div> : <div className="p-8">
          <EmptyState title="Henüz kayıt yok" description="Bu bölümde görüntülenecek kayıt bulunmuyor." />
          {config.post ? <div className="mt-4 flex justify-center"><Button onClick={openCreate}>+ İlk Kaydı Ekle</Button></div> : null}
        </div>}
        <DataViewMeta>
          <span>{rows.length} kayıt</span>
          <span>{PERIOD_SECTIONS.has(section) ? `${year}/${String(month).padStart(2, "0")}` : config.title}</span>
        </DataViewMeta>
      </DataView>
    )}
  </div>;
}

function DynamicField({ field, value, staff, onChange }: { field: string; value: string | number; staff: StaffRow[]; onChange: (value: string) => void }) {
  const label = FIELD_LABELS[field] ?? field;
  const normalized = String(value ?? "");
  return <label className="block">
    <span className="mb-2 block text-[13px] font-medium text-[var(--ink)]">{label}</span>
    {field === "staffId" ? <ValooSelect value={normalized} onChange={onChange} placeholder="Çalışan seçin" searchPlaceholder="Çalışan ara…" emptyLabel="Çalışan bulunamadı." options={staff.map((item) => ({ value: item.id, label: `${item.firstName ?? ""} ${item.lastName ?? ""}`.trim() }))} /> :
      SELECT_VALUES[field] ? <ValooSelect value={normalized} onChange={onChange} searchable={false} placeholder="Seçin" options={SELECT_VALUES[field].map((option) => ({ value: option, label: userLabel(option) }))} /> :
      DATE_FIELDS.has(field) ? <DatePicker value={normalized} onChange={onChange} ariaLabel={label} /> :
      <input className="control h-11 w-full" type={NUMBER_FIELDS.has(field) ? "number" : "text"} value={value} onChange={(event) => onChange(event.target.value)} />}
  </label>;
}

function normalizeForm(section: SectionKey, raw: FormState, canReadSensitive: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = { ...raw };
  if (section === "employees") {
    return {
      firstName: body.firstName,
      lastName: body.lastName,
      phone: body.phone || undefined,
      email: body.email || undefined,
      personnelNumber: body.personnelNumber || undefined,
      position: body.position || undefined,
      department: body.department || undefined,
      employmentType: body.employmentType || undefined,
      hireDate: body.hireDate || undefined,
      ...(canReadSensitive ? {
        grossSalary: body.grossSalary === "" ? undefined : Number(body.grossSalary),
        iban: body.iban || undefined,
        bankName: body.bankName || undefined,
      } : {}),
    };
  }
  for (const key of Object.keys(body)) {
    if (NUMBER_FIELDS.has(key) && body[key] !== "") body[key] = Number(body[key]);
  }
  return body;
}

function rowsFromResponse(response: unknown): DataRow[] {
  if (Array.isArray(response)) return response.filter(isDataRow);
  if (isDataRow(response) && Array.isArray(response.data)) return response.data.filter(isDataRow);
  return [];
}
function isDataRow(value: unknown): value is DataRow { return typeof value === "object" && value !== null; }
function isStaffRow(value: DataRow): value is StaffRow { return typeof value.id === "string"; }
function isSectionKey(value: string): value is SectionKey { return value in SECTION_CONFIG; }
function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" && value.includes("T")) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleString("tr-TR");
  }
  if (typeof value === "string") return userLabel(value);
  return String(value);
}
