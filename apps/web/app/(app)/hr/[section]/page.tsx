"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { CardInfo } from "@/components/card-info";
import { DataView, DataViewMeta } from "@/components/data-view";
import { DatePicker } from "@/components/date-picker";
import { FormActions, FormGrid, FormSection, FormSubmitButton } from "@/components/form-system";
import { Alert, Button, EmptyState, Modal, Spinner } from "@/components/ui";
import { ConfirmDialog } from "@/components/modal";
import { ValooSelect } from "@/components/valoo-controls";
import { api, ApiError, withQuery } from "@/lib/api";
import { getActiveBranchId, hasPermission } from "@/lib/auth";
import { getCardHelp } from "@/lib/card-help";
import { userErrorMessage, userLabel } from "@/lib/user-language";

type SectionKey = "employees" | "personnel-files" | "attendance" | "leaves" | "payroll" | "payments" | "sgk";
type SectionConfig = { title: string; get: string; post?: string; fields: readonly string[] };
type DataRow = Record<string, unknown> & { id?: string };
type StaffRow = DataRow & { id: string; firstName?: string; lastName?: string; departmentId?: string | null; positionId?: string | null };
type OrgItem = { id: string; name: string; code?: string; department_id?: string | null };
type OrganizationData = { branches: OrgItem[]; departments: OrgItem[]; teams: OrgItem[]; positions: OrgItem[] };
type EmployeeRole = { id: string; name: string; slug: string; scope: "CENTRAL" | "COMPANY" | "BRANCH"; description?: string | null };
type EmployeeCreateResponse = DataRow & { accountProvisioning?: { activationToken?: string; expiresAt?: string; roleName?: string; status?: string } };
type FormState = Record<string, string | number | undefined>;

