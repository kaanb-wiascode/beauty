"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  Alert,
  Button,
  EmptyState,
  Field,
  Modal,
  Select,
  Spinner,
  StatusBadge,
  TextArea,
  TextInput,
} from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import type {
  Appointment,
  AppointmentStatus,
  Customer,
  Paginated,
  Service,
  Staff,
} from "@/lib/types";
import {
  addMinutesLocal,
  appointmentStatusLabel,
  defaultStartLocal,
  formatTime,
  fullName,
  toDateTimeLocal,
  toIso,
} from "@/lib/format";

const DAY_START_HOUR = 8;
const DAY_END_HOUR = 20;
const SLOT_MINUTES = 30;
const SLOT_HEIGHT = 58;

const statusStyles: Record<AppointmentStatus, string> = {
  SCHEDULED: "border-[#dfe3e8] bg-[#f3f5f7] text-[#526071]",
  CONFIRMED: "border-[#d8eadf] bg-[#eef8f1] text-[#2f7a56]",
  COMPLETED: "border-[#d9e5f3] bg-[#eef5fc] text-[#476a8c]",
  CANCELLED: "border-[#f1d7dc] bg-[#fff0f2] text-[#a34658]",
  NO_SHOW: "border-[#eadde8] bg-[#f8f0f7] text-[#795a73]",
};

const dotStyles: Record<AppointmentStatus, string> = {
  SCHEDULED: "bg-[#8d99a8]",
  CONFIRMED: "bg-[#35a36a]",
  COMPLETED: "bg-[#719bd0]",
  CANCELLED: "bg-[#ef5b70]",
  NO_SHOW: "bg-[#a67e9c]",
};

function startOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

