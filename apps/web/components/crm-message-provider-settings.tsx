"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/modal";
import { Alert, Button, Field, GlassCard, Spinner, TextInput } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, ApiError } from "@/lib/api";
import { hasActiveBranch, hasPermission } from "@/lib/auth";

type Connection = {
  id: string;
  providerKey: string;
  channel: "EMAIL" | "SMS" | "WHATSAPP";
  enabled: boolean;
  publicConfig: Record<string, unknown>;
  version: number;
  credentialsConfigured: boolean;
  updatedAt: string;
};

type FormState = {
  phoneNumberId: string;
  graphApiVersion: string;
  accessToken: string;
  appSecret: string;
  verifyToken: string;
  enabled: boolean;
};

const EMPTY_FORM: FormState = {
  phoneNumberId: "",
  graphApiVersion: "v23.0",
  accessToken: "",
  appSecret: "",
  verifyToken: "",
  enabled: true,
};

export function CrmMessageProviderSettings() {
  const activeBranch = hasActiveBranch();
  const canManage = hasPermission("crm", "manage");
  const { showToast } = useToast();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(activeBranch);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const meta = useMemo(
    () => connections.find((item) => item.providerKey === "meta-whatsapp" && item.channel === "WHATSAPP") ?? null,
    [connections],
  );

  const load = useCallback(async () => {
    if (!activeBranch) { setLoading(false); return; }
    setLoading(true);
    try {
      setConnections(await api<Connection[]>("/crm/message-provider-connections"));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Provider bağlantıları yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [activeBranch]);

  useEffect(() => { void load(); }, [load]);

  function openMeta() {
    setError("");
    setForm({
      ...EMPTY_FORM,
      enabled: meta?.enabled ?? true,
      phoneNumberId: String(meta?.publicConfig.phoneNumberId ?? ""),
      graphApiVersion: String(meta?.publicConfig.graphApiVersion ?? "v23.0"),
    });
    setOpen(true);
  }

  async function save() {
    if (!canManage || saving) return;
    setSaving(true);
    setError("");
    try {
      await api("/crm/message-provider-connections/meta-whatsapp", {
        method: "PATCH",
        body: {
          version: meta?.version,
          enabled: form.enabled,
          phoneNumberId: form.phoneNumberId,
          graphApiVersion: form.graphApiVersion,
          accessToken: form.accessToken,
          appSecret: form.appSecret,
          verifyToken: form.verifyToken,
        },
      });
      setOpen(false);
      setForm(EMPTY_FORM);
      await load();
      showToast("Meta WhatsApp bağlantısı kaydedildi.");
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Meta WhatsApp bağlantısı kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  if (!activeBranch) return null;

  return <section className="mb-6 space-y-3">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--accent)]">Provider Bağlantıları</p>
        <h2 className="mt-1 text-[18px] font-semibold">CRM İletişim Kanalları</h2>
        <p className="mt-1 text-[10px] text-[var(--muted)]">Credential değerleri şifreli vault&apos;ta tutulur ve kaydedildikten sonra tekrar gösterilmez.</p>
      </div>
      {canManage ? <Button variant="secondary" onClick={openMeta}>{meta ? "Meta WhatsApp Ayarları" : "+ Meta WhatsApp Bağla"}</Button> : null}
    </div>

    {loading ? <Spinner label="Provider bağlantıları yükleniyor..." /> : (
      <div className="grid gap-3 md:grid-cols-3">
        <GlassCard>
          <p className="text-[10px] text-[var(--muted)]">Meta WhatsApp Cloud</p>
          <strong className="mt-2 block text-[13px]">{meta ? (meta.enabled ? "Aktif" : "Pasif") : "Bağlı değil"}</strong>
          <p className="mt-2 text-[10px] text-[var(--muted)]">{meta?.credentialsConfigured ? "Credential vault hazır" : "Credential yapılandırılmadı"}</p>
          {meta ? <p className="mt-1 text-[9px] text-[var(--muted-soft)]">Phone Number ID: {String(meta.publicConfig.phoneNumberId ?? "—")} · v{meta.version}</p> : null}
        </GlassCard>
        <GlassCard><p className="text-[10px] text-[var(--muted)]">Webhook Callback</p><code className="mt-2 block break-all text-[10px]">/crm/messages/webhooks/meta-whatsapp</code><p className="mt-2 text-[9px] text-[var(--muted)]">GET verification challenge + imzalı POST callback desteklenir.</p></GlassCard>
        <GlassCard><p className="text-[10px] text-[var(--muted)]">Desteklenen Akış</p><strong className="mt-2 block text-[12px]">Text outbound + delivery receipts</strong><p className="mt-2 text-[9px] text-[var(--muted)]">Inbound subject eşleşmesi açıkça çözülemezse güvenli biçimde ignored kalır.</p></GlassCard>
      </div>
    )}

    <Modal open={open} onClose={() => !saving && setOpen(false)} title="Meta WhatsApp Cloud Bağlantısı">
      <div className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}
        <Field label="Phone Number ID" required><TextInput value={form.phoneNumberId} onChange={(event) => setForm((current) => ({ ...current, phoneNumberId: event.target.value }))} /></Field>
        <Field label="Graph API Version" required><TextInput value={form.graphApiVersion} placeholder="v23.0" onChange={(event) => setForm((current) => ({ ...current, graphApiVersion: event.target.value }))} /></Field>
        <Field label="Access Token" required><TextInput type="password" autoComplete="new-password" value={form.accessToken} onChange={(event) => setForm((current) => ({ ...current, accessToken: event.target.value }))} /></Field>
        <Field label="App Secret" required><TextInput type="password" autoComplete="new-password" value={form.appSecret} onChange={(event) => setForm((current) => ({ ...current, appSecret: event.target.value }))} /></Field>
        <Field label="Webhook Verify Token" required><TextInput type="password" autoComplete="new-password" value={form.verifyToken} onChange={(event) => setForm((current) => ({ ...current, verifyToken: event.target.value }))} /></Field>
        <label className="flex items-center gap-2 text-[11px]"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))} /> Bağlantı aktif</label>
        <Alert>Kaydetme sırasında `CRM_COMMUNICATION_MASTER_KEY` sunucuda yapılandırılmış olmalıdır. Secret değerleri API response&apos;larında geri dönmez.</Alert>
        <div className="flex justify-end gap-2"><Button variant="secondary" disabled={saving} onClick={() => setOpen(false)}>Vazgeç</Button><Button disabled={saving || !form.phoneNumberId || !form.accessToken || !form.appSecret || !form.verifyToken} onClick={() => void save()}>{saving ? "Kaydediliyor..." : "Bağlantıyı Kaydet"}</Button></div>
      </div>
    </Modal>
  </section>;
}
