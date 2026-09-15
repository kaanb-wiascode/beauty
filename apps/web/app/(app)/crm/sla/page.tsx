"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Field,
  GlassCard,
  PageHeader,
  Spinner,
  TextInput,
} from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasActiveBranch, hasPermission } from "@/lib/auth";

type LeadSlaPolicy = {
  warningMinutes: number;
  breachMinutes: number;
  ownerEscalationMinutes: number;
  managerEscalationMinutes: number;
  reassignmentEscalationMinutes: number;
  version: number;
  updatedAt: string | null;
};

type LeadSlaSummary = {
  totalAssigned: number;
  openClocks: number;
  healthy: number;
  warning: number;
  breached: number;
  completed: number;
  compliant: number;
  averageFirstResponseMinutes: number;
  medianFirstResponseMinutes: number;
  slaComplianceRate: number;
  unassignedLeads: number;
  assignmentBacklog: number;
};

type LeadSlaBreach = {
  leadId: string;
  leadName: string;
  leadScore: number;
  leadTemperature: "COLD" | "WARM" | "HOT";
  ownerUserId: string | null;
  ownerName: string | null;
  startedAt: string;
  breachDueAt: string;
  breachAgeMinutes: number;
  lastEscalationLevel: number;
};

type OwnerMetric = {
  ownerUserId: string;
  ownerName: string | null;
  openLeads: number;
  openSlaClocks: number;
  breachedSla: number;
  converted: number;
  total: number;
  conversionRate: number;
};

type LeadSlaEvent = {
  id: string;
  leadId: string;
  ownerUserId: string | null;
  eventType: "OWNER_ESCALATED" | "MANAGER_ESCALATED" | "REASSIGNMENT_REQUIRED";
  escalationLevel: number;
  metadata: Record<string, unknown>;
  createdAt: string;
};

type LeadSlaDashboard = {
  summary: LeadSlaSummary;
  breaches: LeadSlaBreach[];
  owners: OwnerMetric[];
  escalations: LeadSlaEvent[];
};

type PolicyDraft = {
  warningMinutes: string;
  breachMinutes: string;
  ownerEscalationMinutes: string;
  managerEscalationMinutes: string;
  reassignmentEscalationMinutes: string;
};

function draftFromPolicy(policy: LeadSlaPolicy): PolicyDraft {
  return {
    warningMinutes: String(policy.warningMinutes),
    breachMinutes: String(policy.breachMinutes),
    ownerEscalationMinutes: String(policy.ownerEscalationMinutes),
    managerEscalationMinutes: String(policy.managerEscalationMinutes),
    reassignmentEscalationMinutes: String(policy.reassignmentEscalationMinutes),
  };
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("tr-TR");
}

function formatMinutes(value: number) {
  if (value < 60) return `${Math.round(value)} dk`;
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return minutes ? `${hours} sa ${minutes} dk` : `${hours} sa`;
}

function eventLabel(type: LeadSlaEvent["eventType"]) {
  if (type === "OWNER_ESCALATED") return "Owner escalation";
  if (type === "MANAGER_ESCALATED") return "Manager escalation";
  return "Queue / yeniden atama";
}

