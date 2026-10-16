"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Alert,
  Button,
  EmptyState,
  Panel,
  Select,
  Spinner,
  TableWrap,
  Td,
  Th,
} from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";
import { hasPermission } from "@/lib/auth";

type Direction = "SALES" | "PURCHASE";
type Status = "DRAFT" | "ISSUED" | "CANCELLED";
type LineKind = "SERVICE" | "PACKAGE" | "PRODUCT" | "EXPENSE" | "OTHER";

type InvoiceLine = {
  id: string;
  lineNo: number;
  kind: LineKind;
  description: string;
  quantity: number | string;
  unit: string | null;
  unitPrice: number | string;
  discountAmount: number | string;
  taxRate: number | string;
  taxAmount: number | string;
  lineTotal: number | string;
};

type Invoice = {
  id: string;
  direction: Direction;
  status: Status;
  sourceType: string;
  number: string | null;
  issueDate: string | null;
  dueAt: string | null;
  currency: string;
  subtotal: number | string;
  discountTotal: number | string;
  taxTotal: number | string;
  total: number | string;
  counterpartyName: string;
  counterpartyTaxNumber: string | null;
  counterpartyAddress: string | null;
  note: string | null;
  issuedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  lines: InvoiceLine[];
};

const directionLabel: Record<Direction, string> = {
  SALES: "Satış Faturası",
  PURCHASE: "Alış Faturası",
};

const statusLabel: Record<Status, string> = {
  DRAFT: "Taslak",
  ISSUED: "Düzenlendi",
  CANCELLED: "İptal Edildi",
};

const lineKindLabel: Record<LineKind, string> = {
  SERVICE: "Hizmet",
  PACKAGE: "Paket",
  PRODUCT: "Ürün",
  EXPENSE: "Gider",
  OTHER: "Diğer",
};

