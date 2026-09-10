"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";

type IntegrationKind = "OPEN_BANKING" | "VIRTUAL_POS";
type Integration = {
  id: string;
  kind: IntegrationKind;
  provider: string;
  displayName: string;
  status: string;
  authType: "OAUTH2" | "API_KEY" | "MANUAL";
  branchId: string | null;
  consentExpiresAt?: string | null;
  lastSyncAt?: string | null;
  lastError?: string | null;
};
type BankAccount = {
  id: string;
  integrationId: string;
  bankName: string;
  accountName: string;
  ibanMasked: string | null;
  currency: string;
  availableBalance: number | string | null;
  currentBalance: number | string | null;
  balanceAsOf: string | null;
  active: boolean;
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
type Liquidity = {
  accountCount: number;
  byCurrency: Record<string, { current: number; available: number }>;
  accounts: BankAccount[];
};
type PosSummary = { currencies: Array<{ currency: string; nearCash: number | string; settled: number | string; transactionCount: number }> };
type ConnectResult = { integrationId: string; provider: string; state: string; callbackUrl: string; mode: string; message: string; authorizationUrl?: string };

const PROVIDERS: Record<IntegrationKind, Array<{ value: string; label: string; authType: "OAUTH2" | "API_KEY" }>> = {
  OPEN_BANKING: [
    { value: "OPEN_BANKING_PROVIDER", label: "Açık Bankacılık Sağlayıcısı", authType: "OAUTH2" },
    { value: "GARANTI_BBVA", label: "Garanti BBVA", authType: "OAUTH2" },
    { value: "AKBANK", label: "Akbank", authType: "OAUTH2" },
    { value: "IS_BANKASI", label: "İş Bankası", authType: "OAUTH2" },
    { value: "YAPI_KREDI", label: "Yapı Kredi", authType: "OAUTH2" },
  ],
  VIRTUAL_POS: [
    { value: "IYZICO", label: "iyzico", authType: "API_KEY" },
    { value: "PAYTR", label: "PayTR", authType: "API_KEY" },
    { value: "GARANTI_POS", label: "Garanti Sanal POS", authType: "API_KEY" },
    { value: "AKBANK_POS", label: "Akbank Sanal POS", authType: "API_KEY" },
  ],
};

function money(value: number | string | null | undefined, currency = "TRY") {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value ?? 0));
}
function dateTime(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
function statusClass(status: string) {
  if (["CONNECTED", "ACTIVE", "SETTLED"].includes(status)) return "bg-emerald-50 text-emerald-700";
  if (["ERROR", "FAILED"].includes(status)) return "bg-rose-50 text-rose-700";
  if (["CONNECTING", "PENDING"].includes(status)) return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

export default function FinancialIntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [liquidity, setLiquidity] = useState<Liquidity | null>(null);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [posSummary, setPosSummary] = useState<PosSummary | null>(null);
  const [kind, setKind] = useState<IntegrationKind>("OPEN_BANKING");
  const [provider, setProvider] = useState(PROVIDERS.OPEN_BANKING[0].value);
  const [displayName, setDisplayName] = useState("Ana Banka Bağlantısı");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [i, l, t, p] = await Promise.all([
        api<Integration[]>("/financial-integrations"),
        api<Liquidity>("/financial-integrations/liquidity"),
        api<BankTransaction[]>("/financial-integrations/bank-transactions?limit=50"),
        api<PosSummary>("/financial-integrations/pos/summary"),
      ]);
      setIntegrations(i); setLiquidity(l); setTransactions(t); setPosSummary(p); setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Finansal entegrasyonlar yüklenemedi."); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const first = PROVIDERS[kind][0];
    setProvider(first.value);
    setDisplayName(kind === "OPEN_BANKING" ? "Ana Banka Bağlantısı" : "Online POS");
  }, [kind]);

  const totals = useMemo(() => Object.entries(liquidity?.byCurrency ?? {}), [liquidity]);

  async function createIntegration() {
    const selected = PROVIDERS[kind].find((p) => p.value === provider) ?? PROVIDERS[kind][0];
    setBusy("create"); setError(null); setNotice(null);
    try {
      const created = await api<Integration>("/financial-integrations", {
        method: "POST",
        body: { kind, provider, displayName, authType: selected.authType },
      });
      setNotice(`${created.displayName} oluşturuldu. Şimdi bağlantıyı başlatabilirsiniz.`);
      await refresh();
    } catch (e) { setError(e instanceof ApiError ? e.message : "Entegrasyon oluşturulamadı."); }
    finally { setBusy(null); }
  }

  async function connect(id: string) {
    setBusy(id); setError(null); setNotice(null);
    try {
      const result = await api<ConnectResult>(`/financial-integrations/${id}/connect`, {
        method: "POST",
        body: { callbackBaseUrl: window.location.origin },
      });
      if (result.authorizationUrl) {
        window.location.assign(result.authorizationUrl);
        return;
      }
      setNotice(`Bağlantı oturumu hazırlandı (${result.provider}). ${result.message}`);
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Bağlantı başlatılamadı."); }
    finally { setBusy(null); }
  }

  async function disconnect(id: string) {
    setBusy(id); setError(null); setNotice(null);
    try {
      await api(`/financial-integrations/${id}/disconnect`, { method: "POST" });
      setNotice("Entegrasyon bağlantısı kesildi.");
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Bağlantı kesilemedi."); }
    finally { setBusy(null); }
  }

  return <div className="mx-auto max-w-[1500px] space-y-6 px-4 py-5 sm:px-6 lg:px-8">
    <header className="rounded-[28px] border border-white/80 bg-white/90 p-6 shadow-[0_16px_50px_rgba(43,35,72,0.07)] backdrop-blur-xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d76df]">Finans & CFO</p><h1 className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-[#242332]">Finansal Entegrasyonlar</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-[#777586]">Firmanızın banka hesaplarını ve online POS sağlayıcılarını Beauty ERP’ye bağlayın. Hesap bakiyeleri, banka hareketleri, POS alacakları ve settlement verileri bu merkezde birleşir.</p></div>
        <button type="button" onClick={() => void refresh()} className="rounded-2xl border border-[#e8e4f4] bg-white px-4 py-2.5 text-sm font-medium text-[#6048bd] hover:bg-[#faf8ff]">Verileri Yenile</button>
      </div>
    </header>

    {error ? <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
    {notice ? <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm text-violet-700">{notice}</div> : null}

    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Metric title="Aktif Entegrasyon" value={String(integrations.filter(i => i.status === "CONNECTED").length)} subtitle={`${integrations.length} toplam bağlantı`} />
      <Metric title="Banka Hesabı" value={String(liquidity?.accountCount ?? 0)} subtitle="Senkronize hesap" />
      <Metric title="POS Near Cash" value={money(posSummary?.currencies.find(c => c.currency === "TRY")?.nearCash, "TRY")} subtitle="Henüz bankaya geçmemiş" />
      <Metric title="TRY Kullanılabilir Bakiye" value={money(liquidity?.byCurrency?.TRY?.available, "TRY")} subtitle="Banka hesapları toplamı" />
    </section>

    <section className="grid gap-6 xl:grid-cols-[430px_1fr]">
      <div className="rounded-[26px] border border-white/80 bg-white/90 p-5 shadow-[0_12px_40px_rgba(43,35,72,0.06)]">
        <h2 className="text-base font-semibold text-[#282736]">Yeni bağlantı</h2><p className="mt-1 text-xs leading-5 text-[#8b8997]">Firma yöneticisi kendi finans bağlantısını buradan başlatabilir.</p>
        <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-[#f7f5fb] p-1.5">
          {(["OPEN_BANKING","VIRTUAL_POS"] as IntegrationKind[]).map(k => <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-xl px-3 py-2.5 text-xs font-semibold ${kind===k?"bg-white text-[#6b50d2] shadow-sm":"text-[#898695]"}`}>{k === "OPEN_BANKING" ? "Banka Bağla" : "Sanal POS Bağla"}</button>)}
        </div>
        <label className="mt-4 block text-xs font-medium text-[#625f70]">Sağlayıcı<select value={provider} onChange={e=>setProvider(e.target.value)} className="mt-1.5 w-full rounded-2xl border border-[#e9e5f1] bg-white px-3 py-3 text-sm outline-none focus:border-[#9d84ef]">{PROVIDERS[kind].map(p=><option key={p.value} value={p.value}>{p.label}</option>)}</select></label>
        <label className="mt-3 block text-xs font-medium text-[#625f70]">Bağlantı adı<input value={displayName} onChange={e=>setDisplayName(e.target.value)} className="mt-1.5 w-full rounded-2xl border border-[#e9e5f1] bg-white px-3 py-3 text-sm outline-none focus:border-[#9d84ef]" /></label>
        <button type="button" disabled={busy!==null || displayName.trim().length<2} onClick={() => void createIntegration()} className="mt-5 w-full rounded-2xl bg-[#7657e8] px-4 py-3 text-sm font-semibold text-white shadow-[0_8px_22px_rgba(118,87,232,0.22)] disabled:opacity-50">{busy==="create"?"Oluşturuluyor…":"Entegrasyonu Oluştur"}</button>
        <p className="mt-3 text-[11px] leading-5 text-[#9a97a4]">Banka kullanıcı adı veya internet bankacılığı şifresi bu ekranda istenmez. OAuth/açık bankacılık bağlantıları sağlayıcının güvenli yetkilendirme akışına yönlendirilir.</p>
      </div>

      <div className="rounded-[26px] border border-white/80 bg-white/90 p-5 shadow-[0_12px_40px_rgba(43,35,72,0.06)]">
        <div className="flex items-center justify-between"><div><h2 className="text-base font-semibold text-[#282736]">Bağlantılar</h2><p className="mt-1 text-xs text-[#8b8997]">Firma kapsamındaki banka ve POS entegrasyonları</p></div><span className="rounded-full bg-[#f1edff] px-3 py-1 text-xs font-semibold text-[#7657e8]">{integrations.length}</span></div>
        <div className="mt-4 space-y-3">{integrations.length ? integrations.map(item => <div key={item.id} className="rounded-[20px] border border-[#efecf4] bg-[#fcfbfe] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold text-[#2b2a38]">{item.displayName}</p><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${statusClass(item.status)}`}>{item.status}</span></div><p className="mt-1 text-xs text-[#888594]">{item.provider} · {item.kind === "OPEN_BANKING" ? "Banka" : "Sanal POS"} · {item.authType}</p><p className="mt-1 text-[11px] text-[#a09da8]">Son senkron: {dateTime(item.lastSyncAt)}</p>{item.lastError?<p className="mt-1 text-[11px] text-rose-600">{item.lastError}</p>:null}</div>
          <div className="flex shrink-0 gap-2">{item.status === "CONNECTED" ? <button onClick={()=>void disconnect(item.id)} disabled={busy===item.id} className="rounded-xl border border-[#e8e4ee] bg-white px-3 py-2 text-xs font-medium text-[#6f6b7a] disabled:opacity-50">Bağlantıyı Kes</button> : <button onClick={()=>void connect(item.id)} disabled={busy===item.id} className="rounded-xl bg-[#7657e8] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy===item.id?"Başlatılıyor…":"Bağlantıyı Başlat"}</button>}</div></div>
        </div>) : <Empty text="Henüz finansal entegrasyon yok. Soldaki formdan ilk banka veya POS bağlantınızı oluşturun." />}</div>
      </div>
    </section>

    <section className="grid gap-6 xl:grid-cols-2">
      <div className="rounded-[26px] border border-white/80 bg-white/90 p-5 shadow-[0_12px_40px_rgba(43,35,72,0.06)]"><h2 className="text-base font-semibold text-[#282736]">Banka pozisyonu</h2><div className="mt-4 space-y-3">{totals.length?totals.map(([currency, value])=><div key={currency} className="flex items-center justify-between rounded-2xl bg-[#f9f7fc] px-4 py-3"><div><p className="text-xs font-semibold text-[#656273]">{currency}</p><p className="mt-1 text-[11px] text-[#9895a1]">Kullanılabilir bakiye</p></div><div className="text-right"><p className="text-sm font-semibold text-[#2c2a39]">{money(value.available,currency)}</p><p className="mt-1 text-[11px] text-[#9895a1]">Defter: {money(value.current,currency)}</p></div></div>):<Empty text="Bağlı banka hesabı bulunmuyor." />}</div></div>
      <div className="rounded-[26px] border border-white/80 bg-white/90 p-5 shadow-[0_12px_40px_rgba(43,35,72,0.06)]"><h2 className="text-base font-semibold text-[#282736]">POS pozisyonu</h2><div className="mt-4 space-y-3">{posSummary?.currencies?.length?posSummary.currencies.map(row=><div key={row.currency} className="rounded-2xl bg-[#f9f7fc] px-4 py-3"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-[#656273]">{row.currency}</span><span className="text-[11px] text-[#9895a1]">{row.transactionCount} işlem</span></div><div className="mt-3 grid grid-cols-2 gap-3"><div><p className="text-[10px] uppercase tracking-wide text-[#9b98a5]">Near Cash</p><p className="mt-1 text-sm font-semibold text-[#7657e8]">{money(row.nearCash,row.currency)}</p></div><div><p className="text-[10px] uppercase tracking-wide text-[#9b98a5]">Settled</p><p className="mt-1 text-sm font-semibold text-[#2d2b39]">{money(row.settled,row.currency)}</p></div></div></div>):<Empty text="POS işlemi bulunmuyor." />}</div></div>
    </section>

    <section className="rounded-[26px] border border-white/80 bg-white/90 p-5 shadow-[0_12px_40px_rgba(43,35,72,0.06)]"><div className="flex items-center justify-between"><div><h2 className="text-base font-semibold text-[#282736]">Son banka hareketleri</h2><p className="mt-1 text-xs text-[#8b8997]">Mutabakat durumuyla birlikte son 50 hareket</p></div></div><div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-xs"><thead><tr className="border-b border-[#eeebf3] text-[#9895a2]"><th className="px-3 py-3 font-medium">Tarih</th><th className="px-3 py-3 font-medium">Banka</th><th className="px-3 py-3 font-medium">Açıklama</th><th className="px-3 py-3 font-medium">Tutar</th><th className="px-3 py-3 font-medium">Mutabakat</th></tr></thead><tbody>{transactions.map(tx=><tr key={tx.id} className="border-b border-[#f3f1f6] last:border-0"><td className="whitespace-nowrap px-3 py-3 text-[#777483]">{dateTime(tx.bookedAt)}</td><td className="px-3 py-3 font-medium text-[#454250]">{tx.bankName}</td><td className="max-w-[420px] truncate px-3 py-3 text-[#777483]">{tx.counterpartyName || tx.description || "—"}</td><td className={`whitespace-nowrap px-3 py-3 font-semibold ${Number(tx.amount)>=0?"text-emerald-700":"text-rose-700"}`}>{money(tx.amount,tx.currency)}</td><td className="px-3 py-3"><span className="rounded-full bg-[#f2f0f6] px-2 py-1 text-[10px] font-semibold text-[#777382]">{tx.reconciliationStatus}</span></td></tr>)}</tbody></table>{!transactions.length?<Empty text="Henüz banka hareketi senkronize edilmedi." />:null}</div></section>
  </div>;
}

function Metric({title,value,subtitle}:{title:string;value:string;subtitle:string}){return <div className="rounded-[22px] border border-white/80 bg-white/90 p-5 shadow-[0_10px_32px_rgba(43,35,72,0.05)]"><p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#9996a2]">{title}</p><p className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#292736]">{value}</p><p className="mt-1 text-xs text-[#918e9b]">{subtitle}</p></div>}
function Empty({text}:{text:string}){return <div className="rounded-2xl border border-dashed border-[#e7e3ed] px-4 py-7 text-center text-xs leading-5 text-[#9996a2]">{text}</div>}
