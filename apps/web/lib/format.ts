import type {
  AppointmentStatus,
  ServiceStatus,
  StaffStatus,
} from "./types";

export function cx(
  ...classes: Array<string | false | null | undefined>
) {
  return classes.filter(Boolean).join(" ");
}

export function fullName(firstName: string, lastName: string) {
  return `${firstName} ${lastName}`.trim();
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function formatTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatPrice(value: string | number) {
  const amount = typeof value === "number" ? value : Number(value);

  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
  }).format(Number.isNaN(amount) ? 0 : amount);
}

export function formatDuration(minutes: number) {
  return `${minutes} dk`;
}

export function staffStatusLabel(status: StaffStatus | string) {
  const labels: Record<string, string> = {
    ACTIVE: "Aktif",
    INACTIVE: "Pasif",
    ARCHIVED: "Arşiv",
  };

  return labels[status] ?? status;
}

export function serviceStatusLabel(status: ServiceStatus | string) {
  return staffStatusLabel(status);
}

export function appointmentStatusLabel(
  status: AppointmentStatus | string,
) {
  const labels: Record<string, string> = {
    SCHEDULED: "Planlandı",
    CONFIRMED: "Onaylandı",
    COMPLETED: "Tamamlandı",
    CANCELLED: "İptal",
    NO_SHOW: "Gelmedi",
  };

  return labels[status] ?? status;
}

export function toDateTimeLocal(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function defaultStartLocal() {
  const date = new Date();
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  return toDateTimeLocal(date);
}

export function addMinutesLocal(start: string, minutes: number) {
  if (!start) return "";

  const date = new Date(start);

  if (Number.isNaN(date.getTime())) return "";

  date.setMinutes(date.getMinutes() + minutes);

  return toDateTimeLocal(date);
}

export function toIso(value: string) {
  return new Date(value).toISOString();
}

export function optionalText(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/* ─────────────────────────────────────────────
   Calendar helpers
   ───────────────────────────────────────────── */

export function startOfLocalDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function endOfLocalDay(value: Date) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

export function addDaysLocal(value: Date, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

export function formatCalendarDate(value: Date) {
  return new Intl.DateTimeFormat("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(value);
}

export function formatCalendarShortDate(value: Date) {
  return new Intl.DateTimeFormat("tr-TR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(value);
}

export function isSameLocalDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}