export default function InvoicesPage() {
  const [rows, setRows] = useState<Invoice[]>([]);
  const canManageFinance = hasPermission("finance", "manage");
  const [direction, setDirection] = useState<"" | Direction>("");
  const [status, setStatus] = useState<"" | Status>("");
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api<Invoice[]>(
        withQuery("/invoices", {
          direction: direction || undefined,
          status: status || undefined,
        }),
      );
      setRows(data);
      setSelected((current) =>
        current ? data.find((item) => item.id === current.id) ?? null : null,
      );
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Faturalar yüklenemedi.",
      );
    } finally {
      setLoading(false);
    }
  }, [direction, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function issueSelected() {
    if (!selected || selected.status !== "DRAFT") return;
    setActionBusy(true);
    setError("");
    try {
      const updated = await api<Invoice>(`/invoices/${selected.id}/issue`, {
        method: "POST",
        body: {},
      });
      setSelected(updated);
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Fatura düzenlenemedi.",
      );
    } finally {
      setActionBusy(false);
    }
  }

  async function cancelSelected() {
    if (!selected || selected.status !== "ISSUED") return;
    const reason = window.prompt("Fatura iptal nedenini yazın.");
    if (reason === null || !reason.trim()) return;

    setActionBusy(true);
    setError("");
    try {
      const updated = await api<Invoice>(`/invoices/${selected.id}/cancel`, {
        method: "POST",
        body: { reason: reason.trim() },
      });
      setSelected(updated);
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Fatura iptal edilemedi.",
      );
    } finally {
      setActionBusy(false);
    }
  }

  const totals = useMemo(
    () => ({
      all: rows.length,
      sales: rows.filter((item) => item.direction === "SALES").length,
      purchase: rows.filter((item) => item.direction === "PURCHASE").length,
      draft: rows.filter((item) => item.status === "DRAFT").length,
    }),
    [rows],
  );

  if (loading && rows.length === 0) {
    return (
      <div className="mx-auto max-w-[1480px] py-20">
        <Spinner label="Faturalar hazırlanıyor..." />
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
            Faturalar
          </h1>
          <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[var(--muted)]">
            Satış ve alış faturalarını, cari hesap bağlantıları ve belge
            kalemleriyle birlikte tek merkezden izleyin.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void load()} disabled={loading}>
          Yenile
        </Button>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Toplam Fatura" value={String(totals.all)} />
        <Metric label="Satış Faturası" value={String(totals.sales)} />
        <Metric label="Alış Faturası" value={String(totals.purchase)} />
        <Metric label="Taslak" value={String(totals.draft)} />
      </section>

      <Panel>
        <div className="grid gap-3 border-b border-[var(--line)] p-4 sm:grid-cols-2">
          <Select
            value={direction}
            onChange={(event) =>
              setDirection(event.target.value as "" | Direction)
            }
          >
            <option value="">Tüm Fatura Türleri</option>
            <option value="SALES">Satış Faturaları</option>
            <option value="PURCHASE">Alış Faturaları</option>
          </Select>
          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value as "" | Status)}
          >
            <option value="">Tüm Durumlar</option>
            <option value="DRAFT">Taslak</option>
            <option value="ISSUED">Düzenlendi</option>
            <option value="CANCELLED">İptal Edildi</option>
          </Select>
        </div>

        {rows.length ? (
          <TableWrap>
            <thead>
              <tr>
                <Th>Fatura</Th>
                <Th>Cari Hesap</Th>
                <Th>Tarih</Th>
                <Th>Tutar</Th>
                <Th>Durum</Th>
                <Th>İşlem</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((invoice) => (
                <tr key={invoice.id} className="border-t border-[var(--line)]">
                  <Td label="Fatura">
                    <div>
                      <strong className="text-[13px]">
                        {invoice.number || "Henüz numara verilmedi"}
                      </strong>
                      <p className="mt-1 text-[11px] text-[var(--muted)]">
                        {directionLabel[invoice.direction]}
                      </p>
                    </div>
                  </Td>
                  <Td label="Cari Hesap">
                    <div>
                      <strong className="text-[12px]">
                        {invoice.counterpartyName}
                      </strong>
                      {invoice.counterpartyTaxNumber ? (
                        <p className="mt-1 text-[10px] text-[var(--muted)]">
                          Vergi No: {invoice.counterpartyTaxNumber}
                        </p>
                      ) : null}
                    </div>
                  </Td>
                  <Td label="Tarih">
                    {invoice.issueDate
                      ? formatDate(invoice.issueDate)
                      : formatDate(invoice.createdAt)}
                  </Td>
                  <Td label="Tutar">
                    <strong>
                      {money(invoice.total, invoice.currency)}
                    </strong>
                  </Td>
                  <Td label="Durum">
                    <StatusBadge status={invoice.status} />
                  </Td>
                  <Td label="İşlem" actions>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setSelected(invoice)}
                    >
                      Detayı Gör
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : (
          <EmptyState
            title="Fatura bulunamadı"
            description="Seçtiğiniz filtrelere uygun satış veya alış faturası bulunmuyor."
          />
        )}
      </Panel>

      {selected ? (
        <Panel>
          <div className="flex flex-col gap-3 border-b border-[var(--line)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-[15px] font-semibold text-[var(--ink)]">
                {selected.number || "Taslak Fatura"}
              </h2>
              <p className="mt-1 text-[11px] text-[var(--muted)]">
                {directionLabel[selected.direction]} · {selected.counterpartyName}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={selected.status} />
              {canManageFinance && selected.status === "DRAFT" ? (
                <Button
                  size="sm"
                  disabled={actionBusy}
                  onClick={() => void issueSelected()}
                >
                  {actionBusy ? "Düzenleniyor..." : "Faturayı Düzenle"}
                </Button>
              ) : null}
              {canManageFinance && selected.status === "ISSUED" ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={actionBusy}
                  onClick={() => void cancelSelected()}
                >
                  {actionBusy ? "İşleniyor..." : "Faturayı İptal Et"}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
            <Detail
              label="Ara Toplam"
              value={money(selected.subtotal, selected.currency)}
            />
            <Detail
              label="İndirim"
              value={money(selected.discountTotal, selected.currency)}
            />
            <Detail
              label="Vergi"
              value={money(selected.taxTotal, selected.currency)}
            />
            <Detail
              label="Genel Toplam"
              value={money(selected.total, selected.currency)}
              strong
            />
          </div>

          <div className="border-t border-[var(--line)]">
            <TableWrap>
              <thead>
                <tr>
                  <Th>Kalem</Th>
                  <Th>Miktar</Th>
                  <Th>Birim Fiyat</Th>
                  <Th>İndirim</Th>
                  <Th>Vergi</Th>
                  <Th>Toplam</Th>
                </tr>
              </thead>
              <tbody>
                {selected.lines.map((line) => (
                  <tr key={line.id} className="border-t border-[var(--line)]">
                    <Td label="Kalem">
                      <div>
                        <strong className="text-[12px]">{line.description}</strong>
                        <p className="mt-1 text-[10px] text-[var(--muted)]">
                          {lineKindLabel[line.kind]}
                        </p>
                      </div>
                    </Td>
                    <Td label="Miktar">
                      {Number(line.quantity).toLocaleString("tr-TR")}
                      {line.unit ? ` ${line.unit}` : ""}
                    </Td>
                    <Td label="Birim Fiyat">
                      {money(line.unitPrice, selected.currency)}
                    </Td>
                    <Td label="İndirim">
                      {money(line.discountAmount, selected.currency)}
                    </Td>
                    <Td label="Vergi">
                      %{Number(line.taxRate).toLocaleString("tr-TR")} ·{" "}
                      {money(line.taxAmount, selected.currency)}
                    </Td>
                    <Td label="Toplam">
                      <strong>{money(line.lineTotal, selected.currency)}</strong>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4">
      <p className="text-[10px] font-medium text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-[22px] font-semibold tracking-[-.03em] text-[var(--ink)]">
        {value}
      </p>
    </div>
  );
}

function Detail({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-[14px] bg-[var(--surface-2)]/55 p-4">
      <p className="text-[10px] text-[var(--muted)]">{label}</p>
      <p
        className={`mt-2 ${
          strong ? "text-[16px]" : "text-[13px]"
        } font-semibold text-[var(--ink)]`}
      >
        {value}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const className =
    status === "ISSUED"
      ? "bg-emerald-50 text-emerald-700"
      : status === "CANCELLED"
        ? "bg-red-50 text-red-700"
        : "bg-amber-50 text-amber-700";

  return (
    <span
      className={`inline-flex w-fit rounded-full px-2.5 py-1 text-[11px] font-semibold ${className}`}
    >
      {statusLabel[status]}
    </span>
  );
}

function money(value: number | string, currency: string) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
  }).format(new Date(value));
}
