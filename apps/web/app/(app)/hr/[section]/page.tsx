"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { DataView, DataViewMeta } from "@/components/data-view";
import { FormActions, FormGrid, FormSection, FormSubmitButton } from "@/components/form-system";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";

type SectionKey = "employees" | "personnel-files" | "attendance" | "leaves" | "payroll" | "payments" | "sgk";
type SectionConfig = { title: string; get: string; post?: string; fields: readonly string[] };
type DataRow = Record<string, unknown> & { id?: string };
type StaffRow = DataRow & { id: string; firstName?: string; lastName?: string };
type FormState = Record<string, string | number | undefined>;

const SECTION_CONFIG: Record<SectionKey, SectionConfig> = {
  employees: {
    title: "Çalışanlar",
    get: "/hr/employees",
    post: "/staff",
    fields: ["firstName", "lastName", "phone", "email", "personnelNumber", "position", "department", "employmentType", "hireDate", "salary", "iban", "bankName"],
  },
  "personnel-files": {
    title: "Özlük Dosyaları",
    get: "/hr/personnel-files",
    fields: ["firstName", "lastName", "identityNumber", "department", "position", "hireDate", "salary", "iban", "bankName"],
  },
  attendance: {
    title: "Puantaj",
    get: "/hr/attendance",
    post: "/hr/attendance",
    fields: ["staffId", "workDate", "checkIn", "checkOut", "breakMinutes", "workedMinutes", "overtimeMinutes", "status", "note"],
  },
  leaves: {
    title: "İzinler",
    get: "/hr/leaves",
    post: "/hr/leaves",
    fields: ["staffId", "type", "startDate", "endDate", "days", "status", "reason"],
  },
  payroll: {
    title: "Bordro",
    get: "/hr/payroll",
    post: "/hr/payroll/periods",
    fields: ["year", "month"],
  },
  payments: {
    title: "Maaş Ödemeleri",
    get: "/hr/payments",
    post: "/hr/payments",
    fields: ["staffId", "year", "month", "amount", "method", "status", "paidAt", "note"],
  },
  sgk: {
    title: "SGK İşlemleri",
    get: "/hr/sgk",
    post: "/hr/sgk",
    fields: ["staffId", "year", "month", "status", "documentNo", "recordDate", "note"],
  },
};

const FIELD_LABELS: Record<string, string> = {
  firstName: "Ad",
  lastName: "Soyad",
  phone: "Telefon",
  email: "E-posta",
  personnelNumber: "Sicil No",
  identityNumber: "T.C. Kimlik No",
  position: "Pozisyon",
  department: "Departman",
  employmentType: "Çalışma Tipi",
  hireDate: "İşe Giriş",
  salary: "Brüt Maaş",
  iban: "IBAN",
  bankName: "Banka",
  staffId: "Personel",
  workDate: "Tarih",
  checkIn: "Giriş",
  checkOut: "Çıkış",
  breakMinutes: "Mola dk",
  workedMinutes: "Çalışma dk",
  overtimeMinutes: "Fazla Mesai dk",
  status: "Durum",
  note: "Not",
  type: "İzin Türü",
  startDate: "Başlangıç",
  endDate: "Bitiş",
  days: "Gün",
  reason: "Açıklama",
  year: "Yıl",
  month: "Ay",
  amount: "Tutar",
  method: "Yöntem",
  paidAt: "Ödeme Tarihi",
  documentNo: "Belge No",
  recordDate: "Kayıt Tarihi",
};

