"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog, Modal } from "@/components/modal";
import {
  Alert,
  Button,
  EmptyState,
  Field,
  Pagination,
  Spinner,
  StatusBadge,
  TextArea,
  TextInput,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, ApiError, withQuery } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import { formatDuration, formatPrice, optionalText, serviceStatusLabel } from "@/lib/format";
import type { CreateServiceInput, Paginated, Service } from "@/lib/types";

type FormState = { name: string; description: string; durationMinutes: string; price: string };
type Performance = { id: string; name?: string; collected: number; appointmentCount: number };
type PerformanceResponse = Performance[] | { data?: Performance[] };

const emptyForm: FormState = { name: "", description: "", durationMinutes: "60", price: "" };

function Icon({ name, size = 20 }: { name: "grid" | "check" | "calendar" | "money" | "search" | "filter" | "sort" | "clock" | "spark" | "more" | "edit" | "arrow"; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "grid") return <svg {...common}><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></svg>;
  if (name === "check") return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="m8.5 12 2.3 2.3 4.8-5" /></svg>;
  if (name === "calendar") return <svg {...common}><rect x="4" y="5.5" width="16" height="15" rx="2" /><path d="M8 3.5v4M16 3.5v4M4 10h16" /></svg>;
  if (name === "money") return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v9M15 9.5c-.8-.8-1.8-1.2-3-1.2-1.7 0-2.7.8-2.7 1.9 0 1.2 1 1.7 2.8 2 1.9.3 2.9.9 2.9 2.1 0 1.2-1.1 2-3 2-1.2 0-2.3-.4-3.1-1.2" /></svg>;
  if (name === "search") return <svg {...common}><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.2 4.2" /></svg>;
  if (name === "filter") return <svg {...common}><path d="M4 6h16M7 12h10M10 18h4" /></svg>;
  if (name === "sort") return <svg {...common}><path d="M8 5v14M5 8l3-3 3 3M16 19V5M13 16l3 3 3-3" /></svg>;
  if (name === "clock") return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.2 2" /></svg>;
  if (name === "spark") return <svg {...common}><path d="m12 3 1.4 5.6L19 10l-5.6 1.4L12 17l-1.4-5.6L5 10l5.6-1.4L12 3ZM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z" /></svg>;
  if (name === "more") return <svg {...common}><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></svg>;
  if (name === "edit") return <svg {...common}><path d="m4 16.5-.8 3.3 3.3-.8L18.8 6.7a2 2 0 0 0-2.8-2.8L4 16.5Z" /><path d="m14.5 5.5 4 4" /></svg>;
  return <svg {...common}><path d="M5 12h13M14 7l5 5-5 5" /></svg>;
}

function toPayload(form: FormState): CreateServiceInput {
  return {
    name: form.name.trim(),
    durationMinutes: Number(form.durationMinutes),
    price: Number(form.price),
    ...(optionalText(form.description) ? { description: form.description.trim() } : {}),
  };
}

function money(value: number) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(value);
}

