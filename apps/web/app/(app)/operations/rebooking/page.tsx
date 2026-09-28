"use client";

import { useEffect, useMemo, useState } from "react";

import { CardInfo } from "@/components/card-info";
import { ValooSelect } from "@/components/valoo-controls";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasActiveBranch, hasPermission } from "@/lib/auth";
import { getCardHelp } from "@/lib/card-help";
import type { Customer, Paginated, Service, Staff } from "@/lib/types";

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

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

export default function OperationsRebookingPage() {
  const canCreate = hasPermission("appointments", "create");
  const canManagePolicy = hasPermission("services", "update");
  const canReadCustomers = hasPermission("customers", "read");
  const canReadStaff = hasPermission("staff", "read");

  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [analytics, setAnalytics] = useState<RebookingAnalytics | null>(null);

  const [policyServiceId, setPolicyServiceId] = useState("");
  const [intervalDays, setIntervalDays] = useState("28");
  const [customerFilter, setCustomerFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");

  const [selectedId, setSelectedId] = useState("");
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [startAt, setStartAt] = useState("");

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    if (!hasActiveBranch()) {
      setLoading(false);
      setError("Yeniden randevu yönetimi için önce aktif bir şube seçin.");
      return;
    }

    setLoading(true);
    setError("");
    setWarning("");

    const requests = await Promise.allSettled([
      api<Opportunity[]>("/operations/rebooking/opportunities"),
      api<Paginated<Service>>("/services?page=1&limit=100&status=ACTIVE"),
      api<RebookingAnalytics>("/operations/rebooking-analytics?days=90"),
      canReadCustomers
        ? api<Paginated<Customer>>("/customers?page=1&limit=100")
        : Promise.resolve(null),
      canReadStaff
        ? api<Paginated<Staff>>("/staff?page=1&limit=100&status=ACTIVE")
        : Promise.resolve(null),
    ]);

    const [opportunitiesResult, servicesResult, analyticsResult, customersResult, staffResult] = requests;
    const warnings: string[] = [];

    if (opportunitiesResult.status === "fulfilled") {
      setOpportunities(opportunitiesResult.value);
    } else {
      setOpportunities([]);
      warnings.push(errorMessage(opportunitiesResult.reason, "Tamamlanan hizmetler yüklenemedi."));
    }

    if (servicesResult.status === "fulfilled") {
      setServices(servicesResult.value.data);
      setPolicyServiceId((current) => current || servicesResult.value.data[0]?.id || "");
    } else {
      setServices([]);
      warnings.push(errorMessage(servicesResult.reason, "Hizmetler yüklenemedi."));
    }

    if (analyticsResult.status === "fulfilled") {
      setAnalytics(analyticsResult.value);
    } else {
      setAnalytics(null);
      warnings.push(errorMessage(analyticsResult.reason, "Yeniden randevu özeti yüklenemedi."));
    }

    if (customersResult.status === "fulfilled" && customersResult.value) {
      setCustomers(customersResult.value.data);
    } else if (customersResult.status === "rejected") {
      setCustomers([]);
      warnings.push(errorMessage(customersResult.reason, "Müşteriler yüklenemedi."));
    }

    if (staffResult.status === "fulfilled" && staffResult.value) {
      setStaff(staffResult.value.data);
    } else if (staffResult.status === "rejected") {
      setStaff([]);
      warnings.push(errorMessage(staffResult.reason, "Personel listesi yüklenemedi."));
    }

    if (warnings.length) {
      setWarning(Array.from(new Set(warnings)).join(" "));
    }

    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const selected = useMemo(
    () => opportunities.find((item) => item.id === selectedId) ?? null,
    [opportunities, selectedId],
  );

  const filteredOpportunities = useMemo(
    () =>
      opportunities.filter((item) => {
        if (customerFilter && item.customerId !== customerFilter) return false;
        if (serviceFilter && item.serviceId !== serviceFilter) return false;
        return true;
      }),
    [opportunities, customerFilter, serviceFilter],
  );

  function selectOpportunity(item: Opportunity) {
    setSelectedId(item.id);
    setSelectedStaffId(item.staffId);
    setStartAt(localInputValue(item.recommendedStartAt));
    setNotice("");
    setError("");
  }

  async function savePolicy() {
    if (!canManagePolicy || !policyServiceId) return;
    const days = Number(intervalDays);
    if (!Number.isInteger(days) || days < 1 || days > 730) {
      setError("Önerilen dönüş aralığı 1 ile 730 gün arasında olmalıdır.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      await api(`/operations/rebooking/services/${policyServiceId}/policy`, {
        method: "PUT",
        body: { recommendedIntervalDays: days },
      });
      setNotice("Önerilen yeniden randevu aralığı kaydedildi.");
      await load();
    } catch (err) {
      setError(errorMessage(err, "Yeniden randevu kuralı kaydedilemedi."));
    } finally {
      setBusy(false);
    }
  }

  async function createRebooking() {
    if (!canCreate || !selected || !startAt) return;

    const start = new Date(startAt);
    if (Number.isNaN(start.getTime()) || start <= new Date()) {
      setError("Yeni randevu için gelecekte bir tarih ve saat seçin.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      await api(`/operations/rebooking/appointments/${selected.id}`, {
        method: "POST",
        body: {
          startAt: start.toISOString(),
          staffId: selectedStaffId || selected.staffId,
          notes: `Önceki randevu ${selected.id.slice(0, 8)} üzerinden yeniden randevu`,
        },
      });

      setNotice("Yeni randevu oluşturuldu ve önceki hizmetle bağlantısı kaydedildi.");
      setSelectedId("");
      setSelectedStaffId("");
      setStartAt("");
      await load();
    } catch (err) {
      setError(errorMessage(err, "Yeni randevu oluşturulamadı."));
    } finally {
      setBusy(false);
    }
  }

  if (loading && !opportunities.length && !services.length) {
    return (
      <div className="mx-auto max-w-[1420px] py-10">
        <Spinner label="Yeniden randevu verileri hazırlanıyor..." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1420px] space-y-5 pb-10">
      <header className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-soft)]">
          Müşteri Devamlılığı
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
          Yeniden Randevu
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
          Uygulamadaki tamamlanmış randevuları, müşterileri, hizmetleri ve aktif personeli birlikte kullanarak müşterinin bir sonraki randevusunu planlar.
        </p>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
      {warning ? <Alert tone="warning" onClose={() => setWarning("")}>{warning}</Alert> : null}
      {notice ? <Alert tone="success" onClose={() => setNotice("")}>{notice}</Alert> : null}

      {analytics ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-semibold text-[var(--muted)]">90 Gün Yeniden Randevu Oranı</p>
              <CardInfo help={getCardHelp("90 Gün Yeniden Randevu Oranı", "Son 90 gündeki uygun tamamlanmış hizmetlerin ne kadarının yeni randevuya dönüştüğünü gösterir.")} />
            </div>
            <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">%{analytics.rebookingRate}</p>
          </div>
          <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-semibold text-[var(--muted)]">Tamamlanan Hizmet</p>
              <CardInfo help={getCardHelp("Tamamlanan Hizmet", "Yeniden randevu değerlendirmesine uygun tamamlanmış hizmetlerin sayısını gösterir.")} />
            </div>
            <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">{analytics.eligibleCompleted}</p>
          </div>
          <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-semibold text-[var(--muted)]">Yeniden Randevu</p>
              <CardInfo help={getCardHelp("Yeniden Randevu", "Kaynak hizmet sonrasında yeni randevu oluşturulmuş kayıtların sayısını gösterir.")} />
            </div>
            <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">{analytics.rebooked}</p>
          </div>
          <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-semibold text-[var(--muted)]">Öneriden Ortalama Sapma</p>
              <CardInfo help={getCardHelp("Öneriden Ortalama Sapma", "Gerçek yeniden randevu tarihi ile önerilen dönüş tarihi arasındaki ortalama gün farkını gösterir.")} />
            </div>
            <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">
              {analytics.avgDeviationDays === null ? "—" : `${analytics.avgDeviationDays > 0 ? "+" : ""}${analytics.avgDeviationDays} gün`}
            </p>
          </div>
        </section>
      ) : null}

      <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--ink)]">Müşteri ve Hizmet Filtresi</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Uygulamadaki müşteriler ve hizmetlerle tamamlanmış randevuları filtreleyin.
            </p>
          </div>
          <CardInfo help={getCardHelp("Müşteri ve Hizmet Filtresi", "Seçimler yalnız listeyi daraltır; kaynak randevu verisi uygulamadaki tamamlanmış randevulardan gelir.")} />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <ValooSelect
            value={customerFilter}
            onChange={setCustomerFilter}
            placeholder="Tüm müşteriler"
            searchPlaceholder="Müşteri ara…"
            emptyLabel="Müşteri bulunamadı."
            clearable
            options={customers.map((item) => ({
              value: item.id,
              label: `${item.firstName} ${item.lastName}`.trim(),
              description: item.phone ?? item.email ?? undefined,
            }))}
          />
          <ValooSelect
            value={serviceFilter}
            onChange={setServiceFilter}
            placeholder="Tüm hizmetler"
            searchPlaceholder="Hizmet ara…"
            emptyLabel="Hizmet bulunamadı."
            clearable
            options={services.map((item) => ({
              value: item.id,
              label: item.name,
              description: `${item.durationMinutes} dk`,
            }))}
          />
        </div>
      </section>

      <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--ink)]">Hizmet Dönüş Politikası</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Örneğin 28 gün girildiğinde tamamlanan hizmet için dört hafta sonrası önerilir.
            </p>
          </div>
          <CardInfo help={getCardHelp("Hizmet Dönüş Politikası", "Hizmet bazında önerilen bir sonraki randevu aralığını belirler.")} />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_180px_auto] md:items-end">
          <div>
            <p className="mb-2 text-xs font-semibold text-[var(--muted)]">Hizmet</p>
            <ValooSelect
              value={policyServiceId}
              onChange={setPolicyServiceId}
              placeholder="Hizmet seçin"
              searchPlaceholder="Hizmet ara…"
              emptyLabel="Aktif hizmet bulunamadı."
              options={services.map((item) => ({
                value: item.id,
                label: item.name,
                description: `${item.durationMinutes} dk`,
              }))}
            />
          </div>
          <label className="text-xs font-semibold text-[var(--muted)]">
            Önerilen gün
            <input
              type="number"
              min={1}
              max={730}
              className="mt-2 min-h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm text-[var(--ink)]"
              value={intervalDays}
              onChange={(event) => setIntervalDays(event.target.value)}
            />
          </label>
          <Button
            disabled={!canManagePolicy || !policyServiceId || busy}
            onClick={() => void savePolicy()}
          >
            Politikayı Kaydet
          </Button>
        </div>
        {!canManagePolicy ? (
          <p className="mt-3 text-xs text-[var(--muted)]">
            Hizmet politikasını değiştirmek için hizmet güncelleme yetkisi gerekir.
          </p>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-[24px] border border-[var(--line)] bg-[var(--surface)] shadow-sm">
        <div className="border-b border-[var(--line)] px-6 py-4">
          <h2 className="text-sm font-semibold text-[var(--ink)]">
            Tamamlanan Hizmetler ve Yeniden Randevu Fırsatları
          </h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {filteredOpportunities.length} uygun kayıt gösteriliyor.
          </p>
        </div>

        {filteredOpportunities.length ? (
          <div className="divide-y divide-[var(--line)]">
            {filteredOpportunities.map((item) => (
              <div key={item.id} className="flex flex-col gap-4 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-[var(--ink)]">
                      {item.customerName} · {item.serviceName}
                    </p>
                    {item.rebooked ? (
                      <span className="rounded-full bg-[rgba(47,122,86,0.10)] px-2 py-1 text-[10px] font-semibold text-[#2d5c45]">
                        Yeniden Randevulandı
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Son hizmet: {new Date(item.endAt).toLocaleString("tr-TR")} · Personel: {item.staffName}
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {item.recommendedStartAt
                      ? `Önerilen dönüş: ${new Date(item.recommendedStartAt).toLocaleString("tr-TR")} (${item.recommendedIntervalDays} gün)`
                      : "Bu hizmet için önerilen dönüş aralığı tanımlanmamış."}
                  </p>
                  {item.targetStartAt ? (
                    <p className="mt-1 text-xs font-medium text-[var(--ink)]">
                      Yeni randevu: {new Date(item.targetStartAt).toLocaleString("tr-TR")}
                    </p>
                  ) : null}
                </div>
                {!item.rebooked ? (
                  <Button variant="secondary" onClick={() => selectOpportunity(item)}>
                    Yeniden Randevula
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="px-6 py-10 text-center text-sm text-[var(--muted)]">
            {opportunities.length
              ? "Seçtiğiniz müşteri veya hizmet için uygun tamamlanmış randevu bulunamadı."
              : "Son 90 günde yeniden randevuya uygun tamamlanmış hizmet bulunamadı."}
          </div>
        )}
      </section>

      {selected ? (
        <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-[var(--ink)]">Yeni Randevu Oluştur</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {selected.customerName} · {selected.serviceName}
              </p>
            </div>
            <CardInfo help={getCardHelp("Yeni Randevu Oluştur", "Yeni randevu önceki tamamlanmış hizmetle ilişkilendirilir; böylece yeniden randevu performansı doğru ölçülür.")} />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <div>
              <p className="mb-2 text-xs font-semibold text-[var(--muted)]">Personel</p>
              <ValooSelect
                value={selectedStaffId}
                onChange={setSelectedStaffId}
                placeholder="Personel seçin"
                searchPlaceholder="Personel ara…"
                emptyLabel="Aktif personel bulunamadı."
                options={
                  staff.length
                    ? staff.map((item) => ({
                        value: item.id,
                        label: `${item.firstName} ${item.lastName}`.trim(),
                        description: item.profile?.position,
                      }))
                    : [{
                        value: selected.staffId,
                        label: selected.staffName,
                        description: "Önceki randevudaki personel",
                      }]
                }
              />
            </div>

            <label className="text-xs font-semibold text-[var(--muted)]">
              Başlangıç
              <input
                type="datetime-local"
                className="mt-2 min-h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm text-[var(--ink)]"
                value={startAt}
                onChange={(event) => setStartAt(event.target.value)}
              />
            </label>

            <Button
              disabled={!canCreate || !startAt || !selectedStaffId || busy}
              onClick={() => void createRebooking()}
            >
              {busy ? "Oluşturuluyor..." : "Yeni Randevuyu Oluştur"}
            </Button>
          </div>

          {!canCreate ? (
            <p className="mt-3 text-xs text-[var(--muted)]">
              Yeni randevu oluşturmak için randevu oluşturma yetkisi gerekir.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
