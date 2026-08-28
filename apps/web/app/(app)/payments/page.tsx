"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Alert,
  EmptyState,
  PageHeader,
  Panel,
  Spinner,
  TableWrap,
  Td,
  Th,
} from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";

type Payment = {
  id: string;
  appointmentId: string;
  amount: string | number;
  method: "CASH" | "CARD" | "TRANSFER";
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

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  const total = useMemo(
    () => payments.reduce((sum, payment) => sum + Number(payment.amount), 0),
    [payments],
  );

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
        <div className="border-b border-[var(--line)] px-5 py-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[12px] font-medium text-[var(--muted)]">
                Toplam tahsilat
              </p>
              <p className="mt-1 text-[28px] font-semibold tracking-[-0.04em] text-[var(--ink)]">
                {formatMoney(total)}
              </p>
            </div>

            <p className="text-[12px] text-[var(--muted-soft)]">
              {payments.length} ödeme
            </p>
          </div>
        </div>

        {loading ? (
          <Spinner label="Ödemeler yükleniyor..." />
        ) : payments.length === 0 ? (
          <EmptyState
            title="Henüz ödeme yok"
            description="Randevulardan ödeme aldığınızda kayıtlar burada görünecek."
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
                <Th>Tutar</Th>
              </tr>
            </thead>

            <tbody>
              {payments.map((payment) => (
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
                  <Td label="Tutar" className="font-medium">
                    {formatMoney(payment.amount)}
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
