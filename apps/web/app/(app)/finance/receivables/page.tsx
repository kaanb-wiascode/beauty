"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { FinanceMetric, FinancePanel } from "@/components/finance-view";
import {
  Alert,
  Button,
  EmptyState,
  Panel,
  Spinner,
  TableWrap,
  Td,
  Th,
} from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type Summary = {
  receivableCount: number;
  customerCount: number;
  totalOpen: number;
  totalOverdue: number;
  partiallyPaidCount: number;
  overdueCount: number;
};

type Aging = {
  notDue: number;
  days0to30: number;
  days31to60: number;
  days61to90: number;
  days90Plus: number;
  total: number;
};

type Receivable = {
  saleId: string;
  counterpartyId: string;
  customerName: string;
  phone: string | null;
  email: string | null;
  total: number;
  paid: number;
  balance: number;
  nextDueAt: string | null;
  overdueAmount: number;
  confirmedAt: string;
  status: "OPEN" | "PARTIALLY_PAID" | "OVERDUE";
};

const statusLabel: Record<Receivable["status"], string> = {
  OPEN: "Açık",
  PARTIALLY_PAID: "Kısmi Tahsil Edildi",
  OVERDUE: "Gecikmiş",
};

export default function ReceivablesPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [aging, setAging] = useState<Aging | null>(null);
  const [rows, setRows] = useState<Receivable[]>([]);
  const [baseCurrency, setBaseCurrency] = useState("TRY");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const money = useMemo(
    () =>
      new Intl.NumberFormat("tr-TR", {
        style: "currency",
        currency: baseCurrency,
        maximumFractionDigits: 2,
      }),
    [baseCurrency],
  );

  const date = useMemo(
    () => new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }),
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [summaryData, agingData, receivables, settings] = await Promise.all([
        api<Summary>("/accounts-receivable/summary"),
        api<Aging>("/accounts-receivable/aging"),
        api<Receivable[]>("/accounts-receivable/open"),
        api<{ baseCurrency: string }>("/finance/control/settings"),
      ]);
      setSummary(summaryData);
      setAging(agingData);
      setRows(receivables);
      setBaseCurrency(settings.baseCurrency || "TRY");
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Müşteri alacakları yüklenemedi.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !summary) {
    return (
      <div className="mx-auto max-w-[1480px] py-20">
        <Spinner label="Müşteri alacakları hazırlanıyor..." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1480px] space-y-6 pb-12">
      <header className="flex flex-col gap-5 rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[0_12px_36px_rgba(17,70,104,0.04)] xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-[var(--accent)]">
            Finans Yönetimi
          </p>
          <h1 className="text-[32px] font-semibold tracking-[-.045em] text-[var(--ink)]">
            Müşteri Alacakları
          </h1>
          <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[var(--muted)]">
            Satışlardan doğan açık bakiyeleri, taksit vadelerini, gecikmeleri ve
            kısmi tahsilatları tek ekranda izleyin.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void load()} disabled={loading}>
          Yenile
        </Button>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <FinanceMetric
          label="Toplam Açık Alacak"
          value={money.format(Number(summary?.totalOpen ?? 0))}
          detail={`${summary?.receivableCount ?? 0} açık satış`}
          tone={(summary?.totalOpen ?? 0) > 0 ? "warning" : "success"}
        />
        <FinanceMetric
          label="Gecikmiş Alacak"
          value={money.format(Number(summary?.totalOverdue ?? 0))}
          detail={`${summary?.overdueCount ?? 0} gecikmiş kayıt`}
          tone={(summary?.totalOverdue ?? 0) > 0 ? "danger" : "success"}
        />
        <FinanceMetric
          label="Borçlu Müşteri"
          value={summary?.customerCount ?? 0}
          detail="Açık bakiyesi bulunan"
        />
        <FinanceMetric
          label="Kısmi Tahsilat"
          value={summary?.partiallyPaidCount ?? 0}
          detail="Bakiyesi devam eden"
        />
        <FinanceMetric
          label="90+ Gün"
          value={money.format(Number(aging?.days90Plus ?? 0))}
          detail="En yüksek gecikme riski"
          tone={(aging?.days90Plus ?? 0) > 0 ? "danger" : "neutral"}
        />
      </section>

      <div className="grid gap-5 xl:grid-cols-[.72fr_1.28fr]">
        <FinancePanel
          title="Alacak Yaşlandırma"
          description="Vadesine ve gecikme süresine göre açık müşteri bakiyesi"
        >
          <div className="space-y-2">
            <AgingRow
              label="Vadesi Gelmemiş"
              value={aging?.notDue}
              currency={baseCurrency}
            />
            <AgingRow
              label="0–30 Gün Gecikmiş"
              value={aging?.days0to30}
              currency={baseCurrency}
              danger
            />
            <AgingRow
              label="31–60 Gün Gecikmiş"
              value={aging?.days31to60}
              currency={baseCurrency}
              danger
            />
            <AgingRow
              label="61–90 Gün Gecikmiş"
              value={aging?.days61to90}
              currency={baseCurrency}
              danger
            />
            <AgingRow
              label="90+ Gün Gecikmiş"
              value={aging?.days90Plus}
              currency={baseCurrency}
              danger
            />
            <AgingRow
              label="Toplam Açık"
              value={aging?.total}
              currency={baseCurrency}
              strong
            />
          </div>
        </FinancePanel>

        <Panel>
          <div className="border-b border-[var(--line)] px-5 py-4">
            <h2 className="text-[15px] font-semibold text-[var(--ink)]">
              Açık Müşteri Bakiyeleri
            </h2>
            <p className="mt-1 text-[12px] text-[var(--muted)]">
              Gecikmiş kayıtlar önce gösterilir.
            </p>
          </div>

          {rows.length ? (
            <TableWrap>
              <thead>
                <tr>
                  <Th>Müşteri</Th>
                  <Th>Satış</Th>
                  <Th>Tahsil Edilen</Th>
                  <Th>Açık Bakiye</Th>
                  <Th>Sonraki Vade</Th>
                  <Th>Durum</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.saleId}
                    className="border-t border-[var(--line)]"
                  >
                    <Td label="Müşteri">
                      <div>
                        <strong className="text-[13px]">{row.customerName}</strong>
                        <p className="mt-1 text-[11px] text-[var(--muted)]">
                          {row.phone || row.email || "İletişim bilgisi yok"}
                        </p>
                      </div>
                    </Td>
                    <Td label="Satış">{money.format(row.total)}</Td>
                    <Td label="Tahsil Edilen">{money.format(row.paid)}</Td>
                    <Td label="Açık Bakiye">
                      <strong>{money.format(row.balance)}</strong>
                      {row.overdueAmount > 0 ? (
                        <p className="mt-1 text-[10px] font-medium text-red-700">
                          Gecikmiş: {money.format(row.overdueAmount)}
                        </p>
                      ) : null}
                    </Td>
                    <Td label="Sonraki Vade">
                      {row.nextDueAt ? date.format(new Date(row.nextDueAt)) : "Belirtilmedi"}
                    </Td>
                    <Td label="Durum">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          row.status === "OVERDUE"
                            ? "bg-red-50 text-red-700"
                            : row.status === "PARTIALLY_PAID"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-sky-50 text-sky-700"
                        }`}
                      >
                        {statusLabel[row.status]}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          ) : (
            <EmptyState
              title="Açık müşteri alacağı yok"
              description="Aktif kapsamda tahsil edilmemiş satış bakiyesi bulunmuyor."
            />
          )}
        </Panel>
      </div>
    </div>
  );
}

function AgingRow({
  label,
  value,
  currency,
  danger,
  strong,
}: {
  label: string;
  value?: number;
  currency: string;
  danger?: boolean;
  strong?: boolean;
}) {
  const formatted = new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));

  return (
    <div
      className={`flex items-center justify-between rounded-[12px] px-4 py-3 ${
        strong
          ? "border border-[var(--line)] bg-[var(--surface)]"
          : "bg-[var(--surface-2)]/55"
      }`}
    >
      <span className="text-[11px] text-[var(--muted)]">{label}</span>
      <strong
        className={`text-[12px] ${
          danger && Number(value ?? 0) > 0
            ? "text-red-700"
            : "text-[var(--ink)]"
        }`}
      >
        {formatted}
      </strong>
    </div>
  );
}
