"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { Modal } from "@/components/modal";
import {
  Alert,
  Button,
  EmptyState,
  Field,
  GlassCard,
  PageHeader,
  Select,
  Spinner,
  TextArea,
  TextInput,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, ApiError } from "@/lib/api";
import { hasActiveBranch, hasPermission } from "@/lib/auth";
import {
  followUpChannelLabels,
  opportunityStageLabels,
  type CrmAssignee,
  type CrmEvent,
  type CrmFollowUp,
  type OpportunityStage,
} from "@/lib/crm-types";

type OpportunityDetail = {
  id: string;
  leadId: string | null;
  customerId: string | null;
  ownerUserId: string | null;
  title: string;
  stage: OpportunityStage;
  estimatedValue: string | number | null;
  currency: string;
  probability: number;
  expectedCloseDate: string | null;
  lostReason: string | null;
  saleId: string | null;
  commercialSnapshot: Record<string, unknown> | null;
  convertedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  leadFirstName: string | null;
  leadLastName: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  followUps: CrmFollowUp[];
  events: CrmEvent[];
};

type FollowUpChannel = CrmFollowUp["channel"];

type FollowUpForm = {
  assignedUserId: string;
  channel: FollowUpChannel;
  dueAt: string;
  note: string;
};

const emptyFollowUp: FollowUpForm = {
  assignedUserId: "",
  channel: "CALL",
  dueAt: "",
  note: "",
};

const nextStages: Record<OpportunityStage, OpportunityStage[]> = {
  QUALIFIED: ["NEEDS_ANALYSIS", "LOST"],
  NEEDS_ANALYSIS: ["PROPOSAL", "LOST"],
  PROPOSAL: ["NEGOTIATION", "WON", "LOST"],
  NEGOTIATION: ["PROPOSAL", "WON", "LOST"],
  WON: [],
  LOST: [],
};

function formatMoney(value: string | number | null, currency: string) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function eventLabel(eventType: string) {
  const labels: Record<string, string> = {
    OPPORTUNITY_CREATED: "Satış Fırsatı Oluşturuldu",
    OPPORTUNITY_STAGE_CHANGED: "Satış Aşaması Değişti",
    LEAD_QUALIFIED: "Potansiyel Müşteri Nitelendirildi",
    FOLLOW_UP_CREATED: "Takip Oluşturuldu",
    FOLLOW_UP_COMPLETED: "Takip Tamamlandı",
    FOLLOW_UP_RESCHEDULED: "Takip Yeniden Planlandı",
    FOLLOW_UP_CANCELLED: "Takip İptal Edildi",
    OPPORTUNITY_SALE_LINKED: "Satış Taslağı Bağlandı",
  };
  return labels[eventType] ?? eventType.replaceAll("_", " ");
}

function metadataSummary(metadata: Record<string, unknown> | null) {
  if (!metadata) return null;
  return Object.entries(metadata)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" · ");
}

function nextLocalHour() {
  const date = new Date();
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + 1);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function dateInputValue(value: string | null) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

