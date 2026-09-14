"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Modal } from "@/components/modal";
import { Alert, Button, EmptyState, Field, PageHeader, Spinner, TextArea, TextInput } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, ApiError } from "@/lib/api";
import { hasActiveBranch, hasPermission } from "@/lib/auth";
import { followUpChannelLabels, opportunityStageLabels, type CrmFollowUp, type OpportunityStage } from "@/lib/crm-types";

type View = "overdue" | "today" | "stale";
type FollowUpAction = "complete" | "reschedule" | "cancel";

type ActionFollowUp = Pick<
  CrmFollowUp,
  "id" | "leadId" | "opportunityId" | "assignedUserId" | "channel" | "dueAt" | "note" | "version"
> & { subjectLabel: string };

type ActionOpportunity = {
  id: string;
  leadId: string | null;
  customerId: string | null;
  ownerUserId: string | null;
  title: string;
  stage: OpportunityStage;
  estimatedValue: string | number | null;
  currency: string;
  probability: number;
  updatedAt: string;
  subjectLabel: string;
};

function localDayWindow() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { dayStart: start.toISOString(), dayEnd: end.toISOString() };
}

function staleBefore() {
  const value = new Date();
  value.setDate(value.getDate() - 14);
  return value.toISOString();
}

function toLocalInput(value: string) {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
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

function formatMoney(value: string | number | null, currency: string) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

export default function CrmActionCenterPage() {
  const searchParams = useSearchParams();
  const canManage = hasPermission("crm", "manage");
  const { showToast } = useToast();
  const requestedView = searchParams.get("view");
  const view: View = requestedView === "today" || requestedView === "stale" ? requestedView : "overdue";
  const ownerUserId = searchParams.get("ownerUserId") ?? "";
  const [followUps, setFollowUps] = useState<ActionFollowUp[]>([]);
  const [opportunities, setOpportunities] = useState<ActionOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<ActionFollowUp | null>(null);
  const [action, setAction] = useState<FollowUpAction | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [outcome, setOutcome] = useState("");
  const [rescheduledAt, setRescheduledAt] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (view === "stale") {
        const params = new URLSearchParams({ staleBefore: staleBefore(), limit: "200" });
        if (ownerUserId) params.set("ownerUserId", ownerUserId);
        const rows = await api<ActionOpportunity[]>(`/crm/operations/stale-opportunities?${params}`);
        setOpportunities(rows);
        setFollowUps([]);
      } else {
        const { dayStart, dayEnd } = localDayWindow();
        const params = new URLSearchParams({
          mode: view === "today" ? "TODAY" : "OVERDUE",
          dayStart,
          dayEnd,
          limit: "200",
        });
        if (ownerUserId) params.set("assignedUserId", ownerUserId);
        const rows = await api<ActionFollowUp[]>(`/crm/operations/follow-ups?${params}`);
        setFollowUps(rows);
        setOpportunities([]);
      }
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "CRM aksiyon kuyruğu yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [ownerUserId, view]);

  useEffect(() => { void load(); }, [load]);

  const title = view === "today" ? "Bugünkü Takipler" : view === "stale" ? "Durağan Satış Fırsatları" : "Geciken Takipler";
  const description = useMemo(() => {
    if (view === "today") return "Yerel gün penceresinde tamamlanması gereken açık müşteri temasları.";
    if (view === "stale") return "14+ gündür güncellenmeyen açık fırsatlar; yeniden temas veya aşama güncellemesi bekliyor.";
    return "Planlanan zamanı geçen ve halen açık olan müşteri takipleri.";
  }, [view]);

  function openAction(row: ActionFollowUp, nextAction: FollowUpAction) {
    if (!canManage) return;
    if (!hasActiveBranch()) {
      showToast("Takibi güncellemek için aktif bir şube seçin.", "error");
      return;
    }
    setSelected(row);
    setAction(nextAction);
    setOutcome("");
    setCancelReason("");
    setRescheduledAt(toLocalInput(row.dueAt));
    setActionError("");
  }

  async function submitAction(event: FormEvent) {
    event.preventDefault();
    if (!selected || !action) return;
    const body: Record<string, unknown> = { version: selected.version };
    if (action === "complete") {
      if (!outcome.trim()) return setActionError("Takip sonucu gereklidir.");
      body.outcome = outcome.trim();
    }
    if (action === "reschedule") {
      if (!rescheduledAt) return setActionError("Yeni takip tarihi gereklidir.");
      body.dueAt = new Date(rescheduledAt).toISOString();
    }
    if (action === "cancel") {
      if (!cancelReason.trim()) return setActionError("İptal nedeni gereklidir.");
      body.reason = cancelReason.trim();
    }

    setSaving(true);
    setActionError("");
    try {
      await api(`/crm/follow-ups/${selected.id}/${action}`, { method: "POST", body });
      setSelected(null);
      setAction(null);
      showToast(action === "complete" ? "Takip tamamlandı." : action === "reschedule" ? "Takip yeniden planlandı." : "Takip iptal edildi.", "success");
      await load();
    } catch (requestError) {
      setActionError(requestError instanceof ApiError ? requestError.message : "Takip güncellenemedi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={title}
        description={description}
        action={<div className="flex flex-wrap gap-2"><Link href="/crm"><Button variant="secondary">CRM&apos;e Dön</Button></Link>{view === "stale" ? <Link href="/crm/pipeline"><Button>Pipeline&apos;ı Aç</Button></Link> : <Link href="/crm/follow-ups"><Button>Takip Merkezini Aç</Button></Link>}</div>}
      />

      <div className="flex flex-wrap gap-2">
        <Link href="/crm/actions?view=overdue"><Button variant={view === "overdue" ? "primary" : "secondary"}>Geciken</Button></Link>
        <Link href="/crm/actions?view=today"><Button variant={view === "today" ? "primary" : "secondary"}>Bugün</Button></Link>
        <Link href="/crm/actions?view=stale"><Button variant={view === "stale" ? "primary" : "secondary"}>Durağan Fırsatlar</Button></Link>
      </div>

      {ownerUserId ? <Alert tone="success">Bu görünüm seçilen ekip üyesine göre filtrelendi.</Alert> : null}
      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      {loading ? <Spinner label="CRM aksiyonları hazırlanıyor..." /> : view === "stale" ? (
        opportunities.length ? (
          <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
            <div className="divide-y divide-[var(--line)]">
              {opportunities.map((row) => (
                <article key={row.id} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(220px,1.4fr)_150px_130px_150px_auto] md:items-center">
                  <div className="min-w-0"><Link href={`/crm/opportunities/${row.id}`} className="truncate text-[13px] font-semibold hover:text-[#1674BD]">{row.title}</Link><p className="mt-1 truncate text-[10px] text-[var(--muted)]">{row.subjectLabel}</p></div>
                  <span className="w-fit rounded-full bg-[#EAF5FB] px-2.5 py-1 text-[10px] font-semibold text-[#1674BD]">{opportunityStageLabels[row.stage]}</span>
                  <div><p className="text-[9px] text-[var(--muted-soft)]">Ağırlıklı Değer</p><strong className="text-[11px]">{formatMoney(Number(row.estimatedValue ?? 0) * row.probability / 100, row.currency)}</strong></div>
                  <div><p className="text-[9px] text-[var(--muted-soft)]">Son Güncelleme</p><strong className="text-[10px]">{formatDateTime(row.updatedAt)}</strong></div>
                  {canManage ? <Link href={`/crm/opportunities/${row.id}/edit`}><Button variant="secondary" className="min-h-8 px-3 py-1 text-[10px]">Ticari Düzenle</Button></Link> : null}
                </article>
              ))}
            </div>
          </section>
        ) : <EmptyState title="Durağan Fırsat Yok" description="Bu filtrede 14+ gündür bekleyen açık satış fırsatı bulunmuyor." />
      ) : followUps.length ? (
        <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
          <div className="divide-y divide-[var(--line)]">
            {followUps.map((row) => {
              const href = row.opportunityId ? `/crm/opportunities/${row.opportunityId}` : row.leadId ? `/crm/leads/${row.leadId}` : "/crm/follow-ups";
              return <article key={row.id} className="grid gap-3 px-5 py-4 md:grid-cols-[110px_minmax(200px,1fr)_170px_auto] md:items-center"><span className="w-fit rounded-full bg-[#EAF5FB] px-2.5 py-1 text-[10px] font-semibold text-[#1674BD]">{followUpChannelLabels[row.channel]}</span><div className="min-w-0"><Link href={href} className="truncate text-[12px] font-semibold hover:text-[#1674BD]">{row.subjectLabel}</Link><p className="mt-1 truncate text-[10px] text-[var(--muted)]">{row.note || "Takip notu bulunmuyor"}</p></div><time className={view === "overdue" ? "text-[10px] font-semibold text-[#9c513f]" : "text-[10px] text-[var(--muted)]"}>{formatDateTime(row.dueAt)}</time>{canManage ? <div className="flex flex-wrap justify-end gap-1.5"><Button variant="secondary" className="min-h-8 px-3 py-1 text-[10px]" onClick={() => openAction(row, "complete")}>Tamamla</Button><Button variant="ghost" className="min-h-8 px-2 py-1 text-[10px]" onClick={() => openAction(row, "reschedule")}>Ertele</Button><Button variant="danger" className="min-h-8 px-2 py-1 text-[10px]" onClick={() => openAction(row, "cancel")}>İptal</Button></div> : null}</article>;
            })}
          </div>
        </section>
      ) : <EmptyState title={view === "today" ? "Bugün Takip Yok" : "Geciken Takip Yok"} description="Bu aksiyon kuyruğunda açık kayıt bulunmuyor." />}

      <Modal open={Boolean(selected && action)} onClose={() => !saving && (setSelected(null), setAction(null))} title={action === "complete" ? "Takibi Tamamla" : action === "reschedule" ? "Takibi Ertele" : "Takibi İptal Et"}>
        <form onSubmit={submitAction} className="space-y-4">
          {actionError ? <Alert>{actionError}</Alert> : null}
          {action === "complete" ? <Field label="Takip Sonucu" required><TextArea rows={4} maxLength={2000} value={outcome} onChange={(event) => setOutcome(event.target.value)} /></Field> : null}
          {action === "reschedule" ? <Field label="Yeni Takip Tarihi" required><TextInput type="datetime-local" value={rescheduledAt} onChange={(event) => setRescheduledAt(event.target.value)} /></Field> : null}
          {action === "cancel" ? <Field label="İptal Nedeni" required><TextArea rows={4} maxLength={1000} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} /></Field> : null}
          <div className="flex justify-end gap-3"><Button type="button" variant="secondary" disabled={saving} onClick={() => { setSelected(null); setAction(null); }}>Vazgeç</Button><Button type="submit" disabled={saving}>{saving ? "Kaydediliyor..." : action === "complete" ? "Tamamla" : action === "reschedule" ? "Ertele" : "İptal Et"}</Button></div>
        </form>
      </Modal>
    </div>
  );
}
