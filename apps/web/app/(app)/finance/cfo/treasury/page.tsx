"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { DataView, DataViewMeta } from "@/components/data-view";
import { FinanceEmpty, FinanceMetric, FinancePanel } from "@/components/finance-view";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type ProviderBalance = {
  currency: string;
  currentBalance: number;
  availableBalance: number;
  balanceAsOf: string | null;
  accountCount: number;
};
type SettlementDay = {
  date: string;
  currency: string;
  transactionCount: number;
  grossAmount: number;
  feeAmount: number;
  netAmount: number;
  overdue: boolean;
};
type SettlementCurrencyTotal = {
  currency: string;
  grossAmount: number;
  feeAmount: number;
  netAmount: number;
  transactionCount: number;
};
type LiquidityPosition = {
  asOf: string;
  reportingCurrency: string | null;
  book: {
    cashOnHand: number;
    bankBalance: number;
    actualCash: number;
    posReceivables: number;
    nearCash: number;
    totalLiquidPosition: number;
  };
  provider: { bankBalancesByCurrency: ProviderBalance[] };
  bankVariance: {
    comparable: boolean;
    currency: string | null;
    bookBankBalance: number;
    providerCurrentBalance: number | null;
    providerAvailableBalance: number | null;
    currentVariance: number | null;
    availableVariance: number | null;
    balanceAsOf: string | null;
  };
  posSettlementForecast: {
    scheduled: SettlementDay[];
    totalsByCurrency: SettlementCurrencyTotal[];
    unknownTiming: SettlementCurrencyTotal[];
  };
};
type Reconciliation = {
  total: number;
  matched: number;
  unmatched: number;
  unmatchedAmount: number | string;
  unmatchedBankTransactions: number;
  ignoredBankTransactions: number;
};
type BankAccount = {
  id: string;
  bankName: string;
  accountName: string;
  ibanMasked: string | null;
  currency: string;
  availableBalance: number | string | null;
  currentBalance: number | string | null;
  balanceAsOf: string | null;
};