function addDays(date: Date, amount: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function dateInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDay(date: Date) {
  return new Intl.DateTimeFormat("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function appointmentTop(startAt: string) {
  const date = new Date(startAt);
  const minutes = date.getHours() * 60 + date.getMinutes() - DAY_START_HOUR * 60;
  return Math.max(0, (minutes / SLOT_MINUTES) * SLOT_HEIGHT);
}

function appointmentHeight(startAt: string, endAt: string) {
  const minutes = Math.max(
    SLOT_MINUTES,
    Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000),
  );
  return Math.max(SLOT_HEIGHT, (minutes / SLOT_MINUTES) * SLOT_HEIGHT);
}

type FormState = {
  customerId: string;
  staffId: string;
  serviceId: string;
  startAt: string;
  endAt: string;
  notes: string;
  status: AppointmentStatus;
};

function emptyForm() {
  const start = defaultStartLocal();
  return {
    customerId: "",
    staffId: "",
    serviceId: "",
    startAt: start,
    endAt: addMinutesLocal(start, 60),
    notes: "",
    status: "SCHEDULED" as AppointmentStatus,
  } satisfies FormState;
}

function Icon({ name, className = "h-5 w-5" }: { name: "calendar" | "clock" | "check" | "x" | "users" | "search" | "filter" | "chevron" | "note"; className?: string }) {
  const common = { className, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "calendar") return <svg {...common}><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M8 2v4M16 2v4M3 9h18" /></svg>;
  if (name === "clock") return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></svg>;
  if (name === "check") return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></svg>;
  if (name === "x") return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6m0-6-6 6" /></svg>;
  if (name === "users") return <svg {...common}><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 6.5a3 3 0 0 1 0 5.8M17 14a4.5 4.5 0 0 1 4 5" /></svg>;
  if (name === "search") return <svg {...common}><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>;
  if (name === "filter") return <svg {...common}><path d="M4 6h16M7 12h10M10 18h4" /></svg>;
  if (name === "chevron") return <svg {...common}><path d="m9 6 6 6-6 6" /></svg>;
  return <svg {...common}><path d="M5 4h14v16H5z" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>;
}

export default function AppointmentsPage() {
  const canCreateAppointment = hasPermission("appointments", "create");
  const canUpdateAppointment = hasPermission("appointments", "update");
  const canCancelAppointment = hasPermission("appointments", "cancel");
  const canCreatePayment = hasPermission("payments", "create");
  const searchParams = useSearchParams();
  const customerIdFromUrl = searchParams.get("customerId");

  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [staffFilter, setStaffFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | "">("");
  const [loading, setLoading] = useState(true);
  const [loadingRefs, setLoadingRefs] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<"day" | "week" | "month">("day");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingCancel, setPendingCancel] = useState<Appointment | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentAppointment, setPaymentAppointment] = useState<Appointment | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD" | "TRANSFER">("CARD");
  const [paymentSaving, setPaymentSaving] = useState(false);

  const dateFrom = useMemo(() => toIso(startOfDay(selectedDate).toISOString()), [selectedDate]);
  const dateTo = useMemo(() => toIso(endOfDay(selectedDate).toISOString()), [selectedDate]);

  async function loadAppointments() {
    setLoading(true);
    try {
      const result = await api<Paginated<Appointment>>(withQuery("/appointments", { page: 1, limit: 100, from: dateFrom, to: dateTo }));
      setAppointments(result.data);
      setSelectedId((current) => current && result.data.some((item) => item.id === current) ? current : result.data[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Randevular yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  async function loadReferences() {
    setLoadingRefs(true);
    try {
      const [customerResult, staffResult, serviceResult] = await Promise.all([
        api<Paginated<Customer>>(withQuery("/customers", { page: 1, limit: 100 })),
        api<Paginated<Staff>>(withQuery("/staff", { page: 1, limit: 100 })),
        api<Paginated<Service>>(withQuery("/services", { page: 1, limit: 100 })),
      ]);
      setCustomers(customerResult.data);
      setStaff(staffResult.data);
      setServices(serviceResult.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Randevu seçenekleri yüklenemedi.");
    } finally {
      setLoadingRefs(false);
    }
  }

  useEffect(() => { void loadAppointments(); }, [dateFrom, dateTo]);
  useEffect(() => { void loadReferences(); }, []);

  const customerMap = useMemo(() => new Map(customers.map((item) => [item.id, fullName(item.firstName, item.lastName)])), [customers]);
  const staffMap = useMemo(() => new Map(staff.map((item) => [item.id, fullName(item.firstName, item.lastName)])), [staff]);
  const serviceMap = useMemo(() => new Map(services.map((item) => [item.id, item.name])), [services]);
  const activeStaff = useMemo(() => staff.filter((item) => item.status === "ACTIVE"), [staff]);

  const filteredAppointments = useMemo(() => appointments.filter((appointment) => {
    const haystack = `${customerMap.get(appointment.customerId) ?? ""} ${serviceMap.get(appointment.serviceId) ?? ""} ${staffMap.get(appointment.staffId) ?? ""}`.toLocaleLowerCase("tr-TR");
    return (!search || haystack.includes(search.toLocaleLowerCase("tr-TR"))) &&
      (!staffFilter || appointment.staffId === staffFilter) &&
      (!serviceFilter || appointment.serviceId === serviceFilter) &&
      (!statusFilter || appointment.status === statusFilter);
  }).sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()), [appointments, customerMap, search, serviceMap, staffFilter, staffMap, statusFilter]);

  const selected = filteredAppointments.find((item) => item.id === selectedId) ?? filteredAppointments[0] ?? null;
  const counts = useMemo(() => ({
    total: appointments.length,
    waiting: appointments.filter((item) => item.status === "SCHEDULED").length,
    completed: appointments.filter((item) => item.status === "COMPLETED" || item.status === "CONFIRMED").length,
    cancelled: appointments.filter((item) => item.status === "CANCELLED" || item.status === "NO_SHOW").length,
  }), [appointments]);

  const slots = Array.from({ length: ((DAY_END_HOUR - DAY_START_HOUR) * 60) / SLOT_MINUTES + 1 }, (_, index) => DAY_START_HOUR * 60 + index * SLOT_MINUTES);
  const staffColumns = (activeStaff.length ? activeStaff : staff).slice(0, 5);

  function openCreate(initialStart?: string) {
    const next = emptyForm();
    if (customerIdFromUrl && customers.some((item) => item.id === customerIdFromUrl)) next.customerId = customerIdFromUrl;
    if (initialStart) {
      next.startAt = initialStart;
      next.endAt = addMinutesLocal(initialStart, 60);
    }
    setEditing(null);
    setForm(next);
    setModalOpen(true);
  }

  function openEdit(appointment: Appointment) {
    if (!canUpdateAppointment) return;
    setEditing(appointment);
    setForm({
      customerId: appointment.customerId,
      staffId: appointment.staffId,
      serviceId: appointment.serviceId,
      startAt: toDateTimeLocal(appointment.startAt),
      endAt: toDateTimeLocal(appointment.endAt),
      notes: appointment.notes ?? "",
      status: appointment.status,
    });
    setModalOpen(true);
  }

  async function saveAppointment() {
    if (!form.customerId || !form.staffId || !form.serviceId || !form.startAt || !form.endAt) {
      setError("Lütfen randevu bilgilerini tamamlayın.");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api(`/appointments/${editing.id}`, { method: "PATCH", body: { customerId: form.customerId, staffId: form.staffId, serviceId: form.serviceId, startAt: toIso(form.startAt), endAt: toIso(form.endAt), notes: form.notes, status: form.status } });
      } else {
        await api("/appointments", { method: "POST", body: { customerId: form.customerId, staffId: form.staffId, serviceId: form.serviceId, startAt: toIso(form.startAt), endAt: toIso(form.endAt), notes: form.notes } });
      }
      setModalOpen(false);
      setEditing(null);
      await loadAppointments();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Randevu kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  async function cancelAppointment() {
    if (!pendingCancel) return;
    setSaving(true);
    try {
      await api(`/appointments/${pendingCancel.id}`, { method: "DELETE" });
      setConfirmOpen(false);
      setPendingCancel(null);
      await loadAppointments();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Randevu iptal edilemedi.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(status: AppointmentStatus) {
    if (!selected || !canUpdateAppointment) return;
    setSaving(true);
    try {
      const updated = await api<Appointment>(`/appointments/${selected.id}`, { method: "PATCH", body: { status } });
      setAppointments((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Randevu durumu güncellenemedi.");
    } finally {
      setSaving(false);
    }
  }

  function openPayment() {
    if (!selected || !canCreatePayment) return;
    const service = services.find((item) => item.id === selected.serviceId);
    setPaymentAppointment(selected);
    setPaymentAmount(selected.payment?.amount ? String(selected.payment.amount) : service ? String(service.price) : "");
    setPaymentMethod("CARD");
    setPaymentOpen(true);
  }

  async function createPayment() {
    if (!paymentAppointment || !paymentAmount) return;
    setPaymentSaving(true);
    try {
      await api("/payments", { method: "POST", body: { appointmentId: paymentAppointment.id, amount: Number(paymentAmount), method: paymentMethod } });
      setPaymentOpen(false);
      setPaymentAppointment(null);
      await loadAppointments();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ödeme kaydedilemedi.");
    } finally {
      setPaymentSaving(false);
    }
  }

  const customerName = selected ? customerMap.get(selected.customerId) ?? "Müşteri" : "";
  const selectedStaff = selected ? staffMap.get(selected.staffId) ?? "Personel" : "";
  const selectedService = selected ? serviceMap.get(selected.serviceId) ?? "Hizmet" : "";
  const selectedServicePrice = selected ? services.find((item) => item.id === selected.serviceId)?.price : undefined;

  return (
    <div className="mx-auto max-w-[1540px] space-y-5 pb-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[13px] font-medium text-[var(--muted)]">Günlük program</p>
          <h1 className="mt-1 text-[32px] font-semibold tracking-[-0.045em] text-[var(--ink)] sm:text-[38px]">Randevular</h1>
          <p className="mt-1 text-[14px] text-[var(--muted)]">Tüm randevularınızı yönetin, günlük programınızı takip edin.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-[14px] border border-[var(--line)] bg-white p-1 shadow-[0_4px_18px_rgba(28,25,23,0.04)]">
            <Button variant="ghost" className="h-9 min-h-9 px-2.5" onClick={() => setSelectedDate(addDays(selectedDate, -1))}>‹</Button>
            <button type="button" className="flex min-h-9 items-center gap-2 px-3 text-[13px] font-medium text-[var(--ink)]" onClick={() => setSelectedDate(startOfDay(new Date()))}>
              <Icon name="calendar" className="h-4 w-4 text-[var(--muted)]" />
              <span className="hidden sm:inline capitalize">{formatDay(selectedDate)}</span><span className="sm:hidden">Bugün</span>
            </button>
            <Button variant="ghost" className="h-9 min-h-9 px-2.5" onClick={() => setSelectedDate(addDays(selectedDate, 1))}>›</Button>
          </div>
          <Button variant="secondary" onClick={() => setSelectedDate(startOfDay(new Date()))}>Bugün</Button>
          {canCreateAppointment ? <Button onClick={() => openCreate()}>＋ Yeni randevu</Button> : null}
        </div>
      </div>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Bugünkü", counts.total, "toplam randevu", "calendar", "bg-[#f1f2ff] text-[#5962d7]"],
          ["Bekleyen", counts.waiting, "onay bekleyen", "clock", "bg-[#fff6e8] text-[#c78622]"],
          ["Tamamlanan", counts.completed, "bugün tamamlanan", "check", "bg-[#ecf8f0] text-[#399267]"],
          ["İptal", counts.cancelled, "iptal / gelmedi", "x", "bg-[#fff0f2] text-[#d45b6d]"],
        ].map(([label, value, sub, icon, tone]) => (
          <div key={label} className="surface rounded-[20px] p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] ${tone}`}><Icon name={icon as "calendar" | "clock" | "check" | "x"} className="h-[19px] w-[19px]" /></div>
              <span className="mt-1 text-[11px] font-medium text-[var(--muted)]">{label}</span>
            </div>
            <div className="mt-3 flex items-end justify-between gap-2"><strong className="text-[28px] font-semibold tracking-[-0.04em] text-[var(--ink)]">{value}</strong><span className="text-[11px] text-[var(--muted)]">{sub}</span></div>
          </div>
        ))}
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="surface min-w-0 overflow-hidden rounded-[22px]">
          <div className="flex flex-col gap-3 border-b border-[var(--line)] p-3 sm:p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-1 rounded-[13px] bg-[#f5f5f4] p-1">
                {([["day", "Günlük"], ["week", "Haftalık"], ["month", "Aylık"]] as const).map(([key, label]) => <button key={key} type="button" onClick={() => setView(key)} className={`rounded-[10px] px-3.5 py-2 text-[12px] font-medium transition ${view === key ? "bg-[var(--ink)] text-white shadow-sm" : "text-[var(--muted)] hover:text-[var(--ink)]"}`}>{label}</button>)}
              </div>
              <div className="flex min-w-0 flex-wrap gap-2">
                <div className="relative min-w-[180px] flex-1 sm:flex-none"><Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" /><TextInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Müşteri, hizmet veya personel ara..." className="h-10 pl-9 text-[12px] sm:w-[245px]" /></div>
                <Select value={staffFilter} onChange={(event) => setStaffFilter(event.target.value)} className="h-10 w-auto min-w-[135px] text-[12px]"><option value="">Tüm personel</option>{staff.map((item) => <option key={item.id} value={item.id}>{fullName(item.firstName, item.lastName)}</option>)}</Select>
                <Select value={serviceFilter} onChange={(event) => setServiceFilter(event.target.value)} className="h-10 w-auto min-w-[130px] text-[12px]"><option value="">Tüm hizmetler</option>{services.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
                <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as AppointmentStatus | "")} className="h-10 w-auto min-w-[125px] text-[12px]"><option value="">Tüm durumlar</option><option value="SCHEDULED">Planlandı</option><option value="CONFIRMED">Onaylandı</option><option value="COMPLETED">Tamamlandı</option><option value="CANCELLED">İptal</option><option value="NO_SHOW">Gelmedi</option></Select>
              </div>
            </div>
          </div>

          {view !== "day" ? (
            <div className="p-5"><div className="rounded-[16px] bg-[var(--surface-soft)] px-5 py-4 text-sm text-[var(--muted)]">{view === "week" ? "Haftalık görünüm" : "Aylık görünüm"} için tarih aralığını yukarıdaki kontrollerden seçebilirsiniz. Günlük program aynı randevu verilerini kullanır.</div></div>
          ) : loading ? <Spinner label="Randevular hazırlanıyor..." /> : filteredAppointments.length === 0 ? <EmptyState title="Bugün için randevu yok" description="Filtreleri temizleyin veya yeni bir randevu oluşturun." action={canCreateAppointment ? <Button onClick={() => openCreate()}>Yeni randevu</Button> : undefined} /> : (
            <div className="overflow-x-auto">
              <div className="min-w-[820px]">
                <div className="grid grid-cols-[58px_repeat(var(--staff-count),minmax(150px,1fr))]" style={{ "--staff-count": Math.max(staffColumns.length, 1) } as React.CSSProperties}>
                  <div className="border-r border-[var(--line)] bg-white" />
                  {staffColumns.map((member) => { const name = fullName(member.firstName, member.lastName); return <div key={member.id} className="border-b border-r border-[var(--line)] bg-white px-3 py-3"><div className="flex min-w-0 items-center gap-2"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#eef0f4] text-[10px] font-semibold text-[#667080]">{initials(name)}</div><div className="min-w-0"><p className="truncate text-[11px] font-semibold text-[var(--ink)]">{name}</p><p className="truncate text-[10px] text-[var(--muted)]">Güzellik uzmanı</p></div></div></div>; })}
                </div>
                <div className="relative grid grid-cols-[58px_1fr]">
                  <div className="border-r border-[var(--line)] bg-white">{slots.slice(0, -1).map((minutes) => <div key={minutes} className="flex h-[58px] items-start justify-end border-b border-[var(--line)] pr-2 pt-2 text-[10px] font-medium text-[var(--muted)]">{String(Math.floor(minutes / 60)).padStart(2, "0")}:{String(minutes % 60).padStart(2, "0")}</div>)}</div>
                  <div className="relative grid" style={{ gridTemplateColumns: `repeat(${Math.max(staffColumns.length, 1)}, minmax(150px, 1fr))`, height: `${(slots.length - 1) * SLOT_HEIGHT}px` }}>
                    {staffColumns.map((member) => <div key={member.id} className="relative border-r border-[var(--line)] bg-[linear-gradient(to_bottom,transparent_57px,var(--line)_58px)] [background-size:100%_58px]">{filteredAppointments.filter((item) => item.staffId === member.id).map((item) => { const customer = customerMap.get(item.customerId) ?? "Müşteri"; const service = serviceMap.get(item.serviceId) ?? "Hizmet"; const isSelected = selected?.id === item.id; return <button type="button" key={item.id} onClick={() => setSelectedId(item.id)} className={`absolute left-1.5 right-1.5 z-10 overflow-hidden rounded-[11px] border p-2 text-left shadow-[0_2px_7px_rgba(28,25,23,0.03)] transition hover:-translate-y-px hover:shadow-md ${statusStyles[item.status]} ${isSelected ? "ring-2 ring-[rgba(84,91,214,0.28)] ring-offset-1" : ""}`} style={{ top: appointmentTop(item.startAt), height: appointmentHeight(item.startAt, item.endAt) }}><div className="flex items-center justify-between gap-1 text-[9px] font-medium opacity-75"><span>{formatTime(item.startAt)} – {formatTime(item.endAt)}</span><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotStyles[item.status]}`} /></div><p className="mt-1 truncate text-[11px] font-semibold">{customer}</p><p className="truncate text-[10px] opacity-80">{service}</p><span className="mt-1 inline-flex max-w-full items-center rounded-full bg-white/60 px-1.5 py-0.5 text-[8px] font-medium">{appointmentStatusLabel(item.status)}</span></button>; })}</div>)}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[var(--line)] px-4 py-3 text-[10px] text-[var(--muted)]">{([["COMPLETED", "Tamamlandı"], ["CONFIRMED", "Devam ediyor"], ["SCHEDULED", "Bekliyor"], ["CANCELLED", "İptal"], ["NO_SHOW", "Gelmedi"]] as const).map(([key, label]) => <span key={key} className="inline-flex items-center gap-1.5"><i className={`h-2 w-2 rounded-full ${dotStyles[key]}`} />{label}</span>)}</div>
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <section className="surface overflow-hidden rounded-[22px]">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4"><div><p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Seçili Randevu</p>{selected ? <p className="mt-1 text-[11px] text-[var(--muted)]">{formatDay(new Date(selected.startAt))}</p> : null}</div>{selected ? <StatusBadge status={selected.status} label={appointmentStatusLabel(selected.status)} /> : null}</div>
            {selected ? <div className="p-5">
              <div className="flex items-end justify-between gap-3"><div className="flex items-center gap-2 text-[var(--accent)]"><Icon name="clock" className="h-5 w-5" /><strong className="text-[27px] font-semibold tracking-[-0.04em] text-[var(--ink)]">{formatTime(selected.startAt)}</strong></div><span className="text-[10px] text-[var(--muted)]">{Math.max(0, Math.round((new Date(selected.endAt).getTime() - new Date(selected.startAt).getTime()) / 60000))} dk</span></div>
              <div className="mt-5 flex items-center gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#eef0f4] text-[12px] font-semibold text-[#667080]">{initials(customerName)}</div><div className="min-w-0"><p className="truncate text-[15px] font-semibold text-[var(--ink)]">{customerName}</p><p className="text-[11px] text-[var(--muted)]">Müşteri</p></div></div>
              <div className="mt-5 divide-y divide-[var(--line)] rounded-[15px] border border-[var(--line)] bg-[var(--surface-soft)]">
                <div className="flex items-center gap-3 p-3"><div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-white text-[var(--accent)]"><Icon name="note" className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">Hizmet</p><p className="truncate text-[12px] font-semibold text-[var(--ink)]">{selectedService}</p></div><span className="text-[11px] font-medium text-[var(--muted)]">{selectedServicePrice ? `₺${Number(selectedServicePrice).toLocaleString("tr-TR")}` : "—"}</span></div>
                <div className="flex items-center gap-3 p-3"><div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-white text-[var(--accent)]"><Icon name="users" className="h-4 w-4" /></div><div><p className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">Personel</p><p className="text-[12px] font-semibold text-[var(--ink)]">{selectedStaff}</p></div></div>
                {selected.notes ? <div className="flex gap-3 p-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white text-[var(--accent)]"><Icon name="note" className="h-4 w-4" /></div><div><p className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">Not</p><p className="mt-0.5 text-[11px] leading-5 text-[var(--muted)]">{selected.notes}</p></div></div> : null}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2"><Button className="col-span-2 w-full" onClick={() => selected && openEdit(selected)} disabled={!canUpdateAppointment}>Randevuyu görüntüle <Icon name="chevron" className="h-4 w-4" /></Button><Button variant="secondary" className="w-full" onClick={() => selected && openEdit(selected)} disabled={!canUpdateAppointment}>Düzenle</Button><Button variant="secondary" className="w-full text-[#a34658]" onClick={() => { setPendingCancel(selected); setConfirmOpen(true); }} disabled={!canCancelAppointment}>İptal et</Button></div>
              {canCreatePayment && !selected.payment ? <button type="button" onClick={openPayment} className="mt-3 flex w-full items-center justify-between rounded-[12px] bg-[#f3f0ff] px-3 py-2.5 text-[11px] font-medium text-[#6559ad] transition hover:bg-[#ece8ff]"><span>Bu randevudan ödeme al</span><Icon name="chevron" className="h-4 w-4" /></button> : selected.payment ? <div className="mt-3 rounded-[12px] bg-[#eef8f1] px-3 py-2.5 text-[11px] text-[#2f7a56]">Ödeme alındı · ₺{Number(selected.payment.amount).toLocaleString("tr-TR")}</div> : null}
            </div> : <EmptyState title="Randevu seçin" description="Takvimden bir randevu seçtiğinizde detayları burada görünür." />}
          </section>

          <section className="surface overflow-hidden rounded-[22px]">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4"><div><p className="text-[13px] font-semibold text-[var(--ink)]">Bugünkü randevular</p><p className="mt-0.5 text-[10px] text-[var(--muted)]">Günlük özet</p></div><span className="rounded-full bg-[var(--surface-soft)] px-2 py-1 text-[10px] font-medium text-[var(--muted)]">{appointments.length}</span></div>
            <div className="divide-y divide-[var(--line)] px-5">{appointments.slice(0, 5).map((item) => { const name = customerMap.get(item.customerId) ?? "Müşteri"; return <button type="button" key={item.id} onClick={() => setSelectedId(item.id)} className="flex w-full items-center gap-2.5 py-3 text-left"><span className="w-10 shrink-0 text-[10px] font-medium text-[var(--muted)]">{formatTime(item.startAt)}</span><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#eef0f4] text-[8px] font-semibold text-[#667080]">{initials(name)}</span><span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-semibold text-[var(--ink)]">{name}</span><span className="block truncate text-[9px] text-[var(--muted)]">{serviceMap.get(item.serviceId) ?? "Hizmet"}</span></span><i className={`h-2 w-2 shrink-0 rounded-full ${dotStyles[item.status]}`} /></button>; })}</div>
          </section>

          <section className="surface rounded-[22px] p-5"><div className="flex items-center justify-between"><p className="text-[13px] font-semibold text-[var(--ink)]">Günün özeti</p><Icon name="calendar" className="h-4 w-4 text-[var(--muted)]" /></div><div className="mt-4 space-y-3">{[["Toplam randevu", counts.total, "bg-[#5962d7]"], ["Tamamlanan", counts.completed, "bg-[#35a36a]"], ["Bekleyen", counts.waiting, "bg-[#e8a32c]"], ["İptal", counts.cancelled, "bg-[#ef5b70]"]].map(([label, value, dot]) => <div key={label} className="flex items-center justify-between text-[11px]"><span className="flex items-center gap-2 text-[var(--muted)]"><i className={`h-2 w-2 rounded-full ${dot}`} />{label}</span><strong className="text-[var(--ink)]">{value}</strong></div>)}</div></section>
        </aside>
      </div>

      <Modal open={modalOpen} onClose={() => !saving && setModalOpen(false)} title={editing ? "Randevuyu düzenle" : "Yeni randevu"} description="Müşteri, hizmet, personel ve zaman bilgilerini girin.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Müşteri" required><Select value={form.customerId} onChange={(event) => setForm((current) => ({ ...current, customerId: event.target.value }))} disabled={loadingRefs}><option value="">Müşteri seçin</option>{customers.map((item) => <option key={item.id} value={item.id}>{fullName(item.firstName, item.lastName)}</option>)}</Select></Field>
          <Field label="Personel" required><Select value={form.staffId} onChange={(event) => setForm((current) => ({ ...current, staffId: event.target.value }))} disabled={loadingRefs}><option value="">Personel seçin</option>{staff.filter((item) => item.status === "ACTIVE").map((item) => <option key={item.id} value={item.id}>{fullName(item.firstName, item.lastName)}</option>)}</Select></Field>
          <Field label="Hizmet" required><Select value={form.serviceId} onChange={(event) => setForm((current) => ({ ...current, serviceId: event.target.value }))} disabled={loadingRefs}><option value="">Hizmet seçin</option>{services.filter((item) => item.status === "ACTIVE").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
          <Field label="Durum"><Select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as AppointmentStatus }))}><option value="SCHEDULED">Planlandı</option><option value="CONFIRMED">Onaylandı</option><option value="COMPLETED">Tamamlandı</option><option value="NO_SHOW">Gelmedi</option></Select></Field>
          <Field label="Başlangıç" required><TextInput type="datetime-local" value={form.startAt} onChange={(event) => setForm((current) => ({ ...current, startAt: event.target.value }))} /></Field>
          <Field label="Bitiş" required><TextInput type="datetime-local" value={form.endAt} onChange={(event) => setForm((current) => ({ ...current, endAt: event.target.value }))} /></Field>
          <div className="sm:col-span-2"><Field label="Not"><TextArea rows={3} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Randevuya özel not..." /></Field></div>
        </div>
        <div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Vazgeç</Button><Button onClick={saveAppointment} disabled={saving}>{saving ? "Kaydediliyor..." : editing ? "Değişiklikleri kaydet" : "Randevuyu oluştur"}</Button></div>
      </Modal>

      <Modal open={confirmOpen} onClose={() => !saving && setConfirmOpen(false)} title="Randevuyu iptal et" description={pendingCancel ? `${customerMap.get(pendingCancel.customerId) ?? "Müşteri"} için ${formatTime(pendingCancel.startAt)} randevusu iptal edilecek.` : ""}>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={saving}>Vazgeç</Button><Button variant="danger" onClick={cancelAppointment} disabled={saving}>İptal et</Button></div>
      </Modal>

      <Modal open={paymentOpen} onClose={() => !paymentSaving && setPaymentOpen(false)} title="Ödeme al" description={paymentAppointment ? `${customerMap.get(paymentAppointment.customerId) ?? "Müşteri"} · ${serviceMap.get(paymentAppointment.serviceId) ?? "Hizmet"}` : ""}>
        <div className="space-y-4"><Field label="Tutar" required><TextInput inputMode="decimal" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} placeholder="0" /></Field><Field label="Ödeme yöntemi"><Select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as "CASH" | "CARD" | "TRANSFER")}><option value="CARD">Kart</option><option value="CASH">Nakit</option><option value="TRANSFER">Havale / EFT</option></Select></Field></div><div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={() => setPaymentOpen(false)} disabled={paymentSaving}>Vazgeç</Button><Button onClick={createPayment} disabled={paymentSaving}>{paymentSaving ? "Kaydediliyor..." : "Ödemeyi kaydet"}</Button></div>
      </Modal>
    </div>
  );
}