export default function CrmLeadSlaPage() {
  const activeBranch = hasActiveBranch();
  const canManage = hasPermission("crm", "manage");
  const [policy, setPolicy] = useState<LeadSlaPolicy | null>(null);
  const [draft, setDraft] = useState<PolicyDraft | null>(null);
  const [dashboard, setDashboard] = useState<LeadSlaDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    if (!activeBranch) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [nextPolicy, nextDashboard] = await Promise.all([
        api<LeadSlaPolicy>("/crm/lead-sla/policy"),
        api<LeadSlaDashboard>("/crm/lead-sla/dashboard"),
      ]);
      setPolicy(nextPolicy);
      setDraft(draftFromPolicy(nextPolicy));
      setDashboard(nextDashboard);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Lead SLA verileri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [activeBranch]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateDraft(key: keyof PolicyDraft, value: string) {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  }

  async function savePolicy() {
    if (!policy || !draft || !canManage || !activeBranch || saving) return;
    const values = {
      warningMinutes: Number(draft.warningMinutes),
      breachMinutes: Number(draft.breachMinutes),
      ownerEscalationMinutes: Number(draft.ownerEscalationMinutes),
      managerEscalationMinutes: Number(draft.managerEscalationMinutes),
      reassignmentEscalationMinutes: Number(draft.reassignmentEscalationMinutes),
    };
    if (Object.values(values).some((value) => !Number.isInteger(value) || value < 1)) {
      setError("Tüm SLA eşikleri pozitif tam sayı olmalıdır.");
      return;
    }
    if (values.warningMinutes >= values.breachMinutes) {
      setError("Warning eşiği breach eşiğinden küçük olmalıdır.");
      return;
    }
    if (values.ownerEscalationMinutes >= values.managerEscalationMinutes ||
        values.managerEscalationMinutes >= values.reassignmentEscalationMinutes) {
      setError("Escalation sırası owner < manager < queue olacak şekilde artmalıdır.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const saved = await api<LeadSlaPolicy>("/crm/lead-sla/policy", {
        method: "PATCH",
        body: { ...values, version: policy.version },
      });
      setPolicy(saved);
      setDraft(draftFromPolicy(saved));
      setDashboard(await api<LeadSlaDashboard>("/crm/lead-sla/dashboard"));
      setSuccess("Lead SLA politikası kaydedildi ve açık clock deadline'ları güncellendi.");
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Lead SLA politikası kaydedilemedi.");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function processEscalations() {
    if (!canManage || !activeBranch || processing) return;
    setProcessing(true);
    setError("");
    setSuccess("");
    try {
      const result = await api<{ created: number }>("/crm/lead-sla/process-escalations", { method: "POST" });
      setDashboard(await api<LeadSlaDashboard>("/crm/lead-sla/dashboard"));
      setSuccess(`${result.created} yeni SLA escalation olayı işlendi.`);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "SLA escalation işlemi çalıştırılamadı.");
    } finally {
      setProcessing(false);
    }
  }

  return <div className="space-y-6">
    <PageHeader
      title="Lead SLA"
      description="İlk temas SLA clock'larını, escalation zincirini ve branch satış ekibinin response performansını izleyin."
      action={canManage && activeBranch ? <Button variant="secondary" disabled={processing} onClick={() => void processEscalations()}>{processing ? "İşleniyor..." : "Escalation'ları Şimdi İşle"}</Button> : undefined}
    />

    {!activeBranch ? <Alert>Lead SLA dashboard'u için aktif bir şube seçin.</Alert> : null}
    {activeBranch && !canManage ? <Alert>SLA metriklerini görüntüleyebilirsiniz; politika değişikliği ve manuel escalation işlemi için crm.manage yetkisi gerekir.</Alert> : null}
    {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
    {success ? <Alert tone="success" onClose={() => setSuccess("")}>{success}</Alert> : null}
    {loading ? <Spinner label="Lead SLA dashboard yükleniyor..." /> : null}

    {!loading && activeBranch && dashboard ? <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="SLA Uyum" value={`%${dashboard.summary.slaComplianceRate}`} hint={`${dashboard.summary.compliant}/${dashboard.summary.completed} tamamlanan clock`} />
        <MetricCard label="Ort. İlk Yanıt" value={formatMinutes(dashboard.summary.averageFirstResponseMinutes)} hint={`Medyan ${formatMinutes(dashboard.summary.medianFirstResponseMinutes)}`} />
        <MetricCard label="Breached" value={dashboard.summary.breached} hint={`${dashboard.summary.warning} warning · ${dashboard.summary.healthy} healthy`} danger={dashboard.summary.breached > 0} />
        <MetricCard label="Atama Backlog" value={dashboard.summary.assignmentBacklog} hint={`${dashboard.summary.unassignedLeads} owner’sız açık lead`} danger={dashboard.summary.assignmentBacklog > 0} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[.72fr_1.28fr]">
        <PolicyCard policy={policy} draft={draft} canManage={canManage} saving={saving} onChange={updateDraft} onSave={() => void savePolicy()} />
        <BreachesCard breaches={dashboard.breaches} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <OwnerWorkload owners={dashboard.owners} />
        <EscalationHistory events={dashboard.escalations} />
      </div>
    </> : null}
  </div>;
}

function MetricCard({ label, value, hint, danger = false }: { label: string; value: string | number; hint: string; danger?: boolean }) {
  return <GlassCard>
    <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--muted)]">{label}</p>
    <p className={`mt-2 text-[28px] font-semibold tracking-[-.04em] ${danger ? "text-[#8f3d3d]" : "text-[var(--ink)]"}`}>{value}</p>
    <p className="mt-1 text-[10px] text-[var(--muted)]">{hint}</p>
  </GlassCard>;
}

function PolicyCard({ policy, draft, canManage, saving, onChange, onSave }: {
  policy: LeadSlaPolicy | null;
  draft: PolicyDraft | null;
  canManage: boolean;
  saving: boolean;
  onChange: (key: keyof PolicyDraft, value: string) => void;
  onSave: () => void;
}) {
  return <GlassCard>
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--accent)]">Branch Policy</p>
        <h2 className="mt-1 text-[18px] font-semibold">SLA Eşikleri</h2>
      </div>
      <span className="text-[10px] text-[var(--muted)]">v{policy?.version ?? 0} · {formatDate(policy?.updatedAt)}</span>
    </div>
    {!draft ? <p className="mt-4 text-[12px] text-[var(--muted)]">Politika yüklenemedi.</p> : <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <MinuteField label="Warning" value={draft.warningMinutes} disabled={!canManage || saving} onChange={(value) => onChange("warningMinutes", value)} />
      <MinuteField label="Breach" value={draft.breachMinutes} disabled={!canManage || saving} onChange={(value) => onChange("breachMinutes", value)} />
      <MinuteField label="Owner escalation" value={draft.ownerEscalationMinutes} disabled={!canManage || saving} onChange={(value) => onChange("ownerEscalationMinutes", value)} />
      <MinuteField label="Manager escalation" value={draft.managerEscalationMinutes} disabled={!canManage || saving} onChange={(value) => onChange("managerEscalationMinutes", value)} />
      <MinuteField label="Queue / reassignment" value={draft.reassignmentEscalationMinutes} disabled={!canManage || saving} onChange={(value) => onChange("reassignmentEscalationMinutes", value)} />
      {canManage ? <div className="flex items-end"><Button className="w-full" disabled={saving} onClick={onSave}>{saving ? "Kaydediliyor..." : "Politikayı Kaydet"}</Button></div> : null}
    </div>}
    <p className="mt-4 text-[10px] leading-4 text-[var(--muted)]">Süreler lead&apos;in ilk atama anından başlar. İlk başarılı outbound denemesi veya anlamlı temas clock&apos;ı tamamlar; final escalation lead&apos;i owner&apos;sız branch/team queue&apos;ya döndürür.</p>
  </GlassCard>;
}

