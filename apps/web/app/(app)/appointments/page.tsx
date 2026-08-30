"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  Alert,
  Button,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Panel,
  Select,
  Spinner,
  StatusBadge,
  TextArea,
  TextInput,
  Td,
  Th,
  TableWrap,
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
  formatDate,
  formatTime,
  fullName,
  toDateTimeLocal,
  toIso,
} from "@/lib/format";

const DAY_START_HOUR = 8;
const DAY_END_HOUR = 21;
const SLOT_MINUTES = 30;
const SLOT_HEIGHT = 52;

const STATUS_OPTIONS: Array<{
  value: AppointmentStatus | "";
  label: string;
}> = [
  { value: "", label: "Tüm durumlar" },
  { value: "SCHEDULED", label: "Planlandı" },
  { value: "CONFIRMED", label: "Onaylandı" },
  { value: "COMPLETED", label: "Tamamlandı" },
  { value: "CANCELLED", label: "İptal" },
  { value: "NO_SHOW", label: "Gelmedi" },
];

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

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function fromDateInputValue(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function minutesFromStartOfDay(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

function appointmentTop(startAt: string) {
  const date = new Date(startAt);
  const minutes =
    minutesFromStartOfDay(date) - DAY_START_HOUR * 60;

  return Math.max(0, (minutes / SLOT_MINUTES) * SLOT_HEIGHT);
}

function appointmentHeight(
  startAt: string,
  endAt: string,
) {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();

  const minutes = Math.max(
    SLOT_MINUTES,
    Math.round((end - start) / 60000),
  );

  return Math.max(
    SLOT_HEIGHT,
    (minutes / SLOT_MINUTES) * SLOT_HEIGHT,
  );
}

function statusTone(status: AppointmentStatus) {
  switch (status) {
    case "CONFIRMED":
      return "border-[rgba(47,122,86,0.18)] bg-[rgba(47,122,86,0.08)]";
    case "COMPLETED":
      return "border-[rgba(90,112,140,0.18)] bg-[rgba(90,112,140,0.08)]";
    case "CANCELLED":
    case "NO_SHOW":
      return "border-[rgba(143,61,61,0.16)] bg-[rgba(143,61,61,0.07)]";
    default:
      return "border-[rgba(143,74,86,0.16)] bg-[var(--accent-soft)]";
  }
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

function emptyForm(): FormState {
  const start = defaultStartLocal();

  return {
    customerId: "",
    staffId: "",
    serviceId: "",
    startAt: start,
    endAt: addMinutesLocal(start, 60),
    notes: "",
    status: "SCHEDULED",
  };
}

export default function AppointmentsPage() {
  const canCreateAppointment = hasPermission("appointments", "create");
  const canUpdateAppointment = hasPermission("appointments", "update");
  const canCancelAppointment = hasPermission("appointments", "cancel");
  const canCreatePayment = hasPermission("payments", "create");

  const searchParams = useSearchParams();
  const customerIdFromUrl = searchParams.get("customerId");

  const [selectedDate, setSelectedDate] = useState(
    () => startOfDay(new Date()),
  );

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [services, setServices] = useState<Service[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingReferences, setLoadingReferences] = useState(true);
  const [error, setError] = useState("");

  const [statusFilter, setStatusFilter] = useState<
    AppointmentStatus | ""
  >("");

  const [staffFilter, setStaffFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);

  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [pendingCancel, setPendingCancel] =
    useState<Appointment | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentAppointment, setPaymentAppointment] =
    useState<Appointment | null>(null);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [paymentMethod, setPaymentMethod] =
    useState<"CASH" | "CARD" | "TRANSFER">("CARD");
  const [paymentAmount, setPaymentAmount] = useState("");


  const dateFrom = useMemo(
    () => toIso(startOfDay(selectedDate).toISOString()),
    [selectedDate],
  );

  const dateTo = useMemo(
    () => toIso(endOfDay(selectedDate).toISOString()),
    [selectedDate],
  );

  const formConflict = useMemo(() => {
    if (
      !form.staffId ||
      !form.startAt ||
      !form.endAt
    ) {
      return null;
    }

    const start = new Date(form.startAt).getTime();
    const end = new Date(form.endAt).getTime();

    if (
      Number.isNaN(start) ||
      Number.isNaN(end) ||
      start >= end
    ) {
      return null;
    }

    return (
      appointments.find((appointment) => {
        if (appointment.staffId !== form.staffId) {
          return false;
        }

        if (editing && appointment.id === editing.id) {
          return false;
        }

        if (
          appointment.status === "CANCELLED" ||
      appointment.status === "NO_SHOW"
        ) {
          return false;
        }

        const appointmentStart = new Date(
          appointment.startAt,
        ).getTime();

        const appointmentEnd = new Date(
          appointment.endAt,
        ).getTime();

        return (
          appointmentStart < end &&
          appointmentEnd > start
        );
      }) ?? null
    );
  }, [
    appointments,
    editing,
    form.endAt,
    form.staffId,
    form.startAt,
  ]);

  const visibleAppointments = useMemo(() => {
    return appointments
      .filter((appointment) =>
        statusFilter
          ? appointment.status === statusFilter
          : true,
      )
      .filter((appointment) =>
        staffFilter
          ? appointment.staffId === staffFilter
          : true,
      )
      .filter((appointment) =>
        customerFilter
          ? appointment.customerId === customerFilter
          : true,
        )
      .sort(
        (a, b) =>
          new Date(a.startAt).getTime() -
          new Date(b.startAt).getTime(),
      );
  }, [appointments, customerFilter, staffFilter, statusFilter]);

  const activeStaff = useMemo(
    () => staff.filter((member) => member.status === "ACTIVE"),
    [staff],
  );

  const customerMap = useMemo(
    () =>
      new Map(
        customers.map((customer) => [
          customer.id,
          fullName(customer.firstName, customer.lastName),
        ]),
      ),
    [customers],
  );

  const staffMap = useMemo(
    () =>
      new Map(
        staff.map((member) => [
          member.id,
          fullName(member.firstName, member.lastName),
        ]),
      ),
    [staff],
  );

  const serviceMap = useMemo(
    () =>
      new Map(
        services.map((service) => [service.id, service.name]),
      ),
    [services],
  );

  async function loadAppointments() {
    setLoading(true);
    setError("");

    try {
      const result = await api<Paginated<Appointment>>(
        withQuery("/appointments", {
          page: 1,
          limit: 100,
          from: dateFrom,
          to: dateTo,
        }),
      );

      setAppointments(result.data);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Randevular yüklenemedi.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadReferences() {
    setLoadingReferences(true);

    try {
      const [customerResult, staffResult, serviceResult] =
        await Promise.all([
          api<Paginated<Customer>>(
            withQuery("/customers", {
              page: 1,
              limit: 100,
            }),
          ),
          api<Paginated<Staff>>(
            withQuery("/staff", {
              page: 1,
              limit: 100,
            }),
          ),
          api<Paginated<Service>>(
            withQuery("/services", {
              page: 1,
              limit: 100,
            }),
          ),
        ]);

      setCustomers(customerResult.data);
      setStaff(staffResult.data);
      setServices(serviceResult.data);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Randevu seçenekleri yüklenemedi.",
      );
    } finally {
      setLoadingReferences(false);
    }
  }

  useEffect(() => {
    void loadAppointments();
  }, [dateFrom, dateTo]);

  useEffect(() => {
    void loadReferences();
  }, []);

  function openCreate(initialStart?: string) {
    const next = emptyForm();

    if (
      customerIdFromUrl &&
      customers.some((customer) => customer.id === customerIdFromUrl)
    ) {
      next.customerId = customerIdFromUrl;
    }

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

  function openPayment(appointment: Appointment) {
    setPaymentAppointment(appointment);
    setPaymentMethod("CARD");
    setPaymentError("");

    const service = services.find(
      (item) => item.id === appointment.serviceId,
    );

    setPaymentAmount(
      appointment.payment?.amount
        ? String(appointment.payment.amount)
        : service
          ? String(service.price)
          : "",
    );

    setPaymentOpen(true);
  }

  function closeModal() {
    if (saving) return;

    setModalOpen(false);
    setEditing(null);
  }

  async function saveAppointment() {
    if (
      !form.customerId ||
      !form.staffId ||
      !form.serviceId ||
      !form.startAt ||
      !form.endAt
    ) {
      setError("Lütfen randevu bilgilerini tamamlayın.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      if (editing) {
        await api<Appointment>(
          `/appointments/${editing.id}`,
          {
            method: "PATCH",
            body: {
              customerId: form.customerId,
              staffId: form.staffId,
              serviceId: form.serviceId,
              startAt: toIso(form.startAt),
              endAt: toIso(form.endAt),
              notes: form.notes,
              status: form.status,
            },
          },
        );
      } else {
        await api<Appointment>("/appointments", {
          method: "POST",
          body: {
            customerId: form.customerId,
            staffId: form.staffId,
            serviceId: form.serviceId,
            startAt: toIso(form.startAt),
            endAt: toIso(form.endAt),
            notes: form.notes,
          },
        });
      }

      closeModal();
      await loadAppointments();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Randevu kaydedilemedi.",
      );
    } finally {
      setSaving(false);
    }
  }

  function askCancel(appointment: Appointment) {
    setPendingCancel(appointment);
    setConfirmOpen(true);
  }

  async function cancelAppointment() {
    if (!pendingCancel) return;

    setCancelling(true);
    setError("");

    try {
      await api(`/appointments/${pendingCancel.id}`, {
        method: "DELETE",
      });

      setConfirmOpen(false);
      setPendingCancel(null);
      await loadAppointments();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Randevu iptal edilemedi.",
      );
    } finally {
      setCancelling(false);
    }
  }

  async function updateAppointmentStatus(
    appointment: Appointment,
    status: AppointmentStatus,
  ) {
    setError("");
    setSaving(true);

    try {
      const updated = await api<Appointment>(
        `/appointments/${appointment.id}`,
        {
          method: "PATCH",
          body: {
            status,
          },
        },
      );

      setAppointments((current) =>
        current.map((item) =>
          item.id === updated.id ? updated : item,
        ),
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Randevu durumu güncellenemedi.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function createPayment() {
    if (!canCreatePayment) return;
    if (!paymentAppointment) return;

    const amount = Number(paymentAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentError("Geçerli bir ödeme tutarı girin.");
      return;
    }

    setPaymentSaving(true);
    setPaymentError("");

    try {
      await api("/payments", {
        method: "POST",
        body: {
          appointmentId: paymentAppointment.id,
          amount,
          method: paymentMethod,
        },
      });

      setPaymentOpen(false);
      setPaymentAppointment(null);
      setPaymentAmount("");
      await loadAppointments();
    } catch (err) {
      setPaymentError(
        err instanceof ApiError
          ? err.message
          : "Ödeme kaydedilemedi.",
      );
    } finally {
      setPaymentSaving(false);
    }
  }

  function goToDate(date: Date) {
    setSelectedDate(startOfDay(date));
  }

  function isToday() {
    return (
      toDateInputValue(selectedDate) ===
      toDateInputValue(new Date())
    );
  }

  const dayLabel = new Intl.DateTimeFormat("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(selectedDate);

  const slotCount =
    ((DAY_END_HOUR - DAY_START_HOUR) * 60) / SLOT_MINUTES;

  const slots = Array.from(
    { length: slotCount + 1 },
    (_, index) =>
      DAY_START_HOUR * 60 + index * SLOT_MINUTES,
  );

  return (
    <div className="mx-auto max-w-[1400px] space-y-7">
      <PageHeader
        title="Randevular"
                action={
          <Button onClick={() => openCreate()} disabled={!canCreateAppointment}>
            Yeni randevu
          </Button>
        }
      />

      {error ? (
        <Alert onClose={() => setError("")}>{error}</Alert>
      ) : null}

      <Panel>
        <div className="border-b border-[var(--line)] px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                aria-label="Önceki gün"
                onClick={() =>
                  goToDate(addDays(selectedDate, -1))
                }
              >
                ‹
              </Button>

              <div className="min-w-0 px-2 text-center">
                <p className="text-[17px] font-semibold capitalize tracking-[-0.025em] text-[var(--ink)]">
                  {dayLabel}
                </p>
              </div>

              <Button
                variant="secondary"
                aria-label="Sonraki gün"
                onClick={() =>
                  goToDate(addDays(selectedDate, 1))
                }
              >
                ›
              </Button>

              <Button
                variant="ghost"
                onClick={() => goToDate(new Date())}
                disabled={isToday()}
              >
                Bugün
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                aria-label="Personel filtresi"
                value={staffFilter}
                onChange={(event) =>
                  setStaffFilter(event.target.value)
                }
              >
                <option value="">Tüm personel</option>
                {activeStaff.map((member) => (
                  <option key={member.id} value={member.id}>
                    {fullName(member.firstName, member.lastName)}
                  </option>
                ))}
              </Select>

                <Select
                  aria-label="Müşteri filtresi"
                  value={customerFilter}
                  onChange={(event) =>
                    setCustomerFilter(event.target.value)
                  }
                >
                  <option value="">Tüm müşteriler</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {fullName(
                        customer.firstName,
                        customer.lastName,
                      )}
                    </option>
                  ))}
                </Select>

              <Select
                aria-label="Durum filtresi"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(
                    event.target.value as AppointmentStatus | "",
                  )
                }
              >
                {STATUS_OPTIONS.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>

        {loading ? (
          <Spinner label="Randevular yükleniyor..." />
        ) : visibleAppointments.length === 0 ? (
          <EmptyState
            title="Bu gün için randevu yok"
            description="Yeni bir randevu oluşturarak gününüzü planlamaya başlayabilirsiniz."
          />
        ) : (
          <>
            <div className="hidden overflow-auto lg:block">
              <div
                className="min-w-[920px]"
                style={{
                  minHeight:
                    (slotCount + 1) * SLOT_HEIGHT,
                }}
              >
                <div className="grid grid-cols-[180px_1fr] border-b border-[var(--line)]">
                  <div className="border-r border-[var(--line)] px-5 py-4 text-[12px] font-medium text-[var(--muted)]">
                    Personel
                  </div>

                  <div
                    className="grid"
                    style={{
                      gridTemplateColumns: `repeat(${slotCount}, minmax(52px, 1fr))`,
                    }}
                  >
                    {slots.slice(0, -1).map((minutes) => (
                      <div
                        key={minutes}
                        className="border-r border-[var(--line)] px-2 py-4 text-center text-[11px] font-medium text-[var(--muted)] last:border-r-0"
                      >
                        {String(
                          Math.floor(minutes / 60),
                        ).padStart(2, "0")}
                        :
                        {String(minutes % 60).padStart(
                          2,
                          "0",
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-[180px_1fr]">
                  <div className="border-r border-[var(--line)]">
                    {activeStaff.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center border-b border-[var(--line)] px-5"
                        style={{
                          height:
                            (DAY_END_HOUR -
                              DAY_START_HOUR) *
                            60 /
                            SLOT_MINUTES *
                            SLOT_HEIGHT,
                        }}
                      >
                        <div>
                          <p className="text-[14px] font-medium text-[var(--ink)]">
                            {fullName(
                              member.firstName,
                              member.lastName,
                            )}
                          </p>
                          <p className="mt-0.5 text-[12px] text-[var(--muted)]">
                            Personel
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div>
                    {activeStaff.map((member) => {
                      const memberAppointments =
                        visibleAppointments.filter(
                          (appointment) =>
                            appointment.staffId === member.id,
                        );

                      return (
                        <div
                          key={member.id}
                          className="relative border-b border-[var(--line)]"
                          style={{
                            height:
                              (DAY_END_HOUR -
                                DAY_START_HOUR) *
                              60 /
                              SLOT_MINUTES *
                              SLOT_HEIGHT,
                          }}
                        >
                          <div
                            className="absolute inset-0 grid"
                            style={{
                              gridTemplateColumns: `repeat(${slotCount}, minmax(52px, 1fr))`,
                            }}
                          >
                            {slots
                              .slice(0, -1)
                              .map((minutes) => (
                                <button
                                  key={minutes}
                                  type="button"
                                  className="border-r border-[var(--line)] transition-colors duration-[180ms] hover:bg-black/[0.018]"
                                  aria-label={`${member.firstName} ${member.lastName} ${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")} saatinde randevu oluştur`}
                                  onClick={() => {
                                    const date =
                                      new Date(
                                        selectedDate,
                                      );
                                    date.setHours(
                                      Math.floor(
                                        minutes / 60,
                                      ),
                                      minutes % 60,
                                      0,
                                      0,
                                    );

                                    openCreate(
                                      toDateTimeLocal(date),
                                    );
                                  }}
                                />
                              ))}
                          </div>

                          {memberAppointments.map(
                            (appointment) => (
                              <button
                                key={appointment.id}
                                type="button"
                                className={`absolute left-1 right-1 z-10 overflow-hidden rounded-[16px] border p-3 text-left shadow-[0_4px_18px_rgba(28,25,23,0.05)] transition-[transform,box-shadow] duration-[180ms] hover:z-20 hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(28,25,23,0.10)] ${statusTone(
                                  appointment.status,
                                )}`}
                                style={{
                                  top: appointmentTop(
                                    appointment.startAt,
                                  ),
                                  height: appointmentHeight(
                                    appointment.startAt,
                                    appointment.endAt,
                                  ),
                                }}
                                onClick={() =>
                                  openEdit(appointment)
                                }
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <p className="truncate text-[13px] font-semibold text-[var(--ink)]">
                                    {customerMap.get(
                                      appointment.customerId,
                                    ) ?? "Müşteri"}
                                  </p>

                                  <StatusBadge
                                    status={
                                      appointment.status
                                    }
                                    label={appointmentStatusLabel(
                                      appointment.status,
                                    )}
                                  />
                                </div>

                                <p className="mt-1 truncate text-[12px] text-[var(--muted)]">
                                  {serviceMap.get(
                                    appointment.serviceId,
                                  ) ?? "Hizmet"}
                                </p>

                                <p className="mt-1 text-[11px] font-medium text-[var(--muted)]">
                                  {formatTime(
                                    appointment.startAt,
                                  )}{" "}
                                  –{" "}
                                  {formatTime(
                                    appointment.endAt,
                                  )}
                                </p>
                              </button>
                            ),
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="divide-y divide-[var(--line)] lg:hidden">
              {visibleAppointments.map((appointment) => (
                <button
                  key={appointment.id}
                  type="button"
                  className="block w-full px-5 py-5 text-left transition-colors duration-[180ms] hover:bg-black/[0.018]"
                  onClick={() => openEdit(appointment)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[15px] font-semibold text-[var(--ink)]">
                        {customerMap.get(
                          appointment.customerId,
                        ) ?? "Müşteri"}
                      </p>

                      <p className="mt-1 text-sm text-[var(--muted)]">
                        {serviceMap.get(
                          appointment.serviceId,
                        ) ?? "Hizmet"}
                      </p>
                    </div>

                    <StatusBadge
                      status={appointment.status}
                      label={appointmentStatusLabel(
                        appointment.status,
                      )}
                    />
                  </div>

                  <div className="mt-4 flex items-center justify-between text-[12px] text-[var(--muted)]">
                    <span>
                      {formatTime(appointment.startAt)} –{" "}
                      {formatTime(appointment.endAt)}
                    </span>

                    <span>
                      {staffMap.get(appointment.staffId) ??
                        "Personel"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </Panel>

      <Panel>
        <div className="border-b border-[var(--line)] px-5 py-4">
          <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-[var(--ink)]">
            Liste
          </h2>
        </div>

        {visibleAppointments.length === 0 ? (
          <EmptyState
            title="Gösterilecek randevu yok"
            description="Seçtiğiniz tarih veya filtrelerle eşleşen randevu bulunmuyor."
          />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Müşteri</Th>
                <Th>Hizmet</Th>
                <Th>Personel</Th>
                <Th>Saat</Th>
                <Th>Durum</Th>
                <Th>Aksiyon</Th>
              </tr>
            </thead>

            <tbody>
              {visibleAppointments.map((appointment) => (
                <tr key={appointment.id}>
                  <Td label="Müşteri">
                    <Link
                      href={`/customers/${appointment.customerId}`}
                      className="font-medium text-[var(--accent)] hover:underline"
                    >
                      {customerMap.get(
                        appointment.customerId,
                      ) ?? "—"}
                    </Link>
                  </Td>

                  <Td label="Hizmet">
                    {serviceMap.get(
                      appointment.serviceId,
                    ) ?? "—"}
                  </Td>

                  <Td label="Personel">
                    {staffMap.get(appointment.staffId) ?? "—"}
                  </Td>

                  <Td label="Saat">
                    {formatTime(appointment.startAt)} –{" "}
                    {formatTime(appointment.endAt)}
                  </Td>

                  <Td label="Durum">
                    <StatusBadge
                      status={appointment.status}
                      label={appointmentStatusLabel(
                        appointment.status,
                      )}
                    />
                  </Td>

                  <Td label="Aksiyon" actions>
                    <div className="flex flex-wrap justify-end gap-2">
                      {appointment.status === "SCHEDULED" ? (
                        <Button
                          variant="secondary"
                          onClick={() =>
                            void updateAppointmentStatus(
                              appointment,
                              "CONFIRMED",
                            )
                          }
                          disabled={saving}
                        >
                          Onayla
                        </Button>
                      ) : null}

                      {appointment.status === "CONFIRMED" ? (
                        <>
                          <Button
                            variant="secondary"
                            onClick={() =>
                              void updateAppointmentStatus(
                                appointment,
                                "COMPLETED",
                              )
                            }
                            disabled={saving}
                          >
                            Tamamla
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() =>
                              void updateAppointmentStatus(
                                appointment,
                                "NO_SHOW",
                              )
                            }
                            disabled={saving}
                          >
                            Gelmedi
                          </Button>
                        </>
                      ) : null}

                      {!appointment.payment &&
                      appointment.status !== "CANCELLED" &&
                      appointment.status !== "NO_SHOW" ? (
                        <Button
                          variant="secondary"
                          onClick={() => openPayment(appointment)}
                          disabled={saving}
                        >
                          Ödeme al
                        </Button>
                      ) : null}

                      <Button
                        variant="ghost"
                        onClick={() => openEdit(appointment)}
                        disabled={saving}
                      >
                        Düzenle
                      </Button>

                      {appointment.status !== "CANCELLED" &&
                      appointment.status !== "COMPLETED" &&
                      appointment.status !== "NO_SHOW" ? (
                        <Button
                          variant="danger"
                            disabled={saving || !canCancelAppointment}
                          onClick={() => askCancel(appointment)}
                        >
                          İptal
                        </Button>
                      ) : null}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Panel>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={
          editing ? "Randevuyu düzenle" : "Yeni randevu"
        }
        description="Müşteri, hizmet, personel ve zaman bilgilerini belirleyin."
      >
        {loadingReferences ? (
          <Spinner label="Seçenekler yükleniyor..." />
        ) : (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Müşteri">
                <Select
                  value={form.customerId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      customerId: event.target.value,
                    }))
                  }
                >
                  <option value="">Müşteri seçin</option>
                  {customers.map((customer) => (
                    <option
                      key={customer.id}
                      value={customer.id}
                    >
                      {fullName(
                        customer.firstName,
                        customer.lastName,
                      )}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Personel">
                <Select
                  value={form.staffId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      staffId: event.target.value,
                    }))
                  }
                >
                  <option value="">Personel seçin</option>
                  {activeStaff.map((member) => (
                    <option
                      key={member.id}
                      value={member.id}
                    >
                      {fullName(
                        member.firstName,
                        member.lastName,
                      )}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="Hizmet">
              <Select
                value={form.serviceId}
                onChange={(event) => {
                  const serviceId = event.target.value;

                  const service = services.find(
                    (item) => item.id === serviceId,
                  );

                  setForm((current) => ({
                    ...current,
                    serviceId,
                    endAt: service
                      ? addMinutesLocal(
                          current.startAt,
                          service.durationMinutes,
                        )
                      : current.endAt,
                  }));
                }}
              >
                <option value="">Hizmet seçin</option>
                {services
                  .filter(
                    (service) => service.status === "ACTIVE",
                  )
                  .map((service) => (
                    <option
                      key={service.id}
                      value={service.id}
                    >
                      {service.name} ·{" "}
                      {service.durationMinutes} dk
                    </option>
                  ))}
              </Select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Başlangıç">
                <TextInput
                  type="datetime-local"
                  value={form.startAt}
                  onChange={(event) =>
                    setForm((current) => {
                      const service = services.find(
                        (item) =>
                          item.id === current.serviceId,
                      );

                      return {
                        ...current,
                        startAt: event.target.value,
                        endAt: service
                          ? addMinutesLocal(
                              event.target.value,
                              service.durationMinutes,
                            )
                          : current.endAt,
                      };
                    })
                  }
                />
              </Field>

              <Field label="Bitiş">
                <TextInput
                  type="datetime-local"
                  value={form.endAt}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      endAt: event.target.value,
                    }))
                  }
                />
              </Field>
            </div>

            {formConflict ? (
              <Alert>
                {`Bu personelin ${formatTime(
                  formConflict.startAt,
                )} – ${formatTime(
                  formConflict.endAt,
                )} saatleri arasında çakışan bir randevusu var.`}
              </Alert>
            ) : null}

            {editing ? (
              <Field label="Durum">
                <Select
                  value={form.status}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      status:
                        event.target
                          .value as AppointmentStatus,
                    }))
                  }
                >
                  {STATUS_OPTIONS.filter(
                    (option) => option.value,
                  ).map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                    >
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}

            <Field label="Notlar">
              <TextArea
                rows={4}
                value={form.notes}
                placeholder="İsteğe bağlı not..."
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
              />
            </Field>

            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={closeModal}
                disabled={saving}
              >
                Vazgeç
              </Button>

              <Button
                onClick={() => void saveAppointment()}
                disabled={saving || Boolean(formConflict)}
              >
                {saving
                  ? "Kaydediliyor..."
                  : editing
                    ? "Kaydet"
                    : "Randevu oluştur"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={paymentOpen}
        onClose={() => {
          if (!paymentSaving) {
            setPaymentOpen(false);
            setPaymentAppointment(null);
            setPaymentError("");
          }
        }}
        title="Ödeme al"
        description={
          paymentAppointment
            ? `${customerMap.get(paymentAppointment.customerId) ?? "Müşteri"} · ${serviceMap.get(paymentAppointment.serviceId) ?? "Hizmet"}`
            : "Randevu ödemesi"
        }
      >
        {paymentAppointment ? (
          <div className="space-y-5">
            {paymentError ? (
              <Alert onClose={() => setPaymentError("")}>
                {paymentError}
              </Alert>
            ) : null}

            <Field label="Tutar">
              <TextInput
                type="number"
                min="0.01"
                step="0.01"
                value={paymentAmount}
                onChange={(event) =>
                  setPaymentAmount(event.target.value)
                }
                placeholder="0,00"
                disabled={paymentSaving}
              />
            </Field>

            <Field label="Ödeme yöntemi">
              <Select
                value={paymentMethod}
                onChange={(event) =>
                  setPaymentMethod(
                    event.target.value as
                      | "CASH"
                      | "CARD"
                      | "TRANSFER",
                  )
                }
                disabled={paymentSaving}
              >
                <option value="CARD">Kart</option>
                <option value="CASH">Nakit</option>
                <option value="TRANSFER">Havale / EFT</option>
              </Select>
            </Field>

            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                disabled={paymentSaving}
                onClick={() => {
                  setPaymentOpen(false);
                  setPaymentAppointment(null);
                  setPaymentError("");
                }}
              >
                Vazgeç
              </Button>

              <Button
                disabled={paymentSaving}
                onClick={() => void createPayment()}
              >
                {paymentSaving
                  ? "Kaydediliyor..."
                  : "Ödemeyi kaydet"}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={confirmOpen}
        onClose={() => {
          if (!cancelling) {
            setConfirmOpen(false);
            setPendingCancel(null);
          }
        }}
        title="Randevuyu iptal et"
        description={
          pendingCancel
            ? `${
                customerMap.get(
                  pendingCancel.customerId,
                ) ?? "Bu randevu"
              } için randevu iptal edilecek.`
            : "Bu randevu iptal edilecek."
        }
      >
        <div className="flex justify-end gap-3">
          <Button
            variant="secondary"
            disabled={cancelling}
            onClick={() => {
              setConfirmOpen(false);
              setPendingCancel(null);
            }}
          >
            Vazgeç
          </Button>

          <Button
            variant="danger"
            disabled={cancelling}
            onClick={() => void cancelAppointment()}
          >
            {cancelling ? "İptal ediliyor..." : "İptal et"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
