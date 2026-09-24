"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import { DatePicker } from "@/components/date-picker";
import { DateTimePicker } from "@/components/date-time-picker";
import {
  CheckboxField,
  FormActions,
  FormGrid,
  FormHint,
  FormSection,
  FormSubmitButton,
  FormSummary,
  FormSummaryItem,
} from "@/components/form-system";
import { Modal } from "@/components/modal";
import { Alert, Button, Field, TextArea, TextInput } from "@/components/ui";
import { ValooSegmentedControl, ValooSelect } from "@/components/valoo-controls";
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
  birthDate: string;
  customerSource: "" | "INSTAGRAM" | "GOOGLE" | "REFERRAL" | "WALK_IN" | "OTHER";
  kvkkAcknowledgement: boolean;
  membershipAgreement: boolean;
  explicitConsent: boolean;
  marketingSms: boolean;
  marketingEmail: boolean;
  marketingPhone: boolean;
};

type EligibleSession = {
  id: string;
  customerPackage: { package: { name: string } };
  service: { name: string };
};

const emptyCustomer: QuickCustomerState = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  birthDate: "",
  customerSource: "",
  kvkkAcknowledgement: false,
  membershipAgreement: false,
  explicitConsent: false,
  marketingSms: false,
  marketingEmail: false,
  marketingPhone: false,
};

