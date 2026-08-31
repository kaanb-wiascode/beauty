"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog, Modal } from "@/components/modal";
import {
  Alert,
  Button,
  EmptyState,
  Field,
  GlassCard,
  Pagination,
  Spinner,
  StatusBadge,
  TextInput,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, ApiError, withQuery } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import { optionalText, staffStatusLabel } from "@/lib/format";
import type { CreateStaffInput, Paginated, Staff } from "@/lib/types";

type FormState = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
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

const emptyForm: FormState = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
};

function toPayload(form: FormState): CreateStaffInput {
  return {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    ...(optionalText(form.phone) ? { phone: form.phone.trim() } : {}),
    ...(optionalText(form.email) ? { email: form.email.trim() } : {}),
  };
}

function initials(member: Staff) {
  return `${member.firstName[0] ?? ""}${member.lastName[0] ?? ""}`.toUpperCase();
}

function money(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(value);
}

function Icon({ name, size = 18 }: { name: "search" | "users" | "calendar" | "wallet" | "trend" | "plus" | "more"; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "search") return <svg {...common}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>;
  if (name === "users") return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="9.5" cy="7" r="3.5" /><path d="M17 3.5a3.5 3.5 0 0 1 0 7" /><path d="M21 21v-2a4 4 0 0 0-3-3.87" /></svg>;
  if (name === "calendar") return <svg {...common}><rect x="3" y="4.5" width="18" height="17" rx="3" /><path d="M8 2.5v4M16 2.5v4M3 9h18" /></svg>;
  if (name === "wallet") return <svg {...common}><path d="M4 5h15a2 2 0 0 1 2 2v12H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" /><path d="M3 8h18" /><path d="M16 14h3" /></svg>;
  if (name === "trend") return <svg {...common}><path d="m4 16 5-5 4 3 7-8" /><path d="M16 6h4v4" /></svg>;
  if (name === "plus") return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
  return <svg {...common}><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></svg>;
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
  const [pendingDelete, setPendingDelete] = useState<Staff | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api<Paginated<Staff>>(
        withQuery("/staff", {
          page,
          limit: 20,
          search: search.trim() || undefined,
        }),
      );

      const from = new Date();
      from.setHours(0, 0, 0, 0);
      const to = new Date();
      to.setHours(23, 59, 59, 999);

      const performanceResult = await api<PerformanceResponse>(
        withQuery("/staff/performance", {
          from: from.toISOString(),
          to: to.toISOString(),
        }),
      );

      const rows = Array.isArray(performanceResult) ? performanceResult : performanceResult.data ?? [];
      const map: Record<string, Performance> = {};
      for (const row of rows) map[row.id] = row;

      setStaff(result.data);
      setPerformance(map);
      setTotalPages(result.meta.totalPages || 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Personel listesi yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 180);
    return () => window.clearTimeout(timer);
  }, [load]);

  function openCreate() {
    if (!canCreateStaff) return;
    setEditing(null);
    setForm(emptyForm);
    setFormError("");
    setModalOpen(true);
  }

  function openEdit(member: Staff) {
    if (!canUpdateStaff) return;
    setEditing(member);
    setForm({
      firstName: member.firstName,
      lastName: member.lastName,
      phone: member.phone ?? "",
      email: member.email ?? "",
    });
    setFormError("");
    setModalOpen(true);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setFormError("Ad ve soyad gerekli.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const payload = toPayload(form);
      if (editing) {
        await api<Staff>(`/staff/${editing.id}`, { method: "PATCH", body: payload });
      } else {
        await api<Staff>("/staff", { method: "POST", body: payload });
      }
      setModalOpen(false);
      showToast(editing ? "Personel güncellendi." : "Personel eklendi.");
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Personel kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!canDeleteStaff || !pendingDelete) return;
    setSaving(true);
    try {
      await api(`/staff/${pendingDelete.id}`, { method: "DELETE" });
      setPendingDelete(null);
      showToast("Personel arşivlendi.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Personel arşivlenemedi.");
      setPendingDelete(null);
    } finally {
      setSaving(false);
    }
  }

  const activeCount = useMemo(() => staff.filter((m) => m.status === "ACTIVE").length, [staff]);
  const archivedCount = useMemo(() => staff.filter((m) => m.status === "ARCHIVED").length, [staff]);
  const totalAppointments = useMemo(() => staff.reduce((sum, m) => sum + (performance[m.id]?.appointmentCount ?? 0), 0), [staff, performance]);
  const totalCollected = useMemo(() => staff.reduce((sum, m) => sum + (performance[m.id]?.collected ?? 0), 0), [staff, performance]);
  const topPerformer = useMemo(() => {
    return [...staff].sort((a, b) => (performance[b.id]?.collected ?? 0) - (performance[a.id]?.collected ?? 0))[0];
  }, [staff, performance]);

  const filteredStaff = useMemo(() => {
    if (filter === "ACTIVE") return staff.filter((m) => m.status === "ACTIVE");
    if (filter === "ARCHIVED") return staff.filter((m) => m.status === "ARCHIVED");
    return staff;
  }, [staff, filter]);

  const chartRows = useMemo(() => {
    return [...staff]
      .map((member) => ({ member, stats: performance[member.id] }))
      .sort((a, b) => (b.stats?.collected ?? 0) - (a.stats?.collected ?? 0))
      .slice(0, 5);
  }, [staff, performance]);
  const maxCollected = Math.max(1, ...chartRows.map((r) => r.stats?.collected ?? 0));

  return (
    <div className="mx-auto max-w-[1240px] space-y-5 pb-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[12px] text-[var(--muted)]">Yönetim · Ekip</p>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-[30px] font-semibold tracking-[-0.045em] text-[var(--ink)]">Personel</h1>
            <span className="rounded-full border border-[var(--line)] bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--muted)]">{activeCount} aktif</span>
          </div>
          <p className="mt-1 text-[13px] text-[var(--muted)]">Ekibinizi, günlük performansı ve çalışma durumunu tek ekrandan yönetin.</p>
        </div>
        <Button onClick={openCreate} disabled={!canCreateStaff}>
          <span className="mr-1 inline-flex"><Icon name="plus" size={15} /></span>
          Yeni personel
        </Button>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Toplam personel" value={staff.length} note={`${activeCount} aktif · ${archivedCount} arşiv`} icon="users" />
        <Metric label="Bugünkü randevu" value={totalAppointments} note="Tüm ekip" icon="calendar" />
        <Metric label="Bugünkü tahsilat" value={money(totalCollected)} note="Personel bazlı toplam" icon="wallet" />
        <Metric label="En yüksek performans" value={topPerformer ? `${topPerformer.firstName} ${topPerformer.lastName}` : "—"} note={topPerformer ? money(performance[topPerformer.id]?.collected ?? 0) : "Bugün veri yok"} icon="trend" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(330px,.85fr)]">
        <div className="overflow-hidden rounded-[18px] border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
          <div className="border-b border-[var(--line)] p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-[15px] font-semibold tracking-[-0.02em]">Ekip performansı</h2>
                <p className="mt-1 text-[11px] text-[var(--muted)]">Bugünkü tahsilat karşılaştırması</p>
              </div>
              <div className="flex items-center gap-1 rounded-[10px] bg-[var(--surface-2)] p-1">
                <span className="rounded-[8px] bg-white px-3 py-1.5 text-[10px] font-semibold text-[var(--ink)] shadow-sm">Bugün</span>
                <span className="px-3 py-1.5 text-[10px] font-medium text-[var(--muted)]">7 Gün</span>
                <span className="px-3 py-1.5 text-[10px] font-medium text-[var(--muted)]">30 Gün</span>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {chartRows.length === 0 ? (
                <div className="py-10 text-center text-[12px] text-[var(--muted)]">Performans verisi bulunmuyor.</div>
              ) : chartRows.map(({ member, stats }) => {
                const collected = stats?.collected ?? 0;
                const width = Math.max(4, Math.round((collected / maxCollected) * 100));
                return (
                  <div key={member.id} className="grid grid-cols-[32px_minmax(90px,125px)_minmax(100px,1fr)_72px] items-center gap-3 sm:gap-4">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f0f1f4] text-[9px] font-semibold text-[#5d6270]">{initials(member)}</div>
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-semibold text-[var(--ink)]">{member.firstName} {member.lastName}</p>
                      <p className="mt-0.5 text-[9px] text-[var(--muted)]">{stats?.appointmentCount ?? 0} randevu</p>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#efefed]">
                      <div className="h-full rounded-full bg-[#9abedb] transition-all" style={{ width: `${width}%` }} />
                    </div>
                    <div className="text-right text-[11px] font-semibold">{money(collected)}</div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-3 divide-x border-t border-[var(--line)] bg-[#fcfcfb]">
            <MiniStat label="Randevu" value={totalAppointments} />
            <MiniStat label="Tahsilat" value={money(totalCollected)} />
            <MiniStat label="Aktif ekip" value={activeCount} />
          </div>
        </div>

        <div className="overflow-hidden rounded-[18px] border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] p-4 sm:p-5">
            <div>
              <h2 className="text-[15px] font-semibold tracking-[-0.02em]">Ekip durumu</h2>
              <p className="mt-1 text-[11px] text-[var(--muted)]">Personel dağılımı</p>
            </div>
            <span className="rounded-[9px] border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-1.5 text-[11px] font-semibold">{staff.length}</span>
          </div>
          <div className="p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <div className="relative h-28 w-28 shrink-0 rounded-full" style={{ background: `conic-gradient(#9abedb 0 ${staff.length ? Math.round((activeCount / staff.length) * 360) : 0}deg, #e8e8e5 0)` }}>
                <div className="absolute inset-[10px] flex flex-col items-center justify-center rounded-full bg-white">
                  <strong className="text-[22px] tracking-[-0.05em]">{activeCount}</strong>
                  <span className="text-[9px] text-[var(--muted)]">aktif</span>
                </div>
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <Legend label="Aktif personel" value={activeCount} percent={staff.length ? Math.round((activeCount / staff.length) * 100) : 0} />
                <Legend label="Arşivlenen" value={archivedCount} percent={staff.length ? Math.round((archivedCount / staff.length) * 100) : 0} muted />
              </div>
            </div>
          </div>
          <div className="border-t border-[var(--line)] p-4 sm:p-5">
            <p className="text-[10px] font-medium uppercase tracking-[.08em] text-[var(--muted-soft)]">Bugünün özeti</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-[10px] bg-[var(--surface-2)] p-3"><p className="text-[9px] text-[var(--muted)]">Randevu</p><strong className="mt-1 block text-[18px] tracking-[-.04em]">{totalAppointments}</strong></div>
              <div className="rounded-[10px] bg-[var(--surface-2)] p-3"><p className="text-[9px] text-[var(--muted)]">Tahsilat</p><strong className="mt-1 block truncate text-[18px] tracking-[-.04em]">{money(totalCollected)}</strong></div>
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[18px] border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
        <div className="border-b border-[var(--line)] p-4 sm:p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-[15px] font-semibold tracking-[-0.02em]">Tüm personel</h2>
              <p className="mt-1 text-[11px] text-[var(--muted)]">İletişim, durum ve günlük performans</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 sm:w-[260px]">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-soft)]"><Icon name="search" size={15} /></span>
                <TextInput value={search} placeholder="Personel ara..." className="pl-9" onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
              </div>
              <div className="flex rounded-[10px] border border-[var(--line)] bg-[var(--surface-2)] p-1">
                {(["ALL", "ACTIVE", "ARCHIVED"] as Filter[]).map((item) => {
                  const labels: Record<Filter, string> = { ALL: "Tümü", ACTIVE: "Aktif", ARCHIVED: "Arşiv" };
                  return <button key={item} type="button" onClick={() => setFilter(item)} className={`rounded-[8px] px-3 py-1.5 text-[10px] font-semibold transition ${filter === item ? "bg-white text-[var(--ink)] shadow-sm" : "text-[var(--muted)]"}`}>{labels[item]}</button>;
                })}
              </div>
            </div>
          </div>
        </div>

        {loading ? <Spinner label="Personel yükleniyor..." /> : filteredStaff.length === 0 ? (
          <EmptyState title={search.trim() ? "Eşleşen personel yok" : "Henüz personel yok"} description={search.trim() ? "Arama kriterinizi değiştirerek tekrar deneyin." : "Yeni personel ekleyerek başlayın."} />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-[var(--line)] bg-[var(--surface-2)] text-[10px] font-semibold text-[var(--muted)]">
                    <th className="px-5 py-3">PERSONEL</th><th className="px-4 py-3">İLETİŞİM</th><th className="px-4 py-3">DURUM</th><th className="px-4 py-3">BUGÜN</th><th className="px-4 py-3">TAHSİLAT</th><th className="px-5 py-3 text-right">İŞLEM</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {filteredStaff.map((member) => {
                    const stats = performance[member.id];
                    return (
                      <tr key={member.id} className="transition hover:bg-[#fafaf9]">
                        <td className="px-5 py-4"><div className="flex items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f0f1f4] text-[10px] font-semibold text-[#5d6270]">{initials(member)}</div><div className="min-w-0"><p className="truncate text-[12px] font-semibold">{member.firstName} {member.lastName}</p><p className="mt-0.5 text-[10px] text-[var(--muted)]">Personel</p></div></div></td>
                        <td className="px-4 py-4"><p className="text-[11px]">{member.phone ?? "—"}</p><p className="mt-0.5 max-w-[220px] truncate text-[10px] text-[var(--muted)]">{member.email ?? "E-posta yok"}</p></td>
                        <td className="px-4 py-4"><StatusBadge status={member.status} label={staffStatusLabel(member.status)} /></td>
                        <td className="px-4 py-4"><p className="text-[11px] font-semibold">{stats?.appointmentCount ?? 0} randevu</p><p className="mt-0.5 text-[10px] text-[var(--muted)]">{stats?.completedAppointments ?? 0} tamamlandı</p></td>
                        <td className="px-4 py-4"><p className="text-[11px] font-semibold">{money(stats?.collected ?? 0)}</p><div className="mt-1 h-1.5 w-20 overflow-hidden rounded-full bg-[#efefed]"><div className="h-full rounded-full bg-[#9abedb]" style={{ width: `${Math.max(3, Math.round(((stats?.collected ?? 0) / maxCollected) * 100))}%` }} /></div></td>
                        <td className="px-5 py-4"><div className="flex justify-end gap-1"><button type="button" onClick={() => openEdit(member)} disabled={!canUpdateStaff} className="rounded-[8px] px-2.5 py-1.5 text-[10px] font-semibold text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]">Düzenle</button><button type="button" onClick={() => setPendingDelete(member)} disabled={!canDeleteStaff || member.status === "ARCHIVED"} className="rounded-[8px] px-2.5 py-1.5 text-[10px] font-semibold text-[var(--danger)] hover:bg-[var(--danger-soft)] disabled:opacity-40"><Icon name="more" size={15} /></button></div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-[var(--line)] md:hidden">
              {filteredStaff.map((member) => {
                const stats = performance[member.id];
                return <article key={member.id} className="p-4"><div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f0f1f4] text-[10px] font-semibold text-[#5d6270]">{initials(member)}</div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div><h3 className="text-[12px] font-semibold">{member.firstName} {member.lastName}</h3><p className="mt-0.5 truncate text-[10px] text-[var(--muted)]">{member.phone ?? member.email ?? "İletişim bilgisi yok"}</p></div><StatusBadge status={member.status} label={staffStatusLabel(member.status)} /></div><div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-[9px] bg-[var(--surface-2)] p-2.5"><p className="text-[9px] text-[var(--muted)]">Randevu</p><strong className="mt-1 block text-[14px]">{stats?.appointmentCount ?? 0}</strong></div><div className="rounded-[9px] bg-[var(--surface-2)] p-2.5"><p className="text-[9px] text-[var(--muted)]">Tahsilat</p><strong className="mt-1 block text-[14px]">{money(stats?.collected ?? 0)}</strong></div></div><div className="mt-3 flex gap-2"><button type="button" onClick={() => openEdit(member)} className="flex-1 rounded-[9px] border border-[var(--line)] py-2 text-[10px] font-semibold">Düzenle</button><button type="button" onClick={() => setPendingDelete(member)} disabled={!canDeleteStaff || member.status === "ARCHIVED"} className="flex-1 rounded-[9px] border border-[var(--line)] py-2 text-[10px] font-semibold text-[var(--danger)] disabled:opacity-40">Arşivle</button></div></div></div></article>;
              })}
            </div>

            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </>
        )}
      </section>

      <Modal open={modalOpen} onClose={() => { if (!saving) { setModalOpen(false); setFormError(""); } }} title={editing ? "Personeli düzenle" : "Yeni personel"} description="Personel iletişim bilgilerini girin.">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ad"><TextInput required value={form.firstName} onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))} /></Field>
            <Field label="Soyad"><TextInput required value={form.lastName} onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))} /></Field>
          </div>
          <Field label="Telefon"><TextInput value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></Field>
          <Field label="E-posta"><TextInput type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></Field>
          {formError ? <Alert>{formError}</Alert> : null}
          <div className="flex justify-end gap-3 pt-2"><Button variant="secondary" type="button" onClick={() => setModalOpen(false)} disabled={saving}>Vazgeç</Button><Button type="submit" disabled={saving}>{saving ? "Kaydediliyor..." : editing ? "Değişiklikleri kaydet" : "Personeli ekle"}</Button></div>
        </form>
      </Modal>

      <ConfirmDialog open={Boolean(pendingDelete)} title="Personeli arşivle" description="Bu personel arşivlenecek. Devam edilsin mi?" loading={saving} onClose={() => setPendingDelete(null)} onConfirm={() => void onDelete()} />
    </div>
  );
}

function Metric({ label, value, note, icon }: { label: string; value: string | number; note: string; icon: "users" | "calendar" | "wallet" | "trend" }) {
  return <GlassCard className="min-w-0 !rounded-[14px] !p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-[10px] font-medium text-[var(--muted)]">{label}</p><p className="mt-2 truncate text-[23px] font-semibold tracking-[-.045em] text-[var(--ink)]">{value}</p><p className="mt-1 truncate text-[9px] text-[var(--muted-soft)]">{note}</p></div><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#f3f3f1] text-[var(--muted)]"><Icon name={icon} size={17} /></span></div></GlassCard>;
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return <div className="px-4 py-3"><p className="text-[9px] text-[var(--muted)]">{label}</p><p className="mt-1 truncate text-[14px] font-semibold tracking-[-.03em]">{value}</p></div>;
}

function Legend({ label, value, percent, muted }: { label: string; value: number; percent: number; muted?: boolean }) {
  return <div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><span className={`h-2 w-2 shrink-0 rounded-full ${muted ? "bg-[#d7d7d3]" : "bg-[#9abedb]"}`} /><span className="truncate text-[10px] text-[var(--muted)]">{label}</span></div><span className="shrink-0 text-[10px] font-semibold">{value} · %{percent}</span></div>;
}