export default function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const canManage = hasPermission("crm", "manage");
  const { showToast } = useToast();
  const [opportunity, setOpportunity] = useState<OpportunityDetail | null>(null);
  const [assignees, setAssignees] = useState<CrmAssignee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [transitionOpen, setTransitionOpen] = useState(false);
  const [transitionSaving, setTransitionSaving] = useState(false);
  const [transitionError, setTransitionError] = useState("");
  const [targetStage, setTargetStage] = useState<OpportunityStage | "">("");
  const [probability, setProbability] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [lostReason, setLostReason] = useState("");

  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpSaving, setFollowUpSaving] = useState(false);
  const [followUpError, setFollowUpError] = useState("");
  const [followUpForm, setFollowUpForm] = useState<FollowUpForm>(emptyFollowUp);

  async function refreshOpportunity(id: string) {
    const result = await api<OpportunityDetail>(`/crm/opportunities/${id}`);
    setOpportunity(result);
    return result;
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const { id } = await params;
        const [result, assigneeRows] = await Promise.all([
          api<OpportunityDetail>(`/crm/opportunities/${id}`),
          canManage
            ? api<CrmAssignee[]>("/crm/assignees")
            : Promise.resolve([] as CrmAssignee[]),
        ]);
        if (!cancelled) {
          setOpportunity(result);
          setAssignees(assigneeRows);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof ApiError
              ? requestError.message
              : "Satış fırsatı yüklenemedi.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [canManage, params]);

  const subject = useMemo(() => {
    if (!opportunity) return null;
    const leadName = [opportunity.leadFirstName, opportunity.leadLastName]
      .filter(Boolean)
      .join(" ");
    const customerName = [
      opportunity.customerFirstName,
      opportunity.customerLastName,
    ]
      .filter(Boolean)
      .join(" ");

    if (opportunity.leadId) {
      return {
        label: leadName || "Potansiyel müşteri",
        href: `/crm/leads/${opportunity.leadId}`,
        kind: "Potansiyel Müşteri",
      };
    }
    if (opportunity.customerId) {
      return {
        label: customerName || "Müşteri",
        href: `/customers/${opportunity.customerId}`,
        kind: "Müşteri",
      };
    }
    return null;
  }, [opportunity]);

  function openTransition() {
    if (!opportunity || !canManage || !nextStages[opportunity.stage].length) return;
    if (!hasActiveBranch()) {
      showToast("Satış fırsatını güncellemek için aktif bir şube seçin.", "error");
      return;
    }
    const firstStage = nextStages[opportunity.stage][0];
    setTargetStage(firstStage);
    setProbability(
      firstStage === "WON"
        ? "100"
        : firstStage === "LOST"
          ? "0"
          : String(opportunity.probability),
    );
    setEstimatedValue(
      opportunity.estimatedValue == null ? "" : String(opportunity.estimatedValue),
    );
    setExpectedCloseDate(dateInputValue(opportunity.expectedCloseDate));
    setLostReason("");
    setTransitionError("");
    setTransitionOpen(true);
  }

  function closeTransition() {
    if (transitionSaving) return;
    setTransitionOpen(false);
    setTransitionError("");
  }

  async function transitionOpportunity(event: FormEvent) {
    event.preventDefault();
    if (!opportunity || !targetStage) return;
    if (targetStage === "LOST" && !lostReason.trim()) {
      setTransitionError("Kaybedilen fırsat için neden gereklidir.");
      return;
    }
    const parsedProbability = Number(probability);
    if (!Number.isFinite(parsedProbability) || parsedProbability < 0 || parsedProbability > 100) {
      setTransitionError("Kazanma olasılığı 0 ile 100 arasında olmalıdır.");
      return;
    }
    const parsedValue = estimatedValue.trim() === "" ? null : Number(estimatedValue);
    if (parsedValue !== null && (!Number.isFinite(parsedValue) || parsedValue < 0)) {
      setTransitionError("Tahmini değer sıfır veya pozitif olmalıdır.");
      return;
    }

    setTransitionSaving(true);
    setTransitionError("");
    try {
      await api(`/crm/opportunities/${opportunity.id}/transition`, {
        method: "POST",
        body: {
          version: opportunity.version,
          stage: targetStage,
          probability: parsedProbability,
          estimatedValue: parsedValue,
          expectedCloseDate: expectedCloseDate
            ? new Date(`${expectedCloseDate}T12:00:00`).toISOString()
            : null,
          ...(targetStage === "LOST" ? { lostReason: lostReason.trim() } : {}),
        },
      });
      await refreshOpportunity(opportunity.id);
      setTransitionOpen(false);
      showToast("Satış fırsatı güncellendi.", "success");
    } catch (requestError) {
      setTransitionError(
        requestError instanceof ApiError
          ? requestError.message
          : "Satış fırsatı güncellenemedi.",
      );
    } finally {
      setTransitionSaving(false);
    }
  }

  function openFollowUp() {
    if (!opportunity || !canManage) return;
    setFollowUpError("");
    setFollowUpForm({
      assignedUserId: opportunity.ownerUserId ?? assignees[0]?.id ?? "",
      channel: "CALL",
      dueAt: nextLocalHour(),
      note: "",
    });
    setFollowUpOpen(true);
  }

  function closeFollowUp() {
    if (followUpSaving) return;
    setFollowUpOpen(false);
    setFollowUpError("");
  }

  async function createFollowUp(event: FormEvent) {
    event.preventDefault();
    if (!opportunity) return;
    if (!followUpForm.assignedUserId) {
      setFollowUpError("Takip sorumlusu seçilmelidir.");
      return;
    }
    if (!followUpForm.dueAt) {
      setFollowUpError("Takip tarihi seçilmelidir.");
      return;
    }

    setFollowUpSaving(true);
    setFollowUpError("");
    try {
      await api<CrmFollowUp>("/crm/follow-ups", {
        method: "POST",
        body: {
          opportunityId: opportunity.id,
          assignedUserId: followUpForm.assignedUserId,
          channel: followUpForm.channel,
          dueAt: new Date(followUpForm.dueAt).toISOString(),
          ...(followUpForm.note.trim() ? { note: followUpForm.note.trim() } : {}),
        },
      });
      await refreshOpportunity(opportunity.id);
      setFollowUpOpen(false);
      showToast("Satış fırsatı için takip oluşturuldu.", "success");
    } catch (requestError) {
      setFollowUpError(
        requestError instanceof ApiError
          ? requestError.message
          : "Takip oluşturulamadı.",
      );
    } finally {
      setFollowUpSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Satış Fırsatı" />
        <div className="mt-10">
          <Spinner label="Satış fırsatı hazırlanıyor..." />
        </div>
      </div>
    );
  }

  if (error || !opportunity) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader title="Satış Fırsatı" />
        <Alert>{error || "Satış fırsatı bulunamadı."}</Alert>
        <Link href="/crm/pipeline">
          <Button variant="secondary">Satış sürecine dön</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={opportunity.title}
        description="Satış fırsatının müşteri bağlantısını, ticari durumunu, takiplerini ve CRM geçmişini tek ekranda izleyin."
        action={
          <div className="flex flex-wrap gap-2">
            {canManage && nextStages[opportunity.stage].length ? (
              <Button variant="secondary" onClick={openTransition}>Fırsatı Güncelle</Button>
            ) : null}
            {canManage ? (
              <Button variant="secondary" onClick={openFollowUp}>+ Takip Oluştur</Button>
            ) : null}
            {subject ? (
              <Link href={subject.href}>
                <Button variant="secondary">{subject.label}</Button>
              </Link>
            ) : null}
            <Link href="/crm/pipeline">
              <Button>Satış Sürecine Dön</Button>
            </Link>
          </div>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <GlassCard>
          <p className="text-[10px] font-medium uppercase tracking-[.08em] text-[var(--muted-soft)]">Aşama</p>
          <strong className="mt-3 block text-[18px] font-semibold text-[var(--ink)]">
            {opportunityStageLabels[opportunity.stage]}
          </strong>
        </GlassCard>
        <GlassCard>
          <p className="text-[10px] font-medium uppercase tracking-[.08em] text-[var(--muted-soft)]">Tahmini Değer</p>
          <strong className="mt-3 block text-[18px] font-semibold text-[var(--ink)]">
            {formatMoney(opportunity.estimatedValue, opportunity.currency)}
          </strong>
        </GlassCard>
        <GlassCard>
          <p className="text-[10px] font-medium uppercase tracking-[.08em] text-[var(--muted-soft)]">Kazanma Olasılığı</p>
          <strong className="mt-3 block text-[18px] font-semibold text-[var(--ink)]">%{opportunity.probability}</strong>
        </GlassCard>
        <GlassCard>
          <p className="text-[10px] font-medium uppercase tracking-[.08em] text-[var(--muted-soft)]">Beklenen Kapanış</p>
          <strong className="mt-3 block text-[18px] font-semibold text-[var(--ink)]">
            {opportunity.expectedCloseDate ? formatDate(opportunity.expectedCloseDate) : "—"}
          </strong>
        </GlassCard>
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,.6fr)]">
        <GlassCard>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--accent)]">Ticari Bağlantı</p>
              <h2 className="mt-1 text-[18px] font-semibold text-[var(--ink)]">Fırsat Özeti</h2>
            </div>
            <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[10px] font-semibold text-[var(--accent)]">
              v{opportunity.version}
            </span>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Detail label="Kayıt Türü" value={subject?.kind || "Bağlantısız"} />
            <Detail label="Kayıt" value={subject?.label || "—"} />
            <Detail label="Oluşturulma" value={formatDateTime(opportunity.createdAt)} />
            <Detail label="Son Güncelleme" value={formatDateTime(opportunity.updatedAt)} />
            {opportunity.lostReason ? (
              <div className="sm:col-span-2">
                <Detail label="Kaybetme Nedeni" value={opportunity.lostReason} />
              </div>
            ) : null}
          </div>
        </GlassCard>

        <GlassCard>
          <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--accent)]">Satış Dönüşümü</p>
          <h2 className="mt-1 text-[18px] font-semibold text-[var(--ink)]">Satış Bağlantısı</h2>
          {opportunity.saleId ? (
            <div className="mt-5 space-y-3">
              <div className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)]/40 p-4">
                <p className="text-[10px] text-[var(--muted-soft)]">Satış ID</p>
                <p className="mt-1 break-all text-[12px] font-medium text-[var(--ink)]">{opportunity.saleId}</p>
              </div>
              <Detail
                label="Dönüşüm Tarihi"
                value={opportunity.convertedAt ? formatDateTime(opportunity.convertedAt) : "—"}
              />
            </div>
          ) : (
            <p className="mt-5 text-[12px] leading-5 text-[var(--muted)]">
              Bu fırsat henüz satış taslağına dönüştürülmemiş. Kazanılan fırsatlar Pipeline üzerinden satış taslağına bağlanabilir.
            </p>
          )}
        </GlassCard>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <GlassCard className="p-0">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
            <div>
              <h2 className="text-[15px] font-semibold text-[var(--ink)]">Takipler</h2>
              <p className="mt-1 text-[10px] text-[var(--muted)]">Bu fırsata bağlı müşteri temasları</p>
            </div>
            {canManage ? (
              <Button variant="ghost" className="min-h-8 px-3 py-1 text-[10px]" onClick={openFollowUp}>+ Yeni Takip</Button>
            ) : null}
          </div>
          {opportunity.followUps.length ? (
            <div className="divide-y divide-[var(--line)]">
              {opportunity.followUps.map((followUp) => (
                <div key={followUp.id} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[12px] font-semibold text-[var(--ink)]">
                      {followUpChannelLabels[followUp.channel]}
                    </p>
                    <span className="text-[10px] font-medium text-[var(--muted)]">{followUp.status}</span>
                  </div>
                  <p className="mt-1 text-[10px] text-[var(--muted)]">{formatDateTime(followUp.dueAt)}</p>
                  {followUp.note ? <p className="mt-2 text-[11px] leading-5 text-[var(--ink)]">{followUp.note}</p> : null}
                  {followUp.outcome ? <p className="mt-2 text-[10px] text-[var(--muted)]">Sonuç: {followUp.outcome}</p> : null}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Takip Bulunmuyor"
              description="Bu fırsata bağlı takip kaydı henüz yok."
              action={canManage ? <Button onClick={openFollowUp}>İlk Takibi Oluştur</Button> : undefined}
            />
          )}
        </GlassCard>

        <GlassCard className="p-0">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <h2 className="text-[15px] font-semibold text-[var(--ink)]">CRM Zaman Çizelgesi</h2>
            <p className="mt-1 text-[10px] text-[var(--muted)]">Fırsat üzerinde oluşan append-only olay geçmişi</p>
          </div>
          {opportunity.events.length ? (
            <div className="divide-y divide-[var(--line)]">
              {opportunity.events.map((event) => {
                const summary = metadataSummary(event.metadata);
                return (
                  <div key={event.id} className="px-5 py-4">
                    <div className="flex items-start gap-3">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-semibold text-[var(--ink)]">{eventLabel(event.eventType)}</p>
                        <p className="mt-1 text-[10px] text-[var(--muted)]">{formatDateTime(event.createdAt)}</p>
                        {summary ? <p className="mt-2 break-words text-[10px] leading-5 text-[var(--muted)]">{summary}</p> : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState title="CRM Olayı Bulunmuyor" description="Bu fırsat için henüz olay geçmişi oluşmamış." />
          )}
        </GlassCard>
      </section>

      <Modal
        open={transitionOpen}
        onClose={closeTransition}
        title="Satış Fırsatını Güncelle"
        description="Aşama geçişi ile birlikte ticari tahminleri güncelleyin."
      >
        <form onSubmit={transitionOpportunity} className="space-y-4">
          {transitionError ? <Alert>{transitionError}</Alert> : null}
          <Field label="Yeni Aşama" required>
            <Select
              value={targetStage}
              onChange={(event) => {
                const value = event.target.value as OpportunityStage;
                setTargetStage(value);
                if (value === "WON") setProbability("100");
                else if (value === "LOST") setProbability("0");
                else setProbability(String(opportunity.probability));
              }}
            >
              {nextStages[opportunity.stage].map((stage) => (
                <option key={stage} value={stage}>{opportunityStageLabels[stage]}</option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Kazanma Olasılığı (%)" required>
              <TextInput
                type="number"
                min="0"
                max="100"
                value={probability}
                disabled={["WON", "LOST"].includes(targetStage)}
                onChange={(event) => setProbability(event.target.value)}
              />
            </Field>
            <Field label={`Tahmini Değer (${opportunity.currency})`}>
              <TextInput
                type="number"
                min="0"
                step="0.01"
                value={estimatedValue}
                onChange={(event) => setEstimatedValue(event.target.value)}
              />
            </Field>
          </div>
          <Field label="Beklenen Kapanış Tarihi">
            <TextInput
              type="date"
              value={expectedCloseDate}
              onChange={(event) => setExpectedCloseDate(event.target.value)}
            />
          </Field>
          {targetStage === "LOST" ? (
            <Field label="Kaybetme Nedeni" required>
              <TextArea
                rows={4}
                maxLength={1000}
                value={lostReason}
                onChange={(event) => setLostReason(event.target.value)}
              />
            </Field>
          ) : null}
          <Alert tone="success">
            Güncelleme mevcut optimistic version kontrolünü kullanır; eşzamanlı değişiklik varsa işlem güvenli biçimde reddedilir.
          </Alert>
          <div className="flex justify-end gap-3 border-t border-[var(--line)] pt-4">
            <Button type="button" variant="secondary" onClick={closeTransition} disabled={transitionSaving}>Vazgeç</Button>
            <Button type="submit" disabled={transitionSaving}>{transitionSaving ? "Güncelleniyor..." : "Fırsatı Güncelle"}</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={followUpOpen}
        onClose={closeFollowUp}
        title="Satış Fırsatı Takibi Oluştur"
        description={opportunity.title}
      >
        <form onSubmit={createFollowUp} className="space-y-4">
          {followUpError ? <Alert>{followUpError}</Alert> : null}
          <Field label="Sorumlu" required>
            <Select
              value={followUpForm.assignedUserId}
              onChange={(event) => setFollowUpForm((current) => ({ ...current, assignedUserId: event.target.value }))}
            >
              <option value="">Sorumlu Seçin</option>
              {assignees.map((assignee) => (
                <option key={assignee.id} value={assignee.id}>
                  {assignee.firstName} {assignee.lastName} · {assignee.email}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Kanal" required>
              <Select
                value={followUpForm.channel}
                onChange={(event) => setFollowUpForm((current) => ({ ...current, channel: event.target.value as FollowUpChannel }))}
              >
                {Object.entries(followUpChannelLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Takip Tarihi" required>
              <TextInput
                type="datetime-local"
                value={followUpForm.dueAt}
                onChange={(event) => setFollowUpForm((current) => ({ ...current, dueAt: event.target.value }))}
              />
            </Field>
          </div>
          <Field label="Not">
            <TextArea
              rows={4}
              maxLength={2000}
              value={followUpForm.note}
              onChange={(event) => setFollowUpForm((current) => ({ ...current, note: event.target.value }))}
              placeholder="Örn. Teklif detaylarını görüşmek için müşteriyi arayın."
            />
          </Field>
          <div className="flex justify-end gap-3 border-t border-[var(--line)] pt-4">
            <Button type="button" variant="secondary" onClick={closeFollowUp} disabled={followUpSaving}>Vazgeç</Button>
            <Button type="submit" disabled={followUpSaving}>{followUpSaving ? "Oluşturuluyor..." : "Takibi Oluştur"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-[.08em] text-[var(--muted-soft)]">{label}</p>
      <p className="mt-1.5 text-[12px] leading-5 text-[var(--ink)]">{value}</p>
    </div>
  );
}
