"use client";

import { Select, useEffect, useState } from "react";

import { Alert, Button, Field, Spinner, TextInput } from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";
import { hasActiveBranch, hasPermission } from "@/lib/auth";
import type { Paginated, Service } from "@/lib/types";
import { WaitlistMatchPanel } from "./waitlist-match-panel";

type CustomerOption = { id: string; firstName: string; lastName: string };
type StaffOption = { id: string; firstName: string; lastName: string; status: string };
type WaitlistEntry = {
  id: string;
  customerId: string;
  customerName: string;
  serviceId: string;
  serviceName: string;
  preferredStaffId: string | null;
  preferredStaffName: string | null;
  desiredFrom: string;
  desiredTo: string;
  preferredTimeStart: string | null;
  preferredTimeEnd: string | null;
  priority: number;
  contactChannel: "ANY" | "PHONE" | "SMS" | "WHATSAPP" | "EMAIL";
  status: "WAITING" | "MATCH_FOUND" | "CONTACTED" | "BOOKED" | "EXPIRED" | "CANCELLED";
  note: string | null;
  expiresAt: string | null;
  version: number;
  createdAt: string;
};

function toLocalInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function initialWindow() {
  const from = new Date();
  from.setMinutes(0, 0, 0);
  const to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { desiredFrom: toLocalInput(from), desiredTo: toLocalInput(to) };
}

const statusLabel: Record<WaitlistEntry["status"], string> = {
  WAITING: "Bekliyor",
  MATCH_FOUND: "Slot bulundu",
  CONTACTED: "İletişime geçildi",
  BOOKED: "Randevuya dönüştü",
  EXPIRED: "Süresi doldu",
  CANCELLED: "İptal edildi",
};