const SECTION_CONFIG: Record<SectionKey, SectionConfig> = {
  employees: { title: "Çalışan Kayıtları", get: "/hr/employees", post: "/hr/employees", fields: ["firstName","lastName","phone","email","roleId","personnelNumber","department","position","employmentType","hireDate","grossSalary","iban","bankName"] },
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
  documentNo: "Belge no", recordDate: "Kayıt tarihi", branchId: "Şube", departmentId: "Departman", teamId: "Ekip", positionId: "Pozisyon", managerStaffId: "Yönetici", roleId: "Kullanıcı Tipi",
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
  const [organization, setOrganization] = useState<OrganizationData>({ branches: [], departments: [], teams: [], positions: [] });
  const [employeeRoles, setEmployeeRoles] = useState<EmployeeRole[]>([]);
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [edit, setEdit] = useState<DataRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [orgCreate, setOrgCreate] = useState<"department" | "team" | "position" | null>(null);
  const [orgDraft, setOrgDraft] = useState({ code: "", name: "", departmentId: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const [activationLink, setActivationLink] = useState("");
  const [activationEmail, setActivationEmail] = useState("");
  const [activationExpiresAt, setActivationExpiresAt] = useState("");
  const [canReadSensitive, setCanReadSensitive] = useState(false);

  useEffect(() => {
    setCanReadSensitive(hasPermission("hr_sensitive", "read"));
    setActiveBranchId(getActiveBranchId());
  }, []);

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
      if (section === "employees") {
        const [org, roles] = await Promise.all([
          api<OrganizationData>("/hr/organization"),
          api<EmployeeRole[]>("/hr/employee-provisioning/roles"),
        ]);
        const branches = Array.isArray(org.branches) ? org.branches : [];
        setOrganization({
          branches,
          departments: Array.isArray(org.departments) ? org.departments : [],
          teams: Array.isArray(org.teams) ? org.teams : [],
          positions: Array.isArray(org.positions) ? org.positions : [],
        });
        setEmployeeRoles(Array.isArray(roles) ? roles : []);
        if (!activeBranchId && branches.length === 1) {
          setForm((current) => ({ ...current, branchId: branches[0].id }));
        }
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
  const formFields = useMemo(() => {
    if (!config) return [];
    const fields = config.fields.filter((field) => canReadSensitive || !SENSITIVE_EMPLOYEE_FIELDS.has(field));
    if (section !== "employees") return fields;
    const employeeFields = edit ? fields.filter((field) => field !== "roleId") : fields;
    const mapped = employeeFields.flatMap((field) =>
      field === "department"
        ? ["departmentId", "teamId"]
        : field === "position"
          ? ["positionId", "managerStaffId"]
          : [field],
    );
    return activeBranchId ? mapped : ["branchId", ...mapped];
  }, [config, canReadSensitive, section, activeBranchId, edit]);
  const editable = section ? EDITABLE_SECTIONS.has(section) : false;

  function updateField(field: string, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function openCreate() {
    setEdit(null);
    setForm({ year, month, ...(activeBranchId ? { branchId: activeBranchId } : organization.branches.length === 1 ? { branchId: organization.branches[0].id } : {}) });
    setError("");
    setFormOpen(true);
  }

  function startEdit(row: DataRow) {
    setEdit(row);
    const next: FormState = { year, month };
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === "string" || typeof value === "number") next[key] = value;
    }
    if (typeof row.departmentId === "string") next.departmentId = row.departmentId;
    if (typeof row.positionId === "string") next.positionId = row.positionId;
    setForm(next);
    setFormOpen(true);
  }

  function closeForm() {
    if (saving) return;
    setEdit(null);
    setForm({ year, month, ...(activeBranchId ? { branchId: activeBranchId } : organization.branches.length === 1 ? { branchId: organization.branches[0].id } : {}) });
    setFormOpen(false);
  }

  function openOrganizationCreate(kind: "department" | "team" | "position") {
    setFormOpen(false);
    setOrgDraft({
      code: "",
      name: "",
      departmentId: (kind === "team" || kind === "position") && typeof form.departmentId === "string" ? form.departmentId : "",
    });
    setOrgCreate(kind);
  }

  function cancelOrganizationCreate() {
    if (saving) return;
    setOrgCreate(null);
    setFormOpen(true);
  }

  async function createOrganizationItem() {
    if (!orgCreate) return;
    const code = orgDraft.code.trim();
    const name = orgDraft.name.trim();
    if (!code || !name) {
      setError("Kısa kod ve ad zorunludur.");
      return;
    }
    if ((orgCreate === "team" || orgCreate === "position") && !orgDraft.departmentId) {
      setError(orgCreate === "team" ? "Ekip için departman seçin." : "Pozisyon için departman seçin.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const path = orgCreate === "department"
        ? "/hr/organization/departments"
        : orgCreate === "team"
          ? "/hr/organization/teams"
          : "/hr/organization/positions";
      const created = await api<OrgItem>(path, {
        method: "POST",
        body: orgCreate === "department"
          ? { code, name, status: "ACTIVE" }
          : { code, name, departmentId: orgDraft.departmentId, status: "ACTIVE" },
      });
      const org = await api<OrganizationData>("/hr/organization");
      setOrganization({
        branches: Array.isArray(org.branches) ? org.branches : [],
        departments: Array.isArray(org.departments) ? org.departments : [],
        teams: Array.isArray(org.teams) ? org.teams : [],
        positions: Array.isArray(org.positions) ? org.positions : [],
      });
      if (orgCreate === "department") {
        setForm((current) => ({ ...current, departmentId: created.id, teamId: "", positionId: "" }));
      } else if (orgCreate === "team") {
        setForm((current) => ({ ...current, departmentId: orgDraft.departmentId, teamId: created.id }));
      } else {
        setForm((current) => ({ ...current, departmentId: orgDraft.departmentId, positionId: created.id }));
      }
      setNotice(orgCreate === "department" ? "Yeni departman oluşturuldu." : orgCreate === "team" ? "Yeni ekip oluşturuldu." : "Yeni pozisyon oluşturuldu.");
      setOrgCreate(null);
      setFormOpen(true);
    } catch (e) {
      setError(e instanceof ApiError ? userErrorMessage(e.message, "Organizasyon kaydı oluşturulamadı.") : "Organizasyon kaydı oluşturulamadı.");
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    if (!section || !config?.post) return;
    if (section === "employees" && !edit) {
      const branchId = activeBranchId || String(form.branchId ?? "");
      if (!String(form.firstName ?? "").trim() || !String(form.lastName ?? "").trim()) {
        setError("Personelin adı ve soyadı zorunludur.");
        return;
      }
      if (!String(form.email ?? "").trim()) {
        setError("Otomatik kullanıcı hesabı için personelin e-posta adresini girin.");
        return;
      }
      if (!branchId) {
        setError("Personelin bağlı olacağı şubeyi personel kayıt formundan seçin.");
        return;
      }
      if (!String(form.roleId ?? "").trim()) {
        setError("Personelin kullanıcı tipini seçin.");
        return;
      }
    }
    if (SENSITIVE_SECTIONS.has(section) && !canReadSensitive) {
      setError("Bu bilgileri değiştirmek için yetkiniz bulunmuyor.");
      return;
    }
    setSaving(true); setError(""); setNotice("");
    try {
      const patch = Boolean(edit && section !== "attendance");
      const endpoint = patch && edit?.id ? `${config.get}/${edit.id}` : config.post;
      const body = normalizeForm(section, form, canReadSensitive);
      const result = await api<EmployeeCreateResponse>(endpoint, { method: patch ? "PATCH" : "POST", body });
      if (section === "employees" && !edit && result?.accountProvisioning?.activationToken) {
        const token = result.accountProvisioning.activationToken;
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        setActivationLink(`${origin}/accept-invitation?token=${encodeURIComponent(token)}`);
        setActivationEmail(String(form.email ?? ""));
        setActivationExpiresAt(result.accountProvisioning.expiresAt ?? "");
      }
      if (section === "employees" && edit?.id) {
        const departmentId = typeof form.departmentId === "string" ? form.departmentId : "";
        const positionId = typeof form.positionId === "string" ? form.positionId : "";
        const previousDepartmentId = typeof edit.departmentId === "string" ? edit.departmentId : "";
        const previousPositionId = typeof edit.positionId === "string" ? edit.positionId : "";
        if (departmentId !== previousDepartmentId || positionId !== previousPositionId) {
          await api(`/hr/employees/${edit.id}/assignments`, {
            method: "POST",
            body: {
              departmentId: departmentId || undefined,
              positionId: positionId || undefined,
              effectiveFrom: new Date().toISOString().slice(0, 10),
              reason: "ORGANIZATION_CHANGE",
            },
          });
        }
      }
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
    if (!config || !id) return;
    setSaving(true);
    try {
      await api(`${config.get}/${id}`, { method: "DELETE" });
      setPendingRemoveId(null);
      setNotice(section === "employees" ? "Çalışan kaydı arşivlendi." : "Kayıt kaldırıldı.");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? userErrorMessage(e.message, "Kayıt kaldırılamadı.") : "Silme işlemi tamamlanamadı.");
    } finally {
      setSaving(false);
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
            {formFields.map((field) => <DynamicField key={field} field={field} value={form[field] ?? ""} staff={staff} organization={organization} employeeRoles={employeeRoles} form={form} activeBranchId={activeBranchId} onChange={(value) => { updateField(field, value); if (field === "branchId") { updateField("managerStaffId", ""); } if (field === "departmentId") { updateField("teamId", ""); updateField("positionId", ""); } }} onCreateDepartment={() => openOrganizationCreate("department")} onCreateTeam={() => openOrganizationCreate("team")} onCreatePosition={() => openOrganizationCreate("position")} />)}
          </FormGrid>
        </FormSection>
        <FormActions>
          <Button type="button" variant="secondary" onClick={closeForm} disabled={saving}>Vazgeç</Button>
          <FormSubmitButton type="button" saving={saving} idleLabel={edit ? "Değişiklikleri Kaydet" : "Kaydı Oluştur"} savingLabel="Kaydediliyor…" onClick={() => void save()} />
        </FormActions>
      </div>
    </Modal>

    <Modal
      open={Boolean(orgCreate)}
      onClose={cancelOrganizationCreate}
      title={orgCreate === "department" ? "Yeni Departman Ekle" : orgCreate === "team" ? "Yeni Ekip Ekle" : "Yeni Pozisyon Ekle"}
      description="Yeni kaydı burada oluşturun; çalışan formuna geri döndüğünüzde otomatik seçilmiş olacak."
    >
      <div className="space-y-4">
        {orgCreate === "team" || orgCreate === "position" ? <label className="block">
          <span className="mb-2 block text-[13px] font-medium text-[var(--ink)]">Departman</span>
          <ValooSelect
            value={orgDraft.departmentId}
            onChange={(departmentId) => setOrgDraft((current) => ({ ...current, departmentId }))}
            options={organization.departments.map((item) => ({ value: item.id, label: item.name }))}
            placeholder="Departman seçin"
            searchPlaceholder="Departman ara…"
            emptyLabel="Henüz departman yok."
            createAction={{
              label: "Yeni departman ekle",
              onClick: () => {
                setOrgCreate("department");
                setOrgDraft({ code: "", name: "", departmentId: "" });
              },
            }}
          />
        </label> : null}
        <label className="block">
          <span className="mb-2 block text-[13px] font-medium text-[var(--ink)]">Kısa Kod</span>
          <input className="control h-11 w-full" value={orgDraft.code} onChange={(event) => setOrgDraft((current) => ({ ...current, code: event.target.value }))} placeholder={orgCreate === "department" ? "Örn. SAT" : orgCreate === "team" ? "Örn. SAT-01" : "Örn. SAT-UZM"} />
        </label>
        <label className="block">
          <span className="mb-2 block text-[13px] font-medium text-[var(--ink)]">{orgCreate === "department" ? "Departman Adı" : orgCreate === "team" ? "Ekip Adı" : "Pozisyon Adı"}</span>
          <input className="control h-11 w-full" value={orgDraft.name} onChange={(event) => setOrgDraft((current) => ({ ...current, name: event.target.value }))} />
        </label>
        <div className="flex justify-end gap-2 border-t border-[var(--line)] pt-4">
          <Button variant="secondary" onClick={cancelOrganizationCreate} disabled={saving}>Vazgeç</Button>
          <Button onClick={() => void createOrganizationItem()} disabled={saving}>{saving ? "Kaydediliyor…" : "Oluştur ve Seç"}</Button>
        </div>
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
              {(section === "employees" || section === "leaves") && row.id ? <Button size="sm" variant="danger" onClick={() => setPendingRemoveId(row.id!)}>Kaldır</Button> : null}
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

    <Modal
      open={Boolean(activationLink)}
      onClose={() => { setActivationLink(""); setActivationEmail(""); setActivationExpiresAt(""); }}
      title="Personel ve Kullanıcı Hesabı Oluşturuldu"
      description="Personel kaydı, şube erişimi ve kullanıcı hesabı otomatik hazırlandı. Personel aşağıdaki tek kullanımlık bağlantıdan kendi parolasını belirleyebilir."
    >
      <div className="space-y-4">
        <div className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--muted-soft)]">Kullanıcı</p>
          <p className="mt-1 text-sm font-semibold text-[var(--ink)]">{activationEmail}</p>
          {activationExpiresAt ? <p className="mt-1 text-[11px] text-[var(--muted)]">Aktivasyon bağlantısı: {new Date(activationExpiresAt).toLocaleString("tr-TR")} tarihine kadar geçerli.</p> : null}
        </div>
        <div className="break-all rounded-[14px] border border-[var(--line)] bg-white p-3 text-xs text-[var(--muted)]">{activationLink}</div>
        <div className="flex justify-end gap-2 border-t border-[var(--line)] pt-4">
          <Button variant="secondary" onClick={() => { setActivationLink(""); setActivationEmail(""); setActivationExpiresAt(""); }}>Kapat</Button>
          <Button onClick={() => void navigator.clipboard.writeText(activationLink)}>Aktivasyon Bağlantısını Kopyala</Button>
        </div>
      </div>
    </Modal>

    <ConfirmDialog
      open={Boolean(pendingRemoveId)}
      title={section === "employees" ? "Çalışan Kaydını Arşivle" : "Kaydı Kaldır"}
      description={section === "employees"
        ? "Çalışan kaydı kalıcı olarak silinmez; geçmiş bilgiler korunarak arşive alınır. Devam edilsin mi?"
        : "Bu kayıt kaldırılacak. Devam edilsin mi?"}
      loading={saving}
      onClose={() => { if (!saving) setPendingRemoveId(null); }}
      onConfirm={() => { if (pendingRemoveId) void remove(pendingRemoveId); }}
    />
  </div>;
}

function DynamicField({
  field,
  value,
  staff,
  organization,
  employeeRoles,
  form,
  activeBranchId,
  onChange,
  onCreateDepartment,
  onCreateTeam,
  onCreatePosition,
}: {
  field: string;
  value: string | number;
  staff: StaffRow[];
  organization: OrganizationData;
  employeeRoles: EmployeeRole[];
  form: FormState;
  activeBranchId: string | null;
  onChange: (value: string) => void;
  onCreateDepartment: () => void;
  onCreateTeam: () => void;
  onCreatePosition: () => void;
}) {
  const label = FIELD_LABELS[field] ?? field;
  const normalized = String(value ?? "");
  const selectedBranchId = activeBranchId || (typeof form.branchId === "string" ? form.branchId : "");
  const selectedDepartmentId = typeof form.departmentId === "string" ? form.departmentId : "";
  const teams = selectedDepartmentId
    ? organization.teams.filter((item) => item.department_id === selectedDepartmentId)
    : organization.teams;
  const positions = selectedDepartmentId
    ? organization.positions.filter((item) => !item.department_id || item.department_id === selectedDepartmentId)
    : organization.positions;
  const managers = selectedBranchId
    ? staff.filter((item) => String(item.branchId ?? "") === selectedBranchId)
    : staff;

  return <label className="block">
    <span className="mb-2 block text-[13px] font-medium text-[var(--ink)]">{label}</span>
    {field === "roleId" ? <ValooSelect
      value={normalized}
      onChange={onChange}
      placeholder="Kullanıcı tipini seçin"
      searchPlaceholder="Rol ara…"
      emptyLabel="Atanabilir kullanıcı tipi bulunamadı."
      options={employeeRoles.map((role) => ({ value: role.id, label: `${role.name} · ${role.scope === "BRANCH" ? "Şube" : role.scope === "COMPANY" ? "Şirket" : "Merkez"}` }))}
    /> :
    field === "branchId" ? <ValooSelect
      value={normalized}
      onChange={onChange}
      placeholder="Şube seçin"
      searchPlaceholder="Şube ara…"
      emptyLabel="Aktif şube bulunamadı."
      options={organization.branches.map((item) => ({ value: item.id, label: item.name }))}
    /> :
    field === "staffId" ? <ValooSelect value={normalized} onChange={onChange} placeholder="Çalışan seçin" searchPlaceholder="Çalışan ara…" emptyLabel="Çalışan bulunamadı." options={staff.map((item) => ({ value: item.id, label: `${item.firstName ?? ""} ${item.lastName ?? ""}`.trim() }))} /> :
    field === "departmentId" ? <ValooSelect
      value={normalized}
      onChange={onChange}
      placeholder="Departman seçin"
      searchPlaceholder="Departman ara…"
      emptyLabel="Henüz departman bulunmuyor."
      options={organization.departments.map((item) => ({ value: item.id, label: item.name }))}
      createAction={{ label: "Yeni departman ekle", onClick: onCreateDepartment }}
    /> :
    field === "teamId" ? <ValooSelect
      value={normalized}
      onChange={onChange}
      placeholder={selectedDepartmentId ? "Ekip seçin" : "Önce departman seçin"}
      searchPlaceholder="Ekip ara…"
      emptyLabel={selectedDepartmentId ? "Bu departman için ekip bulunmuyor." : "Önce departman seçin."}
      options={teams.map((item) => ({ value: item.id, label: item.name }))}
      createAction={{ label: "Yeni ekip ekle", onClick: onCreateTeam }}
    /> :
    field === "positionId" ? <ValooSelect
      value={normalized}
      onChange={onChange}
      placeholder="Pozisyon seçin"
      searchPlaceholder="Pozisyon ara…"
      emptyLabel={selectedDepartmentId ? "Bu departman için pozisyon bulunmuyor." : "Henüz pozisyon bulunmuyor."}
      options={positions.map((item) => ({ value: item.id, label: item.name }))}
      createAction={{ label: "Yeni pozisyon ekle", onClick: onCreatePosition }}
    /> :
    field === "managerStaffId" ? <ValooSelect
      value={normalized}
      onChange={onChange}
      placeholder="Yönetici seçin"
      searchPlaceholder="Yönetici ara…"
      emptyLabel="Uygun yönetici bulunamadı."
      options={managers.map((item) => ({ value: item.id, label: `${item.firstName ?? ""} ${item.lastName ?? ""}`.trim() }))}
    /> :
    field === "employmentType" ? <ValooSelect value={normalized} onChange={onChange} searchable={false} placeholder="Çalışma şeklini seçin" options={[
      { value: "FULL_TIME", label: "Tam Zamanlı" },
      { value: "PART_TIME", label: "Yarı Zamanlı" },
      { value: "HOURLY", label: "Saatlik" },
      { value: "SEASONAL", label: "Sezonluk" },
      { value: "INTERN", label: "Stajyer" },
    ]} /> :
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
      branchId: body.branchId || undefined,
      roleId: body.roleId || undefined,
      departmentId: body.departmentId || undefined,
      teamId: body.teamId || undefined,
      positionId: body.positionId || undefined,
      managerStaffId: body.managerStaffId || undefined,
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