export default function TreasuryCockpitPage() {
  const [position, setPosition] = useState<LiquidityPosition | null>(null);
  const [reconciliation, setReconciliation] = useState<Reconciliation | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextPosition, nextReconciliation, nextAccounts] = await Promise.all([
        api<LiquidityPosition>("/profitability/treasury/liquidity-position"),
        api<Reconciliation>("/financial-integrations/pos/reconciliation/summary"),
        api<BankAccount[]>("/financial-integrations/bank-accounts"),
      ]);
      setPosition(nextPosition);
      setReconciliation(nextReconciliation);
      setAccounts(nextAccounts);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Nakit Yönetimi Verileri Yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reportingCurrency = position?.reportingCurrency ?? "TRY";
  const providerBalance = position?.provider.bankBalancesByCurrency.find(
    (item) => item.currency === position?.reportingCurrency,
  );
  const forecastTotal = position?.posSettlementForecast.totalsByCurrency.find(
    (item) => item.currency === reportingCurrency,
  );
  const chartDays = useMemo(
    () => position?.posSettlementForecast.scheduled.filter((day) => day.currency === reportingCurrency) ?? [],
    [position, reportingCurrency],
  );
  const unknownTiming = position?.posSettlementForecast.unknownTiming.find(
    (item) => item.currency === reportingCurrency,
  );

  if (loading && !position) {
    return (
      <div className="mx-auto max-w-[1500px] py-20">
        <Spinner label="Nakit Yönetimi Hazırlanıyor..." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-12">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[var(--muted-soft)]">Finans Yönetimi · Nakit Yönetimi</p>
          <h1 className="mt-2 text-[36px] font-semibold tracking-[-.045em] text-[var(--ink)]">Canlı Nakit Pozisyonu</h1>
          <p className="mt-2 max-w-3xl text-[14px] leading-6 text-[var(--muted)]">
            Kasa, Banka, POS Alacakları, Beklenen Hesaba Geçişler Ve Mutabakat Farklarını Tek Ekrandan İzleyin.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/finance/cfo" className="inline-flex h-10 items-center rounded-[12px] border border-[var(--line)] bg-[var(--surface)] px-4 text-[11px] font-semibold text-[var(--muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--ink)]">
            Finans Genel Bakışına Dön
          </Link>
          <Button onClick={() => void load()} disabled={loading}>{loading ? "Yükleniyor..." : "Verileri Yenile"}</Button>
        </div>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <FinanceMetric label="Mevcut Nakit" value={money(position?.book.actualCash)} detail="Kasa Ve Banka Toplamı" tone="success" />
        <FinanceMetric label="Hesaba Geçmeyi Bekleyen" value={money(position?.book.nearCash)} detail="POS Alacakları" />
        <FinanceMetric label="Toplam Likit Pozisyon" value={money(position?.book.totalLiquidPosition)} detail="Mevcut Nakit Ve Bekleyen POS" tone="success" />
        <FinanceMetric label="Canlı Banka Bakiyesi" value={position?.bankVariance.comparable ? money(position.bankVariance.providerCurrentBalance, reportingCurrency) : "—"} detail={position?.bankVariance.comparable ? `${reportingCurrency} Güncel Banka Bakiyesi` : "Raporlama Para Birimi Ayarlanmalı"} />
        <FinanceMetric label="Banka Bakiye Farkı" value={position?.bankVariance.comparable ? signedMoney(position.bankVariance.currentVariance, reportingCurrency) : "—"} detail="Canlı Banka Bakiyesi İle Muhasebe Bakiyesi Farkı" tone={varianceTone(position?.bankVariance.currentVariance)} />
        <FinanceMetric label="Beklenen POS Geçişi" value={money(forecastTotal?.netAmount, reportingCurrency)} detail={`${forecastTotal?.transactionCount ?? 0} İşlem`} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <FinancePanel title="POS Hesaba Geçiş Tahmini" description={`${reportingCurrency} İçin Beklenen Net Banka Geçişleri`}>
          <ForecastBars days={chartDays} currency={reportingCurrency} />
        </FinancePanel>
        <FinancePanel title="Nakit Kontrolü" description="Muhasebe, Banka Ve POS Görünümü">
          <div className="grid gap-3 sm:grid-cols-2">
            <Mini label="Kasa" value={money(position?.book.cashOnHand)} />
            <Mini label="Bankalar" value={money(position?.book.bankBalance)} />
            <Mini label="Kullanılabilir Banka Bakiyesi" value={providerBalance ? money(providerBalance.availableBalance, providerBalance.currency) : "—"} />
            <Mini label="Mutabakat Oranı" value={percent(reconciliation?.matched, reconciliation?.total)} />
            <Mini label="Geçiş Tarihi Bilinmeyen POS" value={money(unknownTiming?.netAmount, reportingCurrency)} />
            <Mini label="Mutabakatsız POS" value={`${reconciliation?.unmatched ?? 0} · ${money(reconciliation?.unmatchedAmount)}`} />
          </div>
          <div className="mt-4 rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)]/45 p-4 text-[11px] leading-5 text-[var(--muted)]">
            Muhasebe Banka Bakiyesi İle Canlı Banka Bakiyesi Yalnızca Raporlama Para Birimi Tanımlandığında Karşılaştırılır. Farklar Mutabakat Kontrolü İçin Kullanılır; Canlı Banka Bakiyesi Muhasebe Kayıtlarının Yerine Geçmez.
          </div>
          <Link href="/finance/reconciliation" className="mt-4 inline-flex rounded-[12px] bg-[var(--accent)] px-4 py-2.5 text-[11px] font-semibold text-white">
            Mutabakat Merkezine Git
          </Link>
        </FinancePanel>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <FinancePanel title="Banka Bakiyeleri" description="Para Birimi Bazında Güncel Banka Görünümü">
          <div className="grid gap-3 sm:grid-cols-2">
            {(position?.provider.bankBalancesByCurrency ?? []).map((item) => (
              <div key={item.currency} className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)]/40 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold text-[var(--muted)]">{item.currency}</p>
                  <span className="text-[9px] text-[var(--muted-soft)]">{item.accountCount} Hesap</span>
                </div>
                <p className="mt-3 text-[19px] font-semibold text-[var(--ink)]">{money(item.currentBalance, item.currency)}</p>
                <p className="mt-1 text-[10px] text-[var(--muted)]">Kullanılabilir {money(item.availableBalance, item.currency)}</p>
                <p className="mt-2 text-[9px] text-[var(--muted-soft)]">{dateTime(item.balanceAsOf)}</p>
              </div>
            ))}
            {!position?.provider.bankBalancesByCurrency.length ? <FinanceEmpty title="Banka Bakiyesi Bulunamadı." /> : null}
          </div>
        </FinancePanel>

        <FinancePanel title="POS Geçiş İstisnaları" description="Hesaba Geçiş Zamanı Bilinmeyen POS Tutarları">
          <div className="space-y-2">
            {(position?.posSettlementForecast.unknownTiming ?? []).map((item) => (
              <div key={item.currency} className="flex items-center justify-between rounded-[14px] border border-[var(--line)] px-4 py-3">
                <div>
                  <p className="text-[12px] font-semibold text-[var(--ink)]">{item.currency}</p>
                  <p className="mt-1 text-[10px] text-[var(--muted)]">{item.transactionCount} İşlemin Hesaba Geçiş Tarihi Bilinmiyor</p>
                </div>
                <p className="text-[14px] font-semibold text-[var(--ink)]">{money(item.netAmount, item.currency)}</p>
              </div>
            ))}
            {!position?.posSettlementForecast.unknownTiming.length ? <FinanceEmpty title="Hesaba Geçiş Tarihi Bilinmeyen POS İşlemi Yok." /> : null}
          </div>
        </FinancePanel>
      </section>

      <FinancePanel title="Banka Hesapları" description="Bağlı Hesapların Güncel Bakiye Pozisyonu">
        <DataView>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--line)] bg-[var(--surface-2)]/40 text-[10px] uppercase tracking-[.08em] text-[var(--muted-soft)]">
                  <th className="px-3 py-3">Banka</th><th className="px-3 py-3">Hesap</th><th className="px-3 py-3">IBAN</th><th className="px-3 py-3">Para Birimi</th><th className="px-3 py-3">Mevcut Bakiye</th><th className="px-3 py-3">Kullanılabilir Bakiye</th><th className="px-3 py-3">Bakiye Tarihi</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id} className="border-b border-[var(--line)] last:border-0">
                    <td className="px-3 py-4 font-semibold text-[var(--ink)]">{account.bankName}</td>
                    <td className="px-3 py-4 text-[var(--muted)]">{account.accountName || "—"}</td>
                    <td className="px-3 py-4 text-[var(--muted)]">{account.ibanMasked || "—"}</td>
                    <td className="px-3 py-4">{account.currency}</td>
                    <td className="px-3 py-4">{money(account.currentBalance, account.currency)}</td>
                    <td className="px-3 py-4 font-semibold">{money(account.availableBalance, account.currency)}</td>
                    <td className="px-3 py-4 text-[var(--muted)]">{dateTime(account.balanceAsOf)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!accounts.length ? <FinanceEmpty title="Henüz Bağlı Banka Hesabı Yok." /> : null}
          <DataViewMeta><span>{accounts.length} Hesap</span><span>Güncel Banka Bakiyeleri</span></DataViewMeta>
        </DataView>
      </FinancePanel>
    </div>
  );
}