export default function OperationsWaitlistPage() {
  const canUpdate = hasPermission("appointments", "update");
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    customerId: "",
    serviceId: "",
    preferredStaffId: "",
    ...initialWindow(),
    preferredTimeStart: "",
    preferredTimeEnd: "",
    priority: "50",
    contactChannel: "ANY",
    note: "",
  });

  async function load() {
    if (!hasActiveBranch()) {
      setError("Bekleme listesi için önce çalışma kapsamından bir şube seçin.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [waitlistResult, customerResult, serviceResult, staffResult] = await Promise.all([
        api<WaitlistEntry[]>("/operations/waitlist"),
        api<Paginated<CustomerOption>>(withQuery("/customers", { page: 1, limit: 200 })),
        api<Paginated<Service>>(withQuery("/services", { page: 1, limit: 200 })),
        api<Paginated<StaffOption>>(withQuery("/staff", { page: 1, limit: 200, status: "ACTIVE" })),
      ]);
      setEntries(waitlistResult);
      setCustomers(customerResult.data);
      setServices(serviceResult.data.filter((service) => service.status === "ACTIVE"));
      setStaff(staffResult.data.filter((member) => member.status === "ACTIVE"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Bekleme listesi yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createEntry() {
    if (!canUpdate || !form.customerId || !form.serviceId) return;
    const desiredFrom = new Date(form.desiredFrom);
    const desiredTo = new Date(form.desiredTo);
    if (Number.isNaN(desiredFrom.getTime()) || Number.isNaN(desiredTo.getTime()) || desiredFrom >= desiredTo) {
      setError("Tercih edilen başlangıç ve bitiş aralığı geçerli olmalıdır.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await api<{ entry: WaitlistEntry; duplicate: boolean }>("/operations/waitlist", {
        method: "POST",
        body: {
          customerId: form.customerId,
          serviceId: form.serviceId,
          preferredStaffId: form.preferredStaffId || null,
          desiredFrom: desiredFrom.toISOString(),
          desiredTo: desiredTo.toISOString(),
          preferredTimeStart: form.preferredTimeStart || null,
          preferredTimeEnd: form.preferredTimeEnd || null,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Istanbul",
          priority: Number(form.priority),
          contactChannel: form.contactChannel,
          note: form.note.trim() || null,
        },
      });
      setMessage(result.duplicate ? "Aynı aktif tercih zaten bekleme listesinde; mevcut kayıt korundu." : "Müşteri bekleme listesine eklendi.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Bekleme listesi kaydı oluşturulamadı.");
    } finally {
      setSaving(false);
    }
  }

  async function cancel(entry: WaitlistEntry) {
    if (!canUpdate) return;
    setBusyId(entry.id);
    setError("");
    try {
      await api(`/operations/waitlist/${entry.id}/cancel`, {
        method: "POST",
        body: { expectedVersion: entry.version },
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Bekleme listesi kaydı iptal edilemedi.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <div className="mx-auto max-w-[1420px] py-10"><Spinner label="Bekleme listesi hazırlanıyor..." /></div>;
  }

  return (
    <div className="mx-auto max-w-[1420px] space-y-5 pb-10">
      <header className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-soft)]">Capacity Recovery</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">Bekleme Listesi</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
          Bekleyen talepleri gerçek personel ve kaynak kapasitesiyle eşleştirin; uygun slot kabul edildiğinde randevu ve kaynak rezervasyonları atomik oluşturulur.
        </p>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
      {message ? <div className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[#2d6a49]">{message}</div> : null}

      <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-[var(--ink)]">Yeni Bekleme Talebi</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <Field label="Müşteri">
            <Select className="min-h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm" value={form.customerId} onChange={(event) => setForm((current) => ({ ...current, customerId: event.target.value }))}>
              <option value="">Müşteri seçin</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.firstName} {customer.lastName}</option>)}
            </Select>
          </Field>
          <Field label="Hizmet">
            <Select className="min-h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm" value={form.serviceId} onChange={(event) => setForm((current) => ({ ...current, serviceId: event.target.value }))}>
              <option value="">Hizmet seçin</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
            </Select>
          </Field>
          <Field label="Tercih edilen personel">
            <Select className="min-h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm" value={form.preferredStaffId} onChange={(event) => setForm((current) => ({ ...current, preferredStaffId: event.target.value }))}>
              <option value="">Fark etmez</option>{staff.map((member) => <option key={member.id} value={member.id}>{member.firstName} {member.lastName}</option>)}
            </Select>
          </Field>
          <Field label="Tarih aralığı başlangıcı"><TextInput type="datetime-local" value={form.desiredFrom} onChange={(event) => setForm((current) => ({ ...current, desiredFrom: event.target.value }))} /></Field>
          <Field label="Tarih aralığı bitişi"><TextInput type="datetime-local" value={form.desiredTo} onChange={(event) => setForm((current) => ({ ...current, desiredTo: event.target.value }))} /></Field>
          <Field label="Öncelik (0-100)"><TextInput type="number" min="0" max="100" value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))} /></Field>
          <Field label="Gün içi başlangıç"><TextInput type="time" value={form.preferredTimeStart} onChange={(event) => setForm((current) => ({ ...current, preferredTimeStart: event.target.value }))} /></Field>
          <Field label="Gün içi bitiş"><TextInput type="time" value={form.preferredTimeEnd} onChange={(event) => setForm((current) => ({ ...current, preferredTimeEnd: event.target.value }))} /></Field>
          <Field label="İletişim kanalı">
            <Select className="min-h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm" value={form.contactChannel} onChange={(event) => setForm((current) => ({ ...current, contactChannel: event.target.value }))}>
              <option value="ANY">Fark etmez</option><option value="PHONE">Telefon</option><option value="SMS">SMS</option><option value="WHATSAPP">WhatsApp</option><option value="EMAIL">E-posta</option>
            </Select>
          </Field>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <Field label="Operasyon notu"><TextInput value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} placeholder="Tercih / ulaşılabilirlik notu" /></Field>
          <Button disabled={!canUpdate || saving} onClick={() => void createEntry()}>{saving ? "Ekleniyor..." : "Bekleme Listesine Ekle"}</Button>
        </div>
      </section>

      <section className="overflow-hidden rounded-[24px] border border-[var(--line)] bg-[var(--surface)] shadow-sm">
        <div className="border-b border-[var(--line)] px-6 py-4">
          <h2 className="text-sm font-semibold text-[var(--ink)]">Bekleme Talepleri</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">{entries.length} kayıt · aktif talepler öncelik sırasıyla gösterilir</p>
        </div>
        {entries.length ? (
          <div className="divide-y divide-[var(--line)]">
            {entries.map((entry) => {
              const active = ["WAITING", "MATCH_FOUND", "CONTACTED"].includes(entry.status);
              return (
                <div key={entry.id} className="px-6 py-4">
                  <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_150px_130px_auto] xl:items-center">
                    <div>
                      <p className="text-sm font-semibold text-[var(--ink)]">{entry.customerName}</p>
                      <p className="mt-1 text-xs text-[var(--muted)]">{entry.serviceName}{entry.preferredStaffName ? ` · ${entry.preferredStaffName}` : " · Personel fark etmez"}</p>
                    </div>
                    <div className="text-xs text-[var(--muted)]">
                      <p>{new Date(entry.desiredFrom).toLocaleString("tr-TR")} – {new Date(entry.desiredTo).toLocaleString("tr-TR")}</p>
                      {entry.preferredTimeStart && entry.preferredTimeEnd ? <p className="mt-1">Saat: {entry.preferredTimeStart.slice(0, 5)}–{entry.preferredTimeEnd.slice(0, 5)}</p> : null}
                    </div>
                    <span className="text-xs font-semibold text-[var(--ink)]">Öncelik {entry.priority}</span>
                    <span className="w-fit rounded-full bg-[var(--surface-2)] px-3 py-1 text-xs font-semibold text-[var(--ink)]">{statusLabel[entry.status]}</span>
                    {canUpdate && active ? <Button variant="secondary" disabled={busyId === entry.id} onClick={() => void cancel(entry)}>{busyId === entry.id ? "İptal ediliyor..." : "İptal Et"}</Button> : null}
                  </div>
                  {active ? <WaitlistMatchPanel entryId={entry.id} entryVersion={entry.version} canUpdate={canUpdate} onBooked={load} /> : null}
                </div>
              );
            })}
          </div>
        ) : <div className="px-6 py-10 text-center text-sm text-[var(--muted)]">Bekleme listesinde kayıt yok.</div>}
      </section>
    </div>
  );
}
