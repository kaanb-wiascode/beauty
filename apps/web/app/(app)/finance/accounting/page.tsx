"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { FinanceMetric, FinancePanel, FinanceTab, FinanceTabs } from "@/components/finance-view";
import { Alert, Button, EmptyState, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import { useToast } from "@/components/toast";
import { userLabel } from "@/lib/user-language";

type Account = { id: string; code: string; name: string; type: string; active: boolean; parent?: { id: string; code: string; name: string } | null };
type TrialRow = { accountId: string; code: string; name: string; type: string; debit: number; credit: number; debitBalance: number; creditBalance: number };
type TrialBalance = { rows: TrialRow[]; totals: { debit: number; credit: number; debitBalance: number; creditBalance: number } };
type IncomeSummary = { revenue: number; expense: number; netIncome: number; rows: Array<{ accountId: string; code: string; name: string; type: string; amount: number }> };
type JournalLine = { id: string; debit: number | string; credit: number | string; memo?: string | null; account: { id: string; code: string; name: string } };
type JournalEntry = { id: string; number: string; entryDate: string; description: string; status: string; postedAt?: string | null; referenceType?: string | null; referenceId?: string | null; branch?: { name?: string } | null; lines: JournalLine[] };
type Tab = "overview" | "trial" | "journals" | "accounts";

const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 });
const typeLabel: Record<string, string> = { ASSET: "Varlık", LIABILITY: "Yükümlülük", EQUITY: "Özkaynak", REVENUE: "Gelir", EXPENSE: "Gider" };

