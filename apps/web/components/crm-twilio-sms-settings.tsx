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
      setError(requestError instanceof ApiError ? requestError.message : "SMS bağlantısı yüklenemedi.");
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
      showToast("SMS bağlantısı kaydedildi.");
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "SMS bağlantısı kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  if (!activeBranch) return null;

  return <section className="mb-6 space-y-3">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--accent)]">İletişim Kanalı</p>
        <h2 className="mt-1 text-[18px] font-semibold">SMS</h2>
        <p className="mt-1 text-[10px] text-[var(--muted)]">Gizli bağlantı bilgileri güvenli şekilde saklanır ve kaydedildikten sonra tekrar gösterilmez.</p>
      </div>
      {canManage ? <Button variant="secondary" onClick={openSettings}>{twilio ? "SMS Ayarları" : "+ SMS Bağla"}</Button> : null}
    </div>

    {loading ? <Spinner label="SMS bağlantısı yükleniyor..." /> : <GlassCard>
      <div className="grid gap-3 md:grid-cols-3">
        <div><p className="text-[10px] text-[var(--muted)]">Durum</p><strong className="mt-2 block text-[13px]">{twilio ? (twilio.enabled ? "Aktif" : "Pasif") : "Bağlı değil"}</strong></div>
        <div><p className="text-[10px] text-[var(--muted)]">Gönderici</p><strong className="mt-2 block text-[13px]">{String(twilio?.publicConfig.fromNumber ?? "—")}</strong></div>
        <div><p className="text-[10px] text-[var(--muted)]">Bağlantı Bilgileri</p><strong className="mt-2 block text-[13px]">{twilio?.credentialsConfigured ? "Hazır" : "Eksik"}</strong></div>
      </div>
      <p className="mt-3 text-[9px] text-[var(--muted)]">SMS gönderimi için uluslararası formatta bir gönderici numarası kullanılır.</p>
    </GlassCard>}

    <Modal open={open} onClose={() => !saving && setOpen(false)} title="SMS Bağlantısı">
      <div className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}
        <Field label="Gönderici Numara" required><TextInput value={form.fromNumber} placeholder="+905551112233" onChange={(event) => setForm((current) => ({ ...current, fromNumber: event.target.value }))} /></Field>
        <Field label="Hesap Kimliği" required><TextInput type="password" autoComplete="new-password" value={form.accountSid} onChange={(event) => setForm((current) => ({ ...current, accountSid: event.target.value }))} /></Field>
        <Field label="Güvenlik Anahtarı" required><TextInput type="password" autoComplete="new-password" value={form.authToken} onChange={(event) => setForm((current) => ({ ...current, authToken: event.target.value }))} /></Field>
        <label className="flex items-center gap-2 text-[11px]"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))} /> Bağlantı aktif</label>
        <Alert>Gönderici numarasını ülke koduyla birlikte girin (ör. +90…). Gizli bilgiler güvenli şekilde saklanır ve kaydettikten sonra tekrar gösterilmez.</Alert>
        <div className="flex justify-end gap-2"><Button variant="secondary" disabled={saving} onClick={() => setOpen(false)}>Vazgeç</Button><Button disabled={saving || !form.fromNumber || !form.accountSid || !form.authToken} onClick={() => void save()}>{saving ? "Kaydediliyor..." : "Bağlantıyı Kaydet"}</Button></div>
      </div>
    </Modal>
  </section>;
}
