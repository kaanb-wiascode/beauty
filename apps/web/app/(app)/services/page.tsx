"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog, Modal } from "@/components/modal";
import {
  DataView,
  DataViewMeta,
  DataViewToolbar,
  FilterChip,
  SearchField,
  ToolbarSelect,
} from "@/components/data-view";
import {
  FormActions,
  FormGrid,
  FormHint,
  FormSection,
  FormSubmitButton,
} from "@/components/form-system";
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
import { hasActiveBranch, hasPermission } from "@/lib/auth";
import { formatDuration, formatPrice, optionalText, serviceStatusLabel } from "@/lib/format";
import type { CreateServiceInput, Paginated, Service } from "@/lib/types";

type FormState = { name: string; description: string; durationMinutes: string; price: string };
type Performance = { id: string; name?: string; collected: number; appointmentCount: number };
type PerformanceResponse = Performance[] | { data?: Performance[] };

type ServiceFilter = "ALL" | "ACTIVE" | "ARCHIVED";
type ServiceSort = "default" | "appointments" | "revenue" | "price";

const emptyForm: FormState = { name: "", description: "", durationMinutes: "60", price: "" };

function Icon({ name, size = 20 }: { name: "grid" | "check" | "calendar" | "money" | "clock" | "spark" | "more" | "edit" | "arrow"; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "grid") return <svg {...common}><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></svg>;
  if (name === "check") return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="m8.5 12 2.3 2.3 4.8-5" /></svg>;
  if (name === "calendar") return <svg {...common}><rect x="4" y="5.5" width="16" height="15" rx="2" /><path d="M8 3.5v4M16 3.5v4M4 10h16" /></svg>;
  if (name === "money") return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v9M15 9.5c-.8-.8-1.8-1.2-3-1.2-1.7 0-2.7.8-2.7 1.9 0 1.2 1 1.7 2.8 2 1.9.3 2.9.9 2.9 2.1 0 1.2-1.1 2-3 2-1.2 0-2.3-.4-3.1-1.2" /></svg>;
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
  const [filter, setFilter] = useState<ServiceFilter>("ALL");
  const [sort, setSort] = useState<ServiceSort>("default");
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
      setError(err instanceof ApiError ? err.message : "Hizmetler Yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 180);
    return () => window.clearTimeout(timer);
  }, [load]);

  function handleSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function openCreate() {
    if (!canCreateService) return;
    if (!hasActiveBranch()) {
      showToast("Yeni Hizmet Oluşturmak İçin Önce Çalışma Kapsamından Bir Şube Seçin.", "error");
      return;
    }
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
    if (!editing && !hasActiveBranch()) {
      setFormError("Yeni Hizmet Oluşturmak İçin Önce Çalışma Kapsamından Bir Şube Seçin.");
      return;
    }
    const name = form.name.trim();
    const durationMinutes = Number(form.durationMinutes);
    const price = Number(form.price);
    if (!name) return setFormError("Hizmet Adı Gereklidir.");
    if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) return setFormError("Süre 1 İle 1440 Dakika Arasında Olmalıdır.");
    if (!Number.isFinite(price) || price < 0) return setFormError("Fiyat 0 Veya Daha Büyük Olmalıdır.");
    setSaving(true); setFormError(""); setError("");
    try {
      const payload = toPayload(form);
      if (editing) await api<Service>(`/services/${editing.id}`, { method: "PATCH", body: payload });
      else await api<Service>("/services", { method: "POST", body: payload });
      setModalOpen(false); showToast(editing ? "Hizmet Güncellendi." : "Hizmet Eklendi."); await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Hizmet Kaydedilemedi.");
    } finally { setSaving(false); }
  }

  async function onDelete() {
    if (!canDeleteService || !pendingDelete) return;
    setSaving(true); setError("");
    try {
      await api(`/services/${pendingDelete.id}`, { method: "DELETE" });
      setPendingDelete(null); showToast("Hizmet Arşivlendi."); await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Hizmet Arşivlenemedi."); setPendingDelete(null);
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
        <Kpi icon="grid" label="Toplam Hizmet" value={totalCount} hint="Tüm Hizmetler" />
        <Kpi icon="check" label="Aktif Hizmet" value={activeCount} hint="Bu Sayfadaki Aktif Hizmetler" tone="green" />
        <Kpi icon="calendar" label="Bugünkü Randevu" value={todayAppointments} hint="Bu Sayfadaki Hizmetler" tone="orange" />
        <Kpi icon="money" label="Bugünkü Ciro" value={money(todayRevenue)} hint="Bu Sayfadaki Hizmetler" tone="blue" />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <main className="min-w-0 space-y-6">
          <DataView>
            <DataViewToolbar
              search={
                <SearchField
                  value={search}
                  placeholder="Hizmet Adı Veya Açıklama Ara..."
                  aria-label="Hizmet Ara"
                  onChange={(event) => handleSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape" && search) {
                      handleSearch("");
                    }
                  }}
                />
              }
              actions={
                <ToolbarSelect
                  value={sort}
                  aria-label="Hizmetleri Sırala"
                  onChange={(event) => setSort(event.target.value as ServiceSort)}
                >
                  <option value="default">Varsayılan Sıra</option>
                  <option value="appointments">En Çok Randevu</option>
                  <option value="revenue">En Yüksek Ciro</option>
                  <option value="price">En Yüksek Fiyat</option>
                </ToolbarSelect>
              }
              filters={
                <>
                  <FilterChip active={filter === "ALL"} count={services.length} onClick={() => setFilter("ALL")}>Tümü</FilterChip>
                  <FilterChip active={filter === "ACTIVE"} count={activeCount} onClick={() => setFilter("ACTIVE")}>Aktif</FilterChip>
                  <FilterChip active={filter === "ARCHIVED"} count={archivedCount} onClick={() => setFilter("ARCHIVED")}>Arşiv</FilterChip>
                </>
              }
            />
            <DataViewMeta>
              <span>Bu Sayfada {visibleServices.length} Hizmet</span>
              <span>Toplam {totalCount} Hizmet · Sıralama: {sort === "default" ? "Varsayılan" : sort === "appointments" ? "Randevu" : sort === "revenue" ? "Ciro" : "Fiyat"}</span>
            </DataViewMeta>
          </DataView>

          {loading ? <Spinner label="Hizmetler Yükleniyor..." /> : visibleServices.length === 0 ? (
            <section className="rounded-[24px] border border-[var(--line)] bg-white"><EmptyState title={search.trim() ? "Eşleşen Hizmet Yok" : "Henüz Hizmet Yok"} description={search.trim() ? "Arama Kriterinizi Değiştirerek Tekrar Deneyin." : "Yeni Hizmet Ekleyerek Başlayın."} /></section>
          ) : (
            <>
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {visibleServices.map((service) => <ServiceCard key={service.id} service={service} stats={performance[service.id]} onEdit={() => openEdit(service)} onArchive={() => setPendingDelete(service)} canEdit={canUpdateService} canDelete={canDeleteService} />)}
              </section>
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </>
          )}

          <section className="grid gap-6 lg:grid-cols-[1fr_1.35fr]">
            <Panel title="Öne Çıkanlar" subtitle="Bugünün Dikkat Çeken Hizmetleri">
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                <MiniHighlight icon="spark" label="En Çok Randevu" value={preferred[0]?.service.name ?? "—"} meta={`${preferred[0]?.stats?.appointmentCount ?? 0} Randevu`} />
                <MiniHighlight icon="money" label="En Yüksek Ciro" value={ranked[0]?.service.name ?? "—"} meta={money(ranked[0]?.stats?.collected ?? 0)} />
                <MiniHighlight icon="clock" label="Ortalama Süre" value={`${services.length ? Math.round(services.reduce((sum, item) => sum + item.durationMinutes, 0) / services.length) : 0} Dk`} meta="Bu Sayfadaki Hizmetler" />
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

      <Modal open={modalOpen} onClose={() => { if (!saving) { setModalOpen(false); setFormError(""); } }} title={editing ? "Hizmeti Düzenle" : "Yeni Hizmet"} description="Hizmet Bilgilerini Ve Fiyatlandırmasını Yönetin.">
        <form onSubmit={onSubmit}>
          <FormSection
            title="Temel Bilgiler"
            description="Hizmetin Müşteriye Görünen Adını, Açıklamasını, Süresini Ve Fiyatını Belirleyin."
          >
            <Field label="Hizmet Adı" required>
              <TextInput required value={form.name} placeholder="Örn. Cilt Bakımı" onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            </Field>
            <Field label="Açıklama">
              <TextArea rows={3} value={form.description} placeholder="Hizmet Açıklamasını Girin..." onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
            </Field>
            <FormGrid>
              <Field label="Süre (Dakika)" required>
                <TextInput type="number" min={1} max={1440} required value={form.durationMinutes} onChange={(event) => setForm((current) => ({ ...current, durationMinutes: event.target.value }))} />
              </Field>
              <Field label="Fiyat" required>
                <TextInput type="number" min={0} step="0.01" required value={form.price} onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))} />
              </Field>
            </FormGrid>
            <FormHint tone="info" title="Randevu Akışı">
              Süre Bilgisi Randevu Planlamasında Varsayılan Zaman Aralığını, Fiyat İse Tahsilat Formundaki Önerilen Tutarı Belirler.
            </FormHint>
          </FormSection>

          {formError ? <div className="mt-4"><Alert>{formError}</Alert></div> : null}

          <FormActions>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Vazgeç</Button>
            <FormSubmitButton
              saving={saving}
              idleLabel={editing ? "Değişiklikleri Kaydet" : "Hizmeti Oluştur"}
            />
          </FormActions>
        </form>
      </Modal>

      <ConfirmDialog open={Boolean(pendingDelete)} title="Hizmeti Arşivle" description="Bu Hizmet Arşivlenecek. Devam Edilsin Mi?" loading={saving} onClose={() => setPendingDelete(null)} onConfirm={() => void onDelete()} />
    </div>
  );
}

