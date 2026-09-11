"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DataView,
  DataViewMeta,
  DataViewToolbar,
  FilterChip,
  SearchField,
  ToolbarSelect,
} from "@/components/data-view";
import {
  DashboardActions,
  type DashboardAction,
} from "@/components/dashboard-actions";
import {
  Alert,
  Button,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Panel,
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

type Customer = { id: string; firstName: string; lastName: string };
type Staff = { id: string; firstName: string; lastName: string };
type Service = { id: string; name: string };
type Method = Payment["method"];
type Range = "today" | "week" | "month" | "all";
type PaymentStatus = "" | "COMPLETED" | "REFUNDED";

const METHOD_LABELS: Record<Method, string> = {
  CASH: "Nakit",
  CARD: "Kart",
  TRANSFER: "Havale / EFT",
};

const METHOD_ICONS: Record<Method, string> = {
  CASH: "₺",
  CARD: "▣",
  TRANSFER: "↗",
};

function fullName(firstName: string, lastName: string) {
  return `${firstName} ${lastName}`.trim();
}

function money(value: string | number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function shortMoney(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(value);
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function rangeLabel(range: Range) {
  if (range === "today") return "Bugün";
  if (range === "week") return "Bu hafta";
  if (range === "month") return "Bu ay";
  return "Tüm dönem";
}

function Icon({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "blue" | "green" | "red" | "orange";
}) {
  const tones = {
    neutral: "bg-black/[0.045] text-[var(--muted)]",
    blue: "bg-[var(--accent-soft)] text-[var(--accent)]",
    green: "bg-[rgba(47,122,86,0.10)] text-[#2f7a56]",
    red: "bg-[rgba(143,61,61,0.09)] text-[#8f3d3d]",
    orange: "bg-[rgba(190,116,37,0.10)] text-[#b36b1f]",
  };

  return (
    <span
      aria-hidden="true"
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] text-[16px] font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

function Kpi({
  label,
  value,
  detail,
  icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: string;
  tone: "blue" | "green" | "red" | "orange";
}) {
  return (
    <article className="surface rounded-[20px] border border-[var(--line)] p-5">
      <Icon tone={tone}>{icon}</Icon>
      <p className="mt-4 text-[11px] font-medium text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-[26px] font-semibold tracking-[-0.04em] text-[var(--ink)]">
        {value}
      </p>
      <p className="mt-1 text-[11px] text-[var(--muted-soft)]">{detail}</p>
    </article>
  );
}

function MethodRow({
  method,
  value,
  total,
}: {
  method: Method;
  value: number;
  total: number;
}) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;
  const tone = method === "CARD" ? "blue" : method === "CASH" ? "green" : "orange";

  return (
    <div className="py-3.5">
      <div className="flex items-center gap-3">
        <Icon tone={tone}>{METHOD_ICONS[method]}</Icon>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] font-medium text-[var(--ink)]">
              {METHOD_LABELS[method]}
            </span>
            <span className="text-[13px] font-semibold text-[var(--ink)]">
              {money(value)}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/[0.05]">
            <div
              className="h-full rounded-full bg-[var(--accent)]/70"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
        <span className="w-10 text-right text-[11px] text-[var(--muted)]">
          %{percent}
        </span>
      </div>
    </div>
  );
}

export default function PaymentsPage() {
  const canCreate = hasPermission("payments", "create");
  const canRefund = hasPermission("payments", "refund");
  const { showToast } = useToast();

  const [payments, setPayments] = useState<Payment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState<Method | "">("");
  const [status, setStatus] = useState<PaymentStatus>("");
  const [range, setRange] = useState<Range>("today");
  const [refundId, setRefundId] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [refundSaving, setRefundSaving] = useState(false);
  const [globalAction, setGlobalAction] = useState<DashboardAction | null>(null);

  async function loadPayments() {
    const result = await api<{ data: Payment[] }>(
      withQuery("/payments", { page: 1, limit: 100 }),
    );
    setPayments(result.data);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const [p, c, s, sv] = await Promise.all([
          api<{ data: Payment[] }>(withQuery("/payments", { page: 1, limit: 100 })),
          api<{ data: Customer[] }>(withQuery("/customers", { page: 1, limit: 100 })),
          api<{ data: Staff[] }>(withQuery("/staff", { page: 1, limit: 100 })),
          api<{ data: Service[] }>(withQuery("/services", { page: 1, limit: 100 })),
        ]);

        if (!cancelled) {
          setPayments(p.data);
          setCustomers(c.data);
          setStaff(s.data);
          setServices(sv.data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Ödemeler yüklenemedi.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const customerMap = useMemo(
    () => new Map(customers.map((customer) => [customer.id, fullName(customer.firstName, customer.lastName)])),
    [customers],
  );
  const staffMap = useMemo(
    () => new Map(staff.map((member) => [member.id, fullName(member.firstName, member.lastName)])),
    [staff],
  );
  const serviceMap = useMemo(
    () => new Map(services.map((service) => [service.id, service.name])),
    [services],
  );

  const filtered = useMemo(() => {
    const now = new Date();
    const from =
      range === "today"
        ? startOfDay(now)
        : range === "week"
          ? startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6))
          : range === "month"
            ? startOfDay(new Date(now.getFullYear(), now.getMonth(), 1))
            : null;
    const to = range === "all" ? null : endOfDay(now);
    const needle = search.trim().toLocaleLowerCase("tr-TR");

    return payments.filter((payment) => {
      const date = new Date(payment.paidAt);
      if (from && date < from) return false;
      if (to && date > to) return false;
      if (method && payment.method !== method) return false;
      if (status && payment.status !== status) return false;

      if (needle) {
        const haystack = [
          customerMap.get(payment.appointment.customerId),
          staffMap.get(payment.appointment.staffId),
          serviceMap.get(payment.appointment.serviceId),
          METHOD_LABELS[payment.method],
        ]
          .join(" ")
          .toLocaleLowerCase("tr-TR");

        if (!haystack.includes(needle)) return false;
      }

      return true;
    });
  }, [payments, range, method, status, search, customerMap, staffMap, serviceMap]);

  const sortedPayments = useMemo(
    () => [...filtered].sort((a, b) => +new Date(b.paidAt) - +new Date(a.paidAt)),
    [filtered],
  );

  const stats = useMemo(() => {
    let completed = 0;
    let refunded = 0;
    const methods: Record<Method, number> = { CASH: 0, CARD: 0, TRANSFER: 0 };

    filtered.forEach((payment) => {
      const amount = Number(payment.amount);
      if (payment.status === "REFUNDED") {
        refunded += amount;
      } else {
        completed += amount;
        methods[payment.method] += amount;
      }
    });

    return {
      completed,
      refunded,
      net: completed - refunded,
      methods,
    };
  }, [filtered]);

  const trend = useMemo(() => {
    const now = new Date();

    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - index));
      const key = dayKey(date);
      const value = payments
        .filter(
          (payment) =>
            payment.status === "COMPLETED" &&
            dayKey(new Date(payment.paidAt)) === key,
        )
        .reduce((sum, payment) => sum + Number(payment.amount), 0);

      return {
        label: new Intl.DateTimeFormat("tr-TR", {
          day: "2-digit",
          month: "short",
        }).format(date),
        value,
      };
    });
  }, [payments]);

  async function submitRefund() {
    if (!refundId || !canRefund) return;

    setRefundSaving(true);
    setError("");

    try {
      await api(`/payments/${refundId}/refund`, {
        method: "POST",
        body: { reason: refundReason.trim() || undefined },
      });
      await loadPayments();
      setRefundId(null);
      setRefundReason("");
      showToast("Ödeme iade edildi.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ödeme iade edilemedi.");
    } finally {
      setRefundSaving(false);
    }
  }

  function clearFilters() {
    setSearch("");
    setMethod("");
    setStatus("");
    setRange("today");
  }

  const hasFilters = Boolean(search.trim() || method || status || range !== "today");
  const completedCount = filtered.filter((payment) => payment.status === "COMPLETED").length;
  const refundedCount = filtered.filter((payment) => payment.status === "REFUNDED").length;
  const maxTrend = Math.max(...trend.map((item) => item.value), 1);

  return (
    <div className="mx-auto w-full max-w-[1320px] space-y-6 pb-10">
      <PageHeader
        title="Ödemeler"
        description="Tahsilat, iade ve ödeme hareketlerinizi tek ekrandan yönetin."
        action={
          canCreate ? (
            <Button onClick={() => setGlobalAction("payment")}>+ Yeni ödeme</Button>
          ) : undefined
        }
      />

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Net tahsilat"
          value={money(stats.net)}
          detail={rangeLabel(range)}
          icon="₺"
          tone="blue"
        />
        <Kpi
          label="Brüt tahsilat"
          value={money(stats.completed)}
          detail={`${completedCount} tamamlanan işlem`}
          icon="↓"
          tone="green"
        />
        <Kpi
          label="İadeler"
          value={money(stats.refunded)}
          detail={`${refundedCount} iade`}
          icon="↶"
          tone="red"
        />
        <Kpi
          label="Ortalama işlem"
          value={money(completedCount ? stats.completed / completedCount : 0)}
          detail="Tamamlanan işlemler"
          icon="↗"
          tone="orange"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1.35fr]">
        <Panel>
          <div className="border-b border-[var(--line)] px-6 py-5">
            <h2 className="text-[16px] font-semibold text-[var(--ink)]">
              Ödeme yöntemleri
            </h2>
            <p className="mt-1 text-[12px] text-[var(--muted)]">
              Seçili filtrelere göre tahsilat dağılımı
            </p>
          </div>
          <div className="p-6">
            <div className="mb-4 text-[28px] font-semibold tracking-[-0.04em] text-[var(--ink)]">
              {money(stats.completed)}
            </div>
            <MethodRow method="CARD" value={stats.methods.CARD} total={stats.completed} />
            <MethodRow method="CASH" value={stats.methods.CASH} total={stats.completed} />
            <MethodRow method="TRANSFER" value={stats.methods.TRANSFER} total={stats.completed} />
          </div>
        </Panel>

        <Panel>
          <div className="border-b border-[var(--line)] px-6 py-5">
            <h2 className="text-[16px] font-semibold text-[var(--ink)]">
              Günlük tahsilat trendi
            </h2>
            <p className="mt-1 text-[12px] text-[var(--muted)]">Son 7 gün</p>
          </div>
          <div className="p-6">
            <div className="flex h-[175px] items-end gap-2 sm:gap-3">
              {trend.map((item, index) => (
                <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                  <span className="text-[9px] text-[var(--muted)]">
                    {item.value ? shortMoney(item.value) : "₺0"}
                  </span>
                  <div className="flex h-[105px] w-full items-end rounded-[10px] bg-black/[0.025] p-1">
                    <div
                      className={
                        index === trend.length - 1
                          ? "w-full rounded-[7px] bg-[var(--accent)]"
                          : "w-full rounded-[7px] bg-[#9bbbd7]"
                      }
                      style={{
                        height: `${Math.max((item.value / maxTrend) * 100, item.value ? 5 : 0)}%`,
                      }}
                    />
                  </div>
                  <span className="text-[9px] text-[var(--muted-soft)]">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </section>

      <DataView>
        <DataViewToolbar
          search={
            <SearchField
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setSearch("");
              }}
              placeholder="Müşteri, personel, hizmet veya ödeme yöntemi ara..."
              aria-label="Ödemelerde ara"
            />
          }
          actions={
            <>
              <ToolbarSelect
                value={method}
                onChange={(event) => setMethod(event.target.value as Method | "")}
                aria-label="Ödeme yöntemi"
              >
                <option value="">Tüm yöntemler</option>
                <option value="CASH">Nakit</option>
                <option value="CARD">Kart</option>
                <option value="TRANSFER">Havale / EFT</option>
              </ToolbarSelect>

              <ToolbarSelect
                value={status}
                onChange={(event) => setStatus(event.target.value as PaymentStatus)}
                aria-label="Ödeme durumu"
              >
                <option value="">Tüm durumlar</option>
                <option value="COMPLETED">Tamamlandı</option>
                <option value="REFUNDED">İade edildi</option>
              </ToolbarSelect>

              {hasFilters ? (
                <Button variant="ghost" onClick={clearFilters}>
                  Filtreleri temizle
                </Button>
              ) : null}
            </>
          }
          filters={
            <>
              <FilterChip active={range === "today"} onClick={() => setRange("today")}>Bugün</FilterChip>
              <FilterChip active={range === "week"} onClick={() => setRange("week")}>Bu hafta</FilterChip>
              <FilterChip active={range === "month"} onClick={() => setRange("month")}>Bu ay</FilterChip>
              <FilterChip active={range === "all"} onClick={() => setRange("all")}>Tümü</FilterChip>
            </>
          }
        />

        {loading ? (
          <Spinner label="Ödemeler yükleniyor..." />
        ) : sortedPayments.length === 0 ? (
          <EmptyState
            title={hasFilters ? "Eşleşen ödeme yok" : "Henüz ödeme yok"}
            description={
              hasFilters
                ? "Arama veya filtre kriterlerini değiştirerek tekrar deneyin."
                : "Ödeme kaydı oluştuğunda burada görünecek."
            }
          />
        ) : (
          <>
            <div className="hidden md:block">
              <TableWrap>
                <thead className="border-b border-[var(--line)] bg-[var(--surface-2)]/35">
                  <tr>
                    <Th>Müşteri</Th>
                    <Th>Hizmet</Th>
                    <Th>Yöntem</Th>
                    <Th>Tutar</Th>
                    <Th>Tarih</Th>
                    <Th>Durum</Th>
                    <Th><span className="block text-right">İşlem</span></Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {sortedPayments.map((payment) => (
                    <tr key={payment.id} className="transition hover:bg-black/[0.018]">
                      <Td label="Müşteri">
                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-semibold text-[var(--ink)]">
                            {customerMap.get(payment.appointment.customerId) ?? "—"}
                          </p>
                          <p className="mt-1 truncate text-[10px] text-[var(--muted)]">
                            {staffMap.get(payment.appointment.staffId) ?? "Personel bilgisi yok"}
                          </p>
                        </div>
                      </Td>
                      <Td label="Hizmet">
                        <span className="text-[12px] text-[var(--ink)]">
                          {serviceMap.get(payment.appointment.serviceId) ?? "—"}
                        </span>
                      </Td>
                      <Td label="Yöntem">
                        <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[10px] font-medium text-[var(--muted)]">
                          {METHOD_LABELS[payment.method]}
                        </span>
                      </Td>
                      <Td label="Tutar">
                        <span className="text-[12px] font-semibold text-[var(--ink)]">
                          {money(payment.amount)}
                        </span>
                      </Td>
                      <Td label="Tarih">
                        <span className="text-[10px] text-[var(--muted)]">
                          {dateTime(payment.paidAt)}
                        </span>
                      </Td>
                      <Td label="Durum">
                        <span
                          className={
                            payment.status === "COMPLETED"
                              ? "rounded-full bg-[rgba(47,122,86,.10)] px-2.5 py-1 text-[10px] font-medium text-[#2f7a56]"
                              : "rounded-full bg-[rgba(143,61,61,.08)] px-2.5 py-1 text-[10px] font-medium text-[#8f3d3d]"
                          }
                        >
                          {payment.status === "COMPLETED" ? "Tamamlandı" : "İade edildi"}
                        </span>
                      </Td>
                      <Td label="İşlem">
                        <div className="flex justify-end">
                          {payment.status === "COMPLETED" ? (
                            <button
                              type="button"
                              disabled={!canRefund}
                              onClick={() => {
                                setRefundId(payment.id);
                                setRefundReason("");
                              }}
                              className="rounded-lg px-2.5 py-1.5 text-[10px] font-medium text-[var(--muted)] hover:bg-[var(--surface-2)] disabled:opacity-40"
                            >
                              İade et
                            </button>
                          ) : (
                            <span className="text-[10px] text-[var(--muted-soft)]">—</span>
                          )}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            </div>

            <div className="divide-y divide-[var(--line)] md:hidden">
              {sortedPayments.map((payment) => (
                <article key={payment.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-[13px] font-semibold text-[var(--ink)]">
                        {customerMap.get(payment.appointment.customerId) ?? "—"}
                      </h3>
                      <p className="mt-1 truncate text-[11px] text-[var(--muted)]">
                        {serviceMap.get(payment.appointment.serviceId) ?? "Hizmet bilgisi yok"}
                      </p>
                    </div>
                    <strong className="shrink-0 text-[14px] text-[var(--ink)]">
                      {money(payment.amount)}
                    </strong>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-[var(--muted)]">
                    <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-1">
                      {METHOD_LABELS[payment.method]}
                    </span>
                    <span>{dateTime(payment.paidAt)}</span>
                    <span>{payment.status === "COMPLETED" ? "Tamamlandı" : "İade edildi"}</span>
                  </div>

                  {payment.status === "COMPLETED" ? (
                    <button
                      type="button"
                      disabled={!canRefund}
                      onClick={() => {
                        setRefundId(payment.id);
                        setRefundReason("");
                      }}
                      className="mt-3 rounded-[10px] border border-[var(--line)] px-3 py-2 text-[10px] font-semibold text-[var(--muted)] disabled:opacity-40"
                    >
                      İade et
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          </>
        )}

        <DataViewMeta>
          <span>{sortedPayments.length} ödeme gösteriliyor</span>
          <span>Liste en fazla son 100 kayıt üzerinden çalışır.</span>
        </DataViewMeta>
      </DataView>

      <Modal
        open={Boolean(refundId)}
        onClose={() => {
          if (!refundSaving) {
            setRefundId(null);
            setRefundReason("");
          }
        }}
        title="Ödemeyi iade et"
        description="İade işlemi ödeme kaydını REFUNDED durumuna geçirir."
      >
        <div className="space-y-4">
          <Field label="İade nedeni">
            <TextInput
              value={refundReason}
              onChange={(event) => setRefundReason(event.target.value)}
              placeholder="İsteğe bağlı açıklama"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              disabled={refundSaving}
              onClick={() => {
                setRefundId(null);
                setRefundReason("");
              }}
            >
              Vazgeç
            </Button>
            <Button
              disabled={refundSaving || !canRefund}
              onClick={() => void submitRefund()}
            >
              {refundSaving ? "İade ediliyor..." : "İadeyi onayla"}
            </Button>
          </div>
        </div>
      </Modal>

      <DashboardActions
        action={globalAction}
        onClose={() => setGlobalAction(null)}
        onSaved={(message) => {
          showToast(message);
          void loadPayments();
        }}
      />
    </div>
  );
}
