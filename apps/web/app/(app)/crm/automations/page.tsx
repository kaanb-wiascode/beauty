"use client";

import { useCallback, useEffect, useState } from "react";
import { CardInfo } from "@/components/card-info";
import {
  Alert,
  Button,
  Field,
  GlassCard,
  PageHeader,
  Select,
  Spinner,
  TextInput,
} from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { getCardHelp } from "@/lib/card-help";
import { hasActiveBranch, hasPermission } from "@/lib/auth";
import { userErrorMessage } from "@/lib/user-language";

type AutomationResult = {
  scanned: number;
  created: number;
  skipped: number;
  staleDays?: number;
  staleBefore?: string;
};

type RuleKey =
  | "LEAD_FIRST_TOUCH"
  | "OPPORTUNITY_STAGE_FOLLOW_UP"
  | "STALE_OPPORTUNITY_FOLLOW_UP";

type Channel = "CALL" | "SMS" | "EMAIL" | "WHATSAPP" | "IN_PERSON" | "OTHER";

type AutomationRule = {
  ruleKey: RuleKey;
  enabled: boolean;
  config: Record<string, unknown>;
  version: number;
  overridden: boolean;
};

type AutomationRun = {
  id: string;
  origin: "MANUAL" | "SCHEDULER";
  operation: "EVENT_PROCESSOR" | "STALE_SWEEP";
  status: "SUCCEEDED" | "FAILED";
  scanned: number;
  created: number;
  skipped: number;
  failed: number;
  metrics: Record<string, unknown>;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string;
};