const DATE_FIELDS = new Set(["hireDate", "workDate", "startDate", "endDate", "paidAt", "recordDate"]);
const NUMBER_FIELDS = new Set(["salary", "breakMinutes", "workedMinutes", "overtimeMinutes", "days", "year", "month", "amount"]);
const SELECT_VALUES: Record<string, readonly string[]> = {
  status: ["PENDING", "APPROVED", "PAID", "PRESENT", "ABSENT", "DRAFT"],
  type: ["ANNUAL", "SICK", "EXCUSE", "UNPAID", "OTHER"],
  method: ["BANK", "CASH"],
};
const PERIOD_SECTIONS = new Set<SectionKey>(["attendance", "payroll", "payments", "sgk"]);
const EDITABLE_SECTIONS = new Set<SectionKey>(["employees", "attendance", "leaves"]);

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    if (!section || !config) return;
    setLoading(true);
    setError("");
    try {
      const response = await api<unknown>(
        PERIOD_SECTIONS.has(section) ? withQuery(config.get, { year, month }) : config.get,
      );
      const nextRows = rowsFromResponse(response);
      setRows(nextRows);

      if (section !== "employees" && section !== "personnel-files") {
        const employees = await api<unknown>("/hr/employees");
        setStaff(rowsFromResponse(employees).filter(isStaffRow));
      } else {
        setStaff(nextRows.filter(isStaffRow));
      }
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "İK verileri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [section, year, month]);

  const visibleFields = useMemo(() => config?.fields.slice(0, 8) ?? [], [config]);
  const editable = section ? EDITABLE_SECTIONS.has(section) : false;

  function updateField(field: string, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function save() {
    if (!section || !config?.post) return;
    setSaving(true);
    setError("");
    try {
      const isPatch = Boolean(edit && section !== "attendance");
      const endpoint = isPatch && edit?.id ? `${config.get}/${edit.id}` : config.post;
      await api(endpoint, {
        method: isPatch ? "PATCH" : "POST",
        body: normalizeForm(section, form),
      });
      setForm({ year, month });
      setEdit(null);
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Kayıt kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row: DataRow) {
    setEdit(row);
    const nextForm: FormState = { year, month };
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === "string" || typeof value === "number") nextForm[key] = value;
    }
    setForm(nextForm);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetEdit() {
    setEdit(null);
    setForm({ year, month });
  }

  async function remove(id: string) {
    if (!config || !id || !window.confirm("Bu kayıt silinsin/arşivlensin mi?")) return;
    try {
      await api(`${config.get}/${id}`, { method: "DELETE" });
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Silme işlemi başarısız.");
    }
  }

  if (!section || !config) {
    return (
      <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-8 text-[13px] text-[var(--muted)]">
        İK sayfası bulunamadı.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1280px] space-y-5 pb-10">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[.15em] text-[var(--muted-soft)]">
            İnsan Kaynakları & Özlük
          </p>
          <h1 className="mt-1 text-[30px] font-semibold tracking-[-.035em] text-[var(--ink)]">{config.title}</h1>
          <p className="mt-1 text-xs text-[var(--muted)]">Canlı API ve veritabanı kayıt ekranı.</p>
        </div>
        {PERIOD_SECTIONS.has(section) ? (
          <div className="flex gap-2">
            <input
              className="control h-10 w-24"
              type="number"
              value={year}
              aria-label="Yıl"
              onChange={(event) => setYear(Number(event.target.value))}
            />
            <select
              className="control h-10 min-w-[110px]"
              value={month}
              aria-label="Ay"
              onChange={(event) => setMonth(Number(event.target.value))}
            >
              {Array.from({ length: 12 }, (_, index) => (
                <option key={index + 1} value={index + 1}>{index + 1}. Ay</option>
              ))}
            </select>
          </div>
        ) : null}
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      {config.post ? (
        <section className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_10px_30px_rgba(17,70,104,.045)]">
          <FormSection
            title={edit ? "Kaydı Güncelle" : "Yeni Kayıt"}
            description="Alanları doldurun ve kaydedin. Hassas personel ve bordro verileri yalnız yetkili İK rollerince görüntülenmelidir."
          >
            <FormGrid columns={3} className="xl:grid-cols-4">
              {config.fields.map((field) => (
                <DynamicField
                  key={field}
                  field={field}
                  value={form[field] ?? ""}
                  staff={staff}
                  onChange={(value) => updateField(field, value)}
                />
              ))}
            </FormGrid>
          </FormSection>
          <FormActions>
            {edit ? (
              <Button type="button" variant="secondary" onClick={resetEdit} disabled={saving}>
                İptal
              </Button>
            ) : null}
            <FormSubmitButton
              type="button"
              saving={saving}
              idleLabel={edit ? "Güncelle" : "Kaydet"}
              savingLabel="Kaydediliyor…"
              onClick={() => void save()}
            />
          </FormActions>
        </section>
      ) : null}

      {loading ? (
        <div className="flex h-56 items-center justify-center rounded-[20px] border border-[var(--line)] bg-[var(--surface)]">
          <Spinner />
        </div>
      ) : (
        <DataView>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--line)] bg-[var(--surface-2)]/40 text-[10px] uppercase tracking-[.08em] text-[var(--muted-soft)]">
                  {visibleFields.map((field) => (
                    <th key={field} className="p-4 font-semibold">{FIELD_LABELS[field] ?? field}</th>
                  ))}
                  <th className="p-4 font-semibold">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.id ?? `row-${index}`} className="border-b border-[var(--line)] last:border-0">
                    {visibleFields.map((field) => (
                      <td key={field} className="p-4 text-[var(--muted)]">
                        {field === "staffId"
                          ? displayValue(row.firstName ? `${String(row.firstName)} ${String(row.lastName ?? "")}`.trim() : row[field])
                          : displayValue(row[field])}
                      </td>
                    ))}
                    <td className="p-4">
                      <div className="flex gap-3">
                        {editable && row.id ? (
                          <button type="button" className="text-[var(--accent)]" onClick={() => startEdit(row)}>
                            Düzenle
                          </button>
                        ) : null}
                        {(section === "employees" || section === "leaves") && row.id ? (
                          <button type="button" className="text-[var(--danger)]" onClick={() => void remove(row.id!)}>
                            Sil
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length ? (
            <div className="p-10 text-center text-xs text-[var(--muted)]">Bu dönem için kayıt bulunmuyor.</div>
          ) : null}
          <DataViewMeta>
            <span>{rows.length} kayıt</span>
            <span>{PERIOD_SECTIONS.has(section) ? `${year}/${String(month).padStart(2, "0")}` : config.title}</span>
          </DataViewMeta>
        </DataView>
      )}
    </div>
  );
}