function ForecastBars({ days, currency }: { days: SettlementDay[]; currency: string }) {
  if (!days.length) return <FinanceEmpty title="Beklenen POS Geçiş Verisi Bulunamadı." />;
  const max = Math.max(1, ...days.map((day) => Number(day.netAmount)));
  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[720px] items-end gap-3 rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)]/35 px-4 py-4">
        {days.map((day, index) => (
          <div key={`${day.date}-${index}`} className="flex min-w-[48px] flex-1 flex-col items-center gap-2">
            <div className="flex h-[180px] items-end">
              <div
                className={`w-7 rounded-t-[8px] ${day.overdue ? "bg-[var(--warning)]" : "bg-[var(--accent)]"}`}
                style={{ height: `${Math.max(4, (Number(day.netAmount) / max) * 160)}px` }}
                title={money(day.netAmount, currency)}
              />
            </div>
            <span className="text-[9px] font-semibold text-[var(--muted)]">{shortDate(day.date)}</span>
            <span className="text-[8px] text-[var(--muted-soft)]">{day.transactionCount} İşlem{day.overdue ? " · Gecikmiş" : ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)]/40 p-3">
      <p className="text-[9px] uppercase tracking-[.1em] text-[var(--muted-soft)]">{label}</p>
      <p className="mt-2 text-[16px] font-semibold text-[var(--ink)]">{value}</p>
    </div>
  );
}

function money(value: unknown, currency = "TRY") {
  const numeric = Number(value ?? 0);
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 0 }).format(
    Number.isFinite(numeric) ? numeric : 0,
  );
}

function signedMoney(value: unknown, currency = "TRY") {
  if (value == null) return "—";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return `${numeric > 0 ? "+" : ""}${money(numeric, currency)}`;
}

function varianceTone(value?: number | null): "neutral" | "success" | "warning" {
  if (value == null) return "neutral";
  return Math.abs(value) < 1 ? "success" : "warning";
}

function percent(value?: number, total?: number) {
  if (!total) return "—";
  return `%${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(((value ?? 0) / total) * 100)}`;
}

function dateTime(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short" }).format(new Date(value));
}
