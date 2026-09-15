"use client";

import { useEffect, useMemo, useState } from "react";

import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";
import { hasActiveBranch, hasPermission } from "@/lib/auth";
import type { Customer, Paginated, Visit } from "@/lib/types";

type Channel = "WHATSAPP" | "SMS" | "EMAIL";
type ConfirmationStatus = "PENDING" | "CONFIRMED" | "RESCHEDULE_REQUESTED" | "CANCEL_REQUESTED";
type Upcoming = {
  id: string;
  customerId: string;
  startAt: string;
  appointmentStatus: string;
  customerName: string;
  serviceName: string;
  staffName: string;
  confirmationStatus: ConfirmationStatus;
  confirmationNote: string | null;
  lastReminderMessageId: string | null;
  lastReminderSentAt: string | null;
  version: number;
};

const confirmationLabels: Record<ConfirmationStatus, string> = {
  PENDING: "Bekliyor",
  CONFIRMED: "Onayladı",
  RESCHEDULE_REQUESTED: "Tarih değişikliği istiyor",
  CANCEL_REQUESTED: "İptal istiyor",
};

export default function OperationsEngagementPage() {
  const canUpdate = hasPermission("appointments", "update");
  const [upcoming, setUpcoming] = useState<Upcoming[]>([]);
  const [checkouts, setCheckouts] = useState<Visit[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [channel, setChannel] = useState<Channel>("WHATSAPP");
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    if (!hasActiveBranch()) {
      setLoading(false);
      setError("Müşteri iletişimi için önce aktif bir şube seçin.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [appointmentRows, visitRows, customerRows] = await Promise.all([
        api<Upcoming[]>("/operations/customer-engagement/upcoming?days=7"),
        api<Visit[]>(withQuery("/visits", { status: "CHECKED_OUT", limit: 30 })),
        api<Paginated<Customer>>("/customers?page=1&limit=200"),
      ]);
      setUpcoming(appointmentRows);
      setCheckouts(visitRows);
      setCustomers(customerRows.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Müşteri iletişimi verileri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const customerNames = useMemo(
    () => new Map(customers.map((item) => [item.id, `${item.firstName} ${item.lastName}`.trim()])),
    [customers],
  );

  async function sendReminder(item: Upcoming) {
    if (!canUpdate) return;
    setBusyKey(`reminder:${item.id}`);
    setError("");
    setNotice("");
    try {
      await api(`/operations/customer-engagement/appointments/${item.id}/reminder`, {
        method: "POST",
        body: { channel },
      });
      setNotice(`${item.customerName} için randevu hatırlatması CRM üzerinden gönderildi.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Hatırlatma gönderilemedi.");
    } finally {
      setBusyKey("");
    }
  }

  async function setConfirmation(item: Upcoming, status: ConfirmationStatus) {
    if (!canUpdate) return;
    setBusyKey(`confirmation:${item.id}`);
    setError("");
    setNotice("");
    try {
      await api(`/operations/customer-engagement/appointments/${item.id}/confirmation`, {
        method: "PUT",
        body: { status, expectedVersion: item.version },
      });
      setNotice("Randevu onay durumu güncellendi.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Onay durumu güncellenemedi.");
    } finally {
      setBusyKey("");
    }
  }

  async function sendFollowup(visit: Visit) {
    if (!canUpdate) return;
    setBusyKey(`followup:${visit.id}`);
    setError("");
    setNotice("");
    try {
      await api(`/operations/customer-engagement/visits/${visit.id}/follow-up`, {
        method: "POST",
        body: { channel },
      });
      setNotice("Checkout follow-up mesajı CRM üzerinden gönderildi.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Follow-up gönderilemedi.");
    } finally {
      setBusyKey("");
    }
  }

  if (loading && !upcoming.length && !checkouts.length) {
    return <div className="mx-auto max-w-[1420px] py-10"><Spinner label="Müşteri iletişimi hazırlanıyor..." /></div>;
  }

  return (
    <div className="mx-auto max-w-[1420px] space-y-5 pb-10">
      <header className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-soft)]">CRM / Communications Integration</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">Hatırlatma, Onay & Follow-up</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">Operations yalnız randevu onay durumunu ve kaynak bağlantısını yönetir. Mesaj gönderimi, consent, provider ve idempotency CRM altyapısında kalır.</p>
        <label className="mt-4 block max-w-xs text-xs font-semibold text-[var(--muted)]">İletişim kanalı
          <select className="mt-2 min-h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm text-[var(--ink)]" value={channel} onChange={(event) => setChannel(event.target.value as Channel)}>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="SMS">SMS</option>
            <option value="EMAIL">E-posta</option>
          </select>
        </label>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
      {notice ? <Alert tone="success" onClose={() => setNotice("")}>{notice}</Alert> : null}

      <section className="overflow-hidden rounded-[24px] border border-[var(--line)] bg-[var(--surface)] shadow-sm">
        <div className="border-b border-[var(--line)] px-6 py-4">
          <h2 className="text-sm font-semibold text-[var(--ink)]">Önümüzdeki 7 Gün</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">Hatırlatma gönderin; müşteri yanıtını fiziksel Visit durumundan ayrı kaydedin.</p>
        </div>
        {upcoming.length ? (
          <div className="divide-y divide-[var(--line)]">
            {upcoming.map((item) => (
              <div key={item.id} className="px-6 py-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[var(--ink)]">{item.customerName} · {item.serviceName}</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">{new Date(item.startAt).toLocaleString("tr-TR")} · {item.staffName}</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">Onay: <span className="font-semibold text-[var(--ink)]">{confirmationLabels[item.confirmationStatus]}</span>{item.lastReminderSentAt ? ` · Son hatırlatma ${new Date(item.lastReminderSentAt).toLocaleString("tr-TR")}` : " · Henüz hatırlatma yok"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" disabled={!canUpdate || busyKey === `reminder:${item.id}`} onClick={() => void sendReminder(item)}>Hatırlat</Button>
                    <Button variant="secondary" disabled={!canUpdate || busyKey === `confirmation:${item.id}`} onClick={() => void setConfirmation(item, "CONFIRMED")}>Onayladı</Button>
                    <Button variant="secondary" disabled={!canUpdate || busyKey === `confirmation:${item.id}`} onClick={() => void setConfirmation(item, "RESCHEDULE_REQUESTED")}>Tarih Değişikliği</Button>
                    <Button variant="secondary" disabled={!canUpdate || busyKey === `confirmation:${item.id}`} onClick={() => void setConfirmation(item, "CANCEL_REQUESTED")}>İptal İstiyor</Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : <div className="px-6 py-10 text-center text-sm text-[var(--muted)]">Önümüzdeki 7 günde aktif randevu yok.</div>}
      </section>

      <section className="overflow-hidden rounded-[24px] border border-[var(--line)] bg-[var(--surface)] shadow-sm">
        <div className="border-b border-[var(--line)] px-6 py-4">
          <h2 className="text-sm font-semibold text-[var(--ink)]">Checkout Follow-up</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">Son checkout kayıtlarından teşekkür/geri bildirim mesajı gönderin. Aynı Visit + kanal idempotent işlenir.</p>
        </div>
        {checkouts.length ? (
          <div className="divide-y divide-[var(--line)]">
            {checkouts.map((visit) => (
              <div key={visit.id} className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[var(--ink)]">{customerNames.get(visit.customerId) ?? `Müşteri ${visit.customerId.slice(0, 8)}`}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">Checkout: {visit.checkedOutAt ? new Date(visit.checkedOutAt).toLocaleString("tr-TR") : "—"} · Visit {visit.id.slice(0, 8)}</p>
                </div>
                <Button variant="secondary" disabled={!canUpdate || busyKey === `followup:${visit.id}`} onClick={() => void sendFollowup(visit)}>Follow-up Gönder</Button>
              </div>
            ))}
          </div>
        ) : <div className="px-6 py-10 text-center text-sm text-[var(--muted)]">Checkout kaydı bulunamadı.</div>}
      </section>
    </div>
  );
}
