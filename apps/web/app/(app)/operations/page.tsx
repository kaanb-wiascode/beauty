"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CardInfo } from "@/components/card-info";

import { Alert, Button, Spinner, Select } from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";
import { getCardHelp } from "@/lib/card-help";
import { hasActiveBranch, hasPermission } from "@/lib/auth";
import { useOperationRealtime } from "@/lib/use-operation-realtime";
import type { Appointment, Customer, Paginated, Visit, VisitDetail, VisitStatus } from "@/lib/types";

type CheckoutIssue = {
  code: "VISIT_NOT_CHECKOUT_PENDING" | "PAYMENT_PENDING" | "PACKAGE_SESSION_NOT_CONSUMED" | "COMMERCIAL_CONTEXT_UNVERIFIED";
  appointmentId?: string;
  message: string;
};

type CheckoutReadiness = {
  visitId: string;
  visitStatus: string;
  appointmentIds: string[];
  canCheckout: boolean;
  blockers: CheckoutIssue[];
  warnings: CheckoutIssue[];
};

type SmartAction = {
  id: string;
  severity: "INFO" | "WARNING" | "HIGH" | "CRITICAL";
  title: string;
  explanation: string;
  suggestedAction: string;
};

type OperationsAlertSummary = {
  alerts: Array<{
    id: string;
    severity: SmartAction["severity"];
    title: string;
    message: string;
    suggestedAction: string;
  }>;
};

type OperationsIntelligenceSummary = {
  managerInsights: Array<{
    code: string;
    severity: "INFO" | "WARNING" | "HIGH";
    title: string;
    explanation: string;
    suggestedAction: string;
  }>;
};

type OperationsOptimizationSummary = {
  capacityRecommendations: Array<{
    code: string;
    priority?: "INFO" | "MEDIUM" | "HIGH";
    title: string;
    explanation?: string;
    suggestedAction: string;
  }>;
  staffRecommendations: Array<{
    code: string;
    priority?: "INFO" | "MEDIUM" | "HIGH";
    title: string;
    explanation?: string;
    suggestedAction: string;
  }>;
};

const STATUS_LABELS: Record<VisitStatus, string> = {
  EXPECTED: "Bekleniyor",
  ARRIVED: "Geldi",
  CHECKED_IN: "Giriş Yapıldı",
  WAITING: "Sırada",
  IN_SERVICE: "Hizmette",
  SERVICE_COMPLETED: "Hizmet Tamamlandı",
  CHECKOUT_PENDING: "Çıkış Bekliyor",
  CHECKED_OUT: "Çıkış Yapıldı",
  CANCELLED: "İptal",
};

const STATUS_ORDER: VisitStatus[] = [
  "CHECKED_IN",
  "WAITING",
  "IN_SERVICE",
  "SERVICE_COMPLETED",
  "CHECKOUT_PENDING",
  "EXPECTED",
  "ARRIVED",
  "CHECKED_OUT",
  "CANCELLED",
];

const NEXT_ACTION: Partial<Record<VisitStatus, { label: string; status: VisitStatus }>> = {
  EXPECTED: { label: "Giriş Yap", status: "CHECKED_IN" },
  ARRIVED: { label: "Giriş Yap", status: "CHECKED_IN" },
  CHECKED_IN: { label: "Sıraya Al", status: "WAITING" },
  WAITING: { label: "Hizmeti Başlat", status: "IN_SERVICE" },
  IN_SERVICE: { label: "Hizmeti Tamamla", status: "SERVICE_COMPLETED" },
  SERVICE_COMPLETED: { label: "Çıkışa Hazırla", status: "CHECKOUT_PENDING" },
  CHECKOUT_PENDING: { label: "Çıkış Yap", status: "CHECKED_OUT" },
};

function elapsed(value: string | null) {
  if (!value) return "—";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes} dk`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} sa ${rest} dk` : `${hours} sa`;
}

