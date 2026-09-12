"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { FilterChip } from "@/components/data-view";
import {
  FinanceEmpty,
  FinanceMetric,
  FinancePanel,
  FinanceStatus,
  FinanceTab,
  FinanceTabs,
} from "@/components/finance-view";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type Settlement = {
  id: string;
  integrationId: string;
  providerSettlementId: string;
  grossAmount: number | string;
  feeAmount: number | string;
  netAmount: number | string;
  currency: string;
  settledAt: string;
  reconciliationStatus: string;
  matchedBankTransactionId?: string | null;
  reconciliationConfidence?: number | null;
};

type BankTransaction = {
  id: string;
  bankAccountId: string;
  bankName: string;
  bookedAt: string;
  amount: number | string;
  currency: string;
  description: string | null;
  counterpartyName: string | null;
  reconciliationStatus: string;
};

type Summary = {
  total: number;
  matched: number;
  unmatched: number;
  unmatchedAmount: number | string;
  unmatchedBankTransactions: number;
  ignoredBankTransactions: number;
};

type Suggestion = {
  id: string;
  bankAccountId: string;
  bookedAt: string;
  amount: number | string;
  currency: string;
  description?: string | null;
  confidence: number;
};

type ProcessingStatus =
  | "RECEIVED"
  | "PROCESSING"
  | "PROCESSED"
  | "IGNORED"
  | "FAILED"
  | "RETRY_PENDING"
  | "ENRICHMENT_PENDING"
  | "DEAD_LETTER";

type ProcessingEvent = {
  id: string;
  integrationId: string;
  provider: string;
  externalEventId: string | null;
  eventType: string | null;
  status: ProcessingStatus;
  retryCount: number;
  nextRetryAt: string | null;
  lastAttemptAt: string | null;
  deadLetterAt: string | null;
  replayRequestedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
};

type TabKey = "reconciliation" | "events";

const PROCESS_FILTERS: Array<{ value: "" | ProcessingStatus; label: string }> = [
  { value: "", label: "Tümü" },
  { value: "FAILED", label: "Başarısız" },
  { value: "RETRY_PENDING", label: "Yeniden Denenecek" },
  { value: "ENRICHMENT_PENDING", label: "Bilgi Tamamlanıyor" },
  { value: "DEAD_LETTER", label: "Müdahale Gerekli" },
  { value: "PROCESSING", label: "İşleniyor" },
  { value: "PROCESSED", label: "İşlendi" },
];