type AutomationHistory = {
  summary: { runs7d: number; created7d: number; failed7d: number };
  latestRuns: AutomationRun[];
  ruleActivity: Array<{ ruleKey: RuleKey; lastActivityAt: string; executions7d: number }>;
  ruleChanges: Array<{
    eventId: string;
    ruleKey: RuleKey;
    actorUserId: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>;
};

const CHANNELS: Array<{ value: Channel; label: string }> = [
  { value: "CALL", label: "Arama" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "SMS", label: "SMS" },
  { value: "EMAIL", label: "E-posta" },
  { value: "IN_PERSON", label: "Yüz yüze" },
  { value: "OTHER", label: "Diğer" },
];

const RULE_META: Record<RuleKey, { title: string; trigger: string; description: string; keyPattern: string }> = {
  LEAD_FIRST_TOUCH: {
    title: "Yeni Potansiyel Müşteri → İlk Temas",
    trigger: "Potansiyel müşteri oluşturuldu",
    description: "Yeni potansiyel müşteri oluşturulduğunda sorumlu personele otomatik ilk temas görevi oluşturur.",
    keyPattern: "LEAD_FIRST_TOUCH:{leadId}",
  },
  OPPORTUNITY_STAGE_FOLLOW_UP: {
    title: "Aşama Değişimi → Takip",
    trigger: "Satış fırsatının aşaması değişti",
    description: "Açık satış fırsatı yeni aşamaya geçtiğinde sorumlu personele otomatik takip görevi oluşturur. Kazanılan veya kaybedilen fırsatlarda yeni görev oluşturulmaz.",
    keyPattern: "OPPORTUNITY_STAGE:{opportunityId}:{stage}:v{version}",
  },
  STALE_OPPORTUNITY_FOLLOW_UP: {
    title: "Durağan Fırsat → Görev",
    trigger: "Satış fırsatı uzun süredir güncellenmedi",
    description: "Belirlenen süredir güncellenmemiş açık satış fırsatları için sorumlu personele takip görevi oluşturur.",
    keyPattern: "STALE_OPPORTUNITY:{opportunityId}:{updatedAt}",
  },
};

function numeric(config: Record<string, unknown>, key: string, fallback: number) {
  const value = config[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function channelOf(config: Record<string, unknown>): Channel {
  const value = String(config.channel ?? "CALL") as Channel;
  return CHANNELS.some((item) => item.value === value) ? value : "CALL";
}

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("tr-TR");
}

export default function CrmAutomationsPage() {
  const canManage = hasPermission("crm", "manage");
  const activeBranch = hasActiveBranch();
  const [running, setRunning] = useState<"events" | "stale" | null>(null);
  const [savingRule, setSavingRule] = useState<RuleKey | null>(null);
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [history, setHistory] = useState<AutomationHistory | null>(null);
  const [loadingRules, setLoadingRules] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [lastResult, setLastResult] = useState<{ label: string; result: AutomationResult } | null>(null);

  const loadRules = useCallback(async () => {
    if (!activeBranch) {
      setLoadingRules(false);
      return;
    }
    setLoadingRules(true);
    try {
      setRules(await api<AutomationRule[]>("/crm/automation-rules"));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Otomasyon kuralları yüklenemedi.");
    } finally {
      setLoadingRules(false);
    }
  }, [activeBranch]);

  const loadHistory = useCallback(async () => {
    if (!activeBranch) {
      setLoadingHistory(false);
      return;
    }
    setLoadingHistory(true);
    try {
      setHistory(await api<AutomationHistory>("/crm/operations/automations/history?limit=30"));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Otomasyon geçmişi yüklenemedi.");
    } finally {
      setLoadingHistory(false);
    }
  }, [activeBranch]);

  useEffect(() => {
    void loadRules();
    void loadHistory();
  }, [loadRules, loadHistory]);

  function changeRule(ruleKey: RuleKey, patch: Partial<AutomationRule>) {
    setRules((current) => current.map((rule) => rule.ruleKey === ruleKey ? { ...rule, ...patch } : rule));
  }

  function changeConfig(ruleKey: RuleKey, key: string, value: unknown) {
    setRules((current) => current.map((rule) => rule.ruleKey === ruleKey
      ? { ...rule, config: { ...rule.config, [key]: value } }
      : rule));
  }

  async function saveRule(rule: AutomationRule) {
    if (!canManage || !activeBranch || savingRule) return;
    setSavingRule(rule.ruleKey);
    setError("");
    setSuccess("");
    try {
      const updated = await api<AutomationRule>(`/crm/automation-rules/${rule.ruleKey}`, {
        method: "PATCH",
        body: {
          enabled: rule.enabled,
          version: rule.version,
          config: rule.config,
        },
      });
      changeRule(rule.ruleKey, updated);
      setSuccess(`${RULE_META[rule.ruleKey].title} kuralı kaydedildi.`);
      await loadHistory();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? userErrorMessage(requestError.message,"Otomasyon kuralı kaydedilemedi.") : "Otomasyon kuralı kaydedilemedi.");
      await loadRules();
    } finally {
      setSavingRule(null);
    }
  }

  async function run(kind: "events" | "stale") {
    if (!canManage || !activeBranch || running) return;
    setRunning(kind);
    setError("");
    setSuccess("");
    try {
      const endpoint = kind === "events"
        ? "/crm/operations/automations/process-events"
        : "/crm/operations/automations/stale-sweep";
      const result = await api<AutomationResult>(endpoint, { method: "POST" });
      setLastResult({
        label: kind === "events" ? "Yeni CRM olayları" : "Durağan satış fırsatları",
        result,
      });
      await loadHistory();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? userErrorMessage(requestError.message,"Otomasyon çalıştırılamadı.") : "Otomasyon çalıştırılamadı.");
      await loadHistory();
    } finally {
      setRunning(null);
    }
  }

  return <div className="space-y-6">
    <PageHeader
      title="CRM Otomasyonları"
      description="Şube bazlı otomasyon kurallarını yönetin, otomatik takiplerin ne zaman çalıştığını ve sonuçlarını tek ekrandan izleyin."
      action={canManage && activeBranch ? <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={Boolean(running)} onClick={() => void run("events")}>{running === "events" ? "İşleniyor..." : "Yeni Olayları Şimdi İşle"}</Button><Button disabled={Boolean(running)} onClick={() => void run("stale")}>{running === "stale" ? "Taranıyor..." : "Durağan Fırsatları Kontrol Et"}</Button></div> : undefined}
    />

    {!activeBranch ? <Alert>Otomasyon kurallarını yönetmek ve geçmişi görmek için aktif bir şube seçin.</Alert> : null}
    {activeBranch && !canManage ? <Alert>Kuralları ve çalışma geçmişini görüntüleyebilirsiniz; değiştirmek veya elle çalıştırmak için otomasyon yönetme yetkisi gerekir.</Alert> : null}
    {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
    {success ? <Alert tone="success" onClose={() => setSuccess("")}>{success}</Alert> : null}
    {lastResult ? <Alert tone="success">{lastResult.label}: {lastResult.result.scanned} kayıt tarandı, {lastResult.result.created} takip oluşturuldu, {lastResult.result.skipped} kayıt atlandı.</Alert> : null}

    {activeBranch ? <AutomationOverview history={history} loading={loadingHistory} /> : null}

    {loadingRules ? <Spinner label="Otomasyon kuralları yükleniyor..." /> : null}

    {!loadingRules && activeBranch ? <section className="grid gap-4 xl:grid-cols-3">
      {rules.map((rule) => <RuleEditor
        key={rule.ruleKey}
        rule={rule}
        canManage={canManage}
        saving={savingRule === rule.ruleKey}
        activity={history?.ruleActivity.find((item) => item.ruleKey === rule.ruleKey)}
        onEnabled={(enabled) => changeRule(rule.ruleKey, { enabled })}
        onConfig={(key, value) => changeConfig(rule.ruleKey, key, value)}
        onSave={() => void saveRule(rule)}
      />)}
    </section> : null}

    {activeBranch ? <ExecutionHistory history={history} loading={loadingHistory} /> : null}

    <GlassCard>
      <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--accent)]">Nasıl Çalışır?</p>
      <h2 className="mt-1 text-[18px] font-semibold">Otomatik takip süreci</h2>
      <div className="mt-4 grid gap-3 text-[12px] leading-5 text-[var(--muted)] md:grid-cols-2">
        <p>Yeni potansiyel müşteri ve satış fırsatı hareketleri otomatik olarak değerlendirilir; uygun olduğunda sorumlu personele takip görevi oluşturulur.</p>
        <p>Aynı işlem için tekrar tekrar görev üretilmez. Kurallarda yapılan değişiklikler ve otomasyon sonuçları çalışma geçmişinde saklanır.</p>
      </div>
    </GlassCard>
  </div>;
}

