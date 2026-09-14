"use client";

import { useState } from "react";
import { Alert, Button, GlassCard, PageHeader } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";

type AutomationResult = {
  scanned: number;
  created: number;
  skipped: number;
  staleDays?: number;
  staleBefore?: string;
};

export default function CrmAutomationsPage() {
  const canManage = hasPermission("crm", "manage");
  const [running, setRunning] = useState<"events" | "stale" | null>(null);
  const [error, setError] = useState("");
  const [lastResult, setLastResult] = useState<{ label: string; result: AutomationResult } | null>(null);

  async function run(kind: "events" | "stale") {
    if (!canManage || running) return;
    setRunning(kind);
    setError("");
    try {
      const endpoint = kind === "events"
        ? "/crm/operations/automations/process-events"
        : "/crm/operations/automations/stale-sweep?staleDays=14";
      const result = await api<AutomationResult>(endpoint, { method: "POST" });
      setLastResult({
        label: kind === "events" ? "CRM event otomasyonları" : "Durağan fırsat sweep'i",
        result,
      });
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Otomasyon çalıştırılamadı.");
    } finally {
      setRunning(null);
    }
  }

  return <div className="space-y-6">
    <PageHeader
      title="CRM Otomasyonları"
      description="CRM event'lerinden güvenli ve idempotent takip görevleri üretin. Aynı automation key ikinci kez aynı işi oluşturmaz."
      action={canManage ? <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={Boolean(running)} onClick={() => void run("events")}>{running === "events" ? "İşleniyor..." : "Event Kuyruğunu İşle"}</Button><Button disabled={Boolean(running)} onClick={() => void run("stale")}>{running === "stale" ? "Taranıyor..." : "14+ Gün Durağanları İşle"}</Button></div> : undefined}
    />

    {!canManage ? <Alert>Bu ekranı görüntüleyebilirsiniz; otomasyon çalıştırmak için crm.manage yetkisi gerekir.</Alert> : null}
    {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
    {lastResult ? <Alert tone="success">{lastResult.label}: {lastResult.result.scanned} kayıt tarandı, {lastResult.result.created} takip oluşturuldu, {lastResult.result.skipped} kayıt idempotency nedeniyle atlandı.</Alert> : null}

    <section className="grid gap-4 lg:grid-cols-3">
      <RuleCard
        title="Yeni Lead → İlk Temas"
        trigger="LEAD_CREATED"
        description="Yeni lead'in owner'ına yaklaşık 24 saat sonrasına CALL takibi açar."
        keyPattern="LEAD_FIRST_TOUCH:{leadId}"
      />
      <RuleCard
        title="Aşama Değişimi → Takip"
        trigger="OPPORTUNITY_STAGE_CHANGED"
        description="Açık fırsat yeni aşamaya geçtiğinde owner için takip oluşturur. Negotiation 1 gün, diğer açık aşamalar 2 gün. WON/LOST için görev üretmez."
        keyPattern="OPPORTUNITY_STAGE:{opportunityId}:{stage}:v{version}"
      />
      <RuleCard
        title="14+ Gün Durağan → Görev"
        trigger="STALE_OPPORTUNITY"
        description="14+ gündür güncellenmemiş açık fırsatlara owner bazlı takip görevi açar. Fırsat yeniden güncellenip tekrar durağanlaşırsa yeni cycle üretilebilir."
        keyPattern="STALE_OPPORTUNITY:{opportunityId}:{updatedAt}"
      />
    </section>

    <GlassCard>
      <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--accent)]">Çalışma Modeli</p>
      <h2 className="mt-1 text-[18px] font-semibold">Event-driven ve audit edilebilir</h2>
      <div className="mt-4 grid gap-3 text-[12px] leading-5 text-[var(--muted)] md:grid-cols-2">
        <p>Her otomatik takip normal <strong className="text-[var(--ink)]">crm_follow_ups</strong> kaydıdır; ayrı ve görünmez bir görev sistemi oluşmaz.</p>
        <p>Her execution <strong className="text-[var(--ink)]">AUTOMATION_EXECUTED</strong> olayı bırakır. Kaynak event, rule ve automation key CRM timeline üzerinden audit edilebilir.</p>
        <p>İşlemler tenant/company/branch scope içinde çalışır. Event processor en fazla 100 pending event, stale sweep en fazla 100 açık fırsat işler.</p>
        <p>Bu v1 manuel tetiklenebilir processor&apos;dır. Aynı servis daha sonra scheduler/queue worker tarafından güvenle çağrılabilecek şekilde tasarlanmıştır.</p>
      </div>
    </GlassCard>
  </div>;
}

function RuleCard({ title, trigger, description, keyPattern }: { title: string; trigger: string; description: string; keyPattern: string }) {
  return <GlassCard>
    <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--accent)]">{trigger}</p>
    <h2 className="mt-2 text-[16px] font-semibold">{title}</h2>
    <p className="mt-3 text-[12px] leading-5 text-[var(--muted)]">{description}</p>
    <div className="mt-4 rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)]/40 px-3 py-2.5">
      <p className="text-[9px] uppercase tracking-[.08em] text-[var(--muted-soft)]">Idempotency key</p>
      <code className="mt-1 block break-all text-[10px] text-[var(--ink)]">{keyPattern}</code>
    </div>
  </GlassCard>;
}
