"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { DataView, DataViewMeta, FilterChip } from "@/components/data-view";
import { FinanceEmpty, FinanceMetric, FinancePanel } from "@/components/finance-view";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";

type QualityCaseStatus = "OPEN" | "INVESTIGATING" | "ACTION_REQUIRED" | "RESOLVED" | "CLOSED";
type QualitySeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

type QualityCase = {
  id: string;
  branchId: string;
  branchName?: string | null;
  feedbackId?: string | null;
  customerId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  category: string;
  severity: QualitySeverity;
  status: QualityCaseStatus;
  title: string;
  description?: string | null;
  assignedUserId?: string | null;
  slaDueAt?: string | null;
  createdAt: string;
};

type Feedback = {
  id: string;
  branchId: string;
  branchName?: string | null;
  customerId: string;
  firstName?: string | null;
  lastName?: string | null;
  serviceName?: string | null;
  classification: "UNCLASSIFIED" | "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "CRITICAL";
  overallRating?: number | null;
  comment?: string | null;
  submittedAt: string;
  qualityCaseId?: string | null;
  qualityCaseStatus?: QualityCaseStatus | null;
};

type SlaBreach = {
  id: string;
  branchId: string;
  status: QualityCaseStatus;
  severity: QualitySeverity;
  title: string;
  assignedUserId?: string | null;
  slaDueAt?: string | null;
  slaBreachedAt?: string | null;
  slaEscalationLevel: number;
};

type NotificationOutbox = {
  id: string;
  feedbackRequestId: string;
  customerId: string;
  branchId: string;
  status: "PENDING" | "CLAIMED" | "RETRY" | "SENT" | "DEAD" | "CANCELLED";
  attemptCount: number;
  nextAttemptAt?: string | null;
  sentAt?: string | null;
  channel?: string | null;
  providerKey?: string | null;
  lastErrorCode?: string | null;
  createdAt: string;
};

type Filter = "ALL" | "OPEN" | "INVESTIGATING" | "ACTION_REQUIRED" | "CRITICAL";

type ActionKey = "sla" | "enqueue" | "dispatch" | string;

const STATUS_LABELS: Record<QualityCaseStatus, string> = {
  OPEN: "Açık",
  INVESTIGATING: "İnceleniyor",
  ACTION_REQUIRED: "Aksiyon gerekli",
  RESOLVED: "Çözüldü",
  CLOSED: "Kapandı",
};

