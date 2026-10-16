"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { FinanceMetric, FinancePanel } from "@/components/finance-view";
import {
  Alert,
  Button,
  EmptyState,
  PageHeader,
  Panel,
  Select,
  Spinner,
  TableWrap,
  Td,
  TextInput,
  Th,
} from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";

type CariKind = "CUSTOMER" | "SUPPLIER";

type CariAccount = {
  id: string;
  kind: CariKind;
  name: string;
  phone: string | null;
  email: string | null;
  taxNumber: string | null;
  balance: number;
  balanceStatus: "OPEN" | "SETTLED";
};

type LedgerEntry = {
  id: string;
  date: string;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
  type: string;
};

type DetailResponse = {
  kind: CariKind;
  customer?: { firstName: string; lastName: string; phone?: string | null; email?: string | null };
  supplier?: { name: string };
  summary?: { totalSales: number; grossPaid: number; totalRefunded: number; netPaid: number; balance: number };
  totals?: { debit: number; credit: number; balance: number };
  entries: Array<Record<string, unknown>>;
};

const typeLabel: Record<CariKind, string> = {
  CUSTOMER: "Müşteri",
  SUPPLIER: "Tedarikçi",
};

const movementLabel: Record<string, string> = {
  SALE: "Satış",
  PAYMENT: "Ödeme / Tahsilat",
  REFUND: "İade",
  BILL: "Tedarikçi Faturası",
  CREDIT_NOTE: "Alacak Notu",
  BILL_CANCELLATION: "Fatura İptali",
};

function normalizeEntry(entry: Record<string, unknown>): LedgerEntry {
  return {
    id: String(entry.id ?? entry.referenceId ?? crypto.randomUUID()),
    date: String(entry.occurredAt ?? entry.date ?? new Date().toISOString()),
    description: String(entry.description ?? "Cari hareket"),
    debit: Number(entry.debit ?? 0),
    credit: Number(entry.credit ?? 0),
    runningBalance: Number(entry.runningBalance ?? 0),
    type: String(entry.type ?? ""),
  };
}

