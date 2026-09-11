"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  CheckboxField,
  FormActions,
  FormGrid,
  FormHint,
  FormSection,
  FormSubmitButton,
} from "@/components/form-system";
import { Modal } from "@/components/modal";
import { Alert, Button, Field, Select, TextArea, TextInput } from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import type { Appointment, Customer, Paginated, Service, Staff } from "@/lib/types";

export type DashboardAction = "appointment" | "customer" | "service" | "payment";

type Props = {
  action: DashboardAction | null;
  onClose: () => void;
  onSaved?: (message: string) => void;
};

type QuickCustomerState = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  kvkkAcknowledgement: boolean;
  membershipAgreement: boolean;
};

const emptyCustomer: QuickCustomerState = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  kvkkAcknowledgement: false,
  membershipAgreement: false,
};

const pad = (n: number) => String(n).padStart(2, "0");

function localDateTime(minutes = 30) {
  const d = new Date(Date.now() + minutes * 60000);
  d.setSeconds(0, 0);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function addMinutes(value: string, minutes: number) {
  const d = new Date(value);
  d.setMinutes(d.getMinutes() + minutes);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function labelName(first: string, last: string) {
  return `${first} ${last}`.trim();
}

export function DashboardActions({ action, onClose, onSaved }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [customer, setCustomer] = useState<QuickCustomerState>(emptyCustomer);
  const [service, setService] = useState({ name: "", description: "", duration: "60", price: "" });
  const [appointment, setAppointment] = useState({
    customerId: "",
    staffId: "",
    serviceId: "",
    startAt: localDateTime(),
    endAt: addMinutes(localDateTime(), 60),
    notes: "",
  });
  const [payment, setPayment] = useState({
    appointmentId: "",
    amount: "",
    method: "CARD" as "CASH" | "CARD" | "TRANSFER",
  });

  useEffect(() => {
    if (!action) return;
    setError("");
    setSaving(false);
    if (action === "customer") setCustomer(emptyCustomer);
    if (action === "service") setService({ name: "", description: "", duration: "60", price: "" });
    if (action === "appointment") {
      const startAt = localDateTime(30);
      setAppointment({
        customerId: "",
        staffId: "",
        serviceId: "",
        startAt,
        endAt: addMinutes(startAt, 60),
        notes: "",
      });
    }
    if (action === "payment") setPayment({ appointmentId: "", amount: "", method: "CARD" });
  }, [action]);

  useEffect(() => {
    if (!action || action === "customer" || action === "service") return;

    let cancelled = false;
    setLoadingRefs(true);

    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date();
    to.setDate(to.getDate() + 14);
    to.setHours(23, 59, 59, 999);

    void Promise.all([
      api<Paginated<Customer>>(withQuery("/customers", { page: 1, limit: 100 })),
      api<Paginated<Staff>>(withQuery("/staff", { page: 1, limit: 100 })),
      api<Paginated<Service>>(withQuery("/services", { page: 1, limit: 100 })),
      api<Paginated<Appointment>>(
        withQuery("/appointments", {
          page: 1,
          limit: 100,
          from: from.toISOString(),
          to: to.toISOString(),
        }),
      ),
    ])
      .then(([c, s, sv, a]) => {
        if (cancelled) return;
        setCustomers(c.data);
        setStaff(s.data.filter((x) => x.status === "ACTIVE"));
        setServices(sv.data.filter((x) => x.status === "ACTIVE"));
        setAppointments(a.data.filter((x) => x.status !== "CANCELLED" && x.status !== "NO_SHOW"));
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Form seçenekleri yüklenemedi.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingRefs(false);
      });

    return () => {
      cancelled = true;
    };
  }, [action]);

  const selectedService = useMemo(
    () => services.find((x) => x.id === appointment.serviceId),
    [services, appointment.serviceId],
  );

  const title =
    action === "appointment"
      ? "Yeni randevu"
      : action === "customer"
        ? "Yeni müşteri ekle"
        : action === "service"
          ? "Yeni hizmet ekle"
          : "Ödeme al";

  const description =
    action === "appointment"
      ? "Randevuyu dashboard'dan ayrılmadan oluştur."
      : action === "customer"
        ? "Müşteri kaydını hızlıca oluştur."
        : action === "service"
          ? "Hizmetini hızlıca tanımla."
          : "Yaklaşan bir randevu için tahsilat kaydı oluştur.";

  async function saveCustomer(event: FormEvent) {
    event.preventDefault();
    if (!hasPermission("customers", "create")) return setError("Bu işlem için yetkiniz yok.");
    if (!customer.firstName.trim() || !customer.lastName.trim()) return setError("Ad ve soyad gerekli.");
    if (!customer.kvkkAcknowledgement) return setError("KVKK Aydınlatma Metni bilgilendirmesi tamamlanmalıdır.");
    if (!customer.membershipAgreement) return setError("Üyelik Sözleşmesi kabul edilmelidir.");

    setSaving(true);
    setError("");
    try {
      await api("/customers", {
        method: "POST",
        body: {
          firstName: customer.firstName.trim(),
          lastName: customer.lastName.trim(),
          ...(customer.phone.trim() ? { phone: customer.phone.trim() } : {}),
          ...(customer.email.trim() ? { email: customer.email.trim().toLowerCase() } : {}),
          consents: {
            kvkkAcknowledgement: customer.kvkkAcknowledgement,
            membershipAgreement: customer.membershipAgreement,
          },
        },
      });
      onSaved?.("Müşteri başarıyla eklendi.");
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Müşteri eklenemedi.");
    } finally {
      setSaving(false);
    }
  }

  async function saveService(event: FormEvent) {
    event.preventDefault();
    if (!hasPermission("services", "create")) return setError("Bu işlem için yetkiniz yok.");

    const duration = Number(service.duration);
    const price = Number(service.price);
    if (!service.name.trim()) return setError("Hizmet adı gerekli.");
    if (!Number.isInteger(duration) || duration < 1 || duration > 1440) return setError("Süre 1 ile 1440 dakika arasında olmalı.");
    if (!Number.isFinite(price) || price < 0) return setError("Fiyat 0 veya daha büyük olmalı.");

    setSaving(true);
    setError("");
    try {
      await api("/services", {
        method: "POST",
        body: {
          name: service.name.trim(),
          durationMinutes: duration,
          price,
          ...(service.description.trim() ? { description: service.description.trim() } : {}),
        },
      });
      onSaved?.("Hizmet başarıyla eklendi.");
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Hizmet eklenemedi.");
    } finally {
      setSaving(false);
    }
  }

  async function saveAppointment(event: FormEvent) {
    event.preventDefault();
    if (!hasPermission("appointments", "create")) return setError("Bu işlem için yetkiniz yok.");
    if (!appointment.customerId || !appointment.staffId || !appointment.serviceId) {
      return setError("Müşteri, personel ve hizmet seçin.");
    }
    if (!appointment.startAt || !appointment.endAt) return setError("Başlangıç ve bitiş zamanı gerekli.");
    if (new Date(appointment.endAt).getTime() <= new Date(appointment.startAt).getTime()) {
      return setError("Bitiş zamanı başlangıç zamanından sonra olmalı.");
    }

    setSaving(true);
    setError("");
    try {
      await api("/appointments", {
        method: "POST",
        body: {
          customerId: appointment.customerId,
          staffId: appointment.staffId,
          serviceId: appointment.serviceId,
          startAt: new Date(appointment.startAt).toISOString(),
          endAt: new Date(appointment.endAt).toISOString(),
          notes: appointment.notes.trim(),
        },
      });
      onSaved?.("Randevu başarıyla oluşturuldu.");
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Randevu oluşturulamadı.");
    } finally {
      setSaving(false);
    }
  }

  async function savePayment(event: FormEvent) {
    event.preventDefault();
    if (!hasPermission("payments", "create")) return setError("Bu işlem için yetkiniz yok.");

    const amount = Number(payment.amount);
    if (!payment.appointmentId || !Number.isFinite(amount) || amount <= 0) {
      return setError("Randevu ve geçerli tutar seçin.");
    }

    setSaving(true);
    setError("");
    try {
      await api("/payments", {
        method: "POST",
        body: {
          appointmentId: payment.appointmentId,
          amount,
          method: payment.method,
        },
      });
      onSaved?.("Ödeme başarıyla kaydedildi.");
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ödeme kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  function handlePaymentAppointmentChange(appointmentId: string) {
    const selected = appointments.find((item) => item.id === appointmentId);
    const serviceForAppointment = selected
      ? services.find((item) => item.id === selected.serviceId)
      : undefined;

    setPayment((current) => ({
      ...current,
      appointmentId,
      amount: current.amount || (serviceForAppointment?.price != null ? String(serviceForAppointment.price) : ""),
    }));
  }

  const paymentOptions = appointments.map((item) => {
    const customerItem = customers.find((candidate) => candidate.id === item.customerId);
    const label = customerItem
      ? labelName(customerItem.firstName, customerItem.lastName)
      : item.customerId.slice(0, 8);
    const dateLabel = new Intl.DateTimeFormat("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(item.startAt));
    return { id: item.id, label: `${dateLabel} · ${label}` };
  });

  return (
    <Modal open={Boolean(action)} onClose={onClose} title={title} description={description}>
      {action === "customer" ? (
        <form onSubmit={saveCustomer}>
          <FormSection title="Müşteri bilgileri" description="Hızlı kayıt için temel iletişim bilgilerini girin.">
            <FormGrid>
              <Field label="Ad" required>
                <TextInput required value={customer.firstName} onChange={(event) => setCustomer((current) => ({ ...current, firstName: event.target.value }))} />
              </Field>
              <Field label="Soyad" required>
                <TextInput required value={customer.lastName} onChange={(event) => setCustomer((current) => ({ ...current, lastName: event.target.value }))} />
              </Field>
              <Field label="Telefon">
                <TextInput value={customer.phone} onChange={(event) => setCustomer((current) => ({ ...current, phone: event.target.value }))} />
              </Field>
              <Field label="E-posta">
                <TextInput type="email" value={customer.email} onChange={(event) => setCustomer((current) => ({ ...current, email: event.target.value }))} />
              </Field>
            </FormGrid>
          </FormSection>

          <FormSection className="mt-5" title="Zorunlu onaylar" description="Onaylar kullanıcı tarafından açıkça verilmelidir.">
            <div className="space-y-2">
              <CheckboxField
                checked={customer.kvkkAcknowledgement}
                onChange={(checked) => setCustomer((current) => ({ ...current, kvkkAcknowledgement: checked }))}
                label="KVKK Aydınlatma Metni bilgilendirmesi tamamlandı"
              />
              <CheckboxField
                checked={customer.membershipAgreement}
                onChange={(checked) => setCustomer((current) => ({ ...current, membershipAgreement: checked }))}
                label="Üyelik Sözleşmesi kabul edildi"
              />
            </div>
          </FormSection>

          {error ? <div className="mt-4"><Alert>{error}</Alert></div> : null}
          <QuickFormActions saving={saving} onClose={onClose} idleLabel="Müşteriyi oluştur" />
        </form>
      ) : null}

      {action === "service" ? (
        <form onSubmit={saveService}>
          <FormSection title="Hizmet bilgileri" description="Hizmet adı, süre ve fiyat bilgisini tanımlayın.">
            <Field label="Hizmet adı" required>
              <TextInput required value={service.name} onChange={(event) => setService((current) => ({ ...current, name: event.target.value }))} />
            </Field>
            <Field label="Açıklama">
              <TextArea rows={3} value={service.description} onChange={(event) => setService((current) => ({ ...current, description: event.target.value }))} />
            </Field>
            <FormGrid>
              <Field label="Süre (dakika)" required>
                <TextInput type="number" min={1} max={1440} required value={service.duration} onChange={(event) => setService((current) => ({ ...current, duration: event.target.value }))} />
              </Field>
              <Field label="Fiyat" required>
                <TextInput type="number" min={0} step="0.01" required value={service.price} onChange={(event) => setService((current) => ({ ...current, price: event.target.value }))} />
              </Field>
            </FormGrid>
          </FormSection>

          {error ? <div className="mt-4"><Alert>{error}</Alert></div> : null}
          <QuickFormActions saving={saving} onClose={onClose} idleLabel="Hizmeti oluştur" />
        </form>
      ) : null}

      {action === "appointment" ? (
        <form onSubmit={saveAppointment}>
          {loadingRefs ? <FormHint tone="info">Müşteri, personel ve hizmet seçenekleri yükleniyor.</FormHint> : null}

          <FormSection className="mt-4" title="Randevu bilgileri" description="Müşteri, personel ve hizmet seçimini tamamlayın.">
            <FormGrid>
              <Field label="Müşteri" required>
                <Select required value={appointment.customerId} onChange={(event) => setAppointment((current) => ({ ...current, customerId: event.target.value }))}>
                  <option value="">Seçin</option>
                  {customers.map((item) => <option key={item.id} value={item.id}>{labelName(item.firstName, item.lastName)}</option>)}
                </Select>
              </Field>
              <Field label="Personel" required>
                <Select required value={appointment.staffId} onChange={(event) => setAppointment((current) => ({ ...current, staffId: event.target.value }))}>
                  <option value="">Seçin</option>
                  {staff.map((item) => <option key={item.id} value={item.id}>{labelName(item.firstName, item.lastName)}</option>)}
                </Select>
              </Field>
            </FormGrid>

            <Field label="Hizmet" required>
              <Select required value={appointment.serviceId} onChange={(event) => setAppointment((current) => ({ ...current, serviceId: event.target.value }))}>
                <option value="">Seçin</option>
                {services.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.durationMinutes} dk · ₺{Number(item.price).toLocaleString("tr-TR")}
                  </option>
                ))}
              </Select>
            </Field>
          </FormSection>

          <FormSection className="mt-5" title="Zaman" description="Randevunun başlangıç ve bitiş saatini belirleyin.">
            <FormGrid>
              <Field label="Başlangıç" required>
                <TextInput
                  type="datetime-local"
                  required
                  value={appointment.startAt}
                  onChange={(event) =>
                    setAppointment((current) => ({
                      ...current,
                      startAt: event.target.value,
                      endAt: addMinutes(event.target.value, selectedService?.durationMinutes ?? 60),
                    }))
                  }
                />
              </Field>
              <Field label="Bitiş" required>
                <TextInput type="datetime-local" required value={appointment.endAt} onChange={(event) => setAppointment((current) => ({ ...current, endAt: event.target.value }))} />
              </Field>
            </FormGrid>
            <Field label="Not">
              <TextArea rows={2} value={appointment.notes} onChange={(event) => setAppointment((current) => ({ ...current, notes: event.target.value }))} />
            </Field>
          </FormSection>

          {error ? <div className="mt-4"><Alert>{error}</Alert></div> : null}
          <QuickFormActions saving={saving} onClose={onClose} idleLabel="Randevuyu oluştur" />
        </form>
      ) : null}

      {action === "payment" ? (
        <form onSubmit={savePayment}>
          {loadingRefs ? <FormHint tone="info">Yaklaşan randevular yükleniyor.</FormHint> : null}

          <FormSection className="mt-4" title="Tahsilat" description="Randevu, tutar ve ödeme yöntemini seçin.">
            <Field label="Randevu" required>
              <Select required value={payment.appointmentId} onChange={(event) => handlePaymentAppointmentChange(event.target.value)}>
                <option value="">Seçin</option>
                {paymentOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </Select>
            </Field>
            <FormGrid>
              <Field label="Tutar" required>
                <TextInput type="number" min={0.01} step="0.01" required value={payment.amount} onChange={(event) => setPayment((current) => ({ ...current, amount: event.target.value }))} />
              </Field>
              <Field label="Yöntem">
                <Select value={payment.method} onChange={(event) => setPayment((current) => ({ ...current, method: event.target.value as typeof current.method }))}>
                  <option value="CARD">Kart</option>
                  <option value="CASH">Nakit</option>
                  <option value="TRANSFER">Havale / EFT</option>
                </Select>
              </Field>
            </FormGrid>
          </FormSection>

          {error ? <div className="mt-4"><Alert>{error}</Alert></div> : null}
          <QuickFormActions saving={saving} onClose={onClose} idleLabel="Ödemeyi kaydet" />
        </form>
      ) : null}
    </Modal>
  );
}

function QuickFormActions({
  saving,
  onClose,
  idleLabel,
}: {
  saving: boolean;
  onClose: () => void;
  idleLabel: string;
}) {
  return (
    <FormActions>
      <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
        Vazgeç
      </Button>
      <FormSubmitButton saving={saving} idleLabel={idleLabel} />
    </FormActions>
  );
}