function MinuteField({ label, value, disabled, onChange }: { label: string; value: string; disabled: boolean; onChange: (value: string) => void }) {
  return <Field label={`${label} (dk)`}>
    <TextInput type="number" min={1} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
  </Field>;
}

function BreachesCard({ breaches }: { breaches: LeadSlaBreach[] }) {
  return <GlassCard>
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--accent)]">Breach Queue</p>
      <h2 className="mt-1 text-[18px] font-semibold">Müdahale Bekleyen Lead&apos;ler</h2>
    </div>
    <div className="mt-4 space-y-3">
      {!breaches.length ? <p className="text-[12px] text-[var(--muted)]">Aktif SLA breach yok.</p> : breaches.map((item) => <div key={item.leadId} className="rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)]/35 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href={`/crm/leads/${item.leadId}`} className="text-[12px] font-semibold text-[var(--ink)] hover:text-[var(--accent)]">{item.leadName}</Link>
            <p className="mt-1 text-[10px] text-[var(--muted)]">{item.ownerName || "Owner yok"} · {item.leadTemperature} · score {item.leadScore}</p>
          </div>
          <span className="rounded-full bg-[rgba(143,61,61,0.08)] px-2 py-1 text-[9px] font-semibold text-[#7a3333]">+{formatMinutes(item.breachAgeMinutes)}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[var(--muted)]">
          <span>Başlangıç: {formatDate(item.startedAt)}</span>
          <span>Breach: {formatDate(item.breachDueAt)}</span>
          <span>Escalation L{item.lastEscalationLevel}</span>
        </div>
      </div>)}
    </div>
  </GlassCard>;
}

function OwnerWorkload({ owners }: { owners: OwnerMetric[] }) {
  return <GlassCard>
    <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--accent)]">Owner Health</p>
    <h2 className="mt-1 text-[18px] font-semibold">İş Yükü ve Dönüşüm</h2>
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[680px] text-left text-[11px]">
        <thead className="text-[9px] uppercase tracking-[.08em] text-[var(--muted)]"><tr><th className="pb-2">Owner</th><th className="pb-2">Açık Lead</th><th className="pb-2">Açık SLA</th><th className="pb-2">Breach</th><th className="pb-2">Converted</th><th className="pb-2">Conversion</th></tr></thead>
        <tbody>{owners.map((owner) => <tr key={owner.ownerUserId} className="border-t border-[var(--line)]"><td className="py-3 font-medium text-[var(--ink)]">{owner.ownerName || owner.ownerUserId}</td><td className="py-3">{owner.openLeads}</td><td className="py-3">{owner.openSlaClocks}</td><td className={`py-3 ${owner.breachedSla ? "font-semibold text-[#8f3d3d]" : ""}`}>{owner.breachedSla}</td><td className="py-3">{owner.converted}</td><td className="py-3">%{owner.conversionRate}</td></tr>)}</tbody>
      </table>
      {!owners.length ? <p className="py-4 text-[12px] text-[var(--muted)]">Owner metriği oluşmadı.</p> : null}
    </div>
  </GlassCard>;
}

function EscalationHistory({ events }: { events: LeadSlaEvent[] }) {
  return <GlassCard>
    <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--accent)]">Audit Trail</p>
    <h2 className="mt-1 text-[18px] font-semibold">SLA Escalation Geçmişi</h2>
    <div className="mt-4 space-y-3">
      {!events.length ? <p className="text-[12px] text-[var(--muted)]">Henüz escalation olayı yok.</p> : events.map((event) => <div key={event.id} className="border-b border-[var(--line)] pb-3 last:border-0 last:pb-0">
        <div className="flex items-center justify-between gap-3"><Link href={`/crm/leads/${event.leadId}`} className="text-[11px] font-semibold text-[var(--ink)] hover:text-[var(--accent)]">{eventLabel(event.eventType)}</Link><span className="text-[9px] text-[var(--muted)]">L{event.escalationLevel}</span></div>
        <p className="mt-1 text-[10px] text-[var(--muted)]">{formatDate(event.createdAt)} · Lead {event.leadId.slice(0, 8)}</p>
      </div>)}
    </div>
  </GlassCard>;
}
