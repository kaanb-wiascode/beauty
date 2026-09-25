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

type Form = {
  fromNumber: string;
  accountSid: string;
  authToken: string;
  enabled: boolean;
};

const EMPTY: Form = { fromNumber: "", accountSid: "", authToken: "", enabled: true };

export function CrmTwilioSmsSettings() {
  const activeBranch = hasActiveBranch();
  const canManage = hasPermission("crm", "manage");
  const { showToast } = useToast();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(activeBranch);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<Form>(EMPTY);

  const twilio = useMemo(
    () => connections.find((item) => item.providerKey === "twilio-sms" && item.channel === "SMS") ?? null,
    [connections],
  );

  const load = useCallback(async () => {
    if (!activeBranch) { setLoading(false); return; }
    setLoading(true);
    try {
      setConnections(await api<Connection[]>("/crm/message-provider-connections"));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Twilio bağlantısı yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [activeBranch]);

  useEffect(() => { void load(); }, [load]);

  function openSettings() {
    setError("");
    setForm({
      ...EMPTY,
      enabled: twilio?.enabled ?? true,
      fromNumber: String(twilio?.publicConfig.fromNumber ?? ""),
    });
    setOpen(true);
  }

  async function save() {
    if (!canManage || saving) return;
    setSaving(true);
    setError("");
    try {
      await api("/crm/message-provider-connections/twilio-sms", {
        method: "PATCH",
        body: {
          version: twilio?.version,
          enabled: form.enabled,
          fromNumber: form.fromNumber,
          accountSid: form.accountSid,
          authToken: form.authToken,
        },
      });
      setOpen(false);
      setForm(EMPTY);
      await load();
      showToast("Twilio SMS bağlantısı kaydedildi.");
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Twilio SMS bağlantısı kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  if (!activeBranch) return null;

  return <section className="mb-6 space-y-3">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--accent)]">SMS Provider</p>
        <h2 className="mt-1 text-[18px] font-semibold">Twilio SMS</h2>
        <p className="mt-1 text-[10px] text-[var(--muted)]">Account SID ve Auth Token şifreli vault&apos;ta tutulur; tekrar gösterilmez.</p>
      </div>
      {canManage ? <Button variant="secondary" onClick={openSettings}>{twilio ? "Twilio SMS Ayarları" : "+ Twilio SMS Bağla"}</Button> : null}
    </div>

    {loading ? <Spinner label="Twilio SMS bağlantısı yükleniyor..." /> : <GlassCard>
      <div className="grid gap-3 md:grid-cols-3">
        <div><p className="text-[10px] text-[var(--muted)]">Durum</p><strong className="mt-2 block text-[13px]">{twilio ? (twilio.enabled ? "Aktif" : "Pasif") : "Bağlı değil"}</strong></div>
        <div><p className="text-[10px] text-[var(--muted)]">Gönderici</p><strong className="mt-2 block text-[13px]">{String(twilio?.publicConfig.fromNumber ?? "—")}</strong></div>
        <div><p className="text-[10px] text-[var(--muted)]">Credential</p><strong className="mt-2 block text-[13px]">{twilio?.credentialsConfigured ? "Vault hazır" : "Yapılandırılmadı"}</strong></div>
      </div>
      <p className="mt-3 text-[9px] text-[var(--muted)]">SMS gönderimleri E.164 numara formatı ve branch-scoped connection kullanır.</p>
    </GlassCard>}

    <Modal open={open} onClose={() => !saving && setOpen(false)} title="Twilio SMS Bağlantısı">
      <div className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}
        <Field label="Gönderici Numara" required><TextInput value={form.fromNumber} placeholder="+905551112233" onChange={(event) => setForm((current) => ({ ...current, fromNumber: event.target.value }))} /></Field>
        <Field label="Account SID" required><TextInput type="password" autoComplete="new-password" value={form.accountSid} onChange={(event) => setForm((current) => ({ ...current, accountSid: event.target.value }))} /></Field>
        <Field label="Auth Token" required><TextInput type="password" autoComplete="new-password" value={form.authToken} onChange={(event) => setForm((current) => ({ ...current, authToken: event.target.value }))} /></Field>
        <label className="flex items-center gap-2 text-[11px]"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))} /> Bağlantı aktif</label>
        <Alert>Telefon numarası E.164 formatında olmalıdır. Secret alanları yalnız kaydetme sırasında gönderilir ve API response&apos;unda geri dönmez.</Alert>
        <div className="flex justify-end gap-2"><Button variant="secondary" disabled={saving} onClick={() => setOpen(false)}>Vazgeç</Button><Button disabled={saving || !form.fromNumber || !form.accountSid || !form.authToken} onClick={() => void save()}>{saving ? "Kaydediliyor..." : "Bağlantıyı Kaydet"}</Button></div>
      </div>
    </Modal>
  </section>;
}
