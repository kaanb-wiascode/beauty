"use client";

import { Select, useEffect, useMemo, useState } from "react";

import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasActiveBranch, hasPermission } from "@/lib/auth";
import type { Paginated, Service } from "@/lib/types";

type Opportunity = {
  id: string;
  customerId: string;
  serviceId: string;
  staffId: string;
  endAt: string;
  serviceName: string;
  customerName: string;
  staffName: string;
  durationMinutes: number;
  recommendedIntervalDays: number | null;
  recommendedStartAt: string | null;
  targetAppointmentId: string | null;
  targetStartAt: string | null;
  rebooked: boolean;
};

type RebookingAnalytics = {
  windowDays: number;
  eligibleCompleted: number;
  rebooked: number;
  recommendedTracked: number;
  rebookingRate: number;
  avgDeviationDays: number | null;
  byService: Array<{ serviceId: string; serviceName: string; rebooked: number }>;
  byStaff: Array<{ staffId: string; staffName: string; rebooked: number }>;
};

function localInputValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function OperationsRebookingPage() {
  const canCreate = hasPermission("appointments", "create");
  const canManage = hasPermission("appointments", "update");
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [analytics, setAnalytics] = useState<RebookingAnalytics | null>(null);
  const [serviceId, setServiceId] = useState("");
  const [intervalDays, setIntervalDays] = useState("28");
  const [selectedId, setSelectedId] = useState("");
  const [startAt, setStartAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    if (!hasActiveBranch()) {
      setLoading(false);
      setError("Rebooking yönetimi için önce aktif bir şube seçin.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [opportunityRows, serviceRows, analyticsRow] = await Promise.all([
        api<Opportunity[]>("/operations/rebooking/opportunities"),
        api<Paginated<Service>>("/services?page=1&limit=200"),
        api<RebookingAnalytics>("/operations/rebooking-analytics?days=90"),
      ]);
      setOpportunities(opportunityRows);
      setServices(serviceRows.data);
      setAnalytics(analyticsRow);
      setServiceId((current) => current || serviceRows.data[0]?.id || "");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Rebooking verileri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const selected = useMemo(
    () => opportunities.find((item) => item.id === selectedId) ?? null,
    [opportunities, selectedId],
  );

  function selectOpportunity(item: Opportunity) {
    setSelectedId(item.id);
    setStartAt(localInputValue(item.recommendedStartAt));
    setNotice("");
  }

  async function savePolicy() {
    if (!canManage || !serviceId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/operations/rebooking/services/${serviceId}/policy`, {
        method: "PUT",
        body: { recommendedIntervalDays: Number(intervalDays) },
      });
      setNotice("Önerilen yeniden randevu aralığı kaydedildi.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Rebooking politikası kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  }

  async function createRebooking() {
    if (!canCreate || !selected || !startAt) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/operations/rebooking/appointments/${selected.id}`, {
        method: "POST",
        body: {
          startAt: new Date(startAt).toISOString(),
          staffId: selected.staffId,
          notes: `Önceki randevu ${selected.id.slice(0, 8)} üzerinden yeniden randevu`,
        },
      });
      setNotice("Yeni randevu oluşturuldu ve rebooking bağlantısı kaydedildi.");
      setSelectedId("");
      setStartAt("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Yeni randevu oluşturulamadı.");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !opportunities.length) {
    return <div className="mx-auto max-w-[1420px] py-10"><Spinner label="Rebooking fırsatları hazırlanıyor..." /></div>;
  }

  return (
    <div className="mx-auto max-w-[1420px] space-y-5 pb-10">
      <header className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-soft)]">Retention Operations</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">Yeniden Randevu</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">Tamamlanan hizmetlerden sonraki önerilen dönüş tarihini gösterir ve yeni Appointment kaydını kaynak randevuya audit edilebilir biçimde bağlar.</p>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
      {notice ? <Alert tone="success" onClose={() => setNotice("")}>{notice}</Alert> : null}

      {analytics ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm"><p className="text-xs font-semibold text-[var(--muted)]">90 Gün Rebooking Oranı</p><p className="mt-2 text-2xl font-semibold text-[var(--ink)]">%{analytics.rebookingRate}</p></div>
          <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm"><p className="text-xs font-semibold text-[var(--muted)]">Tamamlanan Hizmet</p><p className="mt-2 text-2xl font-semibold text-[var(--ink)]">{analytics.eligibleCompleted}</p></div>
          <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm"><p className="text-xs font-semibold text-[var(--muted)]">Rebooked</p><p className="mt-2 text-2xl font-semibold text-[var(--ink)]">{analytics.rebooked}</p></div>
          <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm"><p className="text-xs font-semibold text-[var(--muted)]">Öneriden Ortalama Sapma</p><p className="mt-2 text-2xl font-semibold text-[var(--ink)]">{analytics.avgDeviationDays === null ? "—" : `${analytics.avgDeviationDays > 0 ? "+" : ""}${analytics.avgDeviationDays} gün`}</p></div>
        </section>
      ) : null}

      <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-[var(--ink)]">Hizmet Dönüş Politikası</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">Örneğin 28 gün girildiğinde tamamlanan hizmet için dört hafta sonrası önerilir.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_180px_auto] md:items-end">
          <label className="text-xs font-semibold text-[var(--muted)]">Hizmet
            <Select className="mt-2 min-h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm text-[var(--ink)]" value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
              {services.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
          </label>
          <label className="text-xs font-semibold text-[var(--muted)]">Önerilen gün
            <input type="number" min={1} max={730} className="mt-2 min-h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm text-[var(--ink)]" value={intervalDays} onChange={(event) => setIntervalDays(event.target.value)} />
          </label>
          <Button disabled={!canManage || !serviceId || busy} onClick={() => void savePolicy()}>Politikayı Kaydet</Button>
        </div>
      </section>

      <section className="overflow-hidden rounded-[24px] border border-[var(--line)] bg-[var(--surface)] shadow-sm">
        <div className="border-b border-[var(--line)] px-6 py-4"><h2 className="text-sm font-semibold text-[var(--ink)]">Tamamlanan Hizmetler ve Rebooking Fırsatları</h2></div>
        {opportunities.length ? (
          <div className="divide-y divide-[var(--line)]">
            {opportunities.map((item) => (
              <div key={item.id} className="flex flex-col gap-4 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-[var(--ink)]">{item.customerName} · {item.serviceName}</p>
                    {item.rebooked ? <span className="rounded-full bg-[rgba(47,122,86,0.10)] px-2 py-1 text-[10px] font-semibold text-[#2d5c45]">Rebooked</span> : null}
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">Son hizmet: {new Date(item.endAt).toLocaleString("tr-TR")} · Personel: {item.staffName}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">{item.recommendedStartAt ? `Önerilen dönüş: ${new Date(item.recommendedStartAt).toLocaleString("tr-TR")} (${item.recommendedIntervalDays} gün)` : "Bu hizmet için önerilen dönüş aralığı tanımlanmamış."}</p>
                  {item.targetStartAt ? <p className="mt-1 text-xs font-medium text-[var(--ink)]">Yeni randevu: {new Date(item.targetStartAt).toLocaleString("tr-TR")}</p> : null}
                </div>
                {!item.rebooked ? <Button variant="secondary" onClick={() => selectOpportunity(item)}>Yeniden Randevula</Button> : null}
              </div>
            ))}
          </div>
        ) : <div className="px-6 py-10 text-center text-sm text-[var(--muted)]">Son 90 günde tamamlanmış hizmet bulunamadı.</div>}
      </section>

      {selected ? (
        <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-[var(--ink)]">Yeni Randevu Oluştur</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">{selected.customerName} · {selected.serviceName} · varsayılan personel {selected.staffName}</p>
          <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <label className="text-xs font-semibold text-[var(--muted)]">Başlangıç
              <input type="datetime-local" className="mt-2 min-h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm text-[var(--ink)]" value={startAt} onChange={(event) => setStartAt(event.target.value)} />
            </label>
            <Button disabled={!canCreate || !startAt || busy} onClick={() => void createRebooking()}>{busy ? "Oluşturuluyor..." : "Yeni Randevuyu Oluştur"}</Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