function AutomationOverview({ history, loading }: { history: AutomationHistory | null; loading: boolean }) {
  if (loading && !history) return <Spinner label="Otomasyon çalışma geçmişi yükleniyor..." />;
  const summary = history?.summary ?? { runs7d: 0, created7d: 0, failed7d: 0 };
  return <section className="grid gap-4 md:grid-cols-3">
    <MetricCard label="7 Günlük Çalışma" value={summary.runs7d} />
    <MetricCard label="Oluşturulan Takip" value={summary.created7d} />
    <MetricCard label="Başarısız Çalışma" value={summary.failed7d} danger={summary.failed7d > 0} />
  </section>;
}

function MetricCard({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return <GlassCard>
    <div className="flex items-start justify-between gap-3">
      <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--muted)]">{label}</p>
      <CardInfo help={getCardHelp(label, "Son 7 günlük otomasyon çalışma özetini gösterir.")} />
    </div>
    <p className={`mt-2 text-[30px] font-semibold tracking-[-.04em] ${danger ? "text-[#8f3d3d]" : "text-[var(--ink)]"}`}>{value}</p>
  </GlassCard>;
}

function ExecutionHistory({ history, loading }: { history: AutomationHistory | null; loading: boolean }) {
  return <div className="grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
    <GlassCard>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--accent)]">Execution History</p>
          <h2 className="mt-1 text-[18px] font-semibold">Son Çalışmalar</h2>
        </div>
        {loading ? <span className="text-[11px] text-[var(--muted)]">Yenileniyor...</span> : null}
      </div>
      <div className="mt-4 space-y-3">
        {!history?.latestRuns.length ? <p className="text-[12px] text-[var(--muted)]">Henüz kayıtlı çalışma geçmişi yok.</p> : history.latestRuns.map((run) => <div key={run.id} className="rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)]/35 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-1 text-[9px] font-semibold ${run.status === "SUCCEEDED" ? "bg-[rgba(47,122,86,0.10)] text-[#2d5c45]" : "bg-[rgba(143,61,61,0.08)] text-[#7a3333]"}`}>{run.status === "SUCCEEDED" ? "BAŞARILI" : "HATALI"}</span>
              <span className="text-[11px] font-semibold text-[var(--ink)]">{run.operation === "EVENT_PROCESSOR" ? "Yeni Olayları İşleme" : "Durağan Fırsat Kontrolü"}</span>
              <span className="text-[10px] text-[var(--muted)]">{run.origin === "SCHEDULER" ? "Otomatik" : "Manuel"}</span>
            </div>
            <span className="text-[10px] text-[var(--muted)]">{formatDate(run.startedAt)}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[var(--muted)]">
            <span>Taranan <strong className="text-[var(--ink)]">{run.scanned}</strong></span>
            <span>Oluşturulan <strong className="text-[var(--ink)]">{run.created}</strong></span>
            <span>Atlanan <strong className="text-[var(--ink)]">{run.skipped}</strong></span>
            {run.failed ? <span>Hata <strong className="text-[#8f3d3d]">{run.failed}</strong></span> : null}
          </div>
          {run.errorMessage ? <p className="mt-2 text-[10px] leading-4 text-[#8f3d3d]">{userErrorMessage(run.errorMessage,"Otomasyon çalışması sırasında bir hata oluştu.")}</p> : null}
        </div>)}
      </div>
    </GlassCard>

    <GlassCard>
      <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--accent)]">Rule Changes</p>
      <h2 className="mt-1 text-[18px] font-semibold">Değişiklik Geçmişi</h2>
      <div className="mt-4 space-y-3">
        {!history?.ruleChanges.length ? <p className="text-[12px] text-[var(--muted)]">Henüz kural değişikliği yok.</p> : history.ruleChanges.map((change) => <div key={change.eventId} className="border-b border-[var(--line)] pb-3 last:border-0 last:pb-0">
          <p className="text-[11px] font-semibold text-[var(--ink)]">{RULE_META[change.ruleKey]?.title ?? change.ruleKey}</p>
          <p className="mt-1 text-[10px] text-[var(--muted)]">{formatDate(change.createdAt)} · v{String(change.metadata.version ?? "—")} · {change.metadata.enabled === false ? "Kapalı" : "Aktif"}</p>
        </div>)}
      </div>
    </GlassCard>
  </div>;
}

