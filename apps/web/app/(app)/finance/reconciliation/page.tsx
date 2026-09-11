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

type WebhookStatus =
  | "RECEIVED"
  | "PROCESSING"
  | "PROCESSED"
  | "IGNORED"
  | "FAILED"
  | "RETRY_PENDING"
  | "ENRICHMENT_PENDING"
  | "DEAD_LETTER";

type WebhookEvent = {
  id: string;
  integrationId: string;
  provider: string;
  externalEventId: string | null;
  eventType: string | null;
  status: WebhookStatus;
  retryCount: number;
  nextRetryAt: string | null;
  lastAttemptAt: string | null;
  deadLetterAt: string | null;
  replayRequestedAt: string | null;
  posTransactionId: string | null;
  processingResult: unknown;
  errorMessage: string | null;
  createdAt: string;
  processedAt: string | null;
};

type TabKey = "reconciliation" | "webhooks";

const WEBHOOK_FILTERS: Array<{ value: "" | WebhookStatus; label: string }> = [
  { value: "", label: "Tümü" },
  { value: "FAILED", label: "Failed" },
  { value: "RETRY_PENDING", label: "Retry Pending" },
  { value: "ENRICHMENT_PENDING", label: "Enrichment" },
  { value: "DEAD_LETTER", label: "Dead Letter" },
  { value: "PROCESSING", label: "Processing" },
  { value: "PROCESSED", label: "Processed" },
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
  const [webhooks, setWebhooks] = useState<WebhookEvent[]>([]);
  const [webhookFilter, setWebhookFilter] = useState<"" | WebhookStatus>("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const webhookQuery = webhookFilter ? `?status=${webhookFilter}&limit=200` : "?limit=200";
      const [settlementResult, transactionResult, summaryResult, webhookResult] = await Promise.all([
        api<Settlement[]>("/financial-integrations/pos/settlements"),
        api<BankTransaction[]>("/financial-integrations/bank-transactions?limit=300"),
        api<Summary>("/financial-integrations/pos/reconciliation/summary"),
        api<WebhookEvent[]>(`/financial-integrations/pos/webhooks${webhookQuery}`),
      ]);
      setSettlements(settlementResult);
      setTransactions(transactionResult);
      setSummary(summaryResult);
      setWebhooks(webhookResult);
      setSelected((current) =>
        current ? settlementResult.find((item) => item.id === current.id) ?? null : null,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Finansal exception verileri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [webhookFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const unmatchedSettlements = useMemo(
    () => settlements.filter((item) => item.reconciliationStatus === "UNMATCHED"),
    [settlements],
  );
  const unmatchedTransactions = useMemo(
    () => transactions.filter((item) => item.reconciliationStatus === "UNMATCHED"),
    [transactions],
  );
  const webhookExceptions = useMemo(
    () =>
      webhooks.filter((item) =>
        ["FAILED", "RETRY_PENDING", "ENRICHMENT_PENDING", "DEAD_LETTER"].includes(item.status),
      ),
    [webhooks],
  );
  const deadLetters = useMemo(
    () => webhooks.filter((item) => item.status === "DEAD_LETTER").length,
    [webhooks],
  );
  const processingCount = useMemo(
    () => webhooks.filter((item) => item.status === "PROCESSING").length,
    [webhooks],
  );

  async function openSuggestions(settlement: Settlement) {
    setSelected(settlement);
    setSuggestions([]);
    setError("");
    try {
      const result = await api<{ suggestions: Suggestion[] }>(
        `/financial-integrations/pos/settlements/${settlement.id}/reconciliation-suggestions?days=7`,
      );
      setSuggestions(result.suggestions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Öneriler alınamadı.");
    }
  }

  async function match(
    settlementId: string,
    bankTransactionId: string,
    confidence = 100,
    note = "MANUAL_UI_MATCH",
  ) {
    setBusy(`match:${bankTransactionId}`);
    setError("");
    setNotice("");
    try {
      await api(`/financial-integrations/pos/settlements/${settlementId}/match-bank-transaction`, {
        method: "POST",
        body: { bankTransactionId, confidence, note },
      });
      setNotice("POS settlement banka hareketiyle eşleştirildi.");
      setSelected(null);
      setSuggestions([]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eşleştirme yapılamadı.");
    } finally {
      setBusy("");
    }
  }

  async function ignore(bankTransactionId: string) {
    setBusy(`ignore:${bankTransactionId}`);
    setError("");
    setNotice("");
    try {
      await api(`/financial-integrations/bank-transactions/${bankTransactionId}/ignore`, {
        method: "POST",
      });
      setNotice("Banka hareketi mutabakat dışında bırakıldı.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Banka hareketi mutabakat dışına alınamadı.");
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
      setNotice(
        `${result.scanned} settlement tarandı, ${result.matched} otomatik eşleşti, ${result.skipped} manuel incelemeye kaldı.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Otomatik eşleştirme çalıştırılamadı.");
    } finally {
      setBusy("");
    }
  }

  async function replayWebhook(eventId: string) {
    setBusy(`replay:${eventId}`);
    setError("");
    setNotice("");
    try {
      await api(`/financial-integrations/pos/webhooks/${eventId}/replay`, { method: "POST" });
      setNotice("Webhook yeniden işleme kuyruğuna alındı.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Webhook replay kuyruğa alınamadı.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 pb-10">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.1em] text-[var(--muted-soft)]">
            Finans · Mutabakat
          </p>
          <h1 className="mt-1 text-[32px] font-semibold tracking-[-0.045em] text-[var(--ink)] sm:text-[38px]">
            Exception & Mutabakat Merkezi
          </h1>
          <p className="mt-1 max-w-3xl text-[14px] leading-6 text-[var(--muted)]">
            POS settlement eşleştirmelerini, banka hareketi istisnalarını ve webhook retry/dead-letter kuyruğunu tek operasyon ekranından yönetin.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void load()} disabled={loading || Boolean(busy)}>
            Yenile
          </Button>
          {tab === "reconciliation" ? (
            <Button onClick={() => void autoMatch()} disabled={Boolean(busy)}>
              {busy === "automatch" ? "Eşleştiriliyor..." : "Otomatik eşleştir"}
            </Button>
          ) : null}
        </div>
      </div>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
      {notice ? (
        <div className="rounded-[14px] border border-[rgba(22,116,189,.16)] bg-[var(--accent-soft)] px-4 py-3 text-[12px] text-[var(--accent)]">
          {notice}
        </div>
      ) : null}

      <FinanceTabs>
        <FinanceTab active={tab === "reconciliation"} onClick={() => setTab("reconciliation")}>
          Mutabakat
        </FinanceTab>
        <FinanceTab active={tab === "webhooks"} onClick={() => setTab("webhooks")}>
          Webhook Audit
          {webhookExceptions.length ? (
            <span className="ml-1 rounded-full bg-white/15 px-1.5 py-0.5 text-[9px]">
              {webhookExceptions.length}
            </span>
          ) : null}
        </FinanceTab>
      </FinanceTabs>

      {loading ? <Spinner label="Finansal mutabakat verileri hazırlanıyor..." /> : null}

      {!loading && tab === "reconciliation" ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <FinanceMetric label="Settlement" value={summary?.total ?? 0} detail="Toplam kayıt" />
            <FinanceMetric label="Eşleşen" value={summary?.matched ?? 0} detail="Mutabakat tamam" tone="success" />
            <FinanceMetric
              label="Bekleyen"
              value={summary?.unmatched ?? 0}
              detail={money(summary?.unmatchedAmount, "TRY")}
              tone="warning"
            />
            <FinanceMetric
              label="Eşleşmemiş banka"
              value={summary?.unmatchedBankTransactions ?? 0}
              detail="İnceleme bekliyor"
              tone="danger"
            />
            <FinanceMetric
              label="Yok sayılan"
              value={summary?.ignoredBankTransactions ?? 0}
              detail="Mutabakat dışı"
              tone="info"
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.05fr_.95fr]">
            <FinancePanel
              title="Eşleşmemiş POS Settlement"
              description={`${unmatchedSettlements.length} kayıt manuel veya otomatik inceleme bekliyor.`}
            >
              <div className="space-y-2">
                {unmatchedSettlements.map((settlement) => (
                  <button
                    type="button"
                    key={settlement.id}
                    onClick={() => void openSuggestions(settlement)}
                    className={`w-full rounded-[16px] border p-4 text-left transition ${
                      selected?.id === settlement.id
                        ? "border-[rgba(22,116,189,.28)] bg-[var(--accent-soft)] ring-2 ring-[rgba(22,116,189,.08)]"
                        : "border-[var(--line)] bg-[var(--surface-2)]/30 hover:border-[rgba(22,116,189,.18)] hover:bg-[var(--surface-2)]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-semibold text-[var(--ink)]">
                          {settlement.providerSettlementId}
                        </p>
                        <p className="mt-1 text-[10px] text-[var(--muted)]">{dt(settlement.settledAt)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[13px] font-semibold text-[var(--ink)]">
                          {money(settlement.netAmount, settlement.currency)}
                        </p>
                        <p className="mt-1 text-[9px] text-[var(--muted-soft)]">
                          Brüt {money(settlement.grossAmount, settlement.currency)} · Komisyon {money(settlement.feeAmount, settlement.currency)}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
                {!unmatchedSettlements.length ? (
                  <FinanceEmpty title="Eşleşmemiş POS settlement yok" description="Settlement tarafındaki mutabakat kuyruğu temiz görünüyor." />
                ) : null}
              </div>
            </FinancePanel>

            <FinancePanel
              title="Eşleşme önerileri"
              description={selected ? selected.providerSettlementId : "İncelemek için bir settlement seçin."}
            >
              {selected ? (
                <div className="space-y-2">
                  {suggestions.map((suggestion) => (
                    <div key={suggestion.id} className="rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)]/30 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-[var(--ink)]">
                            {money(suggestion.amount, suggestion.currency)}
                          </p>
                          <p className="mt-1 text-[10px] text-[var(--muted)]">{dt(suggestion.bookedAt)}</p>
                          <p className="mt-1 truncate text-[10px] text-[var(--muted-soft)]">
                            {suggestion.description || "Açıklama yok"}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="inline-flex rounded-full bg-[var(--success-soft)] px-2 py-1 text-[9px] font-semibold text-[var(--success)]">
                            %{suggestion.confidence}
                          </span>
                          <Button
                            className="mt-3 h-9 min-h-9 px-3 text-[10px]"
                            disabled={Boolean(busy)}
                            onClick={() =>
                              void match(selected.id, suggestion.id, suggestion.confidence, "SUGGESTION_UI_MATCH")
                            }
                          >
                            Eşleştir
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {!suggestions.length ? (
                    <FinanceEmpty
                      title="Otomatik öneri bulunamadı"
                      description="Aşağıdaki banka hareketlerinden manuel eşleştirme yapabilirsiniz."
                    />
                  ) : null}
                </div>
              ) : (
                <FinanceEmpty title="Settlement seçin" description="Sol taraftaki bekleyen settlement listesinden bir kayıt seçin." />
              )}
            </FinancePanel>
          </section>

          <FinancePanel
            title="Eşleşmemiş banka hareketleri"
            description={
              selected
                ? `${selected.providerSettlementId} için manuel eşleştirme yapılabilir.`
                : `${unmatchedTransactions.length} banka hareketi inceleme bekliyor.`
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left">
                <thead>
                  <tr className="border-b border-[var(--line)] text-[9px] uppercase tracking-[.12em] text-[var(--muted-soft)]">
                    <th className="px-3 py-3">Tarih</th>
                    <th className="px-3 py-3">Banka</th>
                    <th className="px-3 py-3">Açıklama</th>
                    <th className="px-3 py-3">Tutar</th>
                    <th className="px-3 py-3 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {unmatchedTransactions.map((transaction) => (
                    <tr key={transaction.id} className="text-[11px] text-[var(--muted)] hover:bg-[var(--surface-2)]/35">
                      <td className="whitespace-nowrap px-3 py-3">{dt(transaction.bookedAt)}</td>
                      <td className="px-3 py-3 font-medium text-[var(--ink)]">{transaction.bankName}</td>
                      <td className="max-w-[360px] truncate px-3 py-3">
                        {transaction.description || transaction.counterpartyName || "—"}
                      </td>
                      <td className={`px-3 py-3 font-semibold ${Number(transaction.amount) >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
                        {money(transaction.amount, transaction.currency)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-2">
                          {selected ? (
                            <Button
                              className="h-9 min-h-9 px-3 text-[10px]"
                              disabled={Boolean(busy) || transaction.currency !== selected.currency}
                              onClick={() =>
                                void match(selected.id, transaction.id, 100, "MANUAL_EXCEPTION_CENTER_MATCH")
                              }
                            >
                              {busy === `match:${transaction.id}` ? "Eşleşiyor..." : "Seçili settlement ile eşleştir"}
                            </Button>
                          ) : null}
                          <Button
                            variant="secondary"
                            className="h-9 min-h-9 px-3 text-[10px]"
                            disabled={Boolean(busy)}
                            onClick={() => void ignore(transaction.id)}
                          >
                            {busy === `ignore:${transaction.id}` ? "İşleniyor..." : "Mutabakat dışı"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!unmatchedTransactions.length ? (
                <FinanceEmpty title="Eşleşmemiş banka hareketi yok" description="Banka hareketi istisna kuyruğu temiz görünüyor." />
              ) : null}
            </div>
          </FinancePanel>
        </>
      ) : null}

      {!loading && tab === "webhooks" ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <FinanceMetric label="Webhook" value={webhooks.length} detail="Filtredeki kayıt" />
            <FinanceMetric label="Exception" value={webhookExceptions.length} detail="Retry / failed / enrichment" tone="warning" />
            <FinanceMetric label="Dead Letter" value={deadLetters} detail="Manuel müdahale gerekli" tone="danger" />
            <FinanceMetric label="Processing" value={processingCount} detail="Şu an işleniyor" tone="info" />
          </section>

          <FinancePanel
            title="Webhook Audit & Replay"
            description="İmzalanmış provider event kuyruğu, retry durumu ve replay operasyonu."
            actions={
              <div className="flex flex-wrap gap-2">
                {WEBHOOK_FILTERS.map((filter) => (
                  <FilterChip
                    key={filter.value || "ALL"}
                    active={webhookFilter === filter.value}
                    onClick={() => setWebhookFilter(filter.value)}
                  >
                    {filter.label}
                  </FilterChip>
                ))}
              </div>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] text-left">
                <thead>
                  <tr className="border-b border-[var(--line)] text-[9px] uppercase tracking-[.12em] text-[var(--muted-soft)]">
                    <th className="px-3 py-3">Oluşma</th>
                    <th className="px-3 py-3">Provider</th>
                    <th className="px-3 py-3">Event</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Retry</th>
                    <th className="px-3 py-3">Son deneme / Next</th>
                    <th className="px-3 py-3">Hata</th>
                    <th className="px-3 py-3 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {webhooks.map((webhook) => (
                    <tr key={webhook.id} className="align-top text-[11px] text-[var(--muted)] hover:bg-[var(--surface-2)]/35">
                      <td className="whitespace-nowrap px-3 py-3">{dt(webhook.createdAt)}</td>
                      <td className="px-3 py-3 font-semibold text-[var(--ink)]">{webhook.provider}</td>
                      <td className="px-3 py-3">
                        <p className="font-medium text-[var(--ink)]">{webhook.eventType || "—"}</p>
                        <p className="mt-1 max-w-[180px] truncate text-[9px] text-[var(--muted-soft)]">
                          {webhook.externalEventId || webhook.id}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <FinanceStatus status={webhook.status} />
                        {webhook.deadLetterAt ? (
                          <p className="mt-1 text-[9px] text-[var(--danger)]">DLQ {dt(webhook.deadLetterAt)}</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">{webhook.retryCount}</td>
                      <td className="px-3 py-3">
                        <p>{dt(webhook.lastAttemptAt)}</p>
                        <p className="mt-1 text-[9px] text-[var(--muted-soft)]">Next: {dt(webhook.nextRetryAt)}</p>
                      </td>
                      <td className="max-w-[300px] px-3 py-3">
                        <p className={`line-clamp-3 ${webhook.errorMessage ? "text-[var(--danger)]" : "text-[var(--muted-soft)]"}`}>
                          {webhook.errorMessage || "—"}
                        </p>
                        {webhook.replayRequestedAt ? (
                          <p className="mt-1 text-[9px] text-[var(--accent)]">
                            Replay requested: {dt(webhook.replayRequestedAt)}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {webhook.status !== "PROCESSING" ? (
                          <Button
                            variant="secondary"
                            className="h-9 min-h-9 px-3 text-[10px] text-[var(--accent)]"
                            disabled={Boolean(busy)}
                            onClick={() => void replayWebhook(webhook.id)}
                          >
                            {busy === `replay:${webhook.id}` ? "Kuyruğa alınıyor..." : "Replay"}
                          </Button>
                        ) : (
                          <span className="text-[9px] text-[var(--muted-soft)]">Processing</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!webhooks.length ? (
                <FinanceEmpty title="Webhook event bulunmuyor" description="Seçili filtre için event kaydı yok." />
              ) : null}
            </div>
          </FinancePanel>
        </>
      ) : null}
    </div>
  );
}