const emptyService = {
  name: "",
  category: "",
  description: "",
  duration: "60",
  preparationMinutes: "0",
  cleanupMinutes: "0",
  price: "",
  cost: "",
  taxRate: "20",
  currency: "TRY",
  requiresConsultation: false,
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
  const [eligibleSessions, setEligibleSessions] = useState<EligibleSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingRefs, setLoadingRefs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [customer, setCustomer] = useState<QuickCustomerState>(emptyCustomer);
  const [service, setService] = useState(emptyService);
  const [appointment, setAppointment] = useState({
    customerId: "",
    staffId: "",
    serviceId: "",
    sessionId: "",
    startAt: localDateTime(),
    endAt: addMinutes(localDateTime(), 60),
    notes: "",
  });
  const [payment, setPayment] = useState({
    appointmentId: "",
    amount: "",
    method: "CARD" as "CASH" | "CARD" | "TRANSFER",
    paidAt: localDateTime(0),
  });

  useEffect(() => {
    if (!action) return;
    setError("");
    setSaving(false);
    if (action === "customer") setCustomer(emptyCustomer);
    if (action === "service") setService(emptyService);
    if (action === "appointment") {
      const startAt = localDateTime(30);
      setAppointment({
        customerId: "",
        staffId: "",
        serviceId: "",
        sessionId: "",
        startAt,
        endAt: addMinutes(startAt, 60),
        notes: "",
      });
    }
    if (action === "payment") setPayment({ appointmentId: "", amount: "", method: "CARD", paidAt: localDateTime(0) });
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

  useEffect(() => {
    if (action !== "appointment" || !appointment.customerId || !appointment.serviceId) {
      setEligibleSessions([]);
      return;
    }

    let cancelled = false;
    setLoadingSessions(true);
    void api<EligibleSession[]>(
      withQuery("/appointments/eligible-sessions", {
        customerId: appointment.customerId,
        serviceId: appointment.serviceId,
      }),
    )
      .then((sessions) => {
        if (!cancelled) setEligibleSessions(sessions);
      })
      .catch(() => {
        if (!cancelled) setEligibleSessions([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSessions(false);
      });

    return () => {
      cancelled = true;
    };
  }, [action, appointment.customerId, appointment.serviceId]);

  const selectedService = useMemo(
    () => services.find((x) => x.id === appointment.serviceId),
    [services, appointment.serviceId],
  );
  const selectedCustomer = useMemo(
    () => customers.find((x) => x.id === appointment.customerId),
    [customers, appointment.customerId],
  );
  const selectedStaff = useMemo(
    () => staff.find((x) => x.id === appointment.staffId),
    [staff, appointment.staffId],
  );
  const appointmentConflict = useMemo(() => {
    if (!appointment.staffId || !appointment.startAt || !appointment.endAt) return null;
    const start = new Date(appointment.startAt).getTime();
    const end = new Date(appointment.endAt).getTime();
    return appointments.find(
      (item) =>
        item.staffId === appointment.staffId &&
        new Date(item.startAt).getTime() < end &&
        new Date(item.endAt).getTime() > start,
    ) ?? null;
  }, [appointment.endAt, appointment.staffId, appointment.startAt, appointments]);

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
      ? "Randevuyu ana ekrandan ayrılmadan oluştur."
      : action === "customer"
        ? "Müşteri kaydını hızlıca oluştur."
        : action === "service"
          ? "Hizmetini hızlıca tanımla."
          : "Yaklaşan bir randevu için tahsilat kaydı oluştur.";

  async function saveCustomer(event: FormEvent) {
    event.preventDefault();
    if (!hasPermission("customers", "create")) return setError("Bu işlem için yetkiniz yok.");
    if (!customer.firstName.trim() || !customer.lastName.trim()) return setError("Ad ve soyad gerekli.");
    if (!customer.phone.trim() && !customer.email.trim()) return setError("Telefon veya e-posta bilgilerinden en az biri gerekli.");
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
          ...(customer.birthDate ? { birthDate: customer.birthDate } : {}),
          ...(customer.customerSource ? { customerSource: customer.customerSource } : {}),
          consents: {
            kvkkAcknowledgement: customer.kvkkAcknowledgement,
            membershipAgreement: customer.membershipAgreement,
            explicitConsent: customer.explicitConsent,
            marketingSms: customer.marketingSms,
            marketingEmail: customer.marketingEmail,
            marketingPhone: customer.marketingPhone,
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
    const preparationMinutes = Number(service.preparationMinutes);
    const cleanupMinutes = Number(service.cleanupMinutes);
    const price = Number(service.price);
    const cost = service.cost.trim() ? Number(service.cost) : undefined;
    const taxRate = Number(service.taxRate);
    if (!service.name.trim()) return setError("Hizmet adı gerekli.");
    if (!Number.isInteger(duration) || duration < 1 || duration > 1440) return setError("Süre 1 ile 1440 dakika arasında olmalı.");
    if (!Number.isInteger(preparationMinutes) || preparationMinutes < 0 || preparationMinutes > 240) return setError("Hazırlık süresi 0 ile 240 dakika arasında olmalı.");
    if (!Number.isInteger(cleanupMinutes) || cleanupMinutes < 0 || cleanupMinutes > 240) return setError("Kapanış süresi 0 ile 240 dakika arasında olmalı.");
    if (!Number.isFinite(price) || price < 0) return setError("Fiyat 0 veya daha büyük olmalı.");
    if (cost !== undefined && (!Number.isFinite(cost) || cost < 0)) return setError("Maliyet 0 veya daha büyük olmalı.");
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) return setError("KDV oranı 0 ile 100 arasında olmalı.");

    setSaving(true);
    setError("");
    try {
      await api("/services", {
        method: "POST",
        body: {
          name: service.name.trim(),
          ...(service.category.trim() ? { category: service.category.trim() } : {}),
          durationMinutes: duration,
          preparationMinutes,
          cleanupMinutes,
          price,
          ...(cost !== undefined ? { cost } : {}),
          taxRate,
          currency: service.currency,
          requiresConsultation: service.requiresConsultation,
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
    if (appointmentConflict) return setError("Seçilen personelin bu saat aralığında başka bir randevusu var.");

    setSaving(true);
    setError("");
    try {
      await api("/appointments", {
        method: "POST",
        body: {
          customerId: appointment.customerId,
          staffId: appointment.staffId,
          serviceId: appointment.serviceId,
          ...(appointment.sessionId ? { sessionId: appointment.sessionId } : {}),
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
          paidAt: new Date(payment.paidAt).toISOString(),
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

  function handleAppointmentServiceChange(serviceId: string) {
    const selected = services.find((item) => item.id === serviceId);
    setAppointment((current) => ({
      ...current,
      serviceId,
      sessionId: "",
      endAt: selected ? addMinutes(current.startAt, selected.durationMinutes) : current.endAt,
    }));
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
            <FormGrid>
              <Field label="Doğum tarihi">
                <DatePicker
                  value={customer.birthDate}
                  max={new Date().toISOString().slice(0, 10)}
                  ariaLabel="Doğum tarihi"
                  onChange={(birthDate) => setCustomer((current) => ({ ...current, birthDate }))}
                />
              </Field>
              <Field label="Müşteri kaynağı">
                <ValooSelect
                  value={customer.customerSource}
                  onChange={(customerSource) => setCustomer((current) => ({ ...current, customerSource: customerSource as QuickCustomerState["customerSource"] }))}
                  searchable={false}
                  placeholder="Seçin"
                  options={[
                    { value: "INSTAGRAM", label: "Instagram" },
                    { value: "GOOGLE", label: "Google" },
                    { value: "REFERRAL", label: "Tavsiye" },
                    { value: "WALK_IN", label: "Doğrudan" },
                    { value: "OTHER", label: "Diğer" },
                  ]}
                />
              </Field>
            </FormGrid>
          </FormSection>

          <FormSection className="mt-5" title="Onaylar ve iletişim tercihleri" description="Onaylar kullanıcı tarafından açıkça verilmelidir.">
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
              <CheckboxField
                checked={customer.explicitConsent}
                onChange={(checked) => setCustomer((current) => ({ ...current, explicitConsent: checked }))}
                label="Açık rıza verildi"
              />
              <div className="grid gap-2 sm:grid-cols-3">
                <CheckboxField checked={customer.marketingSms} onChange={(checked) => setCustomer((current) => ({ ...current, marketingSms: checked }))} label="SMS" />
                <CheckboxField checked={customer.marketingEmail} onChange={(checked) => setCustomer((current) => ({ ...current, marketingEmail: checked }))} label="E-posta" />
                <CheckboxField checked={customer.marketingPhone} onChange={(checked) => setCustomer((current) => ({ ...current, marketingPhone: checked }))} label="Telefon" />
              </div>
            </div>
          </FormSection>

          {error ? <div className="mt-4"><Alert>{error}</Alert></div> : null}
          <QuickFormActions saving={saving} onClose={onClose} idleLabel="Müşteriyi oluştur" />
        </form>
      ) : null}

      {action === "service" ? (
        <form onSubmit={saveService}>
          <FormSection title="Hizmet bilgileri" description="Hizmetin operasyon ve fiyatlandırma bilgilerini tanımlayın.">
            <FormGrid>
              <Field label="Hizmet adı" required>
                <TextInput required value={service.name} onChange={(event) => setService((current) => ({ ...current, name: event.target.value }))} />
              </Field>
              <Field label="Kategori">
                <TextInput value={service.category} onChange={(event) => setService((current) => ({ ...current, category: event.target.value }))} />
              </Field>
            </FormGrid>
            <Field label="Açıklama">
              <TextArea rows={3} value={service.description} onChange={(event) => setService((current) => ({ ...current, description: event.target.value }))} />
            </Field>
            <FormGrid>
              <Field label="Hizmet süresi (dk)" required>
                <TextInput type="number" min={1} max={1440} required value={service.duration} onChange={(event) => setService((current) => ({ ...current, duration: event.target.value }))} />
              </Field>
              <Field label="Hazırlık (dk)">
                <TextInput type="number" min={0} max={240} value={service.preparationMinutes} onChange={(event) => setService((current) => ({ ...current, preparationMinutes: event.target.value }))} />
              </Field>
              <Field label="Kapanış / temizlik (dk)">
                <TextInput type="number" min={0} max={240} value={service.cleanupMinutes} onChange={(event) => setService((current) => ({ ...current, cleanupMinutes: event.target.value }))} />
              </Field>
              <Field label="Satış fiyatı" required>
                <TextInput type="number" min={0} step="0.01" required value={service.price} onChange={(event) => setService((current) => ({ ...current, price: event.target.value }))} />
              </Field>
              <Field label="Maliyet">
                <TextInput type="number" min={0} step="0.01" value={service.cost} onChange={(event) => setService((current) => ({ ...current, cost: event.target.value }))} />
              </Field>
              <Field label="KDV (%)">
                <TextInput type="number" min={0} max={100} step="0.01" value={service.taxRate} onChange={(event) => setService((current) => ({ ...current, taxRate: event.target.value }))} />
              </Field>
              <Field label="Para birimi">
                <ValooSelect value={service.currency} onChange={(currency) => setService((current) => ({ ...current, currency }))} searchable={false} options={[
                  { value: "TRY", label: "TRY · Türk Lirası" },
                  { value: "EUR", label: "EUR · Euro" },
                  { value: "USD", label: "USD · ABD Doları" },
                ]} />
              </Field>
            </FormGrid>
            <CheckboxField
              checked={service.requiresConsultation}
              onChange={(requiresConsultation) => setService((current) => ({ ...current, requiresConsultation }))}
              label="Ön danışmanlık gerekli"
            />
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
                <ValooSelect
                  value={appointment.customerId}
                  onChange={(customerId) =>
                    setAppointment((current) => ({ ...current, customerId }))
                  }
                  disabled={loadingRefs}
                  loading={loadingRefs}
                  placeholder="Müşteri seçin"
                  searchPlaceholder="Müşteri ara…"
                  options={customers.map((item) => ({
                    value: item.id,
                    label: labelName(item.firstName, item.lastName),
                    keywords: [item.phone, item.email].filter(Boolean).join(" "),
                  }))}
                />
              </Field>
              <Field label="Personel" required>
                <ValooSelect
                  value={appointment.staffId}
                  onChange={(staffId) =>
                    setAppointment((current) => ({ ...current, staffId }))
                  }
                  disabled={loadingRefs}
                  loading={loadingRefs}
                  placeholder="Personel seçin"
                  searchPlaceholder="Personel ara…"
                  options={staff.map((item) => ({
                    value: item.id,
                    label: labelName(item.firstName, item.lastName),
                  }))}
                />
              </Field>
            </FormGrid>

            <Field label="Hizmet" required>
              <ValooSelect
                value={appointment.serviceId}
                onChange={handleAppointmentServiceChange}
                disabled={loadingRefs}
                loading={loadingRefs}
                placeholder="Hizmet seçin"
                searchPlaceholder="Hizmet ara…"
                options={services.map((item) => ({
                  value: item.id,
                  label: item.name,
                  description: `${item.durationMinutes} dk · ₺${Number(item.price).toLocaleString("tr-TR")}`,
                }))}
              />
            </Field>
            {eligibleSessions.length || loadingSessions ? (
              <Field label="Paket / Seans">
                <ValooSelect
                  value={appointment.sessionId}
                  onChange={(sessionId) => setAppointment((current) => ({ ...current, sessionId }))}
                  loading={loadingSessions}
                  placeholder="Paket kullanmadan devam et"
                  searchPlaceholder="Paket ara…"
                  options={eligibleSessions.map((session) => ({
                    value: session.id,
                    label: session.customerPackage.package.name,
                    description: `${session.service.name} · kullanılabilir seans`,
                  }))}
                />
              </Field>
            ) : appointment.customerId && appointment.serviceId ? (
              <FormHint tone="neutral">Seçilen müşteri ve hizmet için kullanılabilir paket seansı bulunmuyor.</FormHint>
            ) : null}
          </FormSection>

          <FormSection className="mt-5" title="Zaman" description="Randevunun başlangıç ve bitiş saatini belirleyin.">
            <FormGrid>
              <Field label="Başlangıç" required>
                <DateTimePicker
                  value={appointment.startAt}
                  max={appointment.endAt || undefined}
                  ariaLabel="Randevu başlangıcı"
                  onChange={(value) =>
                    setAppointment((current) => ({
                      ...current,
                      startAt: value,
                      endAt: addMinutes(value, selectedService?.durationMinutes ?? 60),
                    }))
                  }
                />
              </Field>
              <Field label="Bitiş" required>
                <DateTimePicker
                  value={appointment.endAt}
                  min={appointment.startAt || undefined}
                  ariaLabel="Randevu bitişi"
                  onChange={(value) => setAppointment((current) => ({ ...current, endAt: value }))}
                />
              </Field>
            </FormGrid>
            <Field label="Not">
              <TextArea rows={2} value={appointment.notes} onChange={(event) => setAppointment((current) => ({ ...current, notes: event.target.value }))} />
            </Field>
          </FormSection>

          {appointmentConflict ? (
            <FormHint tone="warning" title="Personel çakışması">
              Seçilen personelin bu saat aralığında başka bir randevusu var.
            </FormHint>
          ) : null}

          <FormSummary title="Randevu özeti">
            <FormSummaryItem label="Müşteri" value={selectedCustomer ? labelName(selectedCustomer.firstName, selectedCustomer.lastName) : "Seçilmedi"} />
            <FormSummaryItem label="Hizmet" value={selectedService?.name ?? "Seçilmedi"} detail={selectedService ? `${selectedService.durationMinutes} dk · ₺${Number(selectedService.price).toLocaleString("tr-TR")}` : undefined} />
            <FormSummaryItem label="Personel" value={selectedStaff ? labelName(selectedStaff.firstName, selectedStaff.lastName) : "Seçilmedi"} />
            <FormSummaryItem label="Paket" value={appointment.sessionId ? eligibleSessions.find((item) => item.id === appointment.sessionId)?.customerPackage.package.name ?? "Seçili" : "Standart hizmet"} />
          </FormSummary>

          {error ? <div className="mt-4"><Alert>{error}</Alert></div> : null}
          <QuickFormActions saving={saving} onClose={onClose} idleLabel="Randevuyu oluştur" disabled={Boolean(appointmentConflict)} />
        </form>
      ) : null}

      {action === "payment" ? (
        <form onSubmit={savePayment}>
          {loadingRefs ? <FormHint tone="info">Yaklaşan randevular yükleniyor.</FormHint> : null}

          <FormSection className="mt-4" title="Tahsilat" description="Randevu, tutar ve ödeme yöntemini seçin.">
            <Field label="Randevu" required>
              <ValooSelect
                value={payment.appointmentId}
                onChange={handlePaymentAppointmentChange}
                disabled={loadingRefs}
                loading={loadingRefs}
                placeholder="Randevu seçin"
                searchPlaceholder="Randevu ara…"
                options={paymentOptions.map((option) => ({
                  value: option.id,
                  label: option.label,
                }))}
              />
            </Field>
            <FormGrid>
              <Field label="Tutar" required>
                <TextInput type="number" min={0.01} step="0.01" required value={payment.amount} onChange={(event) => setPayment((current) => ({ ...current, amount: event.target.value }))} />
              </Field>
              <Field label="Yöntem">
                <ValooSegmentedControl
                  value={payment.method}
                  onChange={(method) =>
                    setPayment((current) => ({ ...current, method }))
                  }
                  ariaLabel="Ödeme yöntemi"
                  options={[
                    { value: "CARD", label: "Kart" },
                    { value: "CASH", label: "Nakit" },
                    { value: "TRANSFER", label: "Havale / EFT" },
                  ]}
                />
              </Field>
            </FormGrid>
            <Field label="Ödeme tarihi ve saati" required>
              <DateTimePicker
                value={payment.paidAt}
                max={localDateTime(0)}
                ariaLabel="Ödeme tarihi ve saati"
                onChange={(paidAt) => setPayment((current) => ({ ...current, paidAt }))}
              />
            </Field>
          </FormSection>

          {payment.appointmentId ? (() => {
            const selectedAppointment = appointments.find((item) => item.id === payment.appointmentId);
            const selectedCustomerForPayment = selectedAppointment ? customers.find((item) => item.id === selectedAppointment.customerId) : undefined;
            const selectedServiceForPayment = selectedAppointment ? services.find((item) => item.id === selectedAppointment.serviceId) : undefined;
            return (
              <FormSummary title="Tahsilat özeti">
                <FormSummaryItem label="Müşteri" value={selectedCustomerForPayment ? labelName(selectedCustomerForPayment.firstName, selectedCustomerForPayment.lastName) : "—"} />
                <FormSummaryItem label="Hizmet" value={selectedServiceForPayment?.name ?? "—"} />
                <FormSummaryItem label="Tutar" value={payment.amount ? `₺${Number(payment.amount).toLocaleString("tr-TR")}` : "—"} />
                <FormSummaryItem label="Yöntem" value={payment.method === "CARD" ? "Kart" : payment.method === "CASH" ? "Nakit" : "Havale / EFT"} />
              </FormSummary>
            );
          })() : null}

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
  disabled = false,
}: {
  saving: boolean;
  onClose: () => void;
  idleLabel: string;
  disabled?: boolean;
}) {
  return (
    <FormActions sticky>
      <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
        Vazgeç
      </Button>
      <FormSubmitButton saving={saving} disabled={disabled} idleLabel={idleLabel} />
    </FormActions>
  );
}