function RuleEditor({
  rule,
  canManage,
  saving,
  activity,
  onEnabled,
  onConfig,
  onSave,
}: {
  rule: AutomationRule;
  canManage: boolean;
  saving: boolean;
  activity?: { ruleKey: RuleKey; lastActivityAt: string; executions7d: number };
  onEnabled: (enabled: boolean) => void;
  onConfig: (key: string, value: unknown) => void;
  onSave: () => void;
}) {
  const meta = RULE_META[rule.ruleKey];
  return <GlassCard>
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--accent)]">{meta.trigger}</p>
        <h2 className="mt-2 text-[16px] font-semibold">{meta.title}</h2>
      </div>
      <label className="flex items-center gap-2 text-[12px] font-medium text-[var(--muted)]">
        <input
          type="checkbox"
          checked={rule.enabled}
          disabled={!canManage || saving}
          onChange={(event) => onEnabled(event.target.checked)}
          className="h-4 w-4 rounded border-[var(--line)]"
        />
        {rule.enabled ? "Aktif" : "Kapalı"}
      </label>
    </div>

    <p className="mt-3 text-[12px] leading-5 text-[var(--muted)]">{meta.description}</p>
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[var(--muted-soft)]">
      <span>{rule.overridden ? `Şubeye özel ayar · v${rule.version}` : "Sistem varsayılanı"}</span>
      <span>Son 7 gün çalışma: {activity?.executions7d ?? 0}</span>
      <span>Son aktivite: {formatDate(activity?.lastActivityAt)}</span>
    </div>

    <div className="mt-5 grid gap-4">
      {rule.ruleKey === "LEAD_FIRST_TOUCH" ? <>
        <NumberField label="İlk temas gecikmesi (saat)" value={numeric(rule.config, "delayHours", 24)} disabled={!canManage || saving} min={1} max={720} onChange={(value) => onConfig("delayHours", value)} />
        <ChannelField value={channelOf(rule.config)} disabled={!canManage || saving} onChange={(value) => onConfig("channel", value)} />
      </> : null}

      {rule.ruleKey === "OPPORTUNITY_STAGE_FOLLOW_UP" ? <>
        <NumberField label="Standart aşama gecikmesi (gün)" value={numeric(rule.config, "defaultDelayDays", 2)} disabled={!canManage || saving} min={1} max={90} onChange={(value) => onConfig("defaultDelayDays", value)} />
        <NumberField label="Müzakere aşaması gecikmesi (gün)" value={numeric(rule.config, "negotiationDelayDays", 1)} disabled={!canManage || saving} min={1} max={90} onChange={(value) => onConfig("negotiationDelayDays", value)} />
        <ChannelField value={channelOf(rule.config)} disabled={!canManage || saving} onChange={(value) => onConfig("channel", value)} />
      </> : null}

      {rule.ruleKey === "STALE_OPPORTUNITY_FOLLOW_UP" ? <>
        <NumberField label="Durağanlık eşiği (gün)" value={numeric(rule.config, "staleDays", 14)} disabled={!canManage || saving} min={1} max={90} onChange={(value) => onConfig("staleDays", value)} />
        <NumberField label="Görev gecikmesi (saat)" value={numeric(rule.config, "delayHours", 24)} disabled={!canManage || saving} min={1} max={720} onChange={(value) => onConfig("delayHours", value)} />
        <ChannelField value={channelOf(rule.config)} disabled={!canManage || saving} onChange={(value) => onConfig("channel", value)} />
      </> : null}
    </div>

    <div className="mt-5 flex items-center justify-between gap-3">
      <p className="text-[10px] text-[var(--muted-soft)]">Son aktivite: {formatDate(activity?.lastActivityAt)}</p>
      {canManage ? <Button disabled={saving} onClick={onSave}>{saving ? "Kaydediliyor..." : "Kaydet"}</Button> : null}
    </div>
  </GlassCard>;
}

function NumberField({ label, value, disabled, min, max, onChange }: { label: string; value: number; disabled: boolean; min: number; max: number; onChange: (value: number) => void }) {
  return <Field label={label}>
    <TextInput type="number" value={value} disabled={disabled} min={min} max={max} onChange={(event) => onChange(Number(event.target.value))} />
  </Field>;
}

function ChannelField({ value, disabled, onChange }: { value: Channel; disabled: boolean; onChange: (value: Channel) => void }) {
  return <Field label="Takip kanalı">
    <Select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value as Channel)}>
      {CHANNELS.map((channel) => <option key={channel.value} value={channel.value}>{channel.label}</option>)}
    </Select>
  </Field>;
}
