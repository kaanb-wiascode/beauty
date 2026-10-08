"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/modal";
import { Alert, Button, EmptyState, Field, GlassCard, Select, Spinner, TextArea, TextInput } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";

type Channel = "EMAIL" | "SMS" | "WHATSAPP";
type Direction = "INBOUND" | "OUTBOUND";
type Message = {
  id: string;
  direction: Direction;
  channel: Channel;
  status: "DRAFT" | "QUEUED" | "SENT" | "DELIVERED" | "FAILED" | "CANCELLED";
  providerKey: string | null;
  recipient: string;
  subject: string | null;
  body: string;
  errorMessage: string | null;
  version: number;
  sentAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
};
type ProviderStatus = {
  providers: Array<{ key: string; channels: Channel[] }>;
  supportedChannels: Channel[];
};
type ActionMode = "MANUAL_OUTBOUND" | "MANUAL_INBOUND" | "PROVIDER_SEND";

const channelLabels: Record<Channel, string> = {
  EMAIL: "E-posta",
  SMS: "SMS",
  WHATSAPP: "WhatsApp",
};
const statusLabels: Record<Message["status"], string> = {
  DRAFT: "Taslak",
  QUEUED: "Kuyrukta",
  SENT: "Gönderildi",
  DELIVERED: "Teslim / Gelen",
  FAILED: "Hata",
  CANCELLED: "İptal",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function CustomerCommunications({ customerId }: { customerId: string }) {
  const canRead = hasPermission("crm", "read");
  const canManage = hasPermission("crm", "manage");
  const { showToast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [providers, setProviders] = useState<ProviderStatus>({ providers: [], supportedChannels: ["EMAIL", "SMS", "WHATSAPP"] });
  const [loading, setLoading] = useState(canRead);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [mode, setMode] = useState<ActionMode>("MANUAL_OUTBOUND");
  const [channel, setChannel] = useState<Channel>("WHATSAPP");
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const load = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    setError("");
    try {
      const [rows, providerStatus] = await Promise.all([
        api<Message[]>(`/crm/messages?customerId=${customerId}&limit=50`),
        api<ProviderStatus>("/crm/messages/providers"),
      ]);
      setMessages(rows);
      setProviders(providerStatus);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "İletişim geçmişi yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [canRead, customerId]);

  useEffect(() => { void load(); }, [load]);

  const providerAvailable = useMemo(
    () => providers.providers.some((provider) => provider.channels.includes(channel)),
    [channel, providers.providers],
  );

  function resetForm() {
    setMode("MANUAL_OUTBOUND");
    setChannel("WHATSAPP");
    setRecipient("");
    setSubject("");
    setBody("");
    setFormError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canManage || saving || !body.trim()) return;
    setSaving(true);
    setFormError("");
    try {
      const common = {
        customerId,
        channel,
        recipient: recipient.trim() || undefined,
        subject: channel === "EMAIL" && subject.trim() ? subject.trim() : undefined,
        body: body.trim(),
      };
      if (mode === "PROVIDER_SEND") {
        if (!providerAvailable) throw new Error("Bu kanal için bağlı bir gönderim provider'ı yok.");
        const draft = await api<Message>("/crm/messages/drafts", { method: "POST", body: common });
        await api<Message>(`/crm/messages/${draft.id}/send`, { method: "POST", body: { version: draft.version } });
        showToast("Mesaj provider'a gönderildi.", "success");
      } else {
        await api<Message>("/crm/messages/manual", {
          method: "POST",
          body: {
            ...common,
            direction: mode === "MANUAL_INBOUND" ? "INBOUND" : "OUTBOUND",
          },
        });
        showToast(mode === "MANUAL_INBOUND" ? "Gelen iletişim kaydedildi." : "Gönderilen iletişim kaydedildi.", "success");
      }
      setOpen(false);
      resetForm();
      await load();
    } catch (requestError) {
      setFormError(requestError instanceof ApiError ? requestError.message : requestError instanceof Error ? requestError.message : "İletişim kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  if (!canRead) return null;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--accent)]">Communication Timeline</p>
          <h2 className="mt-1 text-[20px] font-semibold">Müşteri İletişimi</h2>
          <p className="mt-1 text-[11px] text-[var(--muted)]">WhatsApp, SMS ve e-posta temaslarını müşteri kaydıyla birlikte izleyin.</p>
        </div>
        {canManage ? <Button onClick={() => { resetForm(); setOpen(true); }}>+ İletişim Ekle</Button> : null}
      </div>

      {error ? <Alert>{error}</Alert> : null}
      {!providers.providers.length ? (
        <Alert>Henüz harici WhatsApp/SMS/e-posta provider&apos;ı bağlı değil. Gerçekte dışarıda yapılan görüşmeleri manuel olarak kaydedebilirsiniz; sistem provider olmadan mesajı gönderilmiş saymaz.</Alert>
      ) : null}

      {loading ? <Spinner label="İletişim geçmişi yükleniyor..." /> : messages.length ? (
        <GlassCard className="p-0">
          <div className="divide-y divide-[var(--line)]">
            {messages.map((message) => (
              <article key={message.id} className="grid gap-3 px-5 py-4 md:grid-cols-[100px_110px_minmax(0,1fr)_170px] md:items-start">
                <span className="w-fit rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--accent)]">{channelLabels[message.channel]}</span>
                <div><p className="text-[10px] font-semibold">{message.direction === "INBOUND" ? "Gelen" : "Giden"}</p><p className="mt-1 text-[9px] text-[var(--muted)]">{statusLabels[message.status]}</p></div>
                <div className="min-w-0"><p className="text-[11px] font-semibold">{message.subject || message.recipient}</p><p className="mt-1 whitespace-pre-wrap break-words text-[11px] leading-5 text-[var(--muted)]">{message.body}</p>{message.errorMessage ? <p className="mt-2 text-[10px] text-[#9c513f]">{message.errorMessage}</p> : null}<p className="mt-2 text-[9px] text-[var(--muted-soft)]">Provider: {message.providerKey || "—"}</p></div>
                <time className="text-[9px] text-[var(--muted)]">{formatDate(message.sentAt || message.createdAt)}</time>
              </article>
            ))}
          </div>
        </GlassCard>
      ) : <EmptyState title="İletişim Kaydı Yok" description="Bu müşteri için henüz CRM iletişim geçmişi bulunmuyor." />}

      <Modal open={open} onClose={() => !saving && setOpen(false)} title="Müşteri İletişimi Ekle">
        <form onSubmit={submit} className="space-y-4">
          {formError ? <Alert>{formError}</Alert> : null}
          <Field label="İşlem" required>
            <Select value={mode} disabled={saving} onChange={(event) => setMode(event.target.value as ActionMode)}>
              <option value="MANUAL_OUTBOUND">Dışarıda gönderildi — kaydet</option>
              <option value="MANUAL_INBOUND">Gelen iletişim — kaydet</option>
              <option value="PROVIDER_SEND" disabled={!providerAvailable}>Provider ile şimdi gönder{providerAvailable ? "" : " (bağlı değil)"}</option>
            </Select>
          </Field>
          <Field label="Kanal" required>
            <Select value={channel} disabled={saving} onChange={(event) => setChannel(event.target.value as Channel)}>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="SMS">SMS</option>
              <option value="EMAIL">E-posta</option>
            </Select>
          </Field>
          <Field label="Alıcı (opsiyonel)">
            <TextInput value={recipient} disabled={saving} maxLength={320} placeholder={channel === "EMAIL" ? "Boşsa müşteri e-postası kullanılır" : "Boşsa müşteri telefonu kullanılır"} onChange={(event) => setRecipient(event.target.value)} />
          </Field>
          {channel === "EMAIL" ? <Field label="Konu"><TextInput value={subject} disabled={saving} maxLength={300} onChange={(event) => setSubject(event.target.value)} /></Field> : null}
          <Field label="Mesaj / Görüşme Notu" required>
            <TextArea rows={5} value={body} disabled={saving} maxLength={10000} onChange={(event) => setBody(event.target.value)} />
          </Field>
          <div className="flex justify-end gap-3"><Button type="button" variant="secondary" disabled={saving} onClick={() => setOpen(false)}>Vazgeç</Button><Button type="submit" disabled={saving || !body.trim()}>{saving ? "Kaydediliyor..." : mode === "PROVIDER_SEND" ? "Gönder" : "Kaydet"}</Button></div>
        </form>
      </Modal>
    </section>
  );
}
