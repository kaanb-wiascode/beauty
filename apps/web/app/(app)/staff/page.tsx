"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog, Modal } from "@/components/modal";
import {
  DataView,
  DataViewMeta,
  DataViewToolbar,
  FilterChip,
  SearchField,
} from "@/components/data-view";
import { StaffEditorForm } from "@/components/staff-form";
import {
  Alert,
  Button,
  EmptyState,
  GlassCard,
  Pagination,
  Spinner,
  StatusBadge,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, ApiError, withQuery } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import { optionalText, staffStatusLabel } from "@/lib/format";
import type { CreateStaffInput, Paginated, Staff, StaffProfile } from "@/lib/types";

type FormState = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  profile: StaffProfile;
};

type Performance = {
  id: string;
  name?: string;
  collected: number;
  appointmentCount: number;
  completedAppointments?: number;
};

type PerformanceResponse = Performance[] | { data?: Performance[] };
type Filter = "ALL" | "ACTIVE" | "ARCHIVED";

const emptyProfile: StaffProfile = {};
const emptyForm: FormState = { firstName: "", lastName: "", phone: "", email: "", profile: emptyProfile };

function toPayload(form: FormState): CreateStaffInput {
  return {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    ...(optionalText(form.phone) ? { phone: form.phone.trim() } : {}),
    ...(optionalText(form.email) ? { email: form.email.trim() } : {}),
    profile: form.profile,
  };
}

function initials(member: Staff) {
  return `${member.firstName[0] ?? ""}${member.lastName[0] ?? ""}`.toUpperCase();
}

function money(value: number) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(value);
}

function Icon({ name, size = 18 }: { name: "users" | "calendar" | "wallet" | "trend" | "plus"; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "users") return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="9.5" cy="7" r="3.5" /><path d="M17 3.5a3.5 3.5 0 0 1 0 7" /><path d="M21 21v-2a4 4 0 0 0-3-3.87" /></svg>;
  if (name === "calendar") return <svg {...common}><rect x="3" y="4.5" width="18" height="17" rx="3" /><path d="M8 2.5v4M16 2.5v4M3 9h18" /></svg>;
  if (name === "wallet") return <svg {...common}><path d="M4 5h15a2 2 0 0 1 2 2v12H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" /><path d="M3 8h18" /><path d="M16 14h3" /></svg>;
  if (name === "trend") return <svg {...common}><path d="m4 16 5-5 4 3 7-8" /><path d="M16 6h4v4" /></svg>;
  return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
}