function money(value: number | string | null | undefined, currency = "TRY") {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

function dt(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function ReconciliationPage() {
  const [tab, setTab] = useState<TabKey>("reconciliation");
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [selected, setSelected] = useState<Settlement | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [events, setEvents] = useState<ProcessingEvent[]>([]);
  const [eventFilter, setEventFilter] = useState<"" | ProcessingStatus>("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const eventQuery = eventFilter ? `?status=${eventFilter}&limit=200` : "?limit=200";
      const [settlementResult, transactionResult, summaryResult, eventResult] = await Promise.all([
        api<Settlement[]>("/financial-integrations/pos/settlements"),
        api<BankTransaction[]>("/financial-integrations/bank-transactions?limit=300"),
        api<Summary>("/financial-integrations/pos/reconciliation/summary"),
        api<ProcessingEvent[]>(`/financial-integrations/pos/webhooks${eventQuery}`),
      ]);
      setSettlements(settlementResult);
      setTransactions(transactionResult);
      setSummary(summaryResult);
      setEvents(eventResult);
      setSelected((current) => current ? settlementResult.find((item) => item.id === current.id) ?? null : null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Mutabakat Verileri Yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [eventFilter]);

  useEffect(() => { void load(); }, [load]);

  const unmatchedSettlements = useMemo(() => settlements.filter((item) => item.reconciliationStatus === "UNMATCHED"), [settlements]);
  const unmatchedTransactions = useMemo(() => transactions.filter((item) => item.reconciliationStatus === "UNMATCHED"), [transactions]);
  const processingExceptions = useMemo(
    () => events.filter((item) => ["FAILED", "RETRY_PENDING", "ENRICHMENT_PENDING", "DEAD_LETTER"].includes(item.status)),
    [events],
  );
  const interventionCount = useMemo(() => events.filter((item) => item.status === "DEAD_LETTER").length, [events]);
  const processingCount = useMemo(() => events.filter((item) => item.status === "PROCESSING").length, [events]);

  async function openSuggestions(settlement: Settlement) {
    setSelected(settlement);
    setSuggestions([]);
    setError("");
    try {
      const result = await api<{ suggestions: Suggestion[] }>(
        `/financial-integrations/pos/settlements/${settlement.id}/reconciliation-suggestions?days=7`,
      );
      setSuggestions(result.suggestions);
    } catch {
      setError("Eşleşme Önerileri Alınamadı.");
    }
  }

  async function match(settlementId: string, bankTransactionId: string, confidence = 100, note = "MANUAL_UI_MATCH") {
    setBusy(`match:${bankTransactionId}`);
    setError("");
    setNotice("");
    try {
      await api(`/financial-integrations/pos/settlements/${settlementId}/match-bank-transaction`, {
        method: "POST",
        body: { bankTransactionId, confidence, note },
      });
      setNotice("POS Geçiş Kaydı Banka Hareketiyle Eşleştirildi.");
      setSelected(null);
      setSuggestions([]);
      await load();
    } catch {
      setError("Eşleştirme Yapılamadı.");
    } finally {
      setBusy("");
    }
  }

  async function ignore(bankTransactionId: string) {
    setBusy(`ignore:${bankTransactionId}`);
    setError("");
    setNotice("");
    try {
      await api(`/financial-integrations/bank-transactions/${bankTransactionId}/ignore`, { method: "POST" });
      setNotice("Banka Hareketi Mutabakat Dışında Bırakıldı.");
      await load();
    } catch {
      setError("Banka Hareketi Mutabakat Dışına Alınamadı.");
    } finally {
      setBusy("");
    }
  }

  async function autoMatch() {
    setBusy("automatch");
    setError("");
    setNotice("");
    try {
      const result = await api<{ scanned: number; matched: number; skipped: number }>(
        "/financial-integrations/pos/reconciliation/auto-match",
        { method: "POST", body: { limit: 300 } },
      );
      setNotice(`${result.scanned} Kayıt Tarandı, ${result.matched} Kayıt Otomatik Eşleşti, ${result.skipped} Kayıt İncelemeye Kaldı.`);
      await load();
    } catch {
      setError("Otomatik Eşleştirme Çalıştırılamadı.");
    } finally {
      setBusy("");
    }
  }

  async function reprocessEvent(eventId: string) {
    setBusy(`replay:${eventId}`);
    setError("");
    setNotice("");
    try {
      await api(`/financial-integrations/pos/webhooks/${eventId}/replay`, { method: "POST" });
      setNotice("İşlem Yeniden Deneme Sırasına Alındı.");
      await load();
    } catch {
      setError("İşlem Yeniden Deneme Sırasına Alınamadı.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 pb-10">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.1em] text-[var(--muted-soft)]">Finans Yönetimi · Mutabakat</p>
          <h1 className="mt-1 text-[32px] font-semibold tracking-[-0.045em] text-[var(--ink)] sm:text-[38px]">Mutabakat Merkezi</h1>
          <p className="mt-1 max-w-3xl text-[14px] leading-6 text-[var(--muted)]">
            POS Geçişlerini Banka Hareketleriyle Eşleştirin, Bekleyen Farkları İnceleyin Ve Yeniden İşlenmesi Gereken Kayıtları Yönetin.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void load()} disabled={loading || Boolean(busy)}>Yenile</Button>
          {tab === "reconciliation" ? (
            <Button onClick={() => void autoMatch()} disabled={Boolean(busy)}>{busy === "automatch" ? "Eşleştiriliyor..." : "Otomatik Eşleştir"}</Button>
          ) : null}
        </div>
      </div>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
      {notice ? <div className="rounded-[14px] border border-[rgba(22,116,189,.16)] bg-[var(--accent-soft)] px-4 py-3 text-[12px] text-[var(--accent)]">{notice}</div> : null}

      <FinanceTabs>
        <FinanceTab active={tab === "reconciliation"} onClick={() => setTab("reconciliation")}>Mutabakat</FinanceTab>
        <FinanceTab active={tab === "events"} onClick={() => setTab("events")}>İşlem İzleme{processingExceptions.length ? <span className="ml-1 rounded-full bg-white/15 px-1.5 py-0.5 text-[9px]">{processingExceptions.length}</span> : null}</FinanceTab>
      </FinanceTabs>

      {loading ? <Spinner label="Mutabakat Verileri Hazırlanıyor..." /> : null}

      {!loading && tab === "reconciliation" ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <FinanceMetric label="POS Geçiş Kaydı" value={summary?.total ?? 0} detail="Toplam Kayıt" />
            <FinanceMetric label="Eşleşen" value={summary?.matched ?? 0} detail="Mutabakat Tamamlandı" tone="success" />
            <FinanceMetric label="Bekleyen" value={summary?.unmatched ?? 0} detail={money(summary?.unmatchedAmount, "TRY")} tone="warning" />
            <FinanceMetric label="Eşleşmemiş Banka Hareketi" value={summary?.unmatchedBankTransactions ?? 0} detail="İnceleme Bekliyor" tone="danger" />
            <FinanceMetric label="Mutabakat Dışı" value={summary?.ignoredBankTransactions ?? 0} detail="İnceleme Dışında" tone="info" />
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.05fr_.95fr]">
            <FinancePanel title="Eşleşmemiş POS Geçişleri" description={`${unmatchedSettlements.length} Kayıt İnceleme Bekliyor.`}>
              <div className="space-y-2">
                {unmatchedSettlements.map((settlement) => (
                  <button
                    type="button"
                    key={settlement.id}
                    onClick={() => void openSuggestions(settlement)}
                    className={`w-full rounded-[16px] border p-4 text-left transition ${selected?.id === settlement.id ? "border-[rgba(22,116,189,.28)] bg-[var(--accent-soft)] ring-2 ring-[rgba(22,116,189,.08)]" : "border-[var(--line)] bg-[var(--surface-2)]/30 hover:border-[rgba(22,116,189,.18)] hover:bg-[var(--surface-2)]"}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0"><p className="truncate text-[12px] font-semibold text-[var(--ink)]">POS Geçiş Kaydı</p><p className="mt-1 text-[10px] text-[var(--muted)]">{dt(settlement.settledAt)}</p></div>
                      <div className="text-right"><p className="text-[13px] font-semibold text-[var(--ink)]">{money(settlement.netAmount, settlement.currency)}</p><p className="mt-1 text-[9px] text-[var(--muted-soft)]">Brüt {money(settlement.grossAmount, settlement.currency)} · Kesinti {money(settlement.feeAmount, settlement.currency)}</p></div>
                    </div>
                  </button>
                ))}
                {!unmatchedSettlements.length ? <FinanceEmpty title="Eşleşmemiş POS Geçişi Yok" description="POS Tarafındaki Mutabakat Kuyruğu Temiz Görünüyor." /> : null}
              </div>
            </FinancePanel>

            <FinancePanel title="Eşleşme Önerileri" description={selected ? "Seçili POS Geçişi İçin Uygun Banka Hareketleri" : "İncelemek İçin Bir POS Geçişi Seçin."}>
              {selected ? (
                <div className="space-y-2">
                  {suggestions.map((suggestion) => (
                    <div key={suggestion.id} className="rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)]/30 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0"><p className="text-[13px] font-semibold text-[var(--ink)]">{money(suggestion.amount, suggestion.currency)}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{dt(suggestion.bookedAt)}</p><p className="mt-1 truncate text-[10px] text-[var(--muted-soft)]">{suggestion.description || "Açıklama Yok"}</p></div>
                        <div className="text-right"><span className="inline-flex rounded-full bg-[var(--success-soft)] px-2 py-1 text-[9px] font-semibold text-[var(--success)]">Eşleşme %{suggestion.confidence}</span><Button className="mt-3 h-9 min-h-9 px-3 text-[10px]" disabled={Boolean(busy)} onClick={() => void match(selected.id, suggestion.id, suggestion.confidence, "SUGGESTION_UI_MATCH")}>Eşleştir</Button></div>
                      </div>
                    </div>
                  ))}
                  {!suggestions.length ? <FinanceEmpty title="Otomatik Öneri Bulunamadı" description="Aşağıdaki Banka Hareketlerinden Elle Eşleştirme Yapabilirsiniz." /> : null}
                </div>
              ) : <FinanceEmpty title="POS Geçişi Seçin" description="Sol Taraftaki Bekleyen Kayıtlardan Birini Seçin." />}
            </FinancePanel>
          </section>

          <FinancePanel title="Eşleşmemiş Banka Hareketleri" description={selected ? "Seçili POS Geçişi İçin Elle Eşleştirme Yapılabilir." : `${unmatchedTransactions.length} Banka Hareketi İnceleme Bekliyor.`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left">
                <thead><tr className="border-b border-[var(--line)] text-[9px] uppercase tracking-[.12em] text-[var(--muted-soft)]"><th className="px-3 py-3">Tarih</th><th className="px-3 py-3">Banka</th><th className="px-3 py-3">Açıklama</th><th className="px-3 py-3">Tutar</th><th className="px-3 py-3 text-right">İşlem</th></tr></thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {unmatchedTransactions.map((transaction) => (
                    <tr key={transaction.id} className="text-[11px] text-[var(--muted)] hover:bg-[var(--surface-2)]/35">
                      <td className="whitespace-nowrap px-3 py-3">{dt(transaction.bookedAt)}</td><td className="px-3 py-3 font-medium text-[var(--ink)]">{transaction.bankName}</td><td className="max-w-[360px] truncate px-3 py-3">{transaction.description || transaction.counterpartyName || "—"}</td><td className={`px-3 py-3 font-semibold ${Number(transaction.amount) >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>{money(transaction.amount, transaction.currency)}</td>
                      <td className="px-3 py-3"><div className="flex justify-end gap-2">{selected ? <Button className="h-9 min-h-9 px-3 text-[10px]" disabled={Boolean(busy) || transaction.currency !== selected.currency} onClick={() => void match(selected.id, transaction.id, 100, "MANUAL_EXCEPTION_CENTER_MATCH")}>{busy === `match:${transaction.id}` ? "Eşleşiyor..." : "Seçili POS Geçişiyle Eşleştir"}</Button> : null}<Button variant="secondary" className="h-9 min-h-9 px-3 text-[10px]" disabled={Boolean(busy)} onClick={() => void ignore(transaction.id)}>{busy === `ignore:${transaction.id}` ? "İşleniyor..." : "Mutabakat Dışı Bırak"}</Button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!unmatchedTransactions.length ? <FinanceEmpty title="Eşleşmemiş Banka Hareketi Yok" description="Banka Hareketi İnceleme Kuyruğu Temiz Görünüyor." /> : null}
            </div>
          </FinancePanel>
        </>
      ) : null}

      {!loading && tab === "events" ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <FinanceMetric label="İşlem Kaydı" value={events.length} detail="Filtredeki Kayıt" />
            <FinanceMetric label="İnceleme Gerektiren" value={processingExceptions.length} detail="Başarısız Veya Bekleyen" tone="warning" />
            <FinanceMetric label="Müdahale Gerekli" value={interventionCount} detail="Elle İşlem Gerektiren" tone="danger" />
            <FinanceMetric label="İşleniyor" value={processingCount} detail="Şu Anda Devam Eden" tone="info" />
          </section>

          <FinancePanel
            title="Otomatik İşlem Kayıtları"
            description="Ödeme Sağlayıcılarından Gelen Kayıtların İşlenme Ve Yeniden Deneme Durumlarını İzleyin."
            actions={<div className="flex flex-wrap gap-2">{PROCESS_FILTERS.map((filter) => <FilterChip key={filter.value || "ALL"} active={eventFilter === filter.value} onClick={() => setEventFilter(filter.value)}>{filter.label}</FilterChip>)}</div>}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left">
                <thead><tr className="border-b border-[var(--line)] text-[9px] uppercase tracking-[.12em] text-[var(--muted-soft)]"><th className="px-3 py-3">Oluşma</th><th className="px-3 py-3">Hizmet Sağlayıcı</th><th className="px-3 py-3">İşlem Türü</th><th className="px-3 py-3">Durum</th><th className="px-3 py-3">Deneme Sayısı</th><th className="px-3 py-3">Son Deneme</th><th className="px-3 py-3 text-right">İşlem</th></tr></thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {events.map((event) => (
                    <tr key={event.id} className="align-top text-[11px] text-[var(--muted)] hover:bg-[var(--surface-2)]/35">
                      <td className="whitespace-nowrap px-3 py-3">{dt(event.createdAt)}</td><td className="px-3 py-3 font-semibold text-[var(--ink)]">{event.provider}</td><td className="px-3 py-3">Otomatik Ödeme İşlemi</td><td className="px-3 py-3"><FinanceStatus status={event.status} /></td><td className="px-3 py-3">{event.retryCount}</td><td className="px-3 py-3">{dt(event.lastAttemptAt)}</td>
                      <td className="px-3 py-3 text-right">{event.status !== "PROCESSING" ? <Button variant="secondary" className="h-9 min-h-9 px-3 text-[10px] text-[var(--accent)]" disabled={Boolean(busy)} onClick={() => void reprocessEvent(event.id)}>{busy === `replay:${event.id}` ? "Sıraya Alınıyor..." : "Yeniden Dene"}</Button> : <span className="text-[9px] text-[var(--muted-soft)]">İşleniyor</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!events.length ? <FinanceEmpty title="İşlem Kaydı Bulunmuyor" description="Seçili Filtre İçin Kayıt Yok." /> : null}
            </div>
          </FinancePanel>
        </>
      ) : null}
    </div>
  );
}
