"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Field, GlassCard, PageHeader, Spinner, TextInput } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, ApiError } from "@/lib/api";
import { hasActiveBranch, hasPermission } from "@/lib/auth";

type Summary = {
  totalThreads: number;
  unreadThreads: number;
  unreadMessages: number;
  awaitingResponse: number;
  breachedTarget: number;
  criticalBreached: number;
  whatsappAwaiting: number;
  smsAwaiting: number;
  emailAwaiting: number;
  oldestAwaitingMinutes: number;
  whatsappTargetMinutes: number;
  smsTargetMinutes: number;
  emailTargetMinutes: number;
  criticalAfterMinutes: number;
};

type Policy = {
  id: string | null;
  whatsappTargetMinutes: number;
  smsTargetMinutes: number;
  emailTargetMinutes: number;
  criticalAfterMinutes: number;
  version: number;
};

function waitLabel(minutes: number) {
  if (minutes < 60) return `${minutes} dk`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} sa`;
  return `${Math.floor(minutes / 1440)} gün`;
}

export default function CrmConversationAnalyticsPage() {
  const canRead = hasPermission("crm", "read");
  const canManage = hasPermission("crm", "manage");
  const activeBranch = hasActiveBranch();
  const { showToast } = useToast();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!canRead || !activeBranch) { setLoading(false); return; }
    setLoading(true);
    setError("");
    try {
      const [metrics, currentPolicy] = await Promise.all([
        api<Summary>("/crm/conversation-analytics/summary"),
        api<Policy>("/crm/conversation-operations/sla-policy"),
      ]);
      setSummary(metrics);
      setPolicy(currentPolicy);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Konuşma analitiği yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [activeBranch, canRead]);

  useEffect(() => { void load(); }, [load]);

  async function savePolicy() {
    if (!canManage || !policy || saving) return;
    setSaving(true);
    setError("");
    try {
      const saved = await api<Policy>("/crm/conversation-operations/sla-policy", {
        method: "PATCH",
        body: {
          version: policy.version,
          whatsappTargetMinutes: policy.whatsappTargetMinutes,
          smsTargetMinutes: policy.smsTargetMinutes,
          emailTargetMinutes: policy.emailTargetMinutes,
          criticalAfterMinutes: policy.criticalAfterMinutes,
        },
      });
      setPolicy(saved);
      showToast("Conversation SLA policy kaydedildi.");
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "SLA policy kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  function updatePolicy(key: keyof Pick<Policy, "whatsappTargetMinutes" | "smsTargetMinutes" | "emailTargetMinutes" | "criticalAfterMinutes">, value: string) {
    setPolicy((current) => current ? { ...current, [key]: Math.max(0, Number(value) || 0) } : current);
  }

  return <div className="space-y-6">
    <PageHeader
      title="Conversation SLA Analytics"
      description="Şubenin WhatsApp, SMS ve e-posta konuşmalarında cevap yükünü ve SLA riskini tüm kayıtlar üzerinden izleyin."
      action={<div className="flex gap-2"><Link href="/crm/conversations"><Button variant="secondary">Inbox</Button></Link><Button variant="secondary" onClick={() => void load()}>Yenile</Button></div>}
    />
    {!activeBranch ? <Alert>Conversation analytics için aktif şube seçin.</Alert> : null}
    {!canRead ? <Alert>Bu ekran için crm.read yetkisi gerekir.</Alert> : null}
    {error ? <Alert>{error}</Alert> : null}
    {loading ? <Spinner label="Conversation SLA metrikleri yükleniyor..." /> : summary ? <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <GlassCard><p className="text-[10px] text-[var(--muted)]">Toplam Konuşma</p><strong className="mt-2 block text-[22px]">{summary.totalThreads}</strong></GlassCard>
        <GlassCard><p className="text-[10px] text-[var(--muted)]">Okunmamış Thread</p><strong className="mt-2 block text-[22px]">{summary.unreadThreads}</strong><p className="mt-1 text-[9px] text-[var(--muted)]">{summary.unreadMessages} mesaj</p></GlassCard>
        <GlassCard><p className="text-[10px] text-[var(--muted)]">Cevap Bekleyen</p><strong className="mt-2 block text-[22px]">{summary.awaitingResponse}</strong></GlassCard>
        <GlassCard><p className="text-[10px] text-[var(--muted)]">SLA İhlali</p><strong className="mt-2 block text-[22px]">{summary.breachedTarget}</strong></GlassCard>
        <GlassCard><p className="text-[10px] text-[var(--muted)]">Kritik İhlal</p><strong className="mt-2 block text-[22px]">{summary.criticalBreached}</strong></GlassCard>
        <GlassCard><p className="text-[10px] text-[var(--muted)]">En Eski Bekleyen</p><strong className="mt-2 block text-[22px]">{waitLabel(summary.oldestAwaitingMinutes)}</strong></GlassCard>
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        <GlassCard><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--accent)]">WhatsApp</p><strong className="mt-3 block text-[28px]">{summary.whatsappAwaiting}</strong><p className="mt-1 text-[10px] text-[var(--muted)]">cevap bekleyen · hedef {waitLabel(summary.whatsappTargetMinutes)}</p></GlassCard>
        <GlassCard><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--accent)]">SMS</p><strong className="mt-3 block text-[28px]">{summary.smsAwaiting}</strong><p className="mt-1 text-[10px] text-[var(--muted)]">cevap bekleyen · hedef {waitLabel(summary.smsTargetMinutes)}</p></GlassCard>
        <GlassCard><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--accent)]">E-posta</p><strong className="mt-3 block text-[28px]">{summary.emailAwaiting}</strong><p className="mt-1 text-[10px] text-[var(--muted)]">cevap bekleyen · hedef {waitLabel(summary.emailTargetMinutes)}</p></GlassCard>
      </section>

      {policy ? <GlassCard>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><h2 className="text-[14px] font-semibold">Branch SLA Policy</h2><p className="mt-1 text-[10px] text-[var(--muted)]">Dakika cinsinden cevap hedefleri. Kritik eşik tüm kanallara uygulanır. Version {policy.version}.</p></div>
          {canManage ? <Button disabled={saving} onClick={() => void savePolicy()}>{saving ? "Kaydediliyor..." : "SLA Policy Kaydet"}</Button> : null}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="WhatsApp hedef (dk)"><TextInput type="number" min={5} max={10080} disabled={!canManage} value={policy.whatsappTargetMinutes} onChange={(event) => updatePolicy("whatsappTargetMinutes", event.target.value)} /></Field>
          <Field label="SMS hedef (dk)"><TextInput type="number" min={5} max={10080} disabled={!canManage} value={policy.smsTargetMinutes} onChange={(event) => updatePolicy("smsTargetMinutes", event.target.value)} /></Field>
          <Field label="E-posta hedef (dk)"><TextInput type="number" min={5} max={10080} disabled={!canManage} value={policy.emailTargetMinutes} onChange={(event) => updatePolicy("emailTargetMinutes", event.target.value)} /></Field>
          <Field label="Kritik eşik (dk)"><TextInput type="number" min={30} max={43200} disabled={!canManage} value={policy.criticalAfterMinutes} onChange={(event) => updatePolicy("criticalAfterMinutes", event.target.value)} /></Field>
        </div>
      </GlassCard> : null}

      <Alert tone={summary.criticalBreached > 0 ? undefined : "success"}>
        {summary.criticalBreached > 0
          ? `${summary.criticalBreached} konuşma branch kritik SLA eşiğini aştı. Öncelikli olarak Unified Inbox üzerinden ele alınmalı.`
          : "Kritik conversation SLA ihlali yok."}
      </Alert>
    </> : null}
  </div>;
}
