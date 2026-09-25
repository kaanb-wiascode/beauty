"use client";

import { useEffect, useState } from "react";
import { CustomerSearchPicker } from "@/components/customer-search-picker";
import { Alert, Button, Field, GlassCard, PageHeader, Select, Spinner, TextArea } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasActiveBranch, hasPermission } from "@/lib/auth";

type Customer = { id: string; firstName: string; lastName: string; phone: string | null; email: string | null };
type Channel = "WHATSAPP" | "SMS" | "EMAIL";
type Status = "OPTED_IN" | "OPTED_OUT" | "UNKNOWN";
const statusLabels: Record<Status, string> = { OPTED_IN: "İzin var", OPTED_OUT: "İzin yok", UNKNOWN: "Belirtilmemiş" };
type Permission = { id: string; channel: Channel; status: Status; source: string; reason: string | null; changedAt: string };

const CHANNELS: Array<{ value: Channel; label: string }> = [
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "SMS", label: "SMS" },
  { value: "EMAIL", label: "E-posta" },
];

export default function CrmCompliancePage() {
  const activeBranch = hasActiveBranch();
  const canManage = hasPermission("crm", "manage");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<Channel | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [drafts, setDrafts] = useState<Record<Channel, { status: Status; reason: string }>>({
    WHATSAPP: { status: "UNKNOWN", reason: "" },
    SMS: { status: "UNKNOWN", reason: "" },
    EMAIL: { status: "UNKNOWN", reason: "" },
  });

  useEffect(() => {
    if (!customer) { setPermissions([]); return; }
    let cancelled = false;
    setLoading(true);
    setError("");
    void api<Permission[]>(`/crm/contact-permissions/CUSTOMER/${customer.id}`)
      .then((rows) => {
        if (cancelled) return;
        setPermissions(rows);
        setDrafts((current) => {
          const next = { ...current };
          for (const channel of CHANNELS) {
            const row = rows.find((item) => item.channel === channel.value);
            next[channel.value] = { status: row?.status ?? "UNKNOWN", reason: row?.reason ?? "" };
          }
          return next;
        });
      })
      .catch((requestError) => { if (!cancelled) setError(requestError instanceof ApiError ? requestError.message : "İletişim izinleri yüklenemedi."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [customer]);

  async function save(channel: Channel) {
    if (!customer || !canManage || saving) return;
    setSaving(channel);
    setError("");
    setSuccess("");
    try {
      const draft = drafts[channel];
      await api(`/crm/contact-permissions/CUSTOMER/${customer.id}/${channel}`, {
        method: "PATCH",
        body: { status: draft.status, source: "MANUAL", reason: draft.reason.trim() || null },
      });
      const rows = await api<Permission[]>(`/crm/contact-permissions/CUSTOMER/${customer.id}`);
      setPermissions(rows);
      setSuccess(`${channel} iletişim izni güncellendi.`);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "İletişim izni kaydedilemedi.");
    } finally { setSaving(null); }
  }

  return <div className="space-y-6">
    <PageHeader title="İletişim İzinleri" description="Müşteri bazında WhatsApp, SMS ve e-posta iletişim izinlerini yönetin. Otomatik mesajlar yalnız açıkça izin verilen kanallardan gönderilir." />
    {!activeBranch ? <Alert>İletişim izinlerini yönetmek için aktif bir şube seçin.</Alert> : null}
    {activeBranch && !canManage ? <Alert>İzinleri görüntüleyebilirsiniz; değiştirmek için müşteri ilişkileri yönetim yetkisi gerekir.</Alert> : null}
    {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
    {success ? <Alert tone="success" onClose={() => setSuccess("")}>{success}</Alert> : null}
    <Alert>İzin durumu belirtilmemişse iletişim izni verilmiş sayılmaz. Otomatik mesaj gönderimi için müşterinin ilgili kanala açıkça izin vermiş olması gerekir. Her değişiklik denetim geçmişine kaydedilir.</Alert>

    <GlassCard>
      <Field label="Müşteri">
        <CustomerSearchPicker selected={customer} disabled={!activeBranch || loading} onSelect={setCustomer} />
      </Field>
    </GlassCard>

    {loading ? <Spinner label="İletişim izinleri yükleniyor..." /> : null}
    {!loading && customer ? <section className="grid gap-4 xl:grid-cols-3">{CHANNELS.map((channel) => {
      const draft = drafts[channel.value];
      const current = permissions.find((item) => item.channel === channel.value);
      return <GlassCard key={channel.value}>
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--accent)]">{channel.label}</p><h2 className="mt-1 text-[16px] font-semibold">{customer.firstName} {customer.lastName}</h2></div>
          <span className="rounded-full border border-[var(--line)] px-2 py-1 text-[9px] font-semibold">{statusLabels[current?.status ?? "UNKNOWN"]}</span>
        </div>
        <div className="mt-5 space-y-4">
          <Field label="İzin durumu">
            <Select value={draft.status} disabled={!canManage || Boolean(saving)} onChange={(event) => setDrafts((prev) => ({ ...prev, [channel.value]: { ...prev[channel.value], status: event.target.value as Status } }))}>
              <option value="OPTED_IN">İzin var</option><option value="OPTED_OUT">İzin yok</option><option value="UNKNOWN">Belirtilmemiş</option>
            </Select>
          </Field>
          <Field label="Gerekçe / kaynak notu"><TextArea rows={4} maxLength={1000} value={draft.reason} disabled={!canManage || Boolean(saving)} onChange={(event) => setDrafts((prev) => ({ ...prev, [channel.value]: { ...prev[channel.value], reason: event.target.value } }))} /></Field>
          {current ? <p className="text-[10px] text-[var(--muted)]">Son değişiklik: {new Date(current.changedAt).toLocaleString("tr-TR")} · {current.source === "MANUAL" ? "Elle güncellendi" : "Sistem tarafından güncellendi"}</p> : <p className="text-[10px] text-[var(--muted)]">Henüz açık bir izin kaydı bulunmuyor.</p>}
          {canManage ? <Button className="w-full" disabled={Boolean(saving)} onClick={() => void save(channel.value)}>{saving === channel.value ? "Kaydediliyor..." : "Kaydet"}</Button> : null}
        </div>
      </GlassCard>;
    })}</section> : null}
  </div>;
}
