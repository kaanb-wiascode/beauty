"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { FinanceMetric, FinancePanel } from "@/components/finance-view";
import { Modal } from "@/components/modal";
import { Alert, Button, EmptyState, Spinner, TextInput } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import { useToast } from "@/components/toast";

type Summary = { billCount: number; grossBills: number; creditNotes: number; netBills: number; paid: number; outstanding: number; overdueCount: number };
type Aging = { notDue: number; days0to30: number; days31to60: number; days61to90: number; days90Plus: number; total: number };
type Bill = { id: string; supplierId: string; supplierName: string; invoiceNumber: string | null; description: string; amount: number | string; dueAt: string | null; status: "OPEN" | "PARTIALLY_PAID" | "PAID" | "CANCELLED"; paid: number | string; balance: number | string; createdAt: string };
type PaymentMethod = "CASH" | "CARD" | "TRANSFER";

const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 });
const statusLabel: Record<string, string> = { OPEN: "Açık", PARTIALLY_PAID: "Kısmi Ödendi", PAID: "Ödendi", CANCELLED: "İptal" };

export default function AccountsPayablePage() {
  const { showToast } = useToast();
  const canManage = hasPermission("finance", "manage");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [aging, setAging] = useState<Aging | null>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [paymentBill, setPaymentBill] = useState<Bill | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("TRANSFER");
  const [reference, setReference] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [summaryData, agingData, billRows] = await Promise.all([
        api<Summary>("/accounts-payable/summary"),
        api<Aging>("/accounts-payable/aging"),
        api<Bill[]>("/accounts-payable/bills"),
      ]);
      setSummary(summaryData);
      setAging(agingData);
      setBills(billRows);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Tedarikçi borçları yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const overdue = useMemo(() => bills.filter((bill) => bill.dueAt && new Date(bill.dueAt) < new Date() && ["OPEN", "PARTIALLY_PAID"].includes(bill.status)), [bills]);
  const open = useMemo(() => bills.filter((bill) => ["OPEN", "PARTIALLY_PAID"].includes(bill.status)), [bills]);

  function startPayment(bill: Bill) {
    setPaymentBill(bill);
    setAmount(String(Number(bill.balance ?? 0)));
    setMethod("TRANSFER");
    setReference("");
  }

  async function pay() {
    if (!paymentBill || busy) return;
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric <= 0 || numeric > Number(paymentBill.balance)) {
      setError("Ödeme tutarı kalan borçtan büyük olamaz ve sıfırdan büyük olmalıdır.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(`/accounts-payable/bills/${paymentBill.id}/payments`, {
        method: "POST",
        body: { amount: numeric, method, reference: reference.trim() || undefined },
      });
      showToast("Tedarikçi ödemesi kaydedildi ve muhasebeleştirildi.");
      setPaymentBill(null);
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Tedarikçi ödemesi kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !summary) return <div className="mx-auto max-w-[1480px] py-20"><Spinner label="Tedarikçi borçları hazırlanıyor..." /></div>;

  return <div className="mx-auto max-w-[1480px] space-y-6 pb-12">
    <header className="flex flex-col gap-5 rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[0_12px_36px_rgba(17,70,104,0.04)] xl:flex-row xl:items-end xl:justify-between">
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-[var(--accent)]">Finans / Accounts Payable</p>
        <h1 className="text-[32px] font-semibold tracking-[-.045em] text-[var(--ink)]">Tedarikçi Borçları</h1>
        <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[var(--muted)]">Tedarikçi faturalarını, açık bakiyeleri, vade riskini ve ödemeleri muhasebe bütünlüğünü koruyarak yönetin.</p>
      </div>
      <Button variant="secondary" onClick={() => void load()} disabled={loading || busy}>Yenile</Button>
    </header>

    {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <FinanceMetric label="Net Tedarikçi Faturası" value={money.format(Number(summary?.netBills ?? 0))} detail={`${summary?.billCount ?? 0} fatura`} />
      <FinanceMetric label="Ödenen" value={money.format(Number(summary?.paid ?? 0))} detail="Gerçekleşen ödeme" tone="success" />
      <FinanceMetric label="Açık Borç" value={money.format(Number(summary?.outstanding ?? 0))} detail={`${open.length} açık/kısmi fatura`} tone={(summary?.outstanding ?? 0) > 0 ? "warning" : "success"} />
      <FinanceMetric label="Vadesi Geçen" value={summary?.overdueCount ?? 0} detail={`${overdue.length} satır tespit edildi`} tone={(summary?.overdueCount ?? 0) > 0 ? "danger" : "success"} />
      <FinanceMetric label="Kredi Notları" value={money.format(Number(summary?.creditNotes ?? 0))} detail="Borçtan düşülen" />
      <FinanceMetric label="90+ Gün" value={money.format(Number(aging?.days90Plus ?? 0))} detail="En yüksek yaşlandırma riski" tone={(aging?.days90Plus ?? 0) > 0 ? "danger" : "neutral"} />
    </section>

    <div className="grid gap-5 xl:grid-cols-[.72fr_1.28fr]">
      <FinancePanel title="Borç Yaşlandırma" description="Vadesine ve gecikme süresine göre açık bakiye">
        <div className="space-y-2">
          <AgingRow label="Vadesi Gelmemiş" value={aging?.notDue} />
          <AgingRow label="0–30 Gün Gecikmiş" value={aging?.days0to30} danger />
          <AgingRow label="31–60 Gün Gecikmiş" value={aging?.days31to60} danger />
          <AgingRow label="61–90 Gün Gecikmiş" value={aging?.days61to90} danger />
          <AgingRow label="90+ Gün Gecikmiş" value={aging?.days90Plus} danger />
          <AgingRow label="Toplam Açık" value={aging?.total} strong />
        </div>
      </FinancePanel>

      <FinancePanel title="Açık Tedarikçi Faturaları" description="Vade ve bakiye öncelikli ödeme kuyruğu">
        <div className="space-y-2">
          {open.map((bill) => {
            const isOverdue = Boolean(bill.dueAt && new Date(bill.dueAt) < new Date());
            return <article key={bill.id} className="flex flex-col gap-3 rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)]/45 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><strong className="text-[13px] text-[var(--ink)]">{bill.supplierName}</strong><span className={`rounded-full px-2 py-1 text-[9px] font-semibold ${isOverdue ? "bg-red-50 text-red-700" : "bg-white text-[var(--muted)]"}`}>{isOverdue ? "VADE GEÇTİ" : statusLabel[bill.status]}</span></div>
                <p className="mt-1 truncate text-[11px] text-[var(--muted)]">{bill.invoiceNumber || "Fatura no yok"} · {bill.description}</p>
                <p className="mt-1 text-[10px] text-[var(--muted-soft)]">Vade: {bill.dueAt ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(new Date(bill.dueAt)) : "Belirtilmedi"} · Toplam {money.format(Number(bill.amount))}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3"><div className="text-right"><p className="text-[10px] text-[var(--muted)]">Kalan</p><strong className="text-[14px] text-[var(--ink)]">{money.format(Number(bill.balance))}</strong></div>{canManage ? <Button disabled={busy} onClick={() => startPayment(bill)}>Ödeme Yap</Button> : null}</div>
            </article>;
          })}
          {!open.length ? <EmptyState title="Açık tedarikçi borcu yok" description="Aktif kapsamda ödenmemiş tedarikçi faturası bulunmuyor." /> : null}
        </div>
      </FinancePanel>
    </div>

    <Modal open={Boolean(paymentBill)} onClose={() => !busy && setPaymentBill(null)} title="Tedarikçi Ödemesi">
      {paymentBill ? <div className="space-y-4">
        <div className="rounded-[12px] bg-[var(--surface-2)] p-3 text-[11px] text-[var(--muted)]"><strong className="text-[var(--ink)]">{paymentBill.supplierName}</strong><br/>Kalan borç: {money.format(Number(paymentBill.balance))}</div>
        <label className="block text-[11px] font-medium text-[var(--muted)]">Ödeme Tutarı<TextInput value={amount} onChange={(event) => setAmount(event.target.value)} type="number" min="0.01" step="0.01" /></label>
        <label className="block text-[11px] font-medium text-[var(--muted)]">Yöntem<select className="control mt-1 h-10 w-full" value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}><option value="TRANSFER">Havale / EFT</option><option value="CASH">Nakit</option><option value="CARD">Kart</option></select></label>
        <label className="block text-[11px] font-medium text-[var(--muted)]">Referans<TextInput value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Dekont / işlem no" /></label>
        <div className="flex justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={() => setPaymentBill(null)}>Vazgeç</Button><Button disabled={busy} onClick={() => void pay()}>{busy ? "Kaydediliyor..." : "Ödemeyi Kaydet"}</Button></div>
      </div> : null}
    </Modal>
  </div>;
}

function AgingRow({ label, value, danger, strong }: { label: string; value?: number; danger?: boolean; strong?: boolean }) {
  return <div className={`flex items-center justify-between rounded-[12px] px-4 py-3 ${strong ? "border border-[var(--line)] bg-[var(--surface)]" : "bg-[var(--surface-2)]/55"}`}><span className="text-[11px] text-[var(--muted)]">{label}</span><strong className={`text-[12px] ${danger && Number(value ?? 0) > 0 ? "text-red-700" : "text-[var(--ink)]"}`}>{money.format(Number(value ?? 0))}</strong></div>;
}
