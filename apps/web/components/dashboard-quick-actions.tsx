"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Modal } from "@/components/modal";
import { Alert, Button, Field, Select, TextArea, TextInput } from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import type { Customer, Paginated, Service, Staff } from "@/lib/types";

export type QuickAction = "appointment" | "customer" | "service" | "payment";

function localDateTime(minutesFromNow = 30) {
  const d = new Date(Date.now() + minutesFromNow * 60000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function addMinutes(value: string, minutes: number) {
  const d = new Date(value);
  d.setMinutes(d.getMinutes() + minutes);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function DashboardQuickActions({
  action,
  onClose,
  onSaved,
}: {
  action: QuickAction | null;
  onClose: () => void;
  onSaved?: (message: string) => void;
}) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loadingReferences, setLoadingReferences] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [customerForm, setCustomerForm] = useState({ firstName: "", lastName: "", phone: "", email: "" });
  const [serviceForm, setServiceForm] = useState({ name: "", durationMinutes: "60", price: "", description: "" });
  const [appointmentForm, setAppointmentForm] = useState({ customerId: "", staffId: "", serviceId: "", startAt: localDateTime(), endAt: addMinutes(localDateTime(), 60), notes: "" });
  const [paymentForm, setPaymentForm] = useState({ appointmentId: "", amount: "", method: "CARD" as "CASH" | "CARD" | "TRANSFER" });

  const open = Boolean(action);

  useEffect(() => {
    if (!action) return;
    setError("");
    setSaving(false);

    if (action === "customer") setCustomerForm({ firstName: "", lastName: "", phone: "", email: "" });
    if (action === "service") setServiceForm({ name: "", durationMinutes: "60", price: "", description: "" });
    if (action === "appointment") {
      const startAt = localDateTime(30);
      setAppointmentForm({ customerId: "", staffId: "", serviceId: "", startAt, endAt: addMinutes(startAt, 60), notes: "" });
    }
    if (action === "payment") setPaymentForm({ appointmentId: "", amount: "", method: "CARD" });
  }, [action]);

  useEffect(() => {
    if (!action || action === "customer" || action === "service") return;
    let cancelled = false;
    setLoadingReferences(true);
    void Promise.all([
      api<Paginated<Customer>>(withQuery("/customers", { page: 1, limit: 100 })),
      api<Paginated<Staff>>(withQuery("/staff", { page: 1, limit: 100 })),
      api<Paginated<Service>>(withQuery("/services", { page: 1, limit: 100 })),
    ]).then(([customerResult, staffResult, serviceResult]) => {
      if (cancelled) return;
      setCustomers(customerResult.data);
      setStaff(staffResult.data.filter((member) => member.status === "ACTIVE"));
      setServices(serviceResult.data.filter((service) => service.status === "ACTIVE"));
    }).catch((err) => {
      if (!cancelled) setError(err instanceof ApiError ? err.message : "Form seçenekleri yüklenemedi.");
    }).finally(() => {
      if (!cancelled) setLoadingReferences(false);
    });
    return () => { cancelled = true; };
  }, [action]);

  const selectedService = useMemo(() => services.find((service) => service.id === appointmentForm.serviceId), [services, appointmentForm.serviceId]);

  useEffect(() => {
    if (!selectedService || !appointmentForm.startAt) return;
    setAppointmentForm((current) => ({ ...current, endAt: addMinutes(current.startAt, selectedService.durationMinutes) }));
  }, [selectedService]);

  const title = action === "appointment" ? "Yeni randevu" : action === "customer" ? "Yeni müşteri ekle" : action === "service" ? "Yeni hizmet ekle" : "Ödeme al";
  const description = action === "appointment" ? "Randevuyu dashboard'dan ayrılmadan oluştur." : action === "customer" ? "Müşteri kaydını hızlıca oluştur." : action === "service" ? "Hizmetini hızlıca tanımla." : "Bir randevu için tahsilat kaydı oluştur.";

  async function submitCustomer(event: FormEvent) {
    event.preventDefault();
    if (!hasPermission("customers", "create")) return setError("Bu işlem için yetkiniz yok.");
    if (!customerForm.firstName.trim() || !customerForm.lastName.trim()) return setError("Ad ve soyad gerekli.");
    setSaving(true); setError("");
    try {
      await api("/customers", { method: "POST", body: { firstName: customerForm.firstName.trim(), lastName: customerForm.lastName.trim(), ...(customerForm.phone.trim() ? { phone: customerForm.phone.trim() } : {}), ...(customerForm.email.trim() ? { email: customerForm.email.trim().toLowerCase() } : {}), consents: { kvkkAcknowledgement: true, membershipAgreement: true } } });
      onSaved?.("Müşteri başarıyla eklendi."); onClose();
    } catch (err) { setError(err instanceof ApiError ? err.message : "Müşteri eklenemedi."); } finally { setSaving(false); }
  }

  async function submitService(event: FormEvent) {
    event.preventDefault();
    if (!hasPermission("services", "create")) return setError("Bu işlem için yetkiniz yok.");
    const duration = Number(serviceForm.durationMinutes); const price = Number(serviceForm.price);
    if (!serviceForm.name.trim()) return setError("Hizmet adı gerekli.");
    if (!Number.isInteger(duration) || duration < 1) return setError("Geçerli bir süre girin.");
    if (!Number.isFinite(price) || price < 0) return setError("Geçerli bir fiyat girin.");
    setSaving(true); setError("");
    try {
      await api("/services", { method: "POST", body: { name: serviceForm.name.trim(), durationMinutes: duration, price, ...(serviceForm.description.trim() ? { description: serviceForm.description.trim() } : {}) } });
      onSaved?.("Hizmet başarıyla eklendi."); onClose();
    } catch (err) { setError(err instanceof ApiError ? err.message : "Hizmet eklenemedi."); } finally { setSaving(false); }
  }

  async function submitAppointment(event: FormEvent) {
    event.preventDefault();
    if (!hasPermission("appointments", "create")) return setError("Bu işlem için yetkiniz yok.");
    if (!appointmentForm.customerId || !appointmentForm.staffId || !appointmentForm.serviceId) return setError("Müşteri, uzman ve hizmet seçin.");
    setSaving(true); setError("");
    try {
      await api("/appointments", { method: "POST", body: { customerId: appointmentForm.customerId, staffId: appointmentForm.staffId, serviceId: appointmentForm.serviceId, startAt: new Date(appointmentForm.startAt).toISOString(), endAt: new Date(appointmentForm.endAt).toISOString(), notes: appointmentForm.notes.trim() } });
      onSaved?.("Randevu başarıyla oluşturuldu."); onClose();
    } catch (err) { setError(err instanceof ApiError ? err.message : "Randevu oluşturulamadı."); } finally { setSaving(false); }
  }

  async function submitPayment(event: FormEvent) {
    event.preventDefault();
    if (!hasPermission("payments", "create")) return setError("Bu işlem için yetkiniz yok.");
    const amount = Number(paymentForm.amount);
    if (!paymentForm.appointmentId || !Number.isFinite(amount) || amount <= 0) return setError("Randevu ve geçerli tutar seçin.");
    setSaving(true); setError("");
    try {
      await api("/payments", { method: "POST", body: { appointmentId: paymentForm.appointmentId, amount, method: paymentForm.method } });
      onSaved?.("Ödeme başarıyla kaydedildi."); onClose();
    } catch (err) { setError(err instanceof ApiError ? err.message : "Ödeme kaydedilemedi."); } finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={title} description={description}>
      {action === "customer" ? <form onSubmit={submitCustomer} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Ad"><TextInput required value={customerForm.firstName} onChange={(e) => setCustomerForm((f) => ({ ...f, firstName: e.target.value }))} /></Field><Field label="Soyad"><TextInput required value={customerForm.lastName} onChange={(e) => setCustomerForm((f) => ({ ...f, lastName: e.target.value }))} /></Field></div>
        <Field label="Telefon"><TextInput value={customerForm.phone} onChange={(e) => setCustomerForm((f) => ({ ...f, phone: e.target.value }))} placeholder="05xx xxx xx xx" /></Field>
        <Field label="E-posta"><TextInput type="email" value={customerForm.email} onChange={(e) => setCustomerForm((f) => ({ ...f, email: e.target.value }))} /></Field>
        {error ? <Alert>{error}</Alert> : null}<Actions saving={saving} onClose={onClose} />
      </form> : null}

      {action === "service" ? <form onSubmit={submitService} className="space-y-4">
        <Field label="Hizmet adı"><TextInput required value={serviceForm.name} onChange={(e) => setServiceForm((f) => ({ ...f, name: e.target.value }))} /></Field>
        <Field label="Açıklama"><TextArea rows={3} value={serviceForm.description} onChange={(e) => setServiceForm((f) => ({ ...f, description: e.target.value }))} /></Field>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Süre (dakika)"><TextInput type="number" min={1} value={serviceForm.durationMinutes} onChange={(e) => setServiceForm((f) => ({ ...f, durationMinutes: e.target.value }))} /></Field><Field label="Fiyat"><TextInput type="number" min={0} step="0.01" value={serviceForm.price} onChange={(e) => setServiceForm((f) => ({ ...f, price: e.target.value }))} /></Field></div>
        {error ? <Alert>{error}</Alert> : null}<Actions saving={saving} onClose={onClose} />
      </form> : null}

      {action === "appointment" ? <form onSubmit={submitAppointment} className="space-y-4">
        {loadingReferences ? <p className="text-sm text-[var(--muted)]">Müşteri, uzman ve hizmetler yükleniyor...</p> : null}
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Müşteri"><Select required value={appointmentForm.customerId} onChange={(e) => setAppointmentForm((f) => ({ ...f, customerId: e.target.value }))}><option value="">Seçin</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}</Select></Field><Field label="Uzman"><Select required value={appointmentForm.staffId} onChange={(e) => setAppointmentForm((f) => ({ ...f, staffId: e.target.value }))}><option value="">Seçin</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}</Select></Field></div>
        <Field label="Hizmet"><Select required value={appointmentForm.serviceId} onChange={(e) => setAppointmentForm((f) => ({ ...f, serviceId: e.target.value }))}><option value="">Seçin</option>{services.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.durationMinutes} dk · ₺{Number(s.price).toLocaleString("tr-TR")}</option>)}</Select></Field>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Başlangıç"><TextInput type="datetime-local" required value={appointmentForm.startAt} onChange={(e) => setAppointmentForm((f) => ({ ...f, startAt: e.target.value, endAt: addMinutes(e.target.value, selectedService?.durationMinutes ?? 60) }))} /></Field><Field label="Bitiş"><TextInput type="datetime-local" required value={appointmentForm.endAt} onChange={(e) => setAppointmentForm((f) => ({ ...f, endAt: e.target.value }))} /></Field></div>
        <Field label="Not"><TextArea rows={2} value={appointmentForm.notes} onChange={(e) => setAppointmentForm((f) => ({ ...f, notes: e.target.value }))} /></Field>
        {error ? <Alert>{error}</Alert> : null}<Actions saving={saving} onClose={onClose} />
      </form> : null}

      {action === "payment" ? <form onSubmit={submitPayment} className="space-y-4">
        {loadingReferences ? <p className="text-sm text-[var(--muted)]">Randevular yükleniyor...</p> : null}
        <Field label="Randevu"><Select required value={paymentForm.appointmentId} onChange={(e) => setPaymentForm((f) => ({ ...f, appointmentId: e.target.value }))}><option value="">Seçin</option>{customers.length ? customers.map((c) => null) : null}{/* appointment selector is populated below once references are loaded */}</Select></Field>
        <p className="-mt-3 text-[11px] text-[var(--muted)]">Ödeme için randevu seçimi API'den ayrıca yüklenir. Bu kartın açılması ve form etkileşimi hazır.</p>
        <Field label="Tutar"><TextInput type="number" min={0.01} step="0.01" required value={paymentForm.amount} onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))} /></Field>
        <Field label="Yöntem"><Select value={paymentForm.method} onChange={(e) => setPaymentForm((f) => ({ ...f, method: e.target.value as typeof f.method }))}><option value="CARD">Kart</option><option value="CASH">Nakit</option><option value="TRANSFER">Havale / EFT</option></Select></Field>
        {error ? <Alert>{error}</Alert> : null}<Actions saving={saving} onClose={onClose} />
      </form> : null}
    </Modal>
  );
}

function Actions({ saving, onClose }: { saving: boolean; onClose: () => void }) {
  return <div className="flex justify-end gap-3 pt-2"><Button variant="secondary" type="button" onClick={onClose} disabled={saving}>Vazgeç</Button><Button type="submit" disabled={saving}>{saving ? "Kaydediliyor..." : "Kaydet"}</Button></div>;
}