export default function StaffPage() {
  const canCreateStaff = hasPermission("staff", "create");
  const canUpdateStaff = hasPermission("staff", "update");
  const canDeleteStaff = hasPermission("staff", "delete");
  const { showToast } = useToast();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [performance, setPerformance] = useState<Record<string, Performance>>({});
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<Staff | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api<Paginated<Staff>>(withQuery("/staff", { page, limit: 20, search: search.trim() || undefined }));
      const from = new Date(); from.setHours(0, 0, 0, 0);
      const to = new Date(); to.setHours(23, 59, 59, 999);
      const performanceResult = await api<PerformanceResponse>(withQuery("/staff/performance", { from: from.toISOString(), to: to.toISOString() }));
      const rows = Array.isArray(performanceResult) ? performanceResult : performanceResult.data ?? [];
      const map: Record<string, Performance> = {};
      for (const row of rows) map[row.id] = row;
      setStaff(result.data); setPerformance(map); setTotalPages(result.meta.totalPages || 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Personel Listesi Yüklenemedi.");
    } finally { setLoading(false); }
  }, [page, search]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 180); return () => window.clearTimeout(timer); }, [load]);

  function openCreate() {
    if (!canCreateStaff) return;
    setEditing(null); setForm({ ...emptyForm, profile: {} }); setFormError(""); setStep(0); setModalOpen(true);
  }

  function openEdit(member: Staff) {
    if (!canUpdateStaff) return;
    setEditing(member);
    setForm({ firstName: member.firstName, lastName: member.lastName, phone: member.phone ?? "", email: member.email ?? "", profile: member.profile ?? {} });
    setFormError(""); setStep(0); setModalOpen(true);
  }

  function setProfile<K extends keyof StaffProfile>(key: K, value: StaffProfile[K]) {
    setForm((current) => ({ ...current, profile: { ...current.profile, [key]: value } }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) { setStep(0); setFormError("Ad Ve Soyad Gereklidir."); return; }
    setSaving(true); setFormError("");
    try {
      const payload = toPayload(form);
      if (editing) await api<Staff>(`/staff/${editing.id}`, { method: "PATCH", body: payload });
      else await api<Staff>("/staff", { method: "POST", body: payload });
      setModalOpen(false); showToast(editing ? "Personel Güncellendi." : "Personel Özlük Dosyası Oluşturuldu."); await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Personel Kaydedilemedi.");
    } finally { setSaving(false); }
  }

  async function onDelete() {
    if (!canDeleteStaff || !pendingDelete) return;
    setSaving(true);
    try { await api(`/staff/${pendingDelete.id}`, { method: "DELETE" }); setPendingDelete(null); showToast("Personel Arşivlendi."); await load(); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Personel Arşivlenemedi."); setPendingDelete(null); }
    finally { setSaving(false); }
  }

  const activeCount = useMemo(() => staff.filter((m) => m.status === "ACTIVE").length, [staff]);
  const archivedCount = useMemo(() => staff.filter((m) => m.status === "ARCHIVED").length, [staff]);
  const totalAppointments = useMemo(() => staff.reduce((sum, m) => sum + (performance[m.id]?.appointmentCount ?? 0), 0), [staff, performance]);
  const totalCollected = useMemo(() => staff.reduce((sum, m) => sum + (performance[m.id]?.collected ?? 0), 0), [staff, performance]);
  const topPerformer = useMemo(() => [...staff].sort((a, b) => (performance[b.id]?.collected ?? 0) - (performance[a.id]?.collected ?? 0))[0], [staff, performance]);
  const filteredStaff = useMemo(() => filter === "ACTIVE" ? staff.filter((m) => m.status === "ACTIVE") : filter === "ARCHIVED" ? staff.filter((m) => m.status === "ARCHIVED") : staff, [staff, filter]);
  const chartRows = useMemo(() => [...staff].map((member) => ({ member, stats: performance[member.id] })).sort((a, b) => (b.stats?.collected ?? 0) - (a.stats?.collected ?? 0)).slice(0, 5), [staff, performance]);
  const maxCollected = Math.max(1, ...chartRows.map((r) => r.stats?.collected ?? 0));

  return (
    <div className="mx-auto max-w-[1240px] space-y-5 pb-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-[12px] text-[var(--muted)]">Yönetim · Ekip</p><div className="mt-1 flex items-center gap-3"><h1 className="text-[30px] font-semibold tracking-[-0.045em] text-[var(--ink)]">Personel</h1><span className="rounded-full border border-[var(--line)] bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--muted)]">{activeCount} Aktif</span></div><p className="mt-1 text-[13px] text-[var(--muted)]">Ekibinizi, Günlük Performansı Ve Çalışma Durumunu Tek Ekrandan Yönetin.</p></div>
        <Button onClick={openCreate} disabled={!canCreateStaff}><span className="mr-1 inline-flex"><Icon name="plus" size={15} /></span>Yeni Personel</Button>
      </header>
      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Toplam Personel" value={staff.length} note={`${activeCount} Aktif · ${archivedCount} Arşiv`} icon="users" />
        <Metric label="Bugünkü Randevu" value={totalAppointments} note="Tüm Ekip" icon="calendar" />
        <Metric label="Bugünkü Tahsilat" value={money(totalCollected)} note="Personel Bazlı Toplam" icon="wallet" />
        <Metric label="En Yüksek Performans" value={topPerformer ? `${topPerformer.firstName} ${topPerformer.lastName}` : "—"} note={topPerformer ? money(performance[topPerformer.id]?.collected ?? 0) : "Bugün Veri Yok"} icon="trend" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(330px,.85fr)]">
        <GlassCard className="!overflow-hidden !rounded-[18px] !p-0"><div className="border-b border-[var(--line)] p-4 sm:p-5"><div className="flex items-center justify-between"><div><h2 className="text-[15px] font-semibold">Ekip Performansı</h2><p className="mt-1 text-[11px] text-[var(--muted)]">Bugünkü Tahsilat Karşılaştırması</p></div><span className="rounded-[9px] bg-[var(--surface-2)] px-3 py-1.5 text-[10px] font-semibold">Bugün</span></div><div className="mt-5 space-y-4">{chartRows.map(({ member, stats }) => { const collected = stats?.collected ?? 0; const width = Math.max(4, Math.round((collected / maxCollected) * 100)); return <div key={member.id} className="grid grid-cols-[32px_minmax(90px,125px)_minmax(100px,1fr)_72px] items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f0f1f4] text-[9px] font-semibold text-[#5d6270]">{initials(member)}</div><div className="min-w-0"><p className="truncate text-[11px] font-semibold">{member.firstName} {member.lastName}</p><p className="mt-0.5 text-[9px] text-[var(--muted)]">{stats?.appointmentCount ?? 0} Randevu</p></div><div className="h-2 overflow-hidden rounded-full bg-[#efefed]"><div className="h-full rounded-full bg-[#9abedb]" style={{ width: `${width}%` }} /></div><div className="text-right text-[11px] font-semibold">{money(collected)}</div></div>; })}</div></div><div className="grid grid-cols-3 divide-x border-t border-[var(--line)] bg-[#fcfcfb]"><MiniStat label="Randevu" value={totalAppointments}/><MiniStat label="Tahsilat" value={money(totalCollected)}/><MiniStat label="Aktif Ekip" value={activeCount}/></div></GlassCard>
        <GlassCard className="!overflow-hidden !rounded-[18px] !p-0"><div className="flex items-center justify-between border-b border-[var(--line)] p-4 sm:p-5"><div><h2 className="text-[15px] font-semibold">Ekip Durumu</h2><p className="mt-1 text-[11px] text-[var(--muted)]">Personel Dağılımı</p></div><span className="rounded-[9px] bg-[var(--surface-2)] px-2.5 py-1.5 text-[11px] font-semibold">{staff.length}</span></div><div className="grid grid-cols-2 gap-2 p-4 sm:p-5"><div className="rounded-[12px] bg-[var(--surface-2)] p-4"><p className="text-[10px] text-[var(--muted)]">Aktif</p><strong className="mt-1 block text-[26px] tracking-[-.05em]">{activeCount}</strong></div><div className="rounded-[12px] bg-[var(--surface-2)] p-4"><p className="text-[10px] text-[var(--muted)]">Arşiv</p><strong className="mt-1 block text-[26px] tracking-[-.05em]">{archivedCount}</strong></div></div></GlassCard>
      </section>

      <DataView>
        <div className="border-b border-[var(--line)] px-4 pt-4 sm:px-5 sm:pt-5">
          <h2 className="text-[15px] font-semibold">Tüm Personel</h2>
          <p className="mt-1 text-[11px] text-[var(--muted)]">İletişim, Durum Ve Günlük Performans</p>
        </div>
        <DataViewToolbar
          search={
            <SearchField
              value={search}
              placeholder="Personel Ara..."
              aria-label="Personel Ara"
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              onKeyDown={(event) => {
                if (event.key === "Escape" && search) {
                  setSearch("");
                  setPage(1);
                }
              }}
            />
          }
          filters={
            <>
              <FilterChip active={filter === "ALL"} count={staff.length} onClick={() => setFilter("ALL")}>Tümü</FilterChip>
              <FilterChip active={filter === "ACTIVE"} count={activeCount} onClick={() => setFilter("ACTIVE")}>Aktif</FilterChip>
              <FilterChip active={filter === "ARCHIVED"} count={archivedCount} onClick={() => setFilter("ARCHIVED")}>Arşiv</FilterChip>
            </>
          }
        />
        {loading ? <Spinner label="Personel Yükleniyor..."/> : filteredStaff.length === 0 ? <EmptyState title={search.trim() ? "Eşleşen Personel Yok" : "Henüz Personel Yok"} description={search.trim() ? "Arama Kriterinizi Değiştirerek Tekrar Deneyin." : "Yeni Personel Ekleyerek Başlayın."}/> : <><div className="hidden overflow-x-auto md:block"><table className="w-full border-collapse text-left"><thead><tr className="border-b border-[var(--line)] bg-[var(--surface-2)] text-[10px] font-semibold text-[var(--muted)]"><th className="px-5 py-3">PERSONEL</th><th className="px-4 py-3">İLETİŞİM</th><th className="px-4 py-3">DURUM</th><th className="px-4 py-3">BUGÜN</th><th className="px-4 py-3">TAHSİLAT</th><th className="px-5 py-3 text-right">İŞLEM</th></tr></thead><tbody className="divide-y divide-[var(--line)]">{filteredStaff.map((member) => {const stats=performance[member.id];return <tr key={member.id} className="transition hover:bg-[#fafaf9]"><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f0f1f4] text-[10px] font-semibold text-[#5d6270]">{initials(member)}</div><div className="min-w-0"><p className="truncate text-[12px] font-semibold">{member.firstName} {member.lastName}</p><p className="mt-0.5 text-[10px] text-[var(--muted)]">{member.profile?.position || "Personel"}</p></div></div></td><td className="px-4 py-4"><p className="text-[11px]">{member.phone ?? "—"}</p><p className="mt-0.5 max-w-[220px] truncate text-[10px] text-[var(--muted)]">{member.email ?? "E-Posta Yok"}</p></td><td className="px-4 py-4"><StatusBadge status={member.status} label={staffStatusLabel(member.status)}/></td><td className="px-4 py-4"><p className="text-[11px] font-semibold">{stats?.appointmentCount ?? 0} Randevu</p><p className="mt-0.5 text-[10px] text-[var(--muted)]">{stats?.completedAppointments ?? 0} Tamamlandı</p></td><td className="px-4 py-4"><p className="text-[11px] font-semibold">{money(stats?.collected ?? 0)}</p></td><td className="px-5 py-4"><div className="flex justify-end gap-1"><button type="button" onClick={()=>openEdit(member)} disabled={!canUpdateStaff} className="rounded-[8px] px-2.5 py-1.5 text-[10px] font-semibold text-[var(--muted)] hover:bg-[var(--surface-2)]">Düzenle</button><button type="button" onClick={()=>setPendingDelete(member)} disabled={!canDeleteStaff || member.status === "ARCHIVED"} className="rounded-[8px] px-2.5 py-1.5 text-[10px] font-semibold text-[var(--danger)] disabled:opacity-40">Arşivle</button></div></td></tr>})}</tbody></table></div><div className="divide-y divide-[var(--line)] md:hidden">{filteredStaff.map((member)=>{const stats=performance[member.id];return <article key={member.id} className="p-4"><div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f0f1f4] text-[10px] font-semibold text-[#5d6270]">{initials(member)}</div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div><h3 className="text-[12px] font-semibold">{member.firstName} {member.lastName}</h3><p className="mt-0.5 truncate text-[10px] text-[var(--muted)]">{member.profile?.position || member.phone || "Personel"}</p></div><StatusBadge status={member.status} label={staffStatusLabel(member.status)}/></div><div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-[9px] bg-[var(--surface-2)] p-2.5"><p className="text-[9px] text-[var(--muted)]">Randevu</p><strong className="mt-1 block text-[14px]">{stats?.appointmentCount ?? 0}</strong></div><div className="rounded-[9px] bg-[var(--surface-2)] p-2.5"><p className="text-[9px] text-[var(--muted)]">Tahsilat</p><strong className="mt-1 block text-[14px]">{money(stats?.collected ?? 0)}</strong></div></div><div className="mt-3 flex gap-2"><button type="button" onClick={()=>openEdit(member)} disabled={!canUpdateStaff} className="flex-1 rounded-[9px] border border-[var(--line)] py-2 text-[10px] font-semibold disabled:opacity-40">Düzenle</button><button type="button" onClick={()=>setPendingDelete(member)} disabled={!canDeleteStaff || member.status === "ARCHIVED"} className="flex-1 rounded-[9px] border border-[var(--line)] py-2 text-[10px] font-semibold text-[var(--danger)] disabled:opacity-40">Arşivle</button></div></div></div></article>})}</div><Pagination page={page} totalPages={totalPages} onPageChange={setPage}/></>}
        <DataViewMeta>
          <span>Bu Sayfada {filteredStaff.length} Personel</span>
          <span>{filter === "ALL" ? "Tüm Durumlar" : filter === "ACTIVE" ? "Aktif Personel" : "Arşiv Personel"}</span>
        </DataViewMeta>
      </DataView>

      <Modal open={modalOpen} onClose={() => { if (!saving) { setModalOpen(false); setFormError(""); } }} title={editing ? "Personeli Düzenle" : "Yeni Personel"} description="Personel Özlük Dosyasını Adım Adım Oluşturun.">
        <StaffEditorForm
          form={form}
          step={step}
          saving={saving}
          editing={Boolean(editing)}
          error={formError}
          onSubmit={onSubmit}
          onChange={setForm}
          onProfileChange={setProfile}
          onStepChange={setStep}
          onCancel={() => { if (!saving) { setModalOpen(false); setFormError(""); } }}
        />
      </Modal>

      <ConfirmDialog open={Boolean(pendingDelete)} title="Personeli Arşivle" description="Bu Personel Arşivlenecek. Devam Edilsin Mi?" loading={saving} onClose={()=>setPendingDelete(null)} onConfirm={()=>void onDelete()}/>
    </div>
  );
}

function Metric({ label, value, note, icon }: { label: string; value: string | number; note: string; icon: "users" | "calendar" | "wallet" | "trend" }) { return <GlassCard className="min-w-0 !rounded-[14px] !p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-[10px] font-medium text-[var(--muted)]">{label}</p><p className="mt-2 truncate text-[23px] font-semibold tracking-[-.045em] text-[var(--ink)]">{value}</p><p className="mt-1 truncate text-[9px] text-[var(--muted-soft)]">{note}</p></div><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#f3f3f1] text-[var(--muted)]"><Icon name={icon} size={17}/></span></div></GlassCard>; }
function MiniStat({ label, value }: { label: string; value: string | number }) { return <div className="px-4 py-3"><p className="text-[9px] text-[var(--muted)]">{label}</p><p className="mt-1 truncate text-[14px] font-semibold tracking-[-.03em]">{value}</p></div>; }