export default function ServicesPage() {
  const canCreateService = hasPermission("services", "create");
  const canUpdateService = hasPermission("services", "update");
  const canDeleteService = hasPermission("services", "delete");
  const { showToast } = useToast();

  const [services, setServices] = useState<Service[]>([]);
  const [performance, setPerformance] = useState<Record<string, Performance>>({});
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"ALL" | "ACTIVE" | "ARCHIVED">("ALL");
  const [sort, setSort] = useState<"default" | "appointments" | "revenue" | "price">("default");
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState<Service | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Service | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api<Paginated<Service>>(withQuery("/services", { page, limit: 20, search: search.trim() || undefined }));
      const from = new Date(); from.setHours(0, 0, 0, 0);
      const to = new Date(); to.setHours(23, 59, 59, 999);
      const performanceResult = await api<PerformanceResponse>(withQuery("/services/performance", { from: from.toISOString(), to: to.toISOString() }));
      const rows = Array.isArray(performanceResult) ? performanceResult : performanceResult.data ?? [];
      const map: Record<string, Performance> = {};
      rows.forEach((row) => { map[row.id] = row; });
      setServices(result.data);
      setPerformance(map);
      setTotalCount(result.meta.total);
      setTotalPages(result.meta.totalPages || 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Hizmetler yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 180);
    return () => window.clearTimeout(timer);
  }, [load]);

  function openCreate() {
    if (!canCreateService) return;
    setEditing(null); setForm(emptyForm); setFormError(""); setModalOpen(true);
  }

  function openEdit(service: Service) {
    if (!canUpdateService) return;
    setEditing(service);
    setForm({ name: service.name, description: service.description ?? "", durationMinutes: String(service.durationMinutes), price: String(service.price) });
    setFormError(""); setModalOpen(true);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const name = form.name.trim();
    const durationMinutes = Number(form.durationMinutes);
    const price = Number(form.price);
    if (!name) return setFormError("Hizmet adı gerekli.");
    if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) return setFormError("Süre 1 ile 1440 dakika arasında olmalı.");
    if (!Number.isFinite(price) || price < 0) return setFormError("Fiyat 0 veya daha büyük olmalı.");
    setSaving(true); setFormError(""); setError("");
    try {
      const payload = toPayload(form);
      if (editing) await api<Service>(`/services/${editing.id}`, { method: "PATCH", body: payload });
      else await api<Service>("/services", { method: "POST", body: payload });
      setModalOpen(false); showToast(editing ? "Hizmet güncellendi." : "Hizmet eklendi."); await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Hizmet kaydedilemedi.");
    } finally { setSaving(false); }
  }

  async function onDelete() {
    if (!canDeleteService || !pendingDelete) return;
    setSaving(true); setError("");
    try {
      await api(`/services/${pendingDelete.id}`, { method: "DELETE" });
      setPendingDelete(null); showToast("Hizmet arşivlendi."); await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Hizmet arşivlenemedi."); setPendingDelete(null);
    } finally { setSaving(false); }
  }

  const activeCount = useMemo(() => services.filter((service) => service.status === "ACTIVE").length, [services]);
  const archivedCount = useMemo(() => services.filter((service) => service.status === "ARCHIVED").length, [services]);
  const todayAppointments = useMemo(() => Object.values(performance).reduce((sum, item) => sum + item.appointmentCount, 0), [performance]);
  const todayRevenue = useMemo(() => Object.values(performance).reduce((sum, item) => sum + item.collected, 0), [performance]);

  const visibleServices = useMemo(() => {
    const rows = services.filter((service) => filter === "ALL" || (filter === "ACTIVE" ? service.status === "ACTIVE" : service.status === "ARCHIVED"));
    return [...rows].sort((a, b) => {
      if (sort === "appointments") return (performance[b.id]?.appointmentCount ?? 0) - (performance[a.id]?.appointmentCount ?? 0);
      if (sort === "revenue") return (performance[b.id]?.collected ?? 0) - (performance[a.id]?.collected ?? 0);
      if (sort === "price") return Number(b.price) - Number(a.price);
      return 0;
    });
  }, [services, filter, sort, performance]);

  const ranked = useMemo(() => services.map((service) => ({ service, stats: performance[service.id] })).filter((item) => (item.stats?.collected ?? 0) > 0 || (item.stats?.appointmentCount ?? 0) > 0).sort((a, b) => (b.stats?.collected ?? 0) - (a.stats?.collected ?? 0)).slice(0, 5), [services, performance]);
  const preferred = useMemo(() => services.map((service) => ({ service, stats: performance[service.id] })).sort((a, b) => (b.stats?.appointmentCount ?? 0) - (a.stats?.appointmentCount ?? 0)).slice(0, 3), [services, performance]);

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 pb-10">
      <PageTop onCreate={openCreate} disabled={!canCreateService} />

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi icon="grid" label="Toplam hizmet" value={totalCount} hint="tüm hizmetler" />
        <Kpi icon="check" label="Aktif hizmet" value={activeCount} hint={`${totalCount ? Math.round((activeCount / totalCount) * 100) : 0}% aktif`} tone="green" />
        <Kpi icon="calendar" label="Bugünkü randevu" value={todayAppointments} hint="toplam randevu" tone="orange" />
        <Kpi icon="money" label="Bugünkü ciro" value={money(todayRevenue)} hint="toplam gelir" tone="purple" />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <main className="min-w-0 space-y-6">
          <section className="overflow-hidden rounded-[24px] border border-[var(--line)] bg-white">
            <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center">
              <div className="relative min-w-0 flex-1">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8d8984]"><Icon name="search" size={18} /></span>
                <TextInput value={search} placeholder="Hizmet adı veya açıklama ara..." className="h-11 pl-10" onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
              </div>
              <div className="flex gap-2">
                <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} className="control h-11 min-w-[110px]">
                  <option value="ALL">Tümü</option><option value="ACTIVE">Aktif</option><option value="ARCHIVED">Arşiv</option>
                </select>
                <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="control h-11 min-w-[145px]">
                  <option value="default">Varsayılan sıra</option><option value="appointments">En çok randevu</option><option value="revenue">En yüksek ciro</option><option value="price">En yüksek fiyat</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] px-4 py-3">
              {(["ALL", "ACTIVE", "ARCHIVED"] as const).map((item) => (
                <button key={item} type="button" onClick={() => setFilter(item)} className={`rounded-full px-4 py-2 text-[13px] font-medium transition-colors ${filter === item ? "bg-[#1f1f1d] text-white" : "bg-[#f7f6f4] text-[#6f6b66] hover:bg-[#eeece9]"}`}>
                  {item === "ALL" ? "Tümü" : item === "ACTIVE" ? `Aktif ${activeCount}` : `Arşiv ${archivedCount}`}
                </button>
              ))}
              <span className="ml-auto hidden items-center gap-2 text-[12px] text-[var(--muted)] sm:flex"><Icon name="filter" size={15} /> Filtrele</span>
            </div>
          </section>

          {loading ? <Spinner label="Hizmetler yükleniyor..." /> : visibleServices.length === 0 ? (
            <section className="rounded-[24px] border border-[var(--line)] bg-white"><EmptyState title={search.trim() ? "Eşleşen hizmet yok" : "Henüz hizmet yok"} description={search.trim() ? "Arama kriterinizi değiştirerek tekrar deneyin." : "Yeni hizmet ekleyerek başlayın."} /></section>
          ) : (
            <>
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {visibleServices.map((service) => <ServiceCard key={service.id} service={service} stats={performance[service.id]} onEdit={() => openEdit(service)} onArchive={() => setPendingDelete(service)} canEdit={canUpdateService} canDelete={canDeleteService} />)}
              </section>
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </>
          )}

          <section className="grid gap-6 lg:grid-cols-[1fr_1.35fr]">
            <Panel title="Öne çıkanlar" subtitle="Bugünün dikkat çeken hizmetleri">
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                <MiniHighlight icon="spark" label="En çok randevu" value={preferred[0]?.service.name ?? "—"} meta={`${preferred[0]?.stats?.appointmentCount ?? 0} randevu`} />
                <MiniHighlight icon="money" label="En yüksek ciro" value={ranked[0]?.service.name ?? "—"} meta={money(ranked[0]?.stats?.collected ?? 0)} />
                <MiniHighlight icon="clock" label="Ortalama süre" value={`${services.length ? Math.round(services.reduce((sum, item) => sum + item.durationMinutes, 0) / services.length) : 0} dk`} meta="tüm hizmetler" />
              </div>
            </Panel>
            <RevenueMix services={services} performance={performance} />
          </section>
        </main>

        <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <PerformancePanel ranked={ranked} />
          <PreferredPanel preferred={preferred} />
          <QuickPanel onCreate={openCreate} />
        </aside>
      </div>

      <Modal open={modalOpen} onClose={() => { if (!saving) { setModalOpen(false); setFormError(""); } }} title={editing ? "Hizmeti düzenle" : "Yeni hizmet"} description="Hizmet bilgilerini ve fiyatlandırmasını yönetin.">
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Hizmet adı" required><TextInput required value={form.name} placeholder="Örn. Hydrafacial" onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></Field>
          <Field label="Açıklama"><TextArea rows={3} value={form.description} placeholder="Hizmet açıklamasını girin..." onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Süre (dakika)" required><TextInput type="number" min={1} max={1440} required value={form.durationMinutes} onChange={(event) => setForm((current) => ({ ...current, durationMinutes: event.target.value }))} /></Field>
            <Field label="Fiyat" required><TextInput type="number" min={0} step="0.01" required value={form.price} onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))} /></Field>
          </div>
          {formError ? <Alert>{formError}</Alert> : null}
          <div className="flex justify-end gap-3 pt-2"><Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Vazgeç</Button><Button type="submit" disabled={saving}>{saving ? "Kaydediliyor..." : editing ? "Değişiklikleri kaydet" : "Hizmeti oluştur"}</Button></div>
        </form>
      </Modal>

      <ConfirmDialog open={Boolean(pendingDelete)} title="Hizmeti arşivle" description="Bu hizmet arşivlenecek. Devam edilsin mi?" loading={saving} onClose={() => setPendingDelete(null)} onConfirm={() => void onDelete()} />
    </div>
  );
}