const SEVERITY_LABELS: Record<QualitySeverity, string> = {
  LOW: "Düşük",
  MEDIUM: "Orta",
  HIGH: "Yüksek",
  CRITICAL: "Kritik",
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function customerName(firstName?: string | null, lastName?: string | null) {
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  return name || "Müşteri";
}

function severityClass(severity: QualitySeverity) {
  if (severity === "CRITICAL") return "bg-[var(--danger-soft)] text-[var(--danger)]";
  if (severity === "HIGH") return "bg-[var(--warning-soft)] text-[var(--warning)]";
  if (severity === "MEDIUM") return "bg-[var(--accent-soft)] text-[var(--accent)]";
  return "bg-[var(--surface-2)] text-[var(--muted)]";
}

function statusClass(status: QualityCaseStatus) {
  if (status === "RESOLVED" || status === "CLOSED") return "bg-[var(--success-soft)] text-[var(--success)]";
  if (status === "ACTION_REQUIRED") return "bg-[var(--warning-soft)] text-[var(--warning)]";
  if (status === "INVESTIGATING") return "bg-[var(--accent-soft)] text-[var(--accent)]";
  return "bg-[var(--surface-2)] text-[var(--muted)]";
}

export default function QualityCockpitPage() {
  const [cases, setCases] = useState<QualityCase[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [breaches, setBreaches] = useState<SlaBreach[]>([]);
  const [outbox, setOutbox] = useState<NotificationOutbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [action, setAction] = useState<ActionKey | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [caseRows, feedbackRows, breachRows, outboxRows] = await Promise.all([
        api<QualityCase[]>(withQuery("/quality/cases", { limit: 100 })),
        api<Feedback[]>(withQuery("/quality/feedback", { limit: 100 })),
        api<SlaBreach[]>(withQuery("/quality/sla/breaches", { limit: 100 })),
        api<NotificationOutbox[]>(withQuery("/quality/notifications/outbox", { limit: 100 })),
      ]);
      setCases(caseRows ?? []);
      setFeedback(feedbackRows ?? []);
      setBreaches(breachRows ?? []);
      setOutbox(outboxRows ?? []);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Kalite verileri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCases = useMemo(() => cases.filter((item) => !["RESOLVED", "CLOSED"].includes(item.status)), [cases]);
  const criticalCases = useMemo(() => openCases.filter((item) => item.severity === "CRITICAL"), [openCases]);
  const negativeFeedback = useMemo(
    () => feedback.filter((item) => item.classification === "NEGATIVE" || item.classification === "CRITICAL"),
    [feedback],
  );
  const deliveryProblems = useMemo(() => outbox.filter((item) => item.status === "RETRY" || item.status === "DEAD"), [outbox]);
  const filteredCases = useMemo(() => {
    if (filter === "ALL") return openCases;
    if (filter === "CRITICAL") return openCases.filter((item) => item.severity === "CRITICAL");
    return openCases.filter((item) => item.status === filter);
  }, [filter, openCases]);

  const perform = useCallback(async (key: ActionKey, job: () => Promise<unknown>, message: string) => {
    setAction(key);
    setError("");
    setSuccess("");
    try {
      await job();
      setSuccess(message);
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "İşlem tamamlanamadı.");
    } finally {
      setAction(null);
    }
  }, [load]);

  const transition = useCallback((item: QualityCase, target: "INVESTIGATING" | "ACTION_REQUIRED") => {
    void perform(
      `case:${item.id}:${target}`,
      () => api(`/quality/cases/${item.id}/transition`, { method: "POST", body: { status: target, note: "Quality Cockpit üzerinden ilerletildi." } }),
      `Vaka ${STATUS_LABELS[target].toLocaleLowerCase("tr-TR")} durumuna alındı.`,
    );
  }, [perform]);

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 pb-10">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--muted-soft)]">Kalite Yönetimi & Müşteri Deneyimi</p>
          <h1 className="mt-1 text-[32px] font-semibold tracking-[-0.045em] text-[var(--ink)]">Quality Control Center</h1>
          <p className="mt-2 max-w-[780px] text-[13px] leading-6 text-[var(--muted)]">
            Açık kalite vakalarını, SLA ihlallerini, negatif müşteri geri bildirimlerini ve bildirim teslimat sorunlarını tek operasyon ekranından yönetin.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void load()} disabled={loading || action !== null}>Yenile</Button>
          <Button
            variant="secondary"
            disabled={action !== null}
            onClick={() => void perform("sla", () => api("/quality/sla/process", { method: "POST", body: { limit: 100 } }), "SLA taraması tamamlandı.")}
          >
            {action === "sla" ? "Taranıyor..." : "SLA Taraması"}
          </Button>
          <Button
            variant="secondary"
            disabled={action !== null}
            onClick={() => void perform("enqueue", () => api("/quality/notifications/enqueue-feedback?limit=100", { method: "POST" }), "Bekleyen geri bildirim istekleri kuyruğa alındı.")}
          >
            {action === "enqueue" ? "Kuyruğa alınıyor..." : "Feedback Kuyruğu"}
          </Button>
          <Button
            disabled={action !== null}
            onClick={() => void perform("dispatch", () => api("/quality/notifications/dispatch-feedback?limit=25", { method: "POST" }), "Feedback bildirim dağıtımı tamamlandı.")}
          >
            {action === "dispatch" ? "Gönderiliyor..." : "Bildirimleri Gönder"}
          </Button>
        </div>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
      {success ? <Alert tone="success" onClose={() => setSuccess("")}>{success}</Alert> : null}

      {loading ? (
        <div className="flex min-h-[320px] items-center justify-center rounded-[22px] border border-[var(--line)] bg-[var(--surface)]">
          <Spinner label="Kalite kontrol merkezi hazırlanıyor..." />
        </div>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <FinanceMetric label="Açık Vaka" value={openCases.length} detail={`${criticalCases.length} kritik vaka`} tone={criticalCases.length ? "danger" : "info"} />
            <FinanceMetric label="SLA İhlali" value={breaches.length} detail="Çözülmemiş ve SLA süresi aşılmış" tone={breaches.length ? "warning" : "success"} />
            <FinanceMetric label="Negatif Feedback" value={negativeFeedback.length} detail="Negatif + kritik geri bildirim" tone={negativeFeedback.length ? "danger" : "neutral"} />
            <FinanceMetric label="Teslimat Sorunu" value={deliveryProblems.length} detail="Retry + dead notification" tone={deliveryProblems.length ? "warning" : "success"} />
          </section>

          <FinancePanel
            title="Aktif Kalite Vakaları"
            description="Açık vakaları önem ve süreç durumuna göre takip edin. Bu ekran yalnız güvenli ara durum geçişlerini tetikler."
            actions={
              <div className="flex flex-wrap gap-2">
                <FilterChip active={filter === "ALL"} count={openCases.length} onClick={() => setFilter("ALL")}>Tümü</FilterChip>
                <FilterChip active={filter === "OPEN"} count={openCases.filter((item) => item.status === "OPEN").length} onClick={() => setFilter("OPEN")}>Açık</FilterChip>
                <FilterChip active={filter === "INVESTIGATING"} count={openCases.filter((item) => item.status === "INVESTIGATING").length} onClick={() => setFilter("INVESTIGATING")}>İnceleniyor</FilterChip>
                <FilterChip active={filter === "ACTION_REQUIRED"} count={openCases.filter((item) => item.status === "ACTION_REQUIRED").length} onClick={() => setFilter("ACTION_REQUIRED")}>Aksiyon</FilterChip>
                <FilterChip active={filter === "CRITICAL"} count={criticalCases.length} onClick={() => setFilter("CRITICAL")}>Kritik</FilterChip>
              </div>
            }
          >
            <DataView>
              <div className="divide-y divide-[var(--line)]">
                {filteredCases.map((item) => {
                  const busy = action?.startsWith(`case:${item.id}:`) ?? false;
                  return (
                    <article key={item.id} className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_160px_160px_auto] lg:items-center sm:px-5">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${severityClass(item.severity)}`}>{SEVERITY_LABELS[item.severity]}</span>
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusClass(item.status)}`}>{STATUS_LABELS[item.status]}</span>
                          <span className="text-[10px] text-[var(--muted-soft)]">{item.branchName ?? item.branchId}</span>
                        </div>
                        <h3 className="mt-2 truncate text-[13px] font-semibold text-[var(--ink)]">{item.title}</h3>
                        <p className="mt-1 line-clamp-2 text-[10px] leading-5 text-[var(--muted)]">{item.description || item.category}</p>
                        <p className="mt-1 text-[10px] text-[var(--muted-soft)]">{customerName(item.firstName, item.lastName)} · Açılış {formatDate(item.createdAt)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-soft)]">SLA</p>
                        <p className="mt-1 text-[11px] font-medium text-[var(--ink)]">{formatDate(item.slaDueAt)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-soft)]">Sorumlu</p>
                        <p className="mt-1 truncate text-[11px] font-medium text-[var(--ink)]">{item.assignedUserId ?? "Atanmamış"}</p>
                      </div>
                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        {item.status === "OPEN" ? (
                          <Button className="min-h-9 px-3 py-2 text-[11px]" variant="secondary" disabled={busy || action !== null} onClick={() => transition(item, "INVESTIGATING")}>{busy ? "İşleniyor..." : "İncelemeye Al"}</Button>
                        ) : null}
                        {item.status === "INVESTIGATING" ? (
                          <Button className="min-h-9 px-3 py-2 text-[11px]" variant="secondary" disabled={busy || action !== null} onClick={() => transition(item, "ACTION_REQUIRED")}>{busy ? "İşleniyor..." : "Aksiyon Gerekli"}</Button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
              {!filteredCases.length ? <div className="p-5"><FinanceEmpty title="Bu filtrede aktif kalite vakası yok." description="Yeni vakalar veya mevcut vakaların durum değişiklikleri burada görünür." /></div> : null}
              <DataViewMeta>
                <span>{filteredCases.length} görünür vaka</span>
                <span>{criticalCases.length} kritik</span>
                <span>{breaches.length} SLA ihlali</span>
              </DataViewMeta>
            </DataView>
          </FinancePanel>

          <div className="grid gap-6 xl:grid-cols-2">
            <FinancePanel title="SLA İhlalleri" description="Çözülmemiş vakalarda SLA süresi aşılmış kayıtlar.">
              <div className="space-y-2">
                {breaches.slice(0, 8).map((item) => (
                  <div key={item.id} className="flex items-start justify-between gap-4 rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)]/30 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-semibold text-[var(--ink)]">{item.title}</p>
                      <p className="mt-1 text-[10px] text-[var(--muted)]">{SEVERITY_LABELS[item.severity]} · {STATUS_LABELS[item.status]} · Seviye {item.slaEscalationLevel}</p>
                    </div>
                    <div className="shrink-0 text-right text-[10px] text-[var(--danger)]">{formatDate(item.slaBreachedAt)}</div>
                  </div>
                ))}
                {!breaches.length ? <FinanceEmpty title="Aktif SLA ihlali yok." description="SLA taraması yeni geciken vakaları işaretlediğinde burada görünür." /> : null}
              </div>
            </FinancePanel>

            <FinancePanel title="Negatif Müşteri Geri Bildirimleri" description="Negatif veya kritik sınıflandırılmış son geri bildirimler.">
              <div className="space-y-2">
                {negativeFeedback.slice(0, 8).map((item) => (
                  <div key={item.id} className="rounded-[14px] border border-[var(--line)] px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-[11px] font-semibold text-[var(--ink)]">{customerName(item.firstName, item.lastName)}</p>
                      <span className="shrink-0 rounded-full bg-[var(--danger-soft)] px-2.5 py-1 text-[9px] font-semibold text-[var(--danger)]">{item.overallRating ?? "—"}/5</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[10px] leading-5 text-[var(--muted)]">{item.comment || "Yorum girilmemiş."}</p>
                    <div className="mt-2 flex flex-wrap justify-between gap-2 text-[9px] text-[var(--muted-soft)]">
                      <span>{item.serviceName ?? item.branchName ?? item.branchId}</span>
                      <span>{item.qualityCaseId ? `Vaka: ${item.qualityCaseStatus ?? "OPEN"}` : "Henüz vaka yok"}</span>
                    </div>
                  </div>
                ))}
                {!negativeFeedback.length ? <FinanceEmpty title="Negatif geri bildirim yok." description="Müşteri portalı ve manuel kalite feedback kayıtları burada izlenir." /> : null}
              </div>
            </FinancePanel>
          </div>

          <FinancePanel title="Notification Delivery Health" description="Feedback bildirim kuyruğunda retry veya permanent failure durumuna düşen teslimatlar.">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {deliveryProblems.slice(0, 9).map((item) => (
                <div key={item.id} className="rounded-[14px] border border-[var(--line)] px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className={`rounded-full px-2.5 py-1 text-[9px] font-semibold ${item.status === "DEAD" ? "bg-[var(--danger-soft)] text-[var(--danger)]" : "bg-[var(--warning-soft)] text-[var(--warning)]"}`}>{item.status}</span>
                    <span className="text-[9px] text-[var(--muted-soft)]">Deneme {item.attemptCount}</span>
                  </div>
                  <p className="mt-3 truncate text-[11px] font-semibold text-[var(--ink)]">{item.lastErrorCode ?? "Delivery retry pending"}</p>
                  <p className="mt-1 text-[9px] text-[var(--muted)]">{item.providerKey ?? "Provider bilinmiyor"} · {item.channel ?? "Kanal bilinmiyor"}</p>
                  <p className="mt-2 text-[9px] text-[var(--muted-soft)]">Sonraki deneme: {formatDate(item.nextAttemptAt)}</p>
                </div>
              ))}
            </div>
            {!deliveryProblems.length ? <FinanceEmpty title="Bildirim teslimat sorunu yok." description="Retry veya DEAD kayıt oluştuğunda operasyon ekibi buradan görebilir." /> : null}
          </FinancePanel>
        </>
      )}
    </div>
  );
}
