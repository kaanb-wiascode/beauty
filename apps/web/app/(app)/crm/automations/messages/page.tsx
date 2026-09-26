"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Field, GlassCard, PageHeader, Select, Spinner, TextArea } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasActiveBranch, hasPermission } from "@/lib/auth";

type RuleKey = "LEAD_FIRST_TOUCH" | "OPPORTUNITY_STAGE_FOLLOW_UP";
type MessageChannel = "WHATSAPP" | "SMS" | "EMAIL";
type Rule = { ruleKey: string; enabled: boolean; config: Record<string, unknown>; version: number; overridden: boolean };

const META: Record<RuleKey, { title: string; description: string }> = {
  LEAD_FIRST_TOUCH: { title: "Yeni Lead → Mesaj", description: "İlk temas follow-up kuralı işlendiğinde aynı source event için kontrollü mesaj aksiyonu üretir." },
  OPPORTUNITY_STAGE_FOLLOW_UP: { title: "Aşama Değişimi → Mesaj", description: "Açık fırsat aşama değiştirdiğinde takip görevinin yanında opsiyonel müşteri mesajı üretir." },
};

function enabled(rule: Rule) { return rule.config.messageEnabled === true; }
function channel(rule: Rule): MessageChannel {
  const value = String(rule.config.messageChannel ?? "WHATSAPP");
  return value === "SMS" || value === "EMAIL" ? value : "WHATSAPP";
}
function template(rule: Rule) { return String(rule.config.messageTemplate ?? ""); }

export default function CrmAutomationMessagesPage() {
  const activeBranch = hasActiveBranch();
  const canManage = hasPermission("crm", "manage");
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    if (!activeBranch) { setLoading(false); return; }
    setLoading(true);
    try {
      const rows = await api<Rule[]>("/crm/automation-rules");
      setRules(rows.filter((rule) => rule.ruleKey === "LEAD_FIRST_TOUCH" || rule.ruleKey === "OPPORTUNITY_STAGE_FOLLOW_UP"));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Mesaj otomasyonları yüklenemedi.");
    } finally { setLoading(false); }
  }, [activeBranch]);

  useEffect(() => { void load(); }, [load]);

  function patch(ruleKey: string, configPatch: Record<string, unknown>) {
    setRules((current) => current.map((rule) => rule.ruleKey === ruleKey ? { ...rule, config: { ...rule.config, ...configPatch } } : rule));
  }

  async function save(rule: Rule) {
    if (!canManage || saving) return;
    setSaving(rule.ruleKey);
    setError("");
    setSuccess("");
    try {
      const updated = await api<Rule>(`/crm/automation-rules/${rule.ruleKey}`, {
        method: "PATCH",
        body: { enabled: rule.enabled, version: rule.version, config: rule.config },
      });
      setRules((current) => current.map((item) => item.ruleKey === updated.ruleKey ? updated : item));
      setSuccess(`${META[rule.ruleKey as RuleKey].title} ayarları kaydedildi.`);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Mesaj otomasyonu kaydedilemedi.");
      await load();
    } finally { setSaving(null); }
  }

  return <div className="space-y-6">
    <PageHeader title="CRM Mesaj Otomasyonları" description="Follow-up otomasyonlarının yanında kontrollü WhatsApp, SMS veya e-posta aksiyonu çalıştırın." action={<Link href="/crm/automations"><Button variant="secondary">Otomasyon Merkezi</Button></Link>} />
    {!activeBranch ? <Alert>Mesaj otomasyonlarını yönetmek için aktif bir şube seçin.</Alert> : null}
    {activeBranch && !canManage ? <Alert>Bu ekranı görüntüleyebilirsiniz; değiştirmek için crm.manage yetkisi gerekir.</Alert> : null}
    {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
    {success ? <Alert tone="success" onClose={() => setSuccess("")}>{success}</Alert> : null}
    <Alert>Mesaj aksiyonları varsayılan olarak kapalıdır. Provider veya alıcı bulunamazsa sistem mesajı gönderilmiş saymaz; CRM message kaydı FAILED/skip audit ile korunur.</Alert>

    {loading ? <Spinner label="Mesaj otomasyonları yükleniyor..." /> : null}
    {!loading && activeBranch ? <section className="grid gap-4 xl:grid-cols-2">{rules.map((rule) => {
      const key = rule.ruleKey as RuleKey;
      return <GlassCard key={rule.ruleKey}>
        <div className="flex items-start justify-between gap-4">
          <div><h2 className="text-[16px] font-semibold">{META[key].title}</h2><p className="mt-2 text-[12px] leading-5 text-[var(--muted)]">{META[key].description}</p></div>
          <label className="flex items-center gap-2 text-[12px] font-medium"><input type="checkbox" checked={enabled(rule)} disabled={!canManage || Boolean(saving)} onChange={(event) => patch(rule.ruleKey, { messageEnabled: event.target.checked })} />Mesaj Gönder</label>
        </div>
        <div className="mt-5 grid gap-4">
          <Field label="Mesaj kanalı"><Select value={channel(rule)} disabled={!canManage || Boolean(saving)} onChange={(event) => patch(rule.ruleKey, { messageChannel: event.target.value as MessageChannel })}><option value="WHATSAPP">WhatsApp</option><option value="SMS">SMS</option><option value="EMAIL">E-posta</option></Select></Field>
          <Field label="Mesaj şablonu"><TextArea rows={5} maxLength={2000} value={template(rule)} disabled={!canManage || Boolean(saving)} onChange={(event) => patch(rule.ruleKey, { messageTemplate: event.target.value })} /></Field>
        </div>
        <div className="mt-5 flex items-center justify-between gap-3"><span className="text-[10px] text-[var(--muted)]">{rule.overridden ? `Branch override · v${rule.version}` : "Sistem varsayılanı"}</span>{canManage ? <Button disabled={Boolean(saving)} onClick={() => void save(rule)}>{saving === rule.ruleKey ? "Kaydediliyor..." : "Kaydet"}</Button> : null}</div>
      </GlassCard>;
    })}</section> : null}
  </div>;
}
