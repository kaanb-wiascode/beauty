"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Alert, Button, Spinner, Select } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import { userErrorMessage, userLabel } from "@/lib/user-language";

type Lead = {
  id: string;
  provider: string;
  campaignName?: string | null;
  firstName: string;
  lastName: string;
  phone?: string | null;
  email?: string | null;
  status: string;
  serviceInterest?: string | null;
  assignedUserId?: string | null;
  branchId?: string | null;
  crmLeadId?: string | null;
  customerId?: string | null;
  appointmentId?: string | null;
  saleId?: string | null;
  revenueAmount: string | number;
  receivedAt: string;
};

type Campaign = { id: string; name: string };
type StaffOption = { id: string; firstName: string; lastName: string; status?: string };
type ServiceOption = { id: string; name: string; durationMinutes: number; status?: string };
type Paginated<T> = { data: T[] };

type ConvertResponse = {
  crmLeadId: string;
  branchId?: string;
  ownerUserId?: string | null;
  routingRuleId?: string | null;
  idempotent: boolean;
};

type CustomerConvertResponse = {
  customerId: string;
  crmLeadId?: string | null;
  matchedExisting?: boolean;
  idempotent: boolean;
};

type AppointmentResponse = {
  id?: string;
  appointmentId?: string;
  customerId?: string;
  idempotent: boolean;
};

const fieldClass = "mt-2 h-11 w-full rounded-[13px] border border-[var(--line)] bg-white px-3 text-[12px] text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";