export default function CariAccountsPage() {
  const [rows, setRows] = useState<CariAccount[]>([]);
  const [kind, setKind] = useState<"" | CariKind>("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CariAccount | null>(null);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [baseCurrency, setBaseCurrency] = useState("TRY");

  const money = useMemo(
    () =>
      new Intl.NumberFormat("tr-TR", {
        style: "currency",
        currency: baseCurrency,
        maximumFractionDigits: 2,
      }),
    [baseCurrency],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [data, settings] = await Promise.all([
        api<CariAccount[]>(withQuery("/cari-accounts", { kind: kind || undefined, search: search.trim() || undefined })),
        api<{ baseCurrency: string }>("/finance/control/settings"),
      ]);
      setRows(data);
      setBaseCurrency(settings.baseCurrency || "TRY");
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Cari hesaplar yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [kind, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function openLedger(account: CariAccount) {
    setSelected(account);
    setDetail(null);
    setDetailLoading(true);
    setError("");
    try {
      setDetail(await api<DetailResponse>(`/cari-accounts/${account.kind}/${account.id}`));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Hesap ekstresi yüklenemedi.");
    } finally {
      setDetailLoading(false);
    }
  }

  const openBalance = useMemo(
    () => rows.reduce((total, row) => total + Number(row.balance || 0), 0),
    [rows],
  );
  const customerCount = rows.filter((row) => row.kind === "CUSTOMER").length;
  const supplierCount = rows.filter((row) => row.kind === "SUPPLIER").length;
  const entries = detail?.entries.map(normalizeEntry) ?? [];

  if (loading && rows.length === 0) {
    return <div className="mx-auto max-w-[1480px] py-20"><Spinner label="Cari hesaplar hazırlanıyor..." /></div>;
  }

  return (
    <div className="mx-auto max-w-[1480px] space-y-6 pb-12">
      <PageHeader
        title="Cari Hesaplar"
        description="Müşteri alacaklarını ve tedarikçi borçlarını tek ekranda izleyin; hesap ekstrelerine doğrudan ulaşın."
        action={<Button variant="secondary" onClick={() => void load()} disabled={loading}>Yenile</Button>}
      />

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FinanceMetric label="Toplam Cari Hesap" value={rows.length} detail="Aktif kapsam" />
        <FinanceMetric label="Müşteri Hesapları" value={customerCount} detail="Satış ve tahsilat bağlantılı" />
        <FinanceMetric label="Tedarikçi Hesapları" value={supplierCount} detail="Fatura ve ödeme bağlantılı" />
        <FinanceMetric
          label="Toplam Açık Bakiye"
          value={money.format(openBalance)}
          detail="Seçili kapsam"
          tone={openBalance > 0 ? "warning" : "success"}
        />
      </section>

      <Panel>
        <div className="grid gap-3 border-b border-[var(--line)] p-4 sm:grid-cols-[220px_1fr]">
          <Select value={kind} onChange={(event) => setKind(event.target.value as "" | CariKind)}>
            <option value="">Tüm Cari Hesaplar</option>
            <option value="CUSTOMER">Müşteriler</option>
            <option value="SUPPLIER">Tedarikçiler</option>
          </Select>
          <TextInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Ad, telefon, e-posta veya vergi numarası ara"
          />
        </div>

        {rows.length ? (
          <TableWrap>
            <thead>
              <tr>
                <Th>Hesap</Th>
                <Th>Tür</Th>
                <Th>İletişim</Th>
                <Th>Açık Bakiye</Th>
                <Th>Durum</Th>
                <Th>İşlem</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.kind}:${row.id}`} className="border-t border-[var(--line)]">
                  <Td label="Hesap">
                    <div>
                      <strong className="text-[13px]">{row.name}</strong>
                      {row.taxNumber ? <p className="mt-1 text-[11px] text-[var(--muted)]">Vergi No: {row.taxNumber}</p> : null}
                    </div>
                  </Td>
                  <Td label="Tür">{typeLabel[row.kind]}</Td>
                  <Td label="İletişim">
                    <div className="text-[12px]">
                      <p>{row.phone || "Telefon yok"}</p>
                      <p className="text-[var(--muted)]">{row.email || "E-posta yok"}</p>
                    </div>
                  </Td>
                  <Td label="Açık Bakiye"><strong>{money.format(row.balance)}</strong></Td>
                  <Td label="Durum">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${row.balance > 0 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                      {row.balance > 0 ? "Açık Bakiye" : "Kapalı"}
                    </span>
                  </Td>
                  <Td label="İşlem" actions>
                    <Button size="sm" variant="secondary" onClick={() => void openLedger(row)}>Hesap Ekstresi</Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : (
          <EmptyState
            title="Cari hesap bulunamadı"
            description="Seçtiğiniz filtre veya arama ölçütüne uygun müşteri ya da tedarikçi hesabı bulunmuyor."
          />
        )}
      </Panel>

      {selected ? (
        <FinancePanel
          title={`${selected.name} · Hesap Ekstresi`}
          description={`${typeLabel[selected.kind]} hesabının borç ve alacak hareketleri`}
        >
          {detailLoading ? (
            <Spinner label="Hesap ekstresi hazırlanıyor..." />
          ) : entries.length ? (
            <div className="space-y-2">
              {entries.map((entry) => (
                <article
                  key={entry.id}
                  className="grid gap-3 rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)]/45 p-4 md:grid-cols-[150px_1fr_130px_130px_140px] md:items-center"
                >
                  <div>
                    <p className="text-[11px] font-semibold text-[var(--ink)]">{movementLabel[entry.type] || "Cari Hareket"}</p>
                    <p className="mt-1 text-[10px] text-[var(--muted)]">
                      {new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(new Date(entry.date))}
                    </p>
                  </div>
                  <p className="text-[12px] text-[var(--muted)]">{entry.description}</p>
                  <div><p className="text-[10px] text-[var(--muted)]">Borç</p><strong className="text-[12px]">{money.format(entry.debit)}</strong></div>
                  <div><p className="text-[10px] text-[var(--muted)]">Alacak</p><strong className="text-[12px]">{money.format(entry.credit)}</strong></div>
                  <div><p className="text-[10px] text-[var(--muted)]">Bakiye</p><strong className="text-[12px]">{money.format(entry.runningBalance)}</strong></div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="Hesap hareketi yok" description="Bu cari hesap için henüz satış, fatura, ödeme veya iade hareketi oluşmamış." />
          )}
        </FinancePanel>
      ) : null}
    </div>
  );
}
