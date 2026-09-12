"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DataView, DataViewMeta } from "@/components/data-view";
import { FinanceEmpty, FinanceMetric, FinancePanel, FinanceStatus } from "@/components/finance-view";
import { FormActions, FormGrid, FormHint, FormSection } from "@/components/form-system";
import { Alert, Button, TextInput } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { userLabel } from "@/lib/user-language";

type IntegrationKind = "OPEN_BANKING" | "VIRTUAL_POS";
type AuthType = "OAUTH2" | "API_KEY" | "MANUAL";
type CredentialField = { key: string; label: string; secret?: boolean; required?: boolean };
type Provider = { kind: IntegrationKind; provider: string; displayName: string; credentialFields: CredentialField[]; capabilities: Record<string, boolean>; runtimeReady: boolean };
type Integration = { id: string; kind: IntegrationKind; provider: string; displayName: string; status: string; authType: AuthType; branchId: string | null; consentExpiresAt?: string | null; lastSyncAt?: string | null; lastError?: string | null };
type Health = { integrationId: string; status: string; healthy: boolean; adapterAvailable: boolean; runtimeReady: boolean; hasCredentials: boolean; consent: { expiresAt: string | null; expired: boolean; expiringSoon: boolean }; sync: { lastSyncAt: string | null; lastStatus: string | null; lastCompletedAt: string | null; stale: boolean }; banking?: { activeAccountCount: number; inactiveAccountCount: number; latestBalanceAsOf: string | null; currentBalancesByCurrency: Record<string, string | number>; latestTransactionAt: string | null; unmatchedTransactionCount: number } | null; lastError: string | null };
type CredentialStatus = { configured: boolean; fields: string[]; requiredFields: CredentialField[]; runtimeReady: boolean };
type BankTransaction = { id: string; bankName: string; bookedAt: string; amount: number | string; currency: string; description: string | null; counterpartyName: string | null; reconciliationStatus: string };
type Liquidity = { accountCount: number; byCurrency: Record<string, { current: number; available: number }> };
type PosSummary = { currencies: Array<{ currency: string; nearCash: number | string; settled: number | string; transactionCount: number }> };
type ConnectResult = { integrationId: string; provider: string; mode: string; message: string; authorizationUrl?: string };
type DetailsState = { health?: Health; credentials?: CredentialStatus };