function visitAgeStart(visit: Visit) {
  return visit.checkedInAt ?? visit.arrivedAt ?? visit.createdAt;
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function endOfToday() {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function dateTimeLabel(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function checkoutIssueLabel(issue: CheckoutIssue) {
  if (issue.code === "PAYMENT_PENDING") return "Ödeme / tahsilat bekliyor";
  if (issue.code === "PACKAGE_SESSION_NOT_CONSUMED") return "Paket seansı tüketilmedi";
  if (issue.code === "VISIT_NOT_CHECKOUT_PENDING") return "Ziyaret henüz çıkış aşamasında değil";
  return "Randevusuz müşteri için satış ve ödeme durumu doğrulanmalı";
}

export default function OperationsPage() {
  const canUpdate = hasPermission("operations", "manage");
  const canReadAppointments = hasPermission("appointments", "read");
  const canReadCustomers = hasPermission("customers", "read");
  const [visits, setVisits] = useState<Visit[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [walkInCustomerId, setWalkInCustomerId] = useState("");
  const [walkInRequestKey, setWalkInRequestKey] = useState<string | null>(null);
  const [expandedVisitId, setExpandedVisitId] = useState<string | null>(null);
  const [visitDetails, setVisitDetails] = useState<Record<string, VisitDetail>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [readinessByVisit, setReadinessByVisit] = useState<Record<string, CheckoutReadiness>>({});
  const [smartActions, setSmartActions] = useState<SmartAction[]>([]);
  const [flowFilter, setFlowFilter] = useState<"ALL" | "EXPECTED" | "WAITING" | "IN_SERVICE" | "CHECKOUT_PENDING">("ALL");

  const loadCheckoutReadiness = useCallback(async (items: Visit[]) => {
    const checkoutVisits = items.filter((visit) => visit.status === "CHECKOUT_PENDING");
    if (!checkoutVisits.length) {
      setReadinessByVisit({});
      return;
    }

    const results = await Promise.allSettled(
      checkoutVisits.map(async (visit) => [
        visit.id,
        await api<CheckoutReadiness>(`/visits/${visit.id}/checkout-readiness`),
      ] as const),
    );

    const next: Record<string, CheckoutReadiness> = {};
    for (const result of results) {
      if (result.status === "fulfilled") next[result.value[0]] = result.value[1];
    }
    setReadinessByVisit(next);
  }, []);

  const loadSmartActions = useCallback(async () => {
    if (!hasActiveBranch()) {
      setSmartActions([]);
      return;
    }

    const [alertsResult, intelligenceResult, optimizationResult] =
      await Promise.allSettled([
        api<OperationsAlertSummary>("/operations/alerts"),
        api<OperationsIntelligenceSummary>("/operations/intelligence?hours=24"),
        api<OperationsOptimizationSummary>("/operations/optimization?hours=24"),
      ]);

    const next: SmartAction[] = [];
    if (alertsResult.status === "fulfilled") {
      next.push(
        ...alertsResult.value.alerts.slice(0, 4).map((item): SmartAction => ({
          id: `alert:${item.id}`,
          severity: item.severity,
          title: item.title,
          explanation: item.message,
          suggestedAction: item.suggestedAction,
        })),
      );
    }

    if (intelligenceResult.status === "fulfilled") {
      next.push(
        ...intelligenceResult.value.managerInsights.slice(0, 4).map((item): SmartAction => ({
          id: `insight:${item.code}`,
          severity: item.severity,
          title: item.title,
          explanation: item.explanation,
          suggestedAction: item.suggestedAction,
        })),
      );
    }

    if (optimizationResult.status === "fulfilled") {
      const recommendations = [
        ...optimizationResult.value.capacityRecommendations,
        ...optimizationResult.value.staffRecommendations,
      ];
      next.push(
        ...recommendations.slice(0, 4).map((item): SmartAction => ({
          id: `recommendation:${item.code}`,
          severity:
            item.priority === "HIGH"
              ? "HIGH"
              : item.priority === "MEDIUM"
                ? "WARNING"
                : "INFO",
          title: item.title,
          explanation: item.explanation ?? "Operasyon verilerine göre öneri oluşturuldu.",
          suggestedAction: item.suggestedAction,
        })),
      );
    }

    const rank: Record<SmartAction["severity"], number> = {
      CRITICAL: 4,
      HIGH: 3,
      WARNING: 2,
      INFO: 1,
    };
    setSmartActions(
      next
        .sort((a, b) => rank[b.severity] - rank[a.severity])
        .slice(0, 6),
    );
  }, []);

  const load = useCallback(async () => {
    if (!hasActiveBranch()) {
      setVisits([]);
      setAppointments([]);
      setCustomers([]);
      setReadinessByVisit({});
      setLoading(false);
      setError("Canlı operasyon ekranı için önce çalışma kapsamından bir şube seçin.");
      return;
    }

    setLoading(true);
    setError("");

    const [visitResult, appointmentResult, customerResult] = await Promise.allSettled([
      api<Visit[]>(withQuery("/visits", { limit: 200 })),
      canReadAppointments
        ? api<Paginated<Appointment>>(withQuery("/appointments", {
            page: 1,
            limit: 100,
            from: startOfToday(),
            to: endOfToday(),
          }))
        : Promise.resolve(null),
      canReadCustomers
        ? api<Paginated<Customer>>(withQuery("/customers", { page: 1, limit: 100 }))
        : Promise.resolve(null),
    ]);

    const errors: string[] = [];

    if (visitResult.status === "fulfilled") {
      setVisits(visitResult.value);
      void loadCheckoutReadiness(visitResult.value);
    } else {
      setVisits([]);
      errors.push(visitResult.reason instanceof ApiError ? visitResult.reason.message : "Ziyaretler yüklenemedi.");
    }

    if (appointmentResult.status === "fulfilled" && appointmentResult.value) {
      setAppointments(appointmentResult.value.data);
    } else if (appointmentResult.status === "rejected") {
      setAppointments([]);
      errors.push(appointmentResult.reason instanceof ApiError ? appointmentResult.reason.message : "Bugünkü randevular yüklenemedi.");
    } else {
      setAppointments([]);
    }

    if (customerResult.status === "fulfilled" && customerResult.value) {
      setCustomers(customerResult.value.data);
    } else if (customerResult.status === "rejected") {
      setCustomers([]);
      errors.push(customerResult.reason instanceof ApiError ? customerResult.reason.message : "Müşteriler yüklenemedi.");
    } else {
      setCustomers([]);
    }

    if (errors.length) {
      setError(Array.from(new Set(errors)).join(" "));
    }

    setLoading(false);
  }, [canReadAppointments, canReadCustomers, loadCheckoutReadiness]);

  useEffect(() => {
    void load();
    void loadSmartActions();
  }, [load, loadSmartActions]);

  useOperationRealtime(() => {
    setVisitDetails({});
    void load();
    void loadSmartActions();
  }, hasActiveBranch());

  const customerMap = useMemo(
    () => new Map(customers.map((customer) => [customer.id, `${customer.firstName} ${customer.lastName}`.trim()])),
    [customers],
  );

  const activeVisits = useMemo(
    () => visits
      .filter((visit) => visit.status !== "CHECKED_OUT" && visit.status !== "CANCELLED")
      .sort((a, b) => {
        const statusDelta = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
        if (statusDelta !== 0) return statusDelta;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }),
    [visits],
  );

  const expectedAppointments = useMemo(() => {
    const activeAppointmentIds = new Set(
      visits
        .filter((visit) => visit.status !== "CHECKED_OUT" && visit.status !== "CANCELLED")
        .flatMap((visit) => visit.appointmentIds ?? []),
    );

    return appointments
      .filter((appointment) => ["SCHEDULED", "CONFIRMED"].includes(appointment.status))
      .filter((appointment) => !activeAppointmentIds.has(appointment.id))
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  }, [appointments, visits]);

  const counts = useMemo(() => ({
    expected: expectedAppointments.length,
    waiting: visits.filter((visit) => visit.status === "WAITING" || visit.status === "CHECKED_IN").length,
    inService: visits.filter((visit) => visit.status === "IN_SERVICE").length,
    checkout: visits.filter((visit) => visit.status === "CHECKOUT_PENDING").length,
  }), [expectedAppointments.length, visits]);

  const visibleVisits = useMemo(() => {
    if (flowFilter === "ALL" || flowFilter === "EXPECTED") return activeVisits;
    if (flowFilter === "WAITING") {
      return activeVisits.filter((visit) => visit.status === "WAITING" || visit.status === "CHECKED_IN");
    }
    return activeVisits.filter((visit) => visit.status === flowFilter);
  }, [activeVisits, flowFilter]);

  const flowSteps: Array<{ key: VisitStatus; label: string }> = [
    { key: "CHECKED_IN", label: "Giriş" },
    { key: "WAITING", label: "Bekleme" },
    { key: "IN_SERVICE", label: "Hizmet" },
    { key: "SERVICE_COMPLETED", label: "Tamamlandı" },
    { key: "CHECKOUT_PENDING", label: "Çıkış" },
  ];

  function flowProgress(status: VisitStatus) {
    const index = flowSteps.findIndex((step) => step.key === status);
    if (status === "ARRIVED" || status === "EXPECTED") return -1;
    if (status === "CHECKED_OUT") return flowSteps.length;
    return index;
  }

  async function checkInAppointment(appointment: Appointment) {
    if (!canUpdate) return;

    setUpdatingId(appointment.id);
    setError("");
    try {
      await api("/visits/check-in", {
        method: "POST",
        body: { appointmentId: appointment.id },
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Müşteri giriş işlemi tamamlanamadı.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function checkInWalkIn() {
    if (!canUpdate || !walkInCustomerId) return;

    const requestKey = walkInRequestKey ?? `walk-in-${crypto.randomUUID()}`;
    setWalkInRequestKey(requestKey);
    setUpdatingId(`walk-in:${walkInCustomerId}`);
    setError("");

    try {
      await api("/visits/check-in", {
        method: "POST",
        body: {
          customerId: walkInCustomerId,
          idempotencyKey: requestKey,
        },
      });
      setWalkInCustomerId("");
      setWalkInRequestKey(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Randevusuz müşteri giriş işlemi tamamlanamadı.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function toggleVisitDetail(visit: Visit) {
    if (expandedVisitId === visit.id) {
      setExpandedVisitId(null);
      return;
    }

    setExpandedVisitId(visit.id);
    if (visitDetails[visit.id]) return;

    setDetailLoadingId(visit.id);
    try {
      const detail = await api<VisitDetail>(`/visits/${visit.id}`);
      setVisitDetails((current) => ({ ...current, [visit.id]: detail }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ziyaret geçmişi yüklenemedi.");
    } finally {
      setDetailLoadingId(null);
    }
  }

  async function advance(visit: Visit) {
    const action = NEXT_ACTION[visit.status];
    if (!action || !canUpdate) return;

    const readiness = readinessByVisit[visit.id];
    if (action.status === "CHECKED_OUT" && readiness && !readiness.canCheckout) {
      setError(`Çıkış işlemi tamamlanamaz: ${readiness.blockers.map(checkoutIssueLabel).join(", ")}.`);
      return;
    }

    setUpdatingId(visit.id);
    setError("");
    try {
      if (action.status === "CHECKED_OUT") {
        await api(`/visits/${visit.id}/check-out`, {
          method: "POST",
          body: { expectedVersion: visit.version },
        });
      } else {
        await api(`/visits/${visit.id}/transition`, {
          method: "POST",
          body: { toStatus: action.status, expectedVersion: visit.version },
        });
      }
      setExpandedVisitId(null);
      setVisitDetails((current) => {
        const next = { ...current };
        delete next[visit.id];
        return next;
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Operasyon durumu güncellenemedi.");
    } finally {
      setUpdatingId(null);
    }
  }

  if (loading) {
    return <div className="mx-auto max-w-[1480px] py-10"><Spinner label="Canlı operasyon hazırlanıyor..." /></div>;
  }

  const flowTabs = [
    { key: "ALL" as const, label: "Tümü", value: activeVisits.length },
    { key: "EXPECTED" as const, label: "Beklenen", value: counts.expected },
    { key: "WAITING" as const, label: "Bekleyen", value: counts.waiting },
    { key: "IN_SERVICE" as const, label: "Hizmette", value: counts.inService },
    { key: "CHECKOUT_PENDING" as const, label: "Çıkış", value: counts.checkout },
  ];

  return (
    <div className="mx-auto max-w-[1480px] space-y-4 pb-12">
      <header className="overflow-hidden rounded-[28px] border border-[var(--line)] bg-[linear-gradient(135deg,var(--surface)_0%,var(--surface)_64%,var(--accent-soft)_140%)] shadow-[0_14px_40px_rgba(20,52,74,.06)]">
        <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,.10)]" />
                Canlı
              </span>
              <span className="text-[11px] font-medium text-[var(--muted-soft)]">
                Operasyon Merkezi
              </span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <h1 className="text-[28px] font-semibold tracking-[-0.045em] text-[var(--ink)] sm:text-[34px]">
                Bugünün operasyon akışı
              </h1>
              <CardInfo help={getCardHelp("Canlı Ziyaret Akışı")} />
            </div>
            <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[var(--muted)]">
              Müşteri gelişinden hizmete, tahsilattan çıkışa kadar şubenin tamamını tek çalışma alanından yönetin.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/operations/service-executions"
              className="inline-flex min-h-10 items-center rounded-[13px] border border-[var(--line)] bg-[var(--surface)] px-4 text-xs font-semibold text-[var(--ink)] shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              Hizmet İcraları
            </Link>
            <Button variant="secondary" onClick={() => { void load(); void loadSmartActions(); }}>
              Yenile
            </Button>
          </div>
        </div>

        <div className="grid border-t border-[var(--line)] bg-[var(--surface)]/70 backdrop-blur-xl sm:grid-cols-5">
          {flowTabs.map((item) => {
            const active = flowFilter === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setFlowFilter(item.key)}
                className={`group flex min-h-[72px] items-center justify-between gap-3 border-b border-[var(--line)] px-4 text-left transition sm:border-b-0 sm:border-r last:sm:border-r-0 ${
                  active ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-2)]"
                }`}
              >
                <div>
                  <p className={`text-[11px] font-semibold ${active ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>{item.label}</p>
                  <p className="mt-1 text-[22px] font-semibold tracking-[-0.04em] text-[var(--ink)]">{item.value}</p>
                </div>
                <span className={`h-2.5 w-2.5 rounded-full transition ${
                  item.key === "IN_SERVICE"
                    ? "bg-blue-500"
                    : item.key === "CHECKOUT_PENDING"
                      ? "bg-amber-500"
                      : item.key === "WAITING"
                        ? "bg-violet-500"
                        : item.key === "EXPECTED"
                          ? "bg-slate-400"
                          : "bg-emerald-500"
                } ${active ? "scale-110" : "opacity-60 group-hover:opacity-100"}`} />
              </button>
            );
          })}
        </div>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,.75fr)]">
        <div className="space-y-4">
          <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_10px_30px_rgba(20,52,74,.045)] sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--muted-soft)]">Hızlı İşlem</p>
                <h2 className="mt-1 text-base font-semibold tracking-[-0.02em] text-[var(--ink)]">Müşteriyi akışa alın</h2>
                <p className="mt-1 text-xs text-[var(--muted)]">Randevusuz gelen müşteriyi birkaç saniyede operasyona dahil edin.</p>
              </div>
              <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-[minmax(240px,1fr)_auto] lg:max-w-[620px]">
                <Select
                  value={walkInCustomerId}
                  onChange={(event) => {
                    setWalkInCustomerId(event.target.value);
                    setWalkInRequestKey(null);
                  }}
                  className="min-h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm text-[var(--ink)] outline-none focus:ring-4 focus:ring-[var(--accent-soft)]"
                >
                  <option value="">Müşteri seçin</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>{customerMap.get(customer.id)}</option>
                  ))}
                </Select>
                <Button
                  disabled={!walkInCustomerId || updatingId === `walk-in:${walkInCustomerId}` || !canUpdate}
                  onClick={() => void checkInWalkIn()}
                >
                  {updatingId === `walk-in:${walkInCustomerId}` ? "Ekleniyor..." : "Akışa Al"}
                </Button>
              </div>
            </div>
          </section>

          {flowFilter === "ALL" || flowFilter === "EXPECTED" ? (
            <section className="overflow-hidden rounded-[24px] border border-[var(--line)] bg-[var(--surface)] shadow-[0_10px_30px_rgba(20,52,74,.045)]">
              <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-[var(--ink)]">Sıradaki Müşteriler</h2>
                    <CardInfo help={getCardHelp("Bugün Beklenen Müşteriler")} />
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--muted)]">{expectedAppointments.length} randevu giriş bekliyor</p>
                </div>
                <Link href="/appointments" className="text-[11px] font-semibold text-[var(--accent)] hover:underline">
                  Tüm randevular
                </Link>
              </div>

              {expectedAppointments.length ? (
                <div className="grid gap-2 p-3 sm:p-4">
                  {expectedAppointments.slice(0, 6).map((appointment, index) => (
                    <article
                      key={appointment.id}
                      className="group grid gap-3 rounded-[18px] border border-transparent bg-[var(--surface-2)] px-4 py-3 transition hover:border-[var(--line)] hover:bg-[var(--surface)] hover:shadow-sm md:grid-cols-[74px_minmax(0,1fr)_auto] md:items-center"
                    >
                      <div>
                        <p className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--ink)]">{timeLabel(appointment.startAt)}</p>
                        <p className="mt-0.5 text-[10px] text-[var(--muted-soft)]">#{String(index + 1).padStart(2, "0")}</p>
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-[var(--ink)]">{customerMap.get(appointment.customerId) ?? "Müşteri"}</p>
                          <span className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-2 py-0.5 text-[9px] font-semibold text-[var(--muted)]">
                            {appointment.status === "CONFIRMED" ? "Onaylı" : "Planlı"}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-[var(--muted)]">Randevu · Giriş bekleniyor</p>
                      </div>
                      {canUpdate ? (
                        <Button disabled={updatingId === appointment.id} onClick={() => void checkInAppointment(appointment)}>
                          {updatingId === appointment.id ? "İşleniyor..." : "Giriş Yap"}
                        </Button>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="px-6 py-10 text-center">
                  <p className="text-sm font-semibold text-[var(--ink)]">Bekleyen randevu yok</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">Bugünkü planlı müşterilerin tamamı işleme alınmış görünüyor.</p>
                </div>
              )}
            </section>
          ) : null}

          <section className="overflow-hidden rounded-[24px] border border-[var(--line)] bg-[var(--surface)] shadow-[0_10px_30px_rgba(20,52,74,.045)]">
            <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-[var(--ink)]">Canlı Operasyon</h2>
                  <CardInfo help={getCardHelp("Aktif Ziyaretler")} />
                </div>
                <p className="mt-1 text-[11px] text-[var(--muted)]">
                  {flowFilter === "ALL" || flowFilter === "EXPECTED" ? activeVisits.length : visibleVisits.length} müşteri aktif akışta
                </p>
              </div>
              <div className="hidden items-center gap-2 sm:flex">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-[10px] font-medium text-[var(--muted)]">Gerçek zamanlı güncelleniyor</span>
              </div>
            </div>

            {visibleVisits.length ? (
              <div className="grid gap-3 p-3 sm:p-4">
                {visibleVisits.map((visit) => {
                  const action = NEXT_ACTION[visit.status];
                  const readiness = readinessByVisit[visit.id];
                  const detail = visitDetails[visit.id];
                  const expanded = expandedVisitId === visit.id;
                  const progress = flowProgress(visit.status);
                  return (
                    <article
                      key={visit.id}
                      className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)] shadow-[0_8px_24px_rgba(20,52,74,.04)] transition hover:shadow-[0_12px_32px_rgba(20,52,74,.08)]"
                    >
                      <div className="p-4 sm:p-5">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="truncate text-[15px] font-semibold tracking-[-0.02em] text-[var(--ink)]">
                                {customerMap.get(visit.customerId) ?? visit.customerName ?? "Müşteri"}
                              </h3>
                              <span className={`inline-flex rounded-full px-2.5 py-1 text-[9px] font-semibold ${
                                visit.status === "IN_SERVICE"
                                  ? "bg-blue-50 text-blue-700"
                                  : visit.status === "CHECKOUT_PENDING"
                                    ? "bg-amber-50 text-amber-700"
                                    : visit.status === "WAITING" || visit.status === "CHECKED_IN"
                                      ? "bg-violet-50 text-violet-700"
                                      : "bg-[var(--surface-2)] text-[var(--muted)]"
                              }`}>
                                {STATUS_LABELS[visit.status]}
                              </span>
                              <span className="text-[10px] text-[var(--muted-soft)]">
                                {visit.source === "WALK_IN" ? "Randevusuz" : "Randevulu"} · {elapsed(visitAgeStart(visit))}
                              </span>
                            </div>

                            <div className="mt-4 grid grid-cols-5 gap-1.5">
                              {flowSteps.map((step, index) => {
                                const done = progress >= index;
                                const current = visit.status === step.key;
                                return (
                                  <div key={step.key} className="min-w-0">
                                    <div className={`h-1.5 rounded-full transition ${
                                      done ? (current ? "bg-[var(--accent)]" : "bg-[var(--accent)]/55") : "bg-[var(--surface-2)]"
                                    }`} />
                                    <p className={`mt-1.5 truncate text-[9px] font-medium ${
                                      current ? "text-[var(--accent)]" : done ? "text-[var(--ink)]" : "text-[var(--muted-soft)]"
                                    }`}>{step.label}</p>
                                  </div>
                                );
                              })}
                            </div>

                            {visit.status === "CHECKOUT_PENDING" && readiness ? (
                              <div className={`mt-4 rounded-[13px] border px-3 py-2.5 text-[11px] ${
                                readiness.canCheckout
                                  ? "border-emerald-200 bg-emerald-50/70 text-emerald-800"
                                  : "border-rose-200 bg-rose-50/70 text-rose-800"
                              }`}>
                                {readiness.canCheckout
                                  ? readiness.warnings.length
                                    ? `Çıkışa hazır · ${readiness.warnings.map(checkoutIssueLabel).join(" · ")}`
                                    : "Çıkışa hazır"
                                  : readiness.blockers.map(checkoutIssueLabel).join(" · ")}
                              </div>
                            ) : null}
                          </div>

                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                            <Button variant="secondary" onClick={() => void toggleVisitDetail(visit)}>
                              {expanded ? "Geçmişi Kapat" : "Geçmiş"}
                            </Button>
                            {visit.status === "IN_SERVICE" ? (
                              <Link
                                href="/operations/service-executions"
                                className="inline-flex min-h-10 items-center justify-center rounded-[12px] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                              >
                                İcrayı Aç
                              </Link>
                            ) : null}
                            {action && canUpdate ? (
                              <Button
                                disabled={updatingId === visit.id || (action.status === "CHECKED_OUT" && readiness ? !readiness.canCheckout : false)}
                                onClick={() => void advance(visit)}
                              >
                                {updatingId === visit.id ? "Güncelleniyor..." : action.label}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {expanded ? (
                        <div className="border-t border-[var(--line)] bg-[var(--surface-2)] px-4 py-4 sm:px-5">
                          {detailLoadingId === visit.id ? (
                            <p className="text-xs text-[var(--muted)]">Operasyon geçmişi yükleniyor...</p>
                          ) : detail ? (
                            <div className="relative space-y-3 pl-5 before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-px before:bg-[var(--line)]">
                              {detail.timeline.length ? detail.timeline.map((event) => (
                                <div key={event.id} className="relative">
                                  <span className="absolute -left-5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface-2)] bg-[var(--accent)]" />
                                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                                    <div>
                                      <p className="text-[11px] font-semibold text-[var(--ink)]">
                                        {event.toStatus ? STATUS_LABELS[event.toStatus] : event.eventType}
                                      </p>
                                      <p className="mt-0.5 text-[10px] leading-4 text-[var(--muted)]">
                                        {event.fromStatus ? `${STATUS_LABELS[event.fromStatus]} → ` : ""}
                                        {event.toStatus ? STATUS_LABELS[event.toStatus] : event.eventType}
                                        {event.note ? ` · ${event.note}` : ""}
                                      </p>
                                    </div>
                                    <span className="text-[10px] text-[var(--muted-soft)]">{dateTimeLabel(event.createdAt)}</span>
                                  </div>
                                </div>
                              )) : (
                                <p className="text-xs text-[var(--muted)]">Operasyon geçmişi bulunmuyor.</p>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-[var(--muted)]">Ziyaret detayı bulunamadı.</p>
                          )}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="px-6 py-14 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-2)] text-lg text-[var(--muted)]">✓</div>
                <p className="mt-3 text-sm font-semibold text-[var(--ink)]">Bu aşamada aktif müşteri yok</p>
                <p className="mt-1 text-xs text-[var(--muted)]">Akış değiştiğinde ekran gerçek zamanlı güncellenecek.</p>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <section className="overflow-hidden rounded-[24px] border border-[var(--line)] bg-[var(--surface)] shadow-[0_10px_30px_rgba(20,52,74,.045)]">
            <div className="border-b border-[var(--line)] px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-soft)]">VALOO Assist</p>
                  <h2 className="mt-1 text-sm font-semibold text-[var(--ink)]">Dikkat gerekiyor</h2>
                </div>
                <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--accent)]">{smartActions.length}</span>
              </div>
            </div>

            {smartActions.length ? (
              <div className="divide-y divide-[var(--line)]">
                {smartActions.map((item) => (
                  <article key={item.id} className="px-5 py-4">
                    <div className="flex items-start gap-3">
                      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                        item.severity === "CRITICAL"
                          ? "bg-rose-500"
                          : item.severity === "HIGH"
                            ? "bg-orange-500"
                            : item.severity === "WARNING"
                              ? "bg-amber-400"
                              : "bg-blue-400"
                      }`} />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[var(--ink)]">{item.title}</p>
                        <p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">{item.explanation}</p>
                        <div className="mt-2 rounded-[11px] bg-[var(--surface-2)] px-3 py-2 text-[10px] leading-4 text-[var(--ink)]">
                          <span className="font-semibold">Öneri:</span> {item.suggestedAction}
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="px-5 py-8 text-center">
                <p className="text-xs font-semibold text-[var(--ink)]">Operasyon sakin görünüyor</p>
                <p className="mt-1 text-[11px] text-[var(--muted)]">Öncelikli müdahale gerektiren bir konu yok.</p>
              </div>
            )}
          </section>

          <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_10px_30px_rgba(20,52,74,.045)]">
            <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-soft)]">Hızlı Geçişler</p>
            <div className="mt-3 grid gap-2">
              {[
                ["/operations/service-executions", "Hizmet İcraları", "Aktif hizmetleri yönetin"],
                ["/operations/sales", "Satış & Tahsilat", "Ödeme ve finans akışına geçin"],
                ["/operations/waitlist", "Bekleme Listesi", "Boşlukları hızlı doldurun"],
                ["/operations/rebooking", "Yeniden Randevu", "Devamlılık fırsatlarını yönetin"],
                ["/operations/resources", "Kaynaklar", "Oda ve cihazları kontrol edin"],
              ].map(([href, title, description]) => (
                <Link
                  key={href}
                  href={href}
                  className="group rounded-[15px] border border-transparent bg-[var(--surface-2)] px-3.5 py-3 transition hover:border-[var(--line)] hover:bg-[var(--surface)] hover:shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold text-[var(--ink)] group-hover:text-[var(--accent)]">{title}</p>
                      <p className="mt-0.5 text-[10px] text-[var(--muted)]">{description}</p>
                    </div>
                    <span className="text-[14px] text-[var(--muted-soft)] transition group-hover:translate-x-0.5 group-hover:text-[var(--accent)]">→</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-[24px] border border-[var(--line)] bg-[linear-gradient(160deg,var(--surface)_0%,var(--accent-soft)_180%)] p-5 shadow-[0_10px_30px_rgba(20,52,74,.045)]">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-semibold text-[var(--ink)]">Bağlı operasyon zinciri</h2>
              <CardInfo help={getCardHelp("Bağlı Operasyon Akışı", "Müşteri, randevu, ziyaret, hizmet, tahsilat ve yeniden randevu aynı canlı süreçte birbirine bağlıdır.")} />
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {["Müşteri", "Randevu", "Ziyaret", "Hizmet", "Tahsilat", "CRM", "Yeniden Randevu"].map((item, index, arr) => (
                <div key={item} className="flex items-center gap-1.5">
                  <span className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 text-[9px] font-semibold text-[var(--ink)]">{item}</span>
                  {index < arr.length - 1 ? <span className="text-[10px] text-[var(--muted-soft)]">→</span> : null}
                </div>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}
