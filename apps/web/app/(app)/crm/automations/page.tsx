"use client";

import { useCallback, useEffect, useState } from "react";
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
import { hasActiveBranch, hasPermission } from "@/lib/auth";

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
    title: "Yeni Lead → İlk Temas",
    trigger: "LEAD_CREATED",
    description: "Yeni lead owner'ına otomatik ilk temas görevi oluşturur.",
    keyPattern: "LEAD_FIRST_TOUCH:{leadId}",
  },
  OPPORTUNITY_STAGE_FOLLOW_UP: {
    title: "Aşama Değişimi → Takip",
    trigger: "OPPORTUNITY_STAGE_CHANGED",
    description: "Açık fırsat yeni aşamaya geçtiğinde owner için takip oluşturur. WON/LOST terminaldir.",
    keyPattern: "OPPORTUNITY_STAGE:{opportunityId}:{stage}:v{version}",
  },
  STALE_OPPORTUNITY_FOLLOW_UP: {
    title: "Durağan Fırsat → Görev",
    trigger: "STALE_OPPORTUNITY",
    description: "Belirlenen süredir güncellenmemiş açık fırsatlara owner bazlı görev oluşturur.",
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

export default function CrmAutomationsPage() {
  const canManage = hasPermission("crm", "manage");
  const activeBranch = hasActiveBranch();
  const [running, setRunning] = useState<"events" | "stale" | null>(null);
  const [savingRule, setSavingRule] = useState<RuleKey | null>(null);
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [lastResult, setLastResult] = useState<{ label: string; result: AutomationResult } | null>(null);

  const loadRules = useCallback(async () => {
    if (!activeBranch) {
      setLoadingRules(false);
      return;
    }
    setLoadingRules(true);
    setError("");
    try {
      setRules(await api<AutomationRule[]>("/crm/automation-rules"));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Otomasyon kuralları yüklenemedi.");
    } finally {
      setLoadingRules(false);
    }
  }, [activeBranch]);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

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
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Otomasyon kuralı kaydedilemedi.");
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
      description="Branch bazlı otomasyon kurallarını yönetin. Runtime arka planda otomatik çalışır; değişiklikler audit event'i ile kaydedilir."
      action={canManage && activeBranch ? <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={Boolean(running)} onClick={() => void run("events")}>{running === "events" ? "İşleniyor..." : "Event Kuyruğunu Şimdi İşle"}</Button><Button disabled={Boolean(running)} onClick={() => void run("stale")}>{running === "stale" ? "Taranıyor..." : "Durağanları Şimdi İşle"}</Button></div> : undefined}
    />

    {!activeBranch ? <Alert>Otomasyon kurallarını yönetmek için aktif bir şube seçin.</Alert> : null}
    {activeBranch && !canManage ? <Alert>Kuralları görüntüleyebilirsiniz; değiştirmek veya manuel çalıştırmak için crm.manage yetkisi gerekir.</Alert> : null}
    {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
    {success ? <Alert tone="success" onClose={() => setSuccess("")}>{success}</Alert> : null}
    {lastResult ? <Alert tone="success">{lastResult.label}: {lastResult.result.scanned} kayıt tarandı, {lastResult.result.created} takip oluşturuldu, {lastResult.result.skipped} kayıt atlandı.</Alert> : null}

    {loadingRules ? <Spinner label="Otomasyon kuralları yükleniyor..." /> : null}

    {!loadingRules && activeBranch ? <section className="grid gap-4 xl:grid-cols-3">
      {rules.map((rule) => <RuleEditor
        key={rule.ruleKey}
        rule={rule}
        canManage={canManage}
        saving={savingRule === rule.ruleKey}
        onEnabled={(enabled) => changeRule(rule.ruleKey, { enabled })}
        onConfig={(key, value) => changeConfig(rule.ruleKey, key, value)}
        onSave={() => void saveRule(rule)}
      />)}
    </section> : null}

    <GlassCard>
      <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--accent)]">Çalışma Modeli</p>
      <h2 className="mt-1 text-[18px] font-semibold">Dağıtık, event-driven ve audit edilebilir</h2>
      <div className="mt-4 grid gap-3 text-[12px] leading-5 text-[var(--muted)] md:grid-cols-2">
        <p>Her otomatik takip normal <strong className="text-[var(--ink)]">crm_follow_ups</strong> kaydıdır; ayrı ve görünmez bir görev sistemi oluşmaz.</p>
        <p>Kural değişiklikleri <strong className="text-[var(--ink)]">AUTOMATION_RULE_UPDATED</strong>, execution&apos;lar <strong className="text-[var(--ink)]">AUTOMATION_EXECUTED</strong> olayı bırakır.</p>
        <p>Runtime yaklaşık her 5 dakikada aday scope&apos;ları tarar. Stale discovery artık branch&apos;in ayarlanmış gün eşiğini kullanır.</p>
        <p>Tenant/company/branch izolasyonu, distributed lease, transaction advisory lock ve unique automation key index&apos;i birlikte duplicate üretimi engeller.</p>
      </div>
    </GlassCard>
  </div>;
}