function money(value: unknown, currency = "TRY") {
  const numeric = Number(value ?? 0);
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number.isFinite(numeric) ? numeric : 0);
}
function dateTime(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
function authTypeFor(provider: Provider): AuthType {
  if (provider.capabilities.apiCredentials || provider.capabilities.credentialTokenAuth) return "API_KEY";
  if (provider.capabilities.oauth) return "OAUTH2";
  return "MANUAL";
}
function financeStatus(status: string) {
  if (["CONNECTED", "ACTIVE", "SUCCESS", "HEALTHY"].includes(status)) return "PROCESSED";
  if (["ERROR", "FAILED", "DEAD_LETTER"].includes(status)) return "FAILED";
  if (["CONNECTING", "PENDING", "RUNNING", "ATTENTION"].includes(status)) return "PROCESSING";
  return status;
}

export default function FinancialIntegrationsPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [liquidity, setLiquidity] = useState<Liquidity | null>(null);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [posSummary, setPosSummary] = useState<PosSummary | null>(null);
  const [kind, setKind] = useState<IntegrationKind>("OPEN_BANKING");
  const [provider, setProvider] = useState("");
  const [displayName, setDisplayName] = useState("Ana Banka Bağlantısı");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, DetailsState>>({});
  const [credentialValues, setCredentialValues] = useState<Record<string, Record<string, string>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [providerRows, integrationRows, liquidityData, transactionRows, posData] = await Promise.all([
        api<Provider[]>("/financial-integrations/providers"),
        api<Integration[]>("/financial-integrations"),
        api<Liquidity>("/financial-integrations/liquidity"),
        api<BankTransaction[]>("/financial-integrations/bank-transactions?limit=50"),
        api<PosSummary>("/financial-integrations/pos/summary"),
      ]);
      setProviders(providerRows);
      setIntegrations(integrationRows);
      setLiquidity(liquidityData);
      setTransactions(transactionRows);
      setPosSummary(posData);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Banka Ve Ödeme Bağlantıları Yüklenemedi.");
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  const kindProviders = useMemo(() => providers.filter((item) => item.kind === kind), [providers, kind]);
  const totals = useMemo(() => Object.entries(liquidity?.byCurrency ?? {}), [liquidity]);
  useEffect(() => {
    setProvider(kindProviders[0]?.provider ?? "");
    setDisplayName(kind === "OPEN_BANKING" ? "Ana Banka Bağlantısı" : "Online POS");
  }, [kind, kindProviders]);

  async function loadDetails(id: string) {
    setBusy(`details:${id}`);
    setError(null);
    try {
      const item = integrations.find((entry) => entry.id === id);
      const [health, credentials] = await Promise.all([
        api<Health>(`/financial-integrations/${id}/health`),
        item?.authType === "API_KEY" ? api<CredentialStatus>(`/financial-integrations/${id}/credentials`) : Promise.resolve(undefined),
      ]);
      setDetails((current) => ({ ...current, [id]: { health, credentials } }));
      setExpanded(id);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Bağlantı Ayrıntıları Alınamadı.");
    } finally { setBusy(null); }
  }

  async function createIntegration() {
    const selected = kindProviders.find((item) => item.provider === provider);
    if (!selected) return;
    setBusy("create"); setError(null); setNotice(null);
    try {
      const created = await api<Integration>("/financial-integrations", { method: "POST", body: { kind, provider, displayName, authType: authTypeFor(selected) } });
      setNotice(`${created.displayName} Oluşturuldu. ${authTypeFor(selected) === "API_KEY" ? "Bağlantı Bilgilerini Güvenli Kasaya Kaydedin." : "Bağlantıyı Başlatabilirsiniz."}`);
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Bağlantı Oluşturulamadı.");
    } finally { setBusy(null); }
  }

  async function saveCredentials(item: Integration) {
    const fields = details[item.id]?.credentials?.requiredFields ?? providers.find((entry) => entry.kind === item.kind && entry.provider === item.provider)?.credentialFields ?? [];
    const values = credentialValues[item.id] ?? {};
    const credentials: Record<string, string> = {};
    for (const field of fields) {
      const value = (values[field.key] ?? "").trim();
      if (value) credentials[field.key] = value;
    }
    setBusy(`credentials:${item.id}`); setError(null); setNotice(null);
    try {
      await api(`/financial-integrations/${item.id}/credentials`, { method: "POST", body: { credentials } });
      setCredentialValues((current) => ({ ...current, [item.id]: {} }));
      setNotice("Bağlantı Bilgileri Güvenli Kasaya Kaydedildi.");
      await refresh(); await loadDetails(item.id);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Bağlantı Bilgileri Kaydedilemedi.");
    } finally { setBusy(null); }
  }

  async function connect(id: string) {
    setBusy(`connect:${id}`); setError(null); setNotice(null);
    try {
      const result = await api<ConnectResult>(`/financial-integrations/${id}/connect`, { method: "POST" });
      if (result.authorizationUrl) { window.location.assign(result.authorizationUrl); return; }
      setNotice("Bağlantı Doğrulandı.");
      await refresh(); await loadDetails(id);
    } catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : "Bağlantı Başlatılamadı."); }
    finally { setBusy(null); }
  }
  async function syncNow(id: string) {
    setBusy(`sync:${id}`); setError(null); setNotice(null);
    try { await api(`/financial-integrations/${id}/sync`, { method: "POST" }); setNotice("Veriler Güncellendi."); await refresh(); await loadDetails(id); }
    catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : "Veriler Güncellenemedi."); }
    finally { setBusy(null); }
  }
  async function disconnect(id: string) {
    setBusy(`disconnect:${id}`); setError(null); setNotice(null);
    try { await api(`/financial-integrations/${id}/disconnect`, { method: "POST" }); setNotice("Bağlantı Kesildi."); await refresh(); await loadDetails(id); }
    catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : "Bağlantı Kesilemedi."); }
    finally { setBusy(null); }
  }
  async function clearCredentials(id: string) {
    setBusy(`clear:${id}`); setError(null);
    try { await api(`/financial-integrations/${id}/credentials`, { method: "DELETE" }); setNotice("Bağlantı Bilgileri Güvenli Kasadan Temizlendi."); await refresh(); await loadDetails(id); }
    catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : "Bağlantı Bilgileri Temizlenemedi."); }
    finally { setBusy(null); }
  }

  return <div className="mx-auto max-w-[1500px] space-y-6 pb-12">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[var(--muted-soft)]">Finans Yönetimi</p><h1 className="mt-1 text-[32px] font-semibold tracking-[-.045em] text-[var(--ink)]">Banka Ve Ödeme Bağlantıları</h1><p className="mt-2 max-w-3xl text-[13px] leading-6 text-[var(--muted)]">Banka Ve Sanal POS Bağlantılarını, Bağlantı İzinlerini, Güncellik Durumunu Ve Veri Güncellemelerini Tek Merkezden Yönetin.</p></div><Button variant="secondary" onClick={() => void refresh()} disabled={busy !== null}>Verileri Yenile</Button></header>
    {error ? <Alert onClose={() => setError(null)}>{error}</Alert> : null}
    {notice ? <Alert tone="success" onClose={() => setNotice(null)}>{notice}</Alert> : null}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><FinanceMetric label="Aktif Bağlantı" value={integrations.filter((item) => item.status === "CONNECTED").length} detail={`${integrations.length} Toplam Bağlantı`} tone="success"/><FinanceMetric label="Banka Hesabı" value={liquidity?.accountCount ?? 0} detail="Güncellenmiş Hesap" tone="info"/><FinanceMetric label="Henüz Hesaba Geçmeyen POS Tutarı" value={money(posSummary?.currencies.find((item) => item.currency === "TRY")?.nearCash)} detail="Bankaya Aktarılmayı Bekleyen" tone="warning"/><FinanceMetric label="Kullanılabilir Bakiye" value={money(liquidity?.byCurrency?.TRY?.available)} detail="Canlı Banka Toplamı"/></section>

    <section className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
      <FinancePanel title="Yeni Bağlantı" description="Yalnızca Sistem Tarafından Desteklenen Banka Ve Ödeme Kuruluşları Gösterilir."><FormSection><div className="grid grid-cols-2 gap-2 rounded-[14px] bg-[var(--surface-2)] p-1.5">{(["OPEN_BANKING", "VIRTUAL_POS"] as IntegrationKind[]).map((value) => <button key={value} type="button" onClick={() => setKind(value)} className={`rounded-[11px] px-3 py-2.5 text-[11px] font-semibold ${kind === value ? "bg-[var(--surface)] text-[var(--accent)] shadow-sm" : "text-[var(--muted)]"}`}>{value === "OPEN_BANKING" ? "Banka Bağla" : "Sanal POS Bağla"}</button>)}</div><label className="block"><span className="mb-1.5 block text-[11px] font-medium text-[var(--muted)]">Hizmet Sağlayıcı</span><select className="control h-11 w-full" value={provider} onChange={(event) => setProvider(event.target.value)}>{kindProviders.map((item) => <option key={item.provider} value={item.provider}>{item.displayName}{item.runtimeReady ? "" : " · Kısmen Kullanıma Hazır"}</option>)}</select></label><label className="block"><span className="mb-1.5 block text-[11px] font-medium text-[var(--muted)]">Bağlantı Adı</span><TextInput value={displayName} onChange={(event) => setDisplayName(event.target.value)}/></label><FormHint tone="warning" title="Bağlantı Bilgisi Güvenliği">İnternet Bankacılığı Kullanıcı Adı Veya Şifresi Toplanmaz. Gizli Bilgiler Yalnızca Güvenli Kasada Şifreli Olarak Saklanır Ve Sonradan Görüntülenmez.</FormHint></FormSection><FormActions><Button type="button" onClick={() => void createIntegration()} disabled={busy !== null || displayName.trim().length < 2 || !provider}>{busy === "create" ? "Oluşturuluyor…" : "Bağlantıyı Oluştur"}</Button></FormActions></FinancePanel>

      <FinancePanel title="Bağlantılar" description="Bağlantı Durumu, İzin Süresi Ve Veri Güncelleme Yönetimi"><div className="space-y-3">{integrations.map((item) => { const state = details[item.id]; const health = state?.health; const credentialFields = state?.credentials?.requiredFields ?? providers.find((entry) => entry.kind === item.kind && entry.provider === item.provider)?.credentialFields ?? []; const isOpen = expanded === item.id; return <article key={item.id} className="rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)]/30 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-[13px] font-semibold text-[var(--ink)]">{item.displayName}</p><FinanceStatus status={financeStatus(item.status)} label={item.status}/>{health ? <FinanceStatus status={financeStatus(health.healthy ? "HEALTHY" : "ATTENTION")} label={health.healthy ? "HEALTHY" : "ATTENTION"}/> : null}</div><p className="mt-1 text-[11px] text-[var(--muted)]">{item.provider} · {item.kind === "OPEN_BANKING" ? "Banka" : "Sanal POS"}</p><p className="mt-1 text-[10px] text-[var(--muted-soft)]">Son Güncelleme: {dateTime(item.lastSyncAt)}{item.consentExpiresAt ? ` · Bağlantı İzni Bitişi: ${dateTime(item.consentExpiresAt)}` : ""}</p>{item.lastError ? <p className="mt-1 text-[10px] text-[var(--danger)]">Bağlantı Kontrolü Gerekiyor.</p> : null}</div><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => void (isOpen ? Promise.resolve(setExpanded(null)) : loadDetails(item.id))}>{isOpen ? "Kapat" : "Yönet"}</Button>{item.status === "CONNECTED" ? <><Button variant="secondary" onClick={() => void syncNow(item.id)} disabled={busy !== null}>Verileri Güncelle</Button><Button variant="secondary" onClick={() => void disconnect(item.id)} disabled={busy !== null}>Bağlantıyı Kes</Button></> : <Button onClick={() => void connect(item.id)} disabled={busy !== null}>Bağlan</Button>}</div></div>{isOpen ? <div className="mt-4 space-y-4 border-t border-[var(--line)] pt-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Mini label="Bağlantı Desteği" value={health?.adapterAvailable ? "Hazır" : "Kullanılamıyor"}/><Mini label="Çalışma Durumu" value={health?.runtimeReady ? "Hazır" : "Kısmen Hazır"}/><Mini label="Bağlantı Bilgileri" value={health?.hasCredentials ? "Ayarlanmış" : "Eksik"}/><Mini label="Son Veri Güncelleme Durumu" value={userLabel(health?.sync.lastStatus)}/></div>{health?.consent.expiresAt ? <FormHint tone={health.consent.expired || health.consent.expiringSoon ? "warning" : "info"}>Bağlantı İzni Bitişi: {dateTime(health.consent.expiresAt)}{health.consent.expired ? " · Süresi Doldu" : health.consent.expiringSoon ? " · Yakında Dolacak" : ""}</FormHint> : null}{health?.sync.stale ? <FormHint tone="warning">Son Başarılı Veri Güncellemesi Eski. Verileri Güncelle Seçeneğini Kullanmanız Önerilir.</FormHint> : null}{health?.banking ? <div className="grid gap-3 sm:grid-cols-3"><Mini label="Aktif Hesap" value={String(health.banking.activeAccountCount)}/><Mini label="Pasif Hesap" value={String(health.banking.inactiveAccountCount)}/><Mini label="Eşleştirilmemiş Hareket" value={String(health.banking.unmatchedTransactionCount)}/></div> : null}{item.authType === "API_KEY" ? <div className="rounded-[14px] border border-[var(--line)] bg-[var(--surface)] p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[12px] font-semibold text-[var(--ink)]">Bağlantı Bilgileri</p><p className="mt-1 text-[10px] text-[var(--muted)]">Gizli Değerler Sonradan Görüntülenmez. Yalnızca Hangi Alanların Ayarlanmış Olduğu Gösterilir.</p></div>{state?.credentials?.configured ? <Button variant="secondary" onClick={() => void clearCredentials(item.id)} disabled={busy !== null}>Güvenli Kasadan Temizle</Button> : null}</div><FormGrid className="mt-4">{credentialFields.map((field) => <label key={field.key} className="block"><span className="mb-1.5 block text-[11px] font-medium text-[var(--muted)]">{field.label}{field.required ? " *" : ""}</span><input type={field.secret === false ? "text" : "password"} autoComplete="off" value={credentialValues[item.id]?.[field.key] ?? ""} onChange={(event) => setCredentialValues((current) => ({ ...current, [item.id]: { ...(current[item.id] ?? {}), [field.key]: event.target.value } }))} className="control h-11 w-full" placeholder={state?.credentials?.fields.includes(field.key) ? "Kaydedilmiş · Değiştirmek İçin Yeniden Girin" : ""}/></label>)}</FormGrid>{credentialFields.length ? <div className="mt-4 flex justify-end"><Button onClick={() => void saveCredentials(item)} disabled={busy !== null}>Bağlantı Bilgilerini Kaydet</Button></div> : <p className="mt-3 text-[10px] text-[var(--muted)]">Bu Bağlantı İçin Ek Bilgi Girişi Gerekmiyor.</p>}</div> : null}</div> : null}</article>; })}{!integrations.length ? <FinanceEmpty title="Henüz Banka Veya Ödeme Bağlantısı Yok."/> : null}</div></FinancePanel>
    </section>

    <section className="grid gap-5 xl:grid-cols-2"><FinancePanel title="Banka Pozisyonu" description="Para Birimi Bazında Mevcut Ve Kullanılabilir Bakiyeler"><div className="space-y-3">{totals.map(([currency, value]) => <div key={currency} className="flex items-center justify-between rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)]/35 px-4 py-3"><div><p className="text-[11px] font-semibold text-[var(--ink)]">{currency}</p><p className="mt-1 text-[10px] text-[var(--muted)]">Kullanılabilir Bakiye</p></div><div className="text-right"><p className="text-[13px] font-semibold text-[var(--ink)]">{money(value.available, currency)}</p><p className="mt-1 text-[10px] text-[var(--muted)]">Mevcut Bakiye: {money(value.current, currency)}</p></div></div>)}{!totals.length ? <FinanceEmpty title="Bağlı Banka Hesabı Bulunmuyor."/> : null}</div></FinancePanel><FinancePanel title="POS Pozisyonu" description="Henüz Hesaba Geçmeyen Ve Hesaba Geçen POS Tutarları"><div className="space-y-3">{posSummary?.currencies?.map((row) => <div key={row.currency} className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)]/35 px-4 py-3"><div className="flex justify-between"><span className="text-[11px] font-semibold text-[var(--ink)]">{row.currency}</span><span className="text-[10px] text-[var(--muted)]">{row.transactionCount} İşlem</span></div><div className="mt-3 grid grid-cols-2 gap-3"><Mini label="Hesaba Geçmeyi Bekleyen" value={money(row.nearCash, row.currency)}/><Mini label="Hesaba Geçen" value={money(row.settled, row.currency)}/></div></div>)}{!posSummary?.currencies?.length ? <FinanceEmpty title="POS İşlemi Bulunmuyor."/> : null}</div></FinancePanel></section>

    <FinancePanel title="Son Banka Hareketleri" description="En Son Güncellenen 50 Banka Hareketi"><DataView><div className="overflow-x-auto"><table className="min-w-[820px] w-full text-left text-xs"><thead><tr className="border-b border-[var(--line)] bg-[var(--surface-2)]/40 text-[10px] uppercase tracking-[.08em] text-[var(--muted-soft)]"><th className="px-3 py-3">Tarih</th><th className="px-3 py-3">Banka</th><th className="px-3 py-3">Açıklama</th><th className="px-3 py-3">Tutar</th><th className="px-3 py-3">Mutabakat</th></tr></thead><tbody>{transactions.map((transaction) => <tr key={transaction.id} className="border-b border-[var(--line)] last:border-0"><td className="whitespace-nowrap px-3 py-3 text-[var(--muted)]">{dateTime(transaction.bookedAt)}</td><td className="px-3 py-3 font-medium text-[var(--ink)]">{transaction.bankName}</td><td className="max-w-[420px] truncate px-3 py-3 text-[var(--muted)]">{transaction.counterpartyName || transaction.description || "—"}</td><td className={`whitespace-nowrap px-3 py-3 font-semibold ${Number(transaction.amount) >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>{money(transaction.amount, transaction.currency)}</td><td className="px-3 py-3"><FinanceStatus status={financeStatus(transaction.reconciliationStatus)} label={transaction.reconciliationStatus}/></td></tr>)}</tbody></table></div>{!transactions.length ? <FinanceEmpty title="Henüz Banka Hareketi Güncellenmedi."/> : null}<DataViewMeta><span>{transactions.length} Hareket</span><span>Son 50 Kayıt</span></DataViewMeta></DataView></FinancePanel>
  </div>;
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[12px] bg-[var(--surface-2)] p-3"><p className="text-[9px] uppercase tracking-[.1em] text-[var(--muted-soft)]">{label}</p><p className="mt-1.5 text-[13px] font-semibold text-[var(--ink)]">{value}</p></div>;
}