function DynamicField({
  field,
  value,
  staff,
  onChange,
}: {
  field: string;
  value: string | number;
  staff: StaffRow[];
  onChange: (value: string) => void;
}) {
  const label = FIELD_LABELS[field] ?? field;
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium text-[var(--muted)]">{label}</span>
      {field === "staffId" ? (
        <select className="control h-11 w-full" value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">Personel seçin</option>
          {staff.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.firstName ?? ""} {employee.lastName ?? ""}
            </option>
          ))}
        </select>
      ) : SELECT_VALUES[field] ? (
        <select className="control h-11 w-full" value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">Seçin</option>
          {SELECT_VALUES[field].map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : (
        <input
          className="control h-11 w-full"
          type={DATE_FIELDS.has(field) ? "date" : NUMBER_FIELDS.has(field) ? "number" : "text"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}

function normalizeForm(section: SectionKey, raw: FormState): Record<string, unknown> {
  const body: Record<string, unknown> = { ...raw };
  if (section === "employees") {
    const profile: Record<string, unknown> = {};
    for (const key of ["personnelNumber", "identityNumber", "position", "department", "employmentType", "hireDate", "salary", "iban", "bankName"]) {
      const value = body[key];
      if (value !== undefined && value !== "") profile[key] = NUMBER_FIELDS.has(key) ? Number(value) : value;
    }
    return {
      firstName: body.firstName,
      lastName: body.lastName,
      phone: body.phone || undefined,
      email: body.email || undefined,
      profile,
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

function isDataRow(value: unknown): value is DataRow {
  return typeof value === "object" && value !== null;
}

function isStaffRow(value: DataRow): value is StaffRow {
  return typeof value.id === "string";
}

function isSectionKey(value: string): value is SectionKey {
  return value in SECTION_CONFIG;
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" && value.includes("T")) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleString("tr-TR");
  }
  return String(value);
}