function PageTop({ onCreate, disabled }: { onCreate: () => void; disabled: boolean }) {
  return <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="mb-1 text-[12px] font-medium uppercase tracking-[0.12em] text-[#918b84]">Salon yönetimi</p><h1 className="text-[34px] font-semibold tracking-[-0.045em] text-[var(--ink)] sm:text-[42px]">Hizmetler</h1><p className="mt-2 text-[14px] text-[var(--muted)]">Salonundaki hizmetleri, fiyatlarını ve performanslarını yönetin.</p></div><Button onClick={onCreate} disabled={disabled} className="min-h-11 bg-[#1f1f1d] px-5 text-white shadow-none hover:bg-[#33322f]"><span className="text-lg leading-none">+</span> Yeni hizmet</Button></header>;
}

function Kpi({ icon, label, value, hint, tone = "blue" }: { icon: "grid" | "check" | "calendar" | "money"; label: string; value: number | string; hint: string; tone?: "blue" | "green" | "orange" | "purple" }) {
  const tones = { blue: "bg-[#f1f4fb] text-[#64799a]", green: "bg-[#eef8f2] text-[#4d936a]", orange: "bg-[#fff5e9] text-[#bd7a30]", purple: "bg-[#f6f0fb] text-[#8763aa]" };
  return <article className="rounded-[20px] border border-[var(--line)] bg-white p-5"><div className="flex items-start justify-between gap-4"><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] ${tones[tone]}`}><Icon name={icon} size={21} /></span><span className="rounded-full bg-[#f6f5f3] px-2.5 py-1 text-[11px] font-medium text-[#8a857f]">{hint}</span></div><p className="mt-4 text-[12px] font-medium uppercase tracking-[0.07em] text-[#8c8781]">{label}</p><p className="mt-1 text-[28px] font-semibold tracking-[-0.04em] text-[var(--ink)]">{value}</p></article>;
}

function ServiceCard({ service, stats, onEdit, onArchive, canEdit, canDelete }: { service: Service; stats?: Performance; onEdit: () => void; onArchive: () => void; canEdit: boolean; canDelete: boolean }) {
  const revenue = stats?.collected ?? 0;
  const appointments = stats?.appointmentCount ?? 0;
  return <article className="group flex min-h-[250px] min-w-0 flex-col overflow-hidden rounded-[20px] border border-[var(--line)] bg-white transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-[#d8d4cf] hover:shadow-[0_14px_35px_rgba(28,25,23,0.07)]"><div className="p-5"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[#f4f1ff] text-[#7764d7]"><Icon name="spark" size={19} /></span><div className="min-w-0 flex-1"><h3 className="truncate text-[15px] font-semibold tracking-[-0.02em] text-[var(--ink)]">{service.name}</h3><p className="mt-0.5 truncate text-[12px] text-[var(--muted)]">{service.description || "Güzellik hizmeti"}</p></div><button type="button" aria-label="Hizmet işlemleri" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#9b9690] hover:bg-[#f5f4f2]" onClick={onEdit}><Icon name="more" size={18} /></button></div><div className="mt-5 flex items-center justify-between gap-3"><span className="inline-flex min-w-0 items-center gap-1.5 text-[12px] text-[#6f6b66]"><Icon name="clock" size={15} /> {formatDuration(service.durationMinutes)}</span><strong className="shrink-0 text-[16px] font-semibold text-[var(--ink)]">{formatPrice(service.price)}</strong></div></div><div className="mt-auto border-t border-[var(--line)] px-5 py-3.5"><div className="flex items-center justify-between gap-3 text-[11px] text-[#8a857f]"><span>Bugün</span><span>{appointments} randevu · {money(revenue)}</span></div><div className="mt-3 flex items-center justify-between gap-2"><StatusBadge status={service.status} label={serviceStatusLabel(service.status)} /><div className="flex min-w-0 gap-2"><Button variant="secondary" className="h-8 min-h-8 px-3 py-1 text-[12px]" onClick={onEdit} disabled={!canEdit}><Icon name="edit" size={14} /> Düzenle</Button><Button variant="ghost" className="h-8 min-h-8 px-2" onClick={onArchive} disabled={!canDelete || service.status === "ARCHIVED"} aria-label="Arşivle"><Icon name="more" size={17} /></Button></div></div></div></article>;
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-white"><div className="border-b border-[var(--line)] px-5 py-4"><h2 className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--ink)]">{title}</h2><p className="mt-1 text-[12px] text-[var(--muted)]">{subtitle}</p></div><div className="p-5">{children}</div></section>;
}

function PerformancePanel({ ranked }: { ranked: { service: Service; stats?: Performance }[] }) {
  const max = Math.max(...ranked.map((item) => item.stats?.collected ?? 0), 1);
  return <Panel title="Hizmet performansı" subtitle="Bugünkü ciro dağılımı"><div className="mb-4 flex gap-1.5"><span className="rounded-full bg-[#1f1f1d] px-3 py-1.5 text-[11px] font-medium text-white">Ciro</span><span className="rounded-full bg-[#f5f4f2] px-3 py-1.5 text-[11px] text-[#77716b]">Randevu</span><span className="rounded-full bg-[#f5f4f2] px-3 py-1.5 text-[11px] text-[#77716b]">Fiyat</span></div><div className="space-y-4">{ranked.length ? ranked.map((item) => <div key={item.service.id}><div className="mb-1.5 flex items-center justify-between gap-3 text-[11px]"><span className="truncate text-[#625d57]">{item.service.name}</span><strong className="shrink-0 text-[11px] text-[var(--ink)]">{money(item.stats?.collected ?? 0)}</strong></div><div className="h-2 overflow-hidden rounded-full bg-[#efeeec]"><div className="h-full rounded-full bg-[#7569d9]" style={{ width: `${Math.max(((item.stats?.collected ?? 0) / max) * 100, 2)}%` }} /></div></div>) : <p className="py-5 text-center text-[12px] text-[var(--muted)]">Bugün henüz hizmet performansı yok.</p>}</div><button type="button" className="mt-5 flex w-full items-center justify-center gap-2 rounded-[12px] border border-[var(--line)] py-2.5 text-[12px] font-medium text-[#55504a] hover:bg-[#faf9f7]">Tüm performansı görüntüle <Icon name="arrow" size={15} /></button></Panel>;
}

function PreferredPanel({ preferred }: { preferred: { service: Service; stats?: Performance }[] }) {
  return <Panel title="En çok tercih edilen" subtitle="Bugünkü randevu sayısına göre"><div className="space-y-3">{preferred.map((item, index) => <div key={item.service.id} className="flex items-center gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f5f2ff] text-[11px] font-semibold text-[#7569d9]">{index + 1}</span><span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[#4e4944]">{item.service.name}</span><span className="shrink-0 text-[11px] text-[#8d8881]">{item.stats?.appointmentCount ?? 0} randevu</span></div>)}</div><button type="button" className="mt-5 flex w-full items-center justify-center gap-2 rounded-[12px] border border-[var(--line)] py-2.5 text-[12px] font-medium text-[#55504a] hover:bg-[#faf9f7]">Tümünü görüntüle <Icon name="arrow" size={15} /></button></Panel>;
}

function QuickPanel({ onCreate }: { onCreate: () => void }) {
  return <Panel title="Hızlı işlemler" subtitle="Hizmet yönetimi"><div className="space-y-2"><QuickAction label="Yeni hizmet" description="Hizmet oluştur" icon="spark" onClick={onCreate} /><QuickAction label="Kategorileri yönet" description="Hizmet kategorileri" icon="grid" /><QuickAction label="Paketler" description="Hizmet paketlerini yönet" icon="money" /></div></Panel>;
}

function QuickAction({ label, description, icon, onClick }: { label: string; description: string; icon: "spark" | "grid" | "money"; onClick?: () => void }) {
  return <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-[12px] px-2.5 py-2.5 text-left hover:bg-[#faf9f7]"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#f4f1ff] text-[#7569d9]"><Icon name={icon} size={17} /></span><span className="min-w-0 flex-1"><strong className="block text-[12px] font-semibold text-[#49443f]">{label}</strong><span className="mt-0.5 block truncate text-[10px] text-[#9a948e]">{description}</span></span><Icon name="arrow" size={15} /></button>;
}

function MiniHighlight({ icon, label, value, meta }: { icon: "spark" | "money" | "clock"; label: string; value: string; meta: string }) {
  return <article className="min-w-0 rounded-[15px] border border-[var(--line)] p-4"><span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-[#f4f1ff] text-[#7569d9]"><Icon name={icon} size={15} /></span><p className="mt-3 truncate text-[10px] font-medium uppercase tracking-[0.06em] text-[#98918a]">{label}</p><p className="mt-1 truncate text-[13px] font-semibold text-[var(--ink)]">{value}</p><p className="mt-1 text-[11px] text-[#8e8983]">{meta}</p></article>;
}

function RevenueMix({ services, performance }: { services: Service[]; performance: Record<string, Performance> }) {
  const rows = services.map((service) => ({ name: service.name, value: performance[service.id]?.collected ?? 0 })).filter((row) => row.value > 0).sort((a, b) => b.value - a.value).slice(0, 6);
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const colors = ["#7569d9", "#4d936a", "#d39b4d", "#8aa6c5", "#a78bbd", "#b9b5ad"];
  let cursor = 0;
  const gradient = rows.length ? rows.map((row, index) => { const start = cursor; cursor += (row.value / total) * 100; return `${colors[index % colors.length]} ${start}% ${cursor}%`; }).join(", ") : "#eeece9 0 100%";
  return <Panel title="Hizmet bazlı gelir dağılımı" subtitle="Bugünkü tahsilat"><div className="flex flex-col gap-5 sm:flex-row sm:items-center"><div className="mx-auto flex h-32 w-32 shrink-0 items-center justify-center rounded-full" style={{ background: `conic-gradient(${gradient})` }}><div className="flex h-20 w-20 items-center justify-center rounded-full bg-white text-center"><span><small className="block text-[9px] uppercase tracking-wider text-[#96908a]">Toplam</small><strong className="text-[14px] text-[var(--ink)]">{money(total)}</strong></span></div></div><div className="min-w-0 flex-1 space-y-2.5">{rows.length ? rows.map((row, index) => <div key={row.name} className="flex items-center gap-2 text-[11px]"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} /><span className="min-w-0 flex-1 truncate text-[#615c56]">{row.name}</span><strong className="shrink-0 text-[#4a4641]">{money(row.value)}</strong></div>) : <p className="text-[12px] text-[var(--muted)]">Bugün gelir dağılımı oluşmadı.</p>}</div></div></Panel>;
}