function RuleEditor({
  rule,
  canManage,
  saving,
  onEnabled,
  onConfig,
  onSave,
}: {
  rule: AutomationRule;
  canManage: boolean;
  saving: boolean;
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
    <p className="mt-2 text-[10px] text-[var(--muted-soft)]">{rule.overridden ? `Branch override · v${rule.version}` : "Sistem varsayılanı"}</p>

    <div className="mt-5 grid gap-4">
      {rule.ruleKey === "LEAD_FIRST_TOUCH" ? <>
        <NumberField label="İlk temas gecikmesi (saat)" value={numeric(rule.config, "delayHours", 24)} disabled={!canManage || saving} min={1} max={720} onChange={(value) => onConfig("delayHours", value)} />
        <ChannelField value={channelOf(rule.config)} disabled={!canManage || saving} onChange={(value) => onConfig("channel", value)} />
      </> : null}

      {rule.ruleKey === "OPPORTUNITY_STAGE_FOLLOW_UP" ? <>
        <NumberField label="Standart aşama gecikmesi (gün)" value={numeric(rule.config, "defaultDelayDays", 2)} disabled={!canManage || saving} min={1} max={90} onChange={(value) => onConfig("defaultDelayDays", value)} />
        <NumberField label="Negotiation gecikmesi (gün)" value={numeric(rule.config, "negotiationDelayDays", 1)} disabled={!canManage || saving} min={1} max={90} onChange={(value) => onConfig("negotiationDelayDays", value)} />
        <ChannelField value={channelOf(rule.config)} disabled={!canManage || saving} onChange={(value) => onConfig("channel", value)} />
      </> : null}

      {rule.ruleKey === "STALE_OPPORTUNITY_FOLLOW_UP" ? <>
        <NumberField label="Durağanlık eşiği (gün)" value={numeric(rule.config, "staleDays", 14)} disabled={!canManage || saving} min={1} max={90} onChange={(value) => onConfig("staleDays", value)} />
        <NumberField label="Görev gecikmesi (saat)" value={numeric(rule.config, "delayHours", 24)} disabled={!canManage || saving} min={1} max={720} onChange={(value) => onConfig("delayHours", value)} />
        <ChannelField value={channelOf(rule.config)} disabled={!canManage || saving} onChange={(value) => onConfig("channel", value)} />
      </> : null}
    </div>

    <div className="mt-5 flex items-center justify-between gap-3">
      <div className="min-w-0 rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)]/40 px-3 py-2.5">
        <p className="text-[9px] uppercase tracking-[.08em] text-[var(--muted-soft)]">Idempotency key</p>
        <code className="mt-1 block break-all text-[10px] text-[var(--ink)]">{meta.keyPattern}</code>
      </div>
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