function PageTop({ onCreate, disabled }: { onCreate: () => void; disabled: boolean }) {
  return <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="mb-1 text-[12px] font-medium uppercase tracking-[0.12em] text-[#918b84]">Salon Yönetimi</p><h1 className="text-[34px] font-semibold tracking-[-0.045em] text-[var(--ink)] sm:text-[42px]">Hizmetler</h1><p className="mt-2 text-[14px] text-[var(--muted)]">Salonunuzdaki Hizmetleri, Fiyatlarını Ve Performanslarını Yönetin.</p></div><Button onClick={onCreate} disabled={disabled} className="min-h-11 bg-[#1f1f1d] px-5 text-white shadow-none hover:bg-[#33322f]"><span className="text-lg leading-none">+</span> Yeni Hizmet</Button></header>;
}

function Kpi({ icon, label, value, hint, tone = "blue" }: { icon: "grid" | "check" | "calendar" | "money"; label: string; value: number | string; hint: string; tone?: "blue" | "green" | "orange" }) {
  const tones = { blue: "bg-[#eaf5fb] text-[#1674bd]", green: "bg-[#eef8f2] text-[#4d936a]", orange: "bg-[#fff5e9] text-[#bd7a30]" };
  return <article className="rounded-[20px] border border-[var(--line)] bg-white p-5"><div className="flex items-start justify-between gap-4"><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] ${tones[tone]}`}><Icon name={icon} size={21} /></span><span className="rounded-full bg-[#f6f5f3] px-2.5 py-1 text-[11px] font-medium text-[#8a857f]">{hint}</span></div><p className="mt-4 text-[12px] font-medium uppercase tracking-[0.07em] text-[#8c8781]">{label}</p><p className="mt-1 text-[28px] font-semibold tracking-[-0.04em] text-[var(--ink)]">{value}</p></article>;
}

function ServiceCard({ service, stats, onEdit, onArchive, canEdit, canDelete }: { service: Service; stats?: Performance; onEdit: () => void; onArchive: () => void; canEdit: boolean; canDelete: boolean }) {
  const revenue = stats?.collected ?? 0;
  const appointments = stats?.appointmentCount ?? 0;
  return <article className="group flex min-h-[250px] min-w-0 flex-col overflow-hidden rounded-[20px] border border-[var(--line)] bg-white transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-[#d8d4cf] hover:shadow-[0_14px_35px_rgba(28,25,23,0.07)]"><div className="p-5"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[#eaf5fb] text-[#1674bd]"><Icon name="spark" size={19} /></span><div className="min-w-0 flex-1"><h3 className="truncate text-[15px] font-semibold tracking-[-0.02em] text-[var(--ink)]">{service.name}</h3><p className="mt-0.5 truncate text-[12px] text-[var(--muted)]">{service.description || "Güzellik Hizmeti"}</p></div><button type="button" aria-label="Hizmet İşlemleri" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#9b9690] hover:bg-[#f5f4f2]" onClick={onEdit}><Icon name="more" size={18} /></button></div><div className="mt-5 flex items-center justify-between gap-3"><span className="inline-flex min-w-0 items-center gap-1.5 text-[12px] text-[#6f6b66]"><Icon name="clock" size={15} /> {formatDuration(service.durationMinutes)}</span><strong className="shrink-0 text-[16px] font-semibold text-[var(--ink)]">{formatPrice(service.price)}</strong></div></div><div className="mt-auto border-t border-[var(--line)] px-5 py-3.5"><div className="flex items-center justify-between gap-3 text-[11px] text-[#8a857f]"><span>Bugün</span><span>{appointments} Randevu · {money(revenue)}</span></div><div className="mt-3 flex items-center justify-between gap-2"><StatusBadge status={service.status} label={serviceStatusLabel(service.status)} /><div className="flex min-w-0 gap-2"><Button variant="secondary" className="h-8 min-h-8 px-3 py-1 text-[12px]" onClick={onEdit} disabled={!canEdit}><Icon name="edit" size={14} /> Düzenle</Button><Button variant="ghost" className="h-8 min-h-8 px-2" onClick={onArchive} disabled={!canDelete || service.status === "ARCHIVED"} aria-label="Arşivle"><Icon name="more" size={17} /></Button></div></div></div></article>;
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-white"><div className="border-b border-[var(--line)] px-5 py-4"><h2 className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--ink)]">{title}</h2><p className="mt-1 text-[12px] text-[var(--muted)]">{subtitle}</p></div><div className="p-5">{children}</div></section>;
}

function PerformancePanel({ ranked }: { ranked: { service: Service; stats?: Performance }[] }) {
  const max = Math.max(...ranked.map((item) => item.stats?.collected ?? 0), 1);
  return <Panel title="Hizmet Performansı" subtitle="Bugünkü Ciro Dağılımı"><div className="mb-4 flex gap-1.5"><span className="rounded-full bg-[#1f1f1d] px-3 py-1.5 text-[11px] font-medium text-white">Ciro</span><span className="rounded-full bg-[#f5f4f2] px-3 py-1.5 text-[11px] text-[#77716b]">Randevu</span><span className="rounded-full bg-[#f5f4f2] px-3 py-1.5 text-[11px] text-[#77716b]">Fiyat</span></div><div className="space-y-4">{ranked.length ? ranked.map((item) => <div key={item.service.id}><div className="mb-1.5 flex items-center justify-between gap-3 text-[11px]"><span className="truncate text-[#625d57]">{item.service.name}</span><strong className="shrink-0 text-[11px] text-[var(--ink)]">{money(item.stats?.collected ?? 0)}</strong></div><div className="h-2 overflow-hidden rounded-full bg-[#efeeec]"><div className="h-full rounded-full bg-[#1674bd]" style={{ width: `${Math.max(((item.stats?.collected ?? 0) / max) * 100, 2)}%` }} /></div></div>) : <p className="py-5 text-center text-[12px] text-[var(--muted)]">Bugün Henüz Hizmet Performansı Yok.</p>}</div></Panel>;
}

function PreferredPanel({ preferred }: { preferred: { service: Service; stats?: Performance }[] }) {
  return <Panel title="En Çok Tercih Edilen" subtitle="Bugünkü Randevu Sayısına Göre"><div className="space-y-3">{preferred.map((item, index) => <div key={item.service.id} className="flex items-center gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#eaf5fb] text-[11px] font-semibold text-[#1674bd]">{index + 1}</span><span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[#4e4944]">{item.service.name}</span><span className="shrink-0 text-[11px] text-[#8d8881]">{item.stats?.appointmentCount ?? 0} Randevu</span></div>)}</div></Panel>;
}

function QuickPanel({ onCreate }: { onCreate: () => void }) {
  return <Panel title="Hızlı İşlemler" subtitle="Hizmet Yönetimi"><QuickAction label="Yeni Hizmet" description="Hizmet Oluştur" icon="spark" onClick={onCreate} /></Panel>;
}

function QuickAction({ label, description, icon, onClick }: { label: string; description: string; icon: "spark" | "grid" | "money"; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-[12px] px-2.5 py-2.5 text-left hover:bg-[#faf9f7]"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#eaf5fb] text-[#1674bd]"><Icon name={icon} size={17} /></span><span className="min-w-0 flex-1"><strong className="block text-[12px] font-semibold text-[#49443f]">{label}</strong><span className="mt-0.5 block truncate text-[10px] text-[#9a948e]">{description}</span></span><Icon name="arrow" size={15} /></button>;
}

function MiniHighlight({ icon, label, value, meta }: { icon: "spark" | "money" | "clock"; label: string; value: string; meta: string }) {
  return <article className="min-w-0 rounded-[15px] border border-[var(--line)] p-4"><span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-[#eaf5fb] text-[#1674bd]"><Icon name={icon} size={15} /></span><p className="mt-3 truncate text-[10px] font-medium uppercase tracking-[0.06em] text-[#98918a]">{label}</p><p className="mt-1 truncate text-[13px] font-semibold text-[var(--ink)]">{value}</p><p className="mt-1 text-[11px] text-[#8e8983]">{meta}</p></article>;
}

function RevenueMix({ services, performance }: { services: Service[]; performance: Record<string, Performance> }) {
  const rows = services.map((service) => ({ name: service.name, value: performance[service.id]?.collected ?? 0 })).filter((row) => row.value > 0).sort((a, b) => b.value - a.value).slice(0, 6);
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const colors = ["#1674BD", "#4d936a", "#d39b4d", "#55D4E1", "#8aa6c5", "#b9b5ad"];
  let cursor = 0;
  const gradient = rows.length ? rows.map((row, index) => { const start = cursor; cursor += (row.value / total) * 100; return `${colors[index % colors.length]} ${start}% ${cursor}%`; }).join(", ") : "#eeece9 0 100%";
  return <Panel title="Hizmet Bazlı Gelir Dağılımı" subtitle="Bugünkü Tahsilat"><div className="flex flex-col gap-5 sm:flex-row sm:items-center"><div className="mx-auto flex h-32 w-32 shrink-0 items-center justify-center rounded-full" style={{ background: `conic-gradient(${gradient})` }}><div className="flex h-20 w-20 items-center justify-center rounded-full bg-white text-center"><span><small className="block text-[9px] uppercase tracking-wider text-[#96908a]">Toplam</small><strong className="text-[14px] text-[var(--ink)]">{money(total)}</strong></span></div></div><div className="min-w-0 flex-1 space-y-2.5">{rows.length ? rows.map((row, index) => <div key={row.name} className="flex items-center gap-2 text-[11px]"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} /><span className="min-w-0 flex-1 truncate text-[#615c56]">{row.name}</span><strong className="shrink-0 text-[#4a4641]">{money(row.value)}</strong></div>) : <p className="text-[12px] text-[var(--muted)]">Bugün Gelir Dağılımı Oluşmadı.</p>}</div></div></Panel>;
}
