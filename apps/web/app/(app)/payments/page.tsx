"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Alert,
  Button,
  EmptyState,
  Field,
  GlassCard,
  PageHeader,
  Panel,
  Select,
  Spinner,
  TableWrap,
  Td,
  TextInput,
  Th,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, ApiError, withQuery } from "@/lib/api";
import { hasPermission } from "@/lib/auth";

type Payment = {
  id: string;
  appointmentId: string;
  amount: string | number;
  method: "CASH" | "CARD" | "TRANSFER";
  status: "COMPLETED" | "REFUNDED";
  paidAt: string;
  appointment: {
    id: string;
    customerId: string;
    staffId: string;
    serviceId: string;
    startAt: string;
    endAt: string;
    status: string;
  };
};

type Customer = {
  id: string;
  firstName: string;
  lastName: string;
};

type Staff = {
  id: string;
  firstName: string;
  lastName: string;
};

type Service = {
  id: string;
  name: string;
};

const METHOD_LABELS: Record<Payment["method"], string> = {
  CASH: "Nakit",
  CARD: "Kart",
  TRANSFER: "Havale / EFT",
};

function fullName(firstName: string, lastName: string) {
  return `${firstName} ${lastName}`.trim();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatMoney(value: string | number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function endOfDay(value: string) {
  if (!value) return null;

  const date = new Date(`${value}T00:00:00`);
  date.setHours(23, 59, 59, 999);
  return date;
}

export default function PaymentsPage() {
  const canRefundPayment = hasPermission("payments", "refund");

  const { showToast } = useToast();

  const [payments, setPayments] = useState<Payment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [services, setServices] = useState<Service[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [method, setMethod] = useState<Payment["method"] | "">("");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [refundSaving, setRefundSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const [paymentResult, customerResult, staffResult, serviceResult] =
          await Promise.all([
            api<{ data: Payment[] }>(
              withQuery("/payments", { page: 1, limit: 100 }),
            ),
            api<{ data: Customer[] }>(
              withQuery("/customers", { page: 1, limit: 100 }),
            ),
            api<{ data: Staff[] }>(
              withQuery("/staff", { page: 1, limit: 100 }),
            ),
            api<{ data: Service[] }>(
              withQuery("/services", { page: 1, limit: 100 }),
            ),
          ]);

        if (!cancelled) {
          setPayments(paymentResult.data);
          setCustomers(customerResult.data);
          setStaff(staffResult.data);
          setServices(serviceResult.data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Ödemeler yüklenemedi.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

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
    () => new Map(services.map((service) => [service.id, service.name])),
    [services],
  );

  const filteredPayments = useMemo(() => {
    const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
    const to = endOfDay(toDate);
    const needle = search.trim().toLocaleLowerCase("tr-TR");

    return payments.filter((payment) => {
      const paidAt = new Date(payment.paidAt);

      if (method && payment.method !== method) {
        return false;
      }

      if (from && paidAt < from) {
        return false;
      }

      if (to && paidAt > to) {
        return false;
      }

      if (needle) {
        const haystack = [
          customerMap.get(payment.appointment.customerId) ?? "",
          staffMap.get(payment.appointment.staffId) ?? "",
          serviceMap.get(payment.appointment.serviceId) ?? "",
          METHOD_LABELS[payment.method],
        ]
          .join(" ")
          .toLocaleLowerCase("tr-TR");

        if (!haystack.includes(needle)) {
          return false;
        }
      }

      return true;
    });
  }, [
    payments,
    method,
    search,
    fromDate,
    toDate,
    customerMap,
    staffMap,
    serviceMap,
  ]);

  const totals = useMemo(() => {
    return filteredPayments.reduce(
      (summary, payment) => {
        const amount = Number(payment.amount);

        if (payment.status === "REFUNDED") {
          summary.refunded += amount;
        } else {
          summary.completed += amount;
        }

        return summary;
      },
      {
        completed: 0,
        refunded: 0,
      },
    );
  }, [filteredPayments]);

  const methodTotals = useMemo(() => {
    return filteredPayments.reduce(
      (summary, payment) => {
        if (payment.status === "COMPLETED") {
          summary[payment.method] += Number(payment.amount);
        }

        return summary;
      },
      {
        CASH: 0,
        CARD: 0,
        TRANSFER: 0,
      },
    );
  }, [filteredPayments]);

  async function refreshPayments() {
    const result = await api<{ data: Payment[] }>(
      withQuery("/payments", { page: 1, limit: 100 }),
    );
    setPayments(result.data);
  }

  async function refundPayment(paymentId: string) {
    if (!canRefundPayment) return;

    const reason = window.prompt("İade nedeni (isteğe bağlı):");

    if (reason === null) return;

    setRefundSaving(true);
    setError("");

    try {
      await api(`/payments/${paymentId}/refund`, {
        method: "POST",
        body: {
          reason: reason.trim() || undefined,
        },
      });

      await refreshPayments();
      showToast("Ödeme iade edildi.");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Ödeme iade edilemedi.",
      );
    } finally {
      setRefundSaving(false);
    }
  }

  function clearFilters() {
    setMethod("");
    setSearch("");
    setFromDate("");
    setToDate("");
  }

  const hasFilters =
    Boolean(method) ||
    Boolean(search.trim()) ||
    Boolean(fromDate) ||
    Boolean(toDate);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Ödemeler"
              />

      {error ? (
        <Alert onClose={() => setError("")}>{error}</Alert>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Net tahsilat"
          value={totals.completed - totals.refunded}
        />
        <SummaryCard
          label="Tahsilat"
          value={totals.completed}
        />
        <SummaryCard
          label="İade"
          value={totals.refunded}
        />
        <SummaryCard
          label="Kayıt"
          value={filteredPayments.length}
          currency={false}
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <MethodCard label="Nakit" value={methodTotals.CASH} />
        <MethodCard label="Kart" value={methodTotals.CARD} />
        <MethodCard label="Havale / EFT" value={methodTotals.TRANSFER} />
      </section>

      <Panel>
        <div className="border-b border-[var(--line)] px-5 py-5">
          <div className="grid gap-4 lg:grid-cols-4">
            <Field label="Ara">
              <TextInput
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Müşteri, hizmet, personel..."
              />
            </Field>

            <Field label="Ödeme yöntemi">
              <Select
                value={method}
                onChange={(event) =>
                  setMethod(
                    event.target.value as Payment["method"] | "",
                  )
                }
              >
                <option value="">Tüm yöntemler</option>
                <option value="CASH">Nakit</option>
                <option value="CARD">Kart</option>
                <option value="TRANSFER">Havale / EFT</option>
              </Select>
            </Field>

            <Field label="Başlangıç tarihi">
              <TextInput
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
              />
            </Field>

            <Field label="Bitiş tarihi">
              <TextInput
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
              />
            </Field>
          </div>

          <div className="mt-4 flex items-center justify-between gap-4">
            <p className="text-[12px] text-[var(--muted)]">
              {filteredPayments.length} ödeme gösteriliyor
            </p>

            {hasFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="text-[13px] font-medium text-[var(--accent)] hover:underline"
              >
                Filtreleri temizle
              </button>
            ) : null}
          </div>
        </div>

        {loading ? (
          <Spinner label="Ödemeler yükleniyor..." />
        ) : filteredPayments.length === 0 ? (
          <EmptyState
            title="Ödeme bulunamadı"
            description={
              payments.length === 0
                ? "Randevulardan ödeme aldığınızda kayıtlar burada görünecek."
                : "Seçtiğiniz filtrelere uyan ödeme bulunamadı."
            }
          />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Tarih</Th>
                <Th>Müşteri</Th>
                <Th>Hizmet</Th>
                <Th>Personel</Th>
                <Th>Yöntem</Th>
                <Th>Durum</Th>
                <Th>Tutar</Th>
                <Th>Aksiyon</Th>
              </tr>
            </thead>

            <tbody>
              {filteredPayments.map((payment) => (
                <tr key={payment.id}>
                  <Td label="Tarih">{formatDate(payment.paidAt)}</Td>
                  <Td label="Müşteri">
                    {customerMap.get(payment.appointment.customerId) ?? "—"}
                  </Td>
                  <Td label="Hizmet">
                    {serviceMap.get(payment.appointment.serviceId) ?? "—"}
                  </Td>
                  <Td label="Personel">
                    {staffMap.get(payment.appointment.staffId) ?? "—"}
                  </Td>
                  <Td label="Yöntem">
                    {METHOD_LABELS[payment.method]}
                  </Td>
                  <Td label="Durum">
                    <span
                      className={
                        payment.status === "REFUNDED"
                          ? "text-[var(--muted)]"
                          : "font-medium text-[var(--ink)]"
                      }
                    >
                      {payment.status === "REFUNDED"
                        ? "İade edildi"
                        : "Tamamlandı"}
                    </span>
                  </Td>
                  <Td label="Tutar" className="font-medium">
                    {formatMoney(payment.amount)}
                  </Td>
                  <Td label="Aksiyon" actions>
                    {payment.status === "COMPLETED" ? (
                      <Button
                        variant="danger"
                        className="px-3 py-1.5"
                        disabled={refundSaving || !canRefundPayment}
                        onClick={() => void refundPayment(payment.id)}
                      >
                        İade et
                      </Button>
                    ) : (
                      <span className="text-[12px] text-[var(--muted-soft)]">
                        İade edildi
                      </span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Panel>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  currency = true,
}: {
  label: string;
  value: number;
  currency?: boolean;
}) {
  return (
    <GlassCard>
      <p className="text-[12px] font-medium text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-3 text-[30px] font-semibold tracking-[-0.04em] text-[var(--ink)]">
        {currency ? formatMoney(value) : value}
      </p>
    </GlassCard>
  );
}

function MethodCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <GlassCard className="py-5">
      <p className="text-[12px] font-medium text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-[22px] font-semibold tracking-[-0.03em] text-[var(--ink)]">
        {formatMoney(value)}
      </p>
    </GlassCard>
  );
}