export default function AccountingPage() {
  const { showToast } = useToast();
  const canManage = hasPermission("accounting", "manage");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [trial, setTrial] = useState<TrialBalance | null>(null);
  const [income, setIncome] = useState<IncomeSummary | null>(null);
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("overview");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [accountRows, trialBalance, incomeSummary, journalRows] = await Promise.all([
        api<Account[]>("/accounting/accounts"),
        api<TrialBalance>("/accounting/reports/trial-balance"),
        api<IncomeSummary>("/accounting/reports/income-summary"),
        api<JournalEntry[]>("/accounting/journal-entries"),
      ]);
      setAccounts(accountRows);
      setTrial(trialBalance);
      setIncome(incomeSummary);
      setJournals(journalRows);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Muhasebe verileri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const draftCount = useMemo(() => journals.filter((row) => row.status === "DRAFT").length, [journals]);
  const postedCount = useMemo(() => journals.filter((row) => row.status === "POSTED").length, [journals]);
  const balanced = Math.abs(Number(trial?.totals.debit ?? 0) - Number(trial?.totals.credit ?? 0)) < 0.01;

  async function postJournal(id: string) {
    if (!canManage || busy) return;
    setBusy(true);
    setError("");
    try {
      await api(`/accounting/journal-entries/${id}/post`, { method: "POST" });
      showToast("Yevmiye kaydı muhasebeleştirildi.");
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Yevmiye kaydı muhasebeleştirilemedi.");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !trial) return <div className="mx-auto max-w-[1480px] py-20"><Spinner label="Muhasebe hazırlanıyor..." /></div>;

  return <div className="mx-auto max-w-[1480px] space-y-6 pb-12">
    <header className="flex flex-col gap-5 rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[0_12px_36px_rgba(17,70,104,0.04)] xl:flex-row xl:items-end xl:justify-between">
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-[var(--accent)]">Finans Yönetimi</p>
        <h1 className="text-[32px] font-semibold tracking-[-.045em] text-[var(--ink)]">Muhasebe Kontrol Merkezi</h1>
        <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[var(--muted)]">Hesap planı, yevmiye kayıtları, mizan ve gelir-gider özetini aynı muhasebe yüzeyinden yönetin.</p>
      </div>
      <Button variant="secondary" onClick={() => void load()} disabled={loading || busy}>Yenile</Button>
    </header>

    {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <FinanceMetric label="Gelir" value={money.format(Number(income?.revenue ?? 0))} detail="Muhasebeleştirilmiş gelir" tone="success" />
      <FinanceMetric label="Gider" value={money.format(Number(income?.expense ?? 0))} detail="Muhasebeleştirilmiş gider" />
      <FinanceMetric label="Net Sonuç" value={money.format(Number(income?.netIncome ?? 0))} detail="Gelir − gider" tone={(income?.netIncome ?? 0) < 0 ? "danger" : "success"} />
      <FinanceMetric label="Hesap" value={accounts.length} detail={`${accounts.filter((row) => row.active).length} aktif hesap`} />
      <FinanceMetric label="Taslak Fiş" value={draftCount} detail={`${postedCount} muhasebeleştirilmiş`} tone={draftCount > 0 ? "warning" : "neutral"} />
      <FinanceMetric label="Mizan" value={balanced ? "Dengeli" : "Kontrol"} detail={`${money.format(Number(trial?.totals.debit ?? 0))} borç`} tone={balanced ? "success" : "danger"} />
    </section>

    <FinanceTabs>
      <FinanceTab active={tab === "overview"} onClick={() => setTab("overview")}>Genel Bakış</FinanceTab>
      <FinanceTab active={tab === "trial"} onClick={() => setTab("trial")}>Mizan</FinanceTab>
      <FinanceTab active={tab === "journals"} onClick={() => setTab("journals")}>Yevmiye</FinanceTab>
      <FinanceTab active={tab === "accounts"} onClick={() => setTab("accounts")}>Hesap Planı</FinanceTab>
    </FinanceTabs>

    {tab === "overview" ? <div className="grid gap-5 xl:grid-cols-2">
      <FinancePanel title="Gelir / Gider Dağılımı" description="Muhasebeleştirilmiş gelir ve gider hesapları">
        <div className="space-y-2">{(income?.rows ?? []).slice(0, 12).map((row) => <Row key={row.accountId} label={`${row.code} · ${row.name}`} value={money.format(Number(row.amount))} detail={typeLabel[row.type] ?? row.type} />)}{!income?.rows?.length ? <EmptyState title="Gelir/gider hareketi yok" description="Muhasebeleştirilmiş gelir veya gider hesabı bulunmuyor." /> : null}</div>
      </FinancePanel>
      <FinancePanel title="Muhasebe Kontrolleri" description="Hızlı finansal bütünlük görünümü">
        <div className="space-y-2">
          <Row label="Toplam Borç" value={money.format(Number(trial?.totals.debit ?? 0))} detail="Mizan" />
          <Row label="Toplam Alacak" value={money.format(Number(trial?.totals.credit ?? 0))} detail="Mizan" />
          <Row label="Borç Bakiyesi" value={money.format(Number(trial?.totals.debitBalance ?? 0))} detail="Hesap bakiyeleri" />
          <Row label="Alacak Bakiyesi" value={money.format(Number(trial?.totals.creditBalance ?? 0))} detail="Hesap bakiyeleri" />
        </div>
      </FinancePanel>
    </div> : null}

    {tab === "trial" ? <FinancePanel title="Mizan" description="Yalnız muhasebeleştirilmiş yevmiye hareketleri">
      <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-[11px]"><thead><tr className="border-b border-[var(--line)] text-[var(--muted)]"><th className="px-3 py-3">Hesap</th><th className="px-3 py-3 text-right">Borç</th><th className="px-3 py-3 text-right">Alacak</th><th className="px-3 py-3 text-right">Borç Bakiye</th><th className="px-3 py-3 text-right">Alacak Bakiye</th></tr></thead><tbody>{(trial?.rows ?? []).map((row) => <tr key={row.accountId} className="border-b border-[var(--line)]/70"><td className="px-3 py-3"><strong className="text-[var(--ink)]">{row.code}</strong><span className="ml-2 text-[var(--muted)]">{row.name}</span></td><td className="px-3 py-3 text-right">{money.format(row.debit)}</td><td className="px-3 py-3 text-right">{money.format(row.credit)}</td><td className="px-3 py-3 text-right">{money.format(row.debitBalance)}</td><td className="px-3 py-3 text-right">{money.format(row.creditBalance)}</td></tr>)}</tbody></table></div>
    </FinancePanel> : null}

    {tab === "journals" ? <FinancePanel title="Yevmiye Kayıtları" description="Taslak ve muhasebeleştirilmiş fişler">
      <div className="space-y-3">{journals.map((entry) => <article key={entry.id} className="rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)]/45 p-4"><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><div className="flex flex-wrap items-center gap-2"><strong className="text-[13px] text-[var(--ink)]">{entry.number}</strong><span className="rounded-full bg-white px-2 py-1 text-[9px] font-semibold text-[var(--muted)]">{userLabel(entry.status)}</span></div><p className="mt-1 text-[12px] text-[var(--muted)]">{entry.description}</p><p className="mt-1 text-[10px] text-[var(--muted-soft)]">{new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(new Date(entry.entryDate))} · {entry.lines.length} satır</p></div>{entry.status === "DRAFT" && canManage ? <Button disabled={busy} onClick={() => void postJournal(entry.id)}>Muhasebeleştir</Button> : null}</div><div className="mt-3 grid gap-2 sm:grid-cols-2">{entry.lines.map((line) => <div key={line.id} className="flex justify-between gap-3 rounded-[10px] bg-white/70 px-3 py-2 text-[10px]"><span className="truncate text-[var(--muted)]">{line.account.code} · {line.account.name}</span><span className="shrink-0 font-semibold text-[var(--ink)]">{Number(line.debit) > 0 ? `B ${money.format(Number(line.debit))}` : `A ${money.format(Number(line.credit))}`}</span></div>)}</div></article>)}{!journals.length ? <EmptyState title="Yevmiye kaydı yok" description="Aktif kapsamda yevmiye kaydı bulunmuyor." /> : null}</div>
    </FinancePanel> : null}

    {tab === "accounts" ? <FinancePanel title="Hesap Planı" description="Şirket hesap planı ve hesap türleri">
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{accounts.map((account) => <div key={account.id} className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)]/45 p-4"><div className="flex items-start justify-between gap-3"><div><strong className="text-[13px] text-[var(--ink)]">{account.code} · {account.name}</strong><p className="mt-1 text-[10px] text-[var(--muted)]">{typeLabel[account.type] ?? userLabel(account.type)}{account.parent ? ` · ${account.parent.code} ${account.parent.name}` : ""}</p></div><span className="text-[9px] font-semibold text-[var(--muted-soft)]">{account.active ? "Aktif" : "Pasif"}</span></div></div>)}{!accounts.length ? <EmptyState title="Hesap planı boş" description="Şirket için hesap kartı bulunmuyor." /> : null}</div>
    </FinancePanel> : null}
  </div>;
}

function Row({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="flex items-center justify-between gap-4 rounded-[12px] bg-[var(--surface-2)]/55 px-4 py-3"><div className="min-w-0"><p className="truncate text-[12px] font-semibold text-[var(--ink)]">{label}</p><p className="mt-1 text-[9px] text-[var(--muted)]">{detail}</p></div><strong className="shrink-0 text-[12px] text-[var(--ink)]">{value}</strong></div>;
}