function localDateTime(hoursAhead: number) {
  const date = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
  date.setSeconds(0, 0);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default function MarketingLeadsPage() {
  const canManage = hasPermission("communications", "manage");
  const canCreateAppointment = hasPermission("appointments", "create");
  const canReadStaff = hasPermission("staff", "read");
  const canReadServices = hasPermission("services", "read");
  const canScheduleFromInbox = canCreateAppointment && canReadStaff && canReadServices;

  const [leads, setLeads] = useState<Lead[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [convertingId, setConvertingId] = useState("");
  const [customerConvertingId, setCustomerConvertingId] = useState("");
  const [appointmentSaving, setAppointmentSaving] = useState(false);
  const [appointmentLeadId, setAppointmentLeadId] = useState("");
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [provider, setProvider] = useState("MANUAL");
  const [campaignId, setCampaignId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [serviceInterest, setServiceInterest] = useState("");
  const [externalLeadId, setExternalLeadId] = useState("");
  const [appointmentStaffId, setAppointmentStaffId] = useState("");
  const [appointmentServiceId, setAppointmentServiceId] = useState("");
  const [appointmentStartAt, setAppointmentStartAt] = useState(() => localDateTime(24));
  const [appointmentEndAt, setAppointmentEndAt] = useState(() => localDateTime(25));
  const [appointmentNotes, setAppointmentNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const referenceRequests: Promise<unknown>[] = [
        api<Lead[]>("/corporate-communications/leads?limit=200"),
        api<Campaign[]>("/corporate-communications/campaigns?limit=200"),
      ];
      if (canScheduleFromInbox) {
        referenceRequests.push(
          api<Paginated<StaffOption>>("/staff?page=1&limit=100"),
          api<Paginated<ServiceOption>>("/services?page=1&limit=100"),
        );
      }
      const results = await Promise.all(referenceRequests);
      setLeads(results[0] as Lead[]);
      setCampaigns(results[1] as Campaign[]);
      if (canScheduleFromInbox) {
        setStaff((results[2] as Paginated<StaffOption>).data.filter((item) => item.status === "ACTIVE"));
        setServices((results[3] as Paginated<ServiceOption>).data.filter((item) => item.status === "ACTIVE"));
      }
    } catch (e) {
      setError(e instanceof ApiError ? userErrorMessage(e.message, "Potansiyel müşteri verileri yüklenemedi.") : "Potansiyel müşteri verileri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [canScheduleFromInbox]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createLead(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api("/corporate-communications/leads", {
        method: "POST",
        body: {
          provider,
          campaignId: campaignId || undefined,
          externalLeadId: externalLeadId || undefined,
          firstName,
          lastName,
          phone: phone || undefined,
          email: email || undefined,
          serviceInterest: serviceInterest || undefined,
        },
      });
      setFirstName("");
      setLastName("");
      setPhone("");
      setEmail("");
      setServiceInterest("");
      setExternalLeadId("");
      setShowForm(false);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? userErrorMessage(e.message, "Potansiyel müşteri kaydedilemedi.") : "Potansiyel müşteri kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  async function convertToCrm(leadId: string) {
    setConvertingId(leadId);
    setError("");
    try {
      const result = await api<ConvertResponse>(
        `/corporate-communications/leads/${leadId}/convert-to-crm`,
        { method: "POST" },
      );
      setLeads((current) => current.map((lead) => lead.id === leadId ? {
        ...lead,
        crmLeadId: result.crmLeadId,
        branchId: result.branchId ?? lead.branchId,
        assignedUserId: result.ownerUserId ?? lead.assignedUserId,
        status: "IN_CRM",
      } : lead));
    } catch (e) {
      setError(e instanceof ApiError ? userErrorMessage(e.message, "Potansiyel müşteri, müşteri ilişkileri kaydına aktarılamadı.") : "Potansiyel müşteri, müşteri ilişkileri kaydına aktarılamadı.");
    } finally {
      setConvertingId("");
    }
  }

  async function convertToCustomer(leadId: string) {
    setCustomerConvertingId(leadId);
    setError("");
    try {
      const result = await api<CustomerConvertResponse>(
        `/corporate-communications/leads/${leadId}/convert-to-customer`,
        { method: "POST" },
      );
      setLeads((current) => current.map((lead) => lead.id === leadId ? {
        ...lead,
        customerId: result.customerId,
      } : lead));
    } catch (e) {
      setError(e instanceof ApiError ? userErrorMessage(e.message, "Potansiyel müşteri, müşteri kaydına dönüştürülemedi.") : "Potansiyel müşteri, müşteri kaydına dönüştürülemedi.");
    } finally {
      setCustomerConvertingId("");
    }
  }

  function openAppointment(leadId: string) {
    setAppointmentLeadId(leadId);
    setAppointmentStaffId("");
    setAppointmentServiceId("");
    setAppointmentStartAt(localDateTime(24));
    setAppointmentEndAt(localDateTime(25));
    setAppointmentNotes("");
    setError("");
  }

  async function createAppointment(event: FormEvent) {
    event.preventDefault();
    if (!appointmentLeadId) return;
    setAppointmentSaving(true);
    setError("");
    try {
      const result = await api<AppointmentResponse>(
        `/corporate-communications/leads/${appointmentLeadId}/create-appointment`,
        {
          method: "POST",
          body: {
            staffId: appointmentStaffId,
            serviceId: appointmentServiceId,
            startAt: new Date(appointmentStartAt).toISOString(),
            endAt: new Date(appointmentEndAt).toISOString(),
            notes: appointmentNotes || undefined,
          },
        },
      );
      const appointmentId = result.id ?? result.appointmentId;
      setLeads((current) => current.map((lead) => lead.id === appointmentLeadId ? {
        ...lead,
        appointmentId: appointmentId ?? lead.appointmentId,
        status: "APPOINTMENT",
      } : lead));
      setAppointmentLeadId("");
    } catch (e) {
      setError(e instanceof ApiError ? userErrorMessage(e.message, "Randevu oluşturulamadı.") : "Randevu oluşturulamadı.");
    } finally {
      setAppointmentSaving(false);
    }
  }

  if (loading && !leads.length) {
    return <div className="py-20"><Spinner label="Potansiyel müşteri kayıtları yükleniyor..." /></div>;
  }

  return (
    <div className="space-y-6 pb-12">
      <header className="flex flex-col gap-4 rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-[var(--accent)]">Kurumsal İletişim</p>
          <h1 className="text-[30px] font-semibold tracking-[-.04em] text-[var(--ink)]">Potansiyel Müşteriler ve Dönüşüm</h1>
          <p className="mt-2 max-w-3xl text-[12px] leading-5 text-[var(--muted)]">Reklam ve iletişim taleplerini müşteri kaydına ve randevu planlamasına dönüştürün. Şube, yetki ve randevu çakışma kuralları otomatik olarak korunur.</p>
        </div>
        {canManage ? <Button onClick={() => setShowForm((v) => !v)}>{showForm ? "Formu Kapat" : "Potansiyel Müşteri Ekle"}</Button> : null}
      </header>
      {error ? <Alert>{error}</Alert> : null}

      {showForm && canManage ? (
        <form onSubmit={(e) => void createLead(e)} className="grid gap-4 rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5 md:grid-cols-2 xl:grid-cols-3">
          <label className="text-[11px] font-semibold text-[var(--muted)]">Kaynak<Select className={fieldClass} value={provider} onChange={(e) => setProvider(e.target.value)}><option value="MANUAL">Elle Eklendi</option><option value="META">Meta Reklamları</option><option value="GOOGLE_ADS">Google Reklamları</option><option value="TIKTOK">TikTok</option><option value="WEBSITE">Web Sitesi</option><option value="WHATSAPP">WhatsApp</option><option value="OTHER">Diğer</option></Select></label>
          <label className="text-[11px] font-semibold text-[var(--muted)]">Kampanya<Select className={fieldClass} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}><option value="">Kampanyasız</option>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</Select></label>
          <label className="text-[11px] font-semibold text-[var(--muted)]">Reklam kaynağı kayıt numarası<input className={fieldClass} value={externalLeadId} onChange={(e) => setExternalLeadId(e.target.value)} placeholder="İsteğe bağlı" /></label>
          <label className="text-[11px] font-semibold text-[var(--muted)]">Ad<input required className={fieldClass} value={firstName} onChange={(e) => setFirstName(e.target.value)} /></label>
          <label className="text-[11px] font-semibold text-[var(--muted)]">Soyad<input required className={fieldClass} value={lastName} onChange={(e) => setLastName(e.target.value)} /></label>
          <label className="text-[11px] font-semibold text-[var(--muted)]">Telefon<input className={fieldClass} value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
          <label className="text-[11px] font-semibold text-[var(--muted)]">E-posta<input type="email" className={fieldClass} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="text-[11px] font-semibold text-[var(--muted)] md:col-span-2">Hizmet İlgisi<input className={fieldClass} value={serviceInterest} onChange={(e) => setServiceInterest(e.target.value)} placeholder="Örn. Lazer epilasyon" /></label>
          <div className="md:col-span-2 xl:col-span-3"><Button disabled={saving} type="submit">{saving ? "Kaydediliyor..." : "Potansiyel Müşteriyi Kaydet"}</Button></div>
        </form>
      ) : null}

      {appointmentLeadId ? (
        <form onSubmit={(e) => void createAppointment(e)} className="grid gap-4 rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5 md:grid-cols-2 xl:grid-cols-3">
          <div className="md:col-span-2 xl:col-span-3">
            <h2 className="text-[15px] font-semibold text-[var(--ink)]">Potansiyel Müşteri Randevusu</h2>
            <p className="mt-1 text-[11px] text-[var(--muted)]">Aktif müşteri, hizmet ve personel aynı şubede doğrulanır; personel çakışması varsa işlem reddedilir.</p>
          </div>
          <label className="text-[11px] font-semibold text-[var(--muted)]">Hizmet<Select required className={fieldClass} value={appointmentServiceId} onChange={(e) => setAppointmentServiceId(e.target.value)}><option value="">Hizmet seçin</option>{services.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.durationMinutes} dk</option>)}</Select></label>
          <label className="text-[11px] font-semibold text-[var(--muted)]">Personel<Select required className={fieldClass} value={appointmentStaffId} onChange={(e) => setAppointmentStaffId(e.target.value)}><option value="">Personel seçin</option>{staff.map((item) => <option key={item.id} value={item.id}>{item.firstName} {item.lastName}</option>)}</Select></label>
          <label className="text-[11px] font-semibold text-[var(--muted)]">Başlangıç<input required type="datetime-local" className={fieldClass} value={appointmentStartAt} onChange={(e) => setAppointmentStartAt(e.target.value)} /></label>
          <label className="text-[11px] font-semibold text-[var(--muted)]">Bitiş<input required type="datetime-local" className={fieldClass} value={appointmentEndAt} onChange={(e) => setAppointmentEndAt(e.target.value)} /></label>
          <label className="text-[11px] font-semibold text-[var(--muted)] md:col-span-2">Not<input className={fieldClass} value={appointmentNotes} onChange={(e) => setAppointmentNotes(e.target.value)} placeholder="Kampanya / görüşme notu" /></label>
          <div className="flex gap-2 md:col-span-2 xl:col-span-3"><Button disabled={appointmentSaving} type="submit">{appointmentSaving ? "Randevu oluşturuluyor..." : "Randevuyu oluştur"}</Button><Button type="button" onClick={() => setAppointmentLeadId("")}>Vazgeç</Button></div>
        </form>
      ) : null}

      <section className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5">
        {leads.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1320px] text-left">
              <thead><tr className="border-b border-[var(--line)] text-[10px] uppercase tracking-[.1em] text-[var(--muted-soft)]"><th className="px-3 py-3">Potansiyel Müşteri</th><th className="px-3 py-3">Kaynak</th><th className="px-3 py-3">Kampanya</th><th className="px-3 py-3">İlgi</th><th className="px-3 py-3">Durum</th><th className="px-3 py-3">Operasyon Akışı</th><th className="px-3 py-3">Dönüşüm</th><th className="px-3 py-3">Geliş</th></tr></thead>
              <tbody>{leads.map((lead) => (
                <tr key={lead.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-3 py-4"><p className="text-[13px] font-semibold text-[var(--ink)]">{lead.firstName} {lead.lastName}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{lead.phone || lead.email || "—"}</p></td>
                  <td className="px-3 py-4 text-[11px] text-[var(--muted)]">{userLabel(lead.provider)}</td>
                  <td className="px-3 py-4 text-[11px] text-[var(--muted)]">{lead.campaignName ?? "—"}</td>
                  <td className="px-3 py-4 text-[11px] text-[var(--muted)]">{lead.serviceInterest ?? "—"}</td>
                  <td className="px-3 py-4"><span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[9px] font-semibold text-[var(--accent)]">{userLabel(lead.status)}</span></td>
                  <td className="px-3 py-4"><div className="flex flex-wrap gap-2">
                    {!lead.crmLeadId && canManage ? <Button disabled={convertingId === lead.id} onClick={() => void convertToCrm(lead.id)}>{convertingId === lead.id ? "Aktarılıyor..." : "Müşteri İlişkilerine Aktar"}</Button> : null}
                    {lead.crmLeadId && !lead.customerId && canManage ? <Button disabled={customerConvertingId === lead.id} onClick={() => void convertToCustomer(lead.id)}>{customerConvertingId === lead.id ? "Dönüştürülüyor..." : "Müşteriye Dönüştür"}</Button> : null}
                    {lead.customerId && !lead.appointmentId && canScheduleFromInbox ? <Button onClick={() => openAppointment(lead.id)}>Randevu Oluştur</Button> : null}
                    {lead.crmLeadId ? <Link className="self-center text-[11px] font-semibold text-[var(--accent)] hover:underline" href="/crm/leads">Müşteri İlişkileri</Link> : null}
                    {lead.customerId ? <Link className="self-center text-[11px] font-semibold text-[var(--accent)] hover:underline" href={`/customers/${lead.customerId}`}>Müşteri</Link> : null}
                    {lead.appointmentId ? <Link className="self-center text-[11px] font-semibold text-[var(--accent)] hover:underline" href="/appointments">Randevu</Link> : null}
                    {lead.customerId && !lead.appointmentId && canCreateAppointment && !canScheduleFromInbox ? <span className="self-center text-[10px] text-[var(--muted)]">Randevu oluşturmak için personel ve hizmetleri görüntüleme yetkisi gerekir.</span> : null}
                  </div></td>
                  <td className="px-3 py-4 text-[10px] text-[var(--muted)]">{lead.saleId ? "Satış" : lead.appointmentId ? "Randevu" : lead.customerId ? "Müşteri" : lead.crmLeadId ? "Müşteri ilişkileri" : "Yeni potansiyel müşteri"}</td>
                  <td className="px-3 py-4 text-[10px] text-[var(--muted)]">{new Date(lead.receivedAt).toLocaleString("tr-TR")}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <div className="py-14 text-center text-[12px] text-[var(--muted)]">Henüz potansiyel müşteri kaydı yok.</div>}
      </section>
    </div>
  );
}
