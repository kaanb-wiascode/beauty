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
};

type Form = { fromEmail: string; fromName: string; apiKey: string; enabled: boolean };
const EMPTY: Form = { fromEmail: "", fromName: "", apiKey: "", enabled: true };

export function CrmResendEmailSettings() {
  const activeBranch = hasActiveBranch();
  const canManage = hasPermission("crm", "manage");
  const { showToast } = useToast();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(activeBranch);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<Form>(EMPTY);

  const resend = useMemo(
    () => connections.find((item) => item.providerKey === "resend-email" && item.channel === "EMAIL") ?? null,
    [connections],
  );

  const load = useCallback(async () => {
    if (!activeBranch) { setLoading(false); return; }
    setLoading(true);
    try {
      setConnections(await api<Connection[]>("/crm/message-provider-connections"));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "E-posta bağlantısı yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [activeBranch]);

  useEffect(() => { void load(); }, [load]);

  function openSettings() {
    setError("");
    setForm({
      ...EMPTY,
      enabled: resend?.enabled ?? true,
      fromEmail: String(resend?.publicConfig.fromEmail ?? ""),
      fromName: String(resend?.publicConfig.fromName ?? ""),
    });
    setOpen(true);
  }

  async function save() {
    if (!canManage || saving) return;
    setSaving(true);
    setError("");
    try {
      await api("/crm/message-provider-connections/resend-email", {
        method: "PATCH",
        body: {
          version: resend?.version,
          enabled: form.enabled,
          fromEmail: form.fromEmail,
          fromName: form.fromName,
          apiKey: form.apiKey,
        },
      });
      setOpen(false);
      setForm(EMPTY);
      await load();
      showToast("Resend e-posta bağlantısı kaydedildi.");
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "E-posta bağlantısı kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  if (!activeBranch) return null;

  return <section className="mb-6 space-y-3">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--accent)]">E-posta Provider</p>
        <h2 className="mt-1 text-[18px] font-semibold">Resend E-posta</h2>
        <p className="mt-1 text-[10px] text-[var(--muted)]">API key şifreli vault&apos;ta tutulur; branch dışına çıkmaz ve response&apos;larda gösterilmez.</p>
      </div>
      {canManage ? <Button variant="secondary" onClick={openSettings}>{resend ? "E-posta Ayarları" : "+ E-posta Bağla"}</Button> : null}
    </div>

    {loading ? <Spinner label="E-posta bağlantısı yükleniyor..." /> : <GlassCard>
      <div className="grid gap-3 md:grid-cols-3">
        <div><p className="text-[10px] text-[var(--muted)]">Durum</p><strong className="mt-2 block text-[13px]">{resend ? (resend.enabled ? "Aktif" : "Pasif") : "Bağlı değil"}</strong></div>
        <div><p className="text-[10px] text-[var(--muted)]">Gönderici</p><strong className="mt-2 block text-[13px]">{String(resend?.publicConfig.fromEmail ?? "—")}</strong></div>
        <div><p className="text-[10px] text-[var(--muted)]">Credential</p><strong className="mt-2 block text-[13px]">{resend?.credentialsConfigured ? "Vault hazır" : "Yapılandırılmadı"}</strong></div>
      </div>
      <p className="mt-3 text-[9px] text-[var(--muted)]">Otomasyon mesajları yalnız açık iletişim izni varsa e-posta provider&apos;ına ulaşır.</p>
    </GlassCard>}

    <Modal open={open} onClose={() => !saving && setOpen(false)} title="Resend E-posta Bağlantısı">
      <div className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}
        <Field label="Gönderici E-posta" required><TextInput type="email" value={form.fromEmail} placeholder="hello@marka.com" onChange={(event) => setForm((current) => ({ ...current, fromEmail: event.target.value }))} /></Field>
        <Field label="Gönderici Adı"><TextInput value={form.fromName} placeholder="Beauty ERP" onChange={(event) => setForm((current) => ({ ...current, fromName: event.target.value }))} /></Field>
        <Field label="Resend API Key" required><TextInput type="password" autoComplete="new-password" value={form.apiKey} onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))} /></Field>
        <label className="flex items-center gap-2 text-[11px]"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))} /> Bağlantı aktif</label>
        <Alert>Gönderici domain&apos;i Resend üzerinde doğrulanmış olmalıdır. API key yalnız kaydetme sırasında gönderilir ve tekrar gösterilmez.</Alert>
        <div className="flex justify-end gap-2"><Button variant="secondary" disabled={saving} onClick={() => setOpen(false)}>Vazgeç</Button><Button disabled={saving || !form.fromEmail || !form.apiKey} onClick={() => void save()}>{saving ? "Kaydediliyor..." : "Bağlantıyı Kaydet"}</Button></div>
      </div>
    </Modal>
  </section>;
}
