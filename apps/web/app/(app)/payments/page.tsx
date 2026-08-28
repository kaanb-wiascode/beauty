"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Alert,
  Button,
  EmptyState,
  Field,
  PageHeader,
  Panel,
  Select,
  Spinner,
  TableWrap,
  Td,
  Th,
  TextInput,
} from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";

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
  const [payments, setPayments] = useState<Payment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [services, setServices] = useState<Service[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [method, setMethod] = useState<Payment["method"] | "">("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

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
    const from = fromDate
      ? new Date(`${fromDate}T00:00:00`)
      : null;
    const to = endOfDay(toDate);

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

      return true;
    });
  }, [payments, method, fromDate, toDate]);

  const total = useMemo(
    () =>
      filteredPayments.reduce(
        (sum, payment) => sum + Number(payment.amount),
        0,
      ),
    [filteredPayments],
  );

  const [refundSaving, setRefundSaving] = useState(false);

  async function refundPayment(paymentId: string) {
    const reason = window.prompt(
      "İade nedeni (isteğe bağlı):",
    );

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

      const result = await api<{ data: Payment[] }>(
        withQuery("/payments", { page: 1, limit: 100 }),
      );

      setPayments(result.data);
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
    setFromDate("");
    setToDate("");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Ödemeler"
        description="Alınan ödemeleri ve tahsilatları görüntüleyin."
      />

      {error ? (
        <Alert onClose={() => setError("")}>{error}</Alert>
      ) : null}

      <Panel>
        <div className="border-b border-[var(--line)] px-5 py-5">
          <div className="grid gap-4 md:grid-cols-3">
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
                <option value="CARD">Kart</option>
                <option value="CASH">Nakit</option>
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

            <button
              type="button"
              onClick={clearFilters}
              className="text-[13px] font-medium text-[var(--accent)] hover:underline"
            >
              Filtreleri temizle
            </button>
          </div>
        </div>

        <div className="border-b border-[var(--line)] px-5 py-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[12px] font-medium text-[var(--muted)]">
                Filtrelenmiş tahsilat
              </p>
              <p className="mt-1 text-[28px] font-semibold tracking-[-0.04em] text-[var(--ink)]">
                {formatMoney(total)}
              </p>
            </div>

            <p className="text-[12px] text-[var(--muted-soft)]">
              Toplam kayıt: {payments.length}
            </p>
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
                    {payment.status === "REFUNDED"
                      ? "İade edildi"
                      : "Tamamlandı"}
                  </Td>
                  <Td label="Tutar" className="font-medium">
                    {formatMoney(payment.amount)}
                  </Td>
                  <Td label="Aksiyon" actions>
                    {payment.status === "COMPLETED" ? (
                      <Button
                        variant="danger"
                        className="px-3 py-1.5"
                        disabled={refundSaving}
                        onClick={() =>
                          void refundPayment(payment.id)
                        }
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
