"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";

type IntegrationKind = "OPEN_BANKING" | "VIRTUAL_POS";
type AuthType = "OAUTH2" | "API_KEY" | "MANUAL";
type CredentialField = { key:string; label:string; secret?:boolean; required?:boolean };
type Provider = {
  kind: IntegrationKind;
  provider: string;
  displayName: string;
  credentialFields: CredentialField[];
  capabilities: Record<string, boolean>;
  runtimeReady: boolean;
};
type Integration = {
  id:string; kind:IntegrationKind; provider:string; displayName:string; status:string; authType:AuthType;
  branchId:string|null; consentExpiresAt?:string|null; lastSyncAt?:string|null; lastError?:string|null;
};
type Health = {
  integrationId:string; status:string; healthy:boolean; adapterAvailable:boolean; runtimeReady:boolean; hasCredentials:boolean;
  consent:{expiresAt:string|null;expired:boolean;expiringSoon:boolean};
  sync:{lastSyncAt:string|null;lastStatus:string|null;lastCompletedAt:string|null;stale:boolean};
  banking?:{activeAccountCount:number;inactiveAccountCount:number;latestBalanceAsOf:string|null;currentBalancesByCurrency:Record<string,string|number>;latestTransactionAt:string|null;unmatchedTransactionCount:number}|null;
  lastError:string|null;
};
type CredentialStatus = { configured:boolean; fields:string[]; requiredFields:CredentialField[]; runtimeReady:boolean };
type BankTransaction = {id:string;bankName:string;bookedAt:string;amount:number|string;currency:string;description:string|null;counterpartyName:string|null;reconciliationStatus:string};
type Liquidity = {accountCount:number;byCurrency:Record<string,{current:number;available:number}>};
type PosSummary = {currencies:Array<{currency:string;nearCash:number|string;settled:number|string;transactionCount:number}>};
type ConnectResult = {integrationId:string;provider:string;mode:string;message:string;authorizationUrl?:string};

type DetailsState = { health?:Health; credentials?:CredentialStatus };

function money(value:unknown,currency="TRY") { const n=Number(value??0); return new Intl.NumberFormat("tr-TR",{style:"currency",currency,maximumFractionDigits:2}).format(Number.isFinite(n)?n:0); }
function dateTime(value?:string|null){if(!value)return "—";return new Intl.DateTimeFormat("tr-TR",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value));}
function statusClass(status:string){if(["CONNECTED","ACTIVE","SUCCESS"].includes(status))return "bg-emerald-50 text-emerald-700";if(["ERROR","FAILED","DEAD_LETTER"].includes(status))return "bg-rose-50 text-rose-700";if(["CONNECTING","PENDING","RUNNING"].includes(status))return "bg-amber-50 text-amber-700";return "bg-slate-100 text-slate-600";}
function authTypeFor(provider:Provider):AuthType { if(provider.capabilities?.apiCredentials||provider.capabilities?.credentialTokenAuth)return "API_KEY"; if(provider.capabilities?.oauth)return "OAUTH2"; return "MANUAL"; }

export default function FinancialIntegrationsPage(){
  const [providers,setProviders]=useState<Provider[]>([]);
  const [integrations,setIntegrations]=useState<Integration[]>([]);
  const [liquidity,setLiquidity]=useState<Liquidity|null>(null);
  const [transactions,setTransactions]=useState<BankTransaction[]>([]);
  const [posSummary,setPosSummary]=useState<PosSummary|null>(null);
  const [kind,setKind]=useState<IntegrationKind>("OPEN_BANKING");
  const [provider,setProvider]=useState("");
  const [displayName,setDisplayName]=useState("Ana Banka Bağlantısı");
  const [expanded,setExpanded]=useState<string|null>(null);
  const [details,setDetails]=useState<Record<string,DetailsState>>({});
  const [credentialValues,setCredentialValues]=useState<Record<string,Record<string,string>>>({});
  const [busy,setBusy]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);

  const refresh=useCallback(async()=>{
    try{
      const [pr,i,l,t,p]=await Promise.all([
        api<Provider[]>("/financial-integrations/providers"),
        api<Integration[]>("/financial-integrations"),
        api<Liquidity>("/financial-integrations/liquidity"),
        api<BankTransaction[]>("/financial-integrations/bank-transactions?limit=50"),
        api<PosSummary>("/financial-integrations/pos/summary"),
      ]);
      setProviders(pr);setIntegrations(i);setLiquidity(l);setTransactions(t);setPosSummary(p);setError(null);
    }catch(e){setError(e instanceof ApiError?e.message:"Finansal entegrasyonlar yüklenemedi.");}
  },[]);

  useEffect(()=>{void refresh();},[refresh]);
  const kindProviders=useMemo(()=>providers.filter(p=>p.kind===kind),[providers,kind]);
  useEffect(()=>{
    const first=kindProviders[0];
    setProvider(first?.provider??"");
    setDisplayName(kind==="OPEN_BANKING"?"Ana Banka Bağlantısı":"Online POS");
  },[kind,kindProviders]);
  const totals=useMemo(()=>Object.entries(liquidity?.byCurrency??{}),[liquidity]);

  async function loadDetails(id:string){
    setBusy(`details:${id}`);setError(null);
    try{
      const item=integrations.find(i=>i.id===id);
      const [health,credentials]=await Promise.all([
        api<Health>(`/financial-integrations/${id}/health`),
        item?.authType==="API_KEY"?api<CredentialStatus>(`/financial-integrations/${id}/credentials`):Promise.resolve(undefined),
      ]);
      setDetails(prev=>({...prev,[id]:{health,credentials}}));
      setExpanded(id);
    }catch(e){setError(e instanceof ApiError?e.message:"Entegrasyon ayrıntıları alınamadı.");}
    finally{setBusy(null);}
  }

  async function createIntegration(){
    const selected=kindProviders.find(p=>p.provider===provider); if(!selected)return;
    setBusy("create");setError(null);setNotice(null);
    try{
      const created=await api<Integration>("/financial-integrations",{method:"POST",body:{kind,provider,displayName,authType:authTypeFor(selected)}});
      setNotice(`${created.displayName} oluşturuldu. ${authTypeFor(selected)==="API_KEY"?"Kimlik bilgilerini güvenli kasaya kaydedin.":"Bağlantıyı başlatabilirsiniz."}`);
      await refresh();
    }catch(e){setError(e instanceof ApiError?e.message:"Entegrasyon oluşturulamadı.");}finally{setBusy(null);}
  }

  async function saveCredentials(item:Integration){
    const fields=details[item.id]?.credentials?.requiredFields??providers.find(p=>p.kind===item.kind&&p.provider===item.provider)?.credentialFields??[];
    const values=credentialValues[item.id]??{};
    const payload:Record<string,string>={};
    for(const field of fields){const value=(values[field.key]??"").trim();if(value)payload[field.key]=value;}
    setBusy(`credentials:${item.id}`);setError(null);setNotice(null);
    try{
      await api(`/financial-integrations/${item.id}/credentials`,{method:"POST",body:{credentials:payload}});
      setCredentialValues(prev=>({...prev,[item.id]:{}}));setNotice("Kimlik bilgileri şifreli kasaya kaydedildi.");
      await refresh();await loadDetails(item.id);
    }catch(e){setError(e instanceof ApiError?e.message:"Kimlik bilgileri kaydedilemedi.");}finally{setBusy(null);}
  }

  async function connect(id:string){setBusy(`connect:${id}`);setError(null);setNotice(null);try{const result=await api<ConnectResult>(`/financial-integrations/${id}/connect`,{method:"POST"});if(result.authorizationUrl){window.location.assign(result.authorizationUrl);return;}setNotice(result.message||"Bağlantı doğrulandı.");await refresh();await loadDetails(id);}catch(e){setError(e instanceof ApiError?e.message:"Bağlantı başlatılamadı.");}finally{setBusy(null);}}
  async function syncNow(id:string){setBusy(`sync:${id}`);setError(null);setNotice(null);try{await api(`/financial-integrations/${id}/sync`,{method:"POST"});setNotice("Senkronizasyon tamamlandı.");await refresh();await loadDetails(id);}catch(e){setError(e instanceof ApiError?e.message:"Senkronizasyon tamamlanamadı.");}finally{setBusy(null);}}
  async function disconnect(id:string){setBusy(`disconnect:${id}`);setError(null);setNotice(null);try{await api(`/financial-integrations/${id}/disconnect`,{method:"POST"});setNotice("Entegrasyon bağlantısı kesildi.");await refresh();await loadDetails(id);}catch(e){setError(e instanceof ApiError?e.message:"Bağlantı kesilemedi.");}finally{setBusy(null);}}
  async function clearCredentials(id:string){setBusy(`clear:${id}`);setError(null);try{await api(`/financial-integrations/${id}/credentials`,{method:"DELETE"});setNotice("Kimlik bilgileri kasadan temizlendi.");await refresh();await loadDetails(id);}catch(e){setError(e instanceof ApiError?e.message:"Kimlik bilgileri temizlenemedi.");}finally{setBusy(null);}}

  return <div className="mx-auto max-w-[1500px] space-y-6 px-4 py-5 sm:px-6 lg:px-8">
    <header className="rounded-[28px] border border-white/80 bg-white/90 p-6 shadow-[0_16px_50px_rgba(43,35,72,.07)] backdrop-blur-xl"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[.18em] text-[#8d76df]">Finans & CFO</p><h1 className="mt-1 text-2xl font-semibold tracking-[-.04em] text-[#242332]">Finansal Entegrasyonlar</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-[#777586]">Banka ve sanal POS bağlantılarını, credential durumunu, consent süresini, provider health ve senkronizasyonu tek merkezden yönetin.</p></div><button type="button" onClick={()=>void refresh()} className="rounded-2xl border border-[#e8e4f4] bg-white px-4 py-2.5 text-sm font-medium text-[#6048bd]">Verileri Yenile</button></div></header>
    {error?<div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>:null}
    {notice?<div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm text-violet-700">{notice}</div>:null}

    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Metric title="Aktif Entegrasyon" value={String(integrations.filter(i=>i.status==="CONNECTED").length)} subtitle={`${integrations.length} toplam bağlantı`}/><Metric title="Banka Hesabı" value={String(liquidity?.accountCount??0)} subtitle="Senkronize hesap"/><Metric title="POS Near Cash" value={money(posSummary?.currencies.find(c=>c.currency==="TRY")?.nearCash)} subtitle="Henüz bankaya geçmemiş"/><Metric title="TRY Kullanılabilir" value={money(liquidity?.byCurrency?.TRY?.available)} subtitle="Canlı banka toplamı"/></section>

    <section className="grid gap-6 xl:grid-cols-[430px_1fr]">
      <div className="rounded-[26px] border border-white/80 bg-white/90 p-5 shadow-[0_12px_40px_rgba(43,35,72,.06)]"><h2 className="text-base font-semibold text-[#282736]">Yeni bağlantı</h2><p className="mt-1 text-xs leading-5 text-[#8b8997]">Yalnız backend registry’de gerçekten desteklenen provider’lar gösterilir.</p><div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-[#f7f5fb] p-1.5">{(["OPEN_BANKING","VIRTUAL_POS"] as IntegrationKind[]).map(k=><button key={k} type="button" onClick={()=>setKind(k)} className={`rounded-xl px-3 py-2.5 text-xs font-semibold ${kind===k?"bg-white text-[#6b50d2] shadow-sm":"text-[#898695]"}`}>{k==="OPEN_BANKING"?"Banka Bağla":"Sanal POS Bağla"}</button>)}</div><label className="mt-4 block text-xs font-medium text-[#625f70]">Sağlayıcı<select value={provider} onChange={e=>setProvider(e.target.value)} className="mt-1.5 w-full rounded-2xl border border-[#e9e5f1] bg-white px-3 py-3 text-sm">{kindProviders.map(p=><option key={p.provider} value={p.provider}>{p.displayName}{p.runtimeReady?"":" · kısmi runtime"}</option>)}</select></label><label className="mt-3 block text-xs font-medium text-[#625f70]">Bağlantı adı<input value={displayName} onChange={e=>setDisplayName(e.target.value)} className="mt-1.5 w-full rounded-2xl border border-[#e9e5f1] bg-white px-3 py-3 text-sm"/></label><button type="button" disabled={busy!==null||displayName.trim().length<2||!provider} onClick={()=>void createIntegration()} className="mt-5 w-full rounded-2xl bg-[#7657e8] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy==="create"?"Oluşturuluyor…":"Entegrasyonu Oluştur"}</button><p className="mt-3 text-[11px] leading-5 text-[#9a97a4]">İnternet bankacılığı kullanıcı adı veya şifresi istenmez. Secret alanlar yalnız şifreli credential vault’a gönderilir.</p></div>

      <div className="rounded-[26px] border border-white/80 bg-white/90 p-5 shadow-[0_12px_40px_rgba(43,35,72,.06)]"><div className="flex items-center justify-between"><div><h2 className="text-base font-semibold text-[#282736]">Bağlantılar</h2><p className="mt-1 text-xs text-[#8b8997]">Health, credential, consent ve sync yönetimi</p></div><span className="rounded-full bg-[#f1edff] px-3 py-1 text-xs font-semibold text-[#7657e8]">{integrations.length}</span></div><div className="mt-4 space-y-3">{integrations.length?integrations.map(item=>{
        const state=details[item.id];const health=state?.health;const credentialFields=state?.credentials?.requiredFields??providers.find(p=>p.kind===item.kind&&p.provider===item.provider)?.credentialFields??[];const isOpen=expanded===item.id;
        return <div key={item.id} className="rounded-[20px] border border-[#efecf4] bg-[#fcfbfe] p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold text-[#2b2a38]">{item.displayName}</p><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${statusClass(item.status)}`}>{item.status}</span>{health?<span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${health.healthy?"bg-emerald-50 text-emerald-700":"bg-amber-50 text-amber-700"}`}>{health.healthy?"HEALTHY":"ATTENTION"}</span>:null}</div><p className="mt-1 text-xs text-[#888594]">{item.provider} · {item.kind==="OPEN_BANKING"?"Banka":"Sanal POS"} · {item.authType}</p><p className="mt-1 text-[11px] text-[#a09da8]">Son senkron: {dateTime(item.lastSyncAt)}{item.consentExpiresAt?` · Consent: ${dateTime(item.consentExpiresAt)}`:""}</p>{item.lastError?<p className="mt-1 text-[11px] text-rose-600">{item.lastError}</p>:null}</div><div className="flex flex-wrap gap-2"><button onClick={()=>void (isOpen?Promise.resolve(setExpanded(null)):loadDetails(item.id))} className="rounded-xl border border-[#e8e4ee] bg-white px-3 py-2 text-xs font-medium text-[#6f6b7a]">{isOpen?"Kapat":"Yönet"}</button>{item.status==="CONNECTED"?<><button onClick={()=>void syncNow(item.id)} disabled={busy!==null} className="rounded-xl border border-[#dcd4f7] bg-white px-3 py-2 text-xs font-semibold text-[#7657e8] disabled:opacity-50">Sync Now</button><button onClick={()=>void disconnect(item.id)} disabled={busy!==null} className="rounded-xl border border-[#eadfe4] bg-white px-3 py-2 text-xs font-medium text-[#8a5d6b] disabled:opacity-50">Bağlantıyı Kes</button></>:<button onClick={()=>void connect(item.id)} disabled={busy!==null} className="rounded-xl bg-[#7657e8] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Bağlan</button>}</div></div>
        {isOpen?<div className="mt-4 border-t border-[#eeebf3] pt-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Mini label="Adapter" value={health?.adapterAvailable?"Hazır":"Yok"}/><Mini label="Runtime" value={health?.runtimeReady?"Ready":"Kısmi"}/><Mini label="Credentials" value={health?.hasCredentials?"Configured":"Eksik"}/><Mini label="Sync" value={health?.sync.lastStatus??"—"}/></div>{health?.consent.expiresAt?<div className={`mt-3 rounded-xl px-3 py-2 text-[11px] ${health.consent.expired?"bg-rose-50 text-rose-700":health.consent.expiringSoon?"bg-amber-50 text-amber-700":"bg-emerald-50 text-emerald-700"}`}>Consent bitişi: {dateTime(health.consent.expiresAt)}{health.consent.expired?" · süresi dolmuş":health.consent.expiringSoon?" · yakında dolacak":""}</div>:null}{health?.sync.stale?<div className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-700">Son başarılı senkronizasyon eski; manuel Sync Now önerilir.</div>:null}{health?.banking?<div className="mt-3 grid gap-3 sm:grid-cols-3"><Mini label="Aktif Hesap" value={String(health.banking.activeAccountCount)}/><Mini label="Pasif Hesap" value={String(health.banking.inactiveAccountCount)}/><Mini label="Unmatched Hareket" value={String(health.banking.unmatchedTransactionCount)}/></div>:null}
        {item.authType==="API_KEY"?<div className="mt-4 rounded-2xl border border-[#ece8f2] bg-white p-4"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold text-[#4b4757]">Provider credentials</p><p className="mt-1 text-[10px] text-[#9894a1]">Değerler geri okunmaz; yalnız alan adları ve configured durumu gösterilir.</p></div>{state?.credentials?.configured?<button onClick={()=>void clearCredentials(item.id)} disabled={busy!==null} className="text-[10px] font-semibold text-rose-600">Kasadan temizle</button>:null}</div><div className="mt-3 grid gap-3 sm:grid-cols-2">{credentialFields.map(field=><label key={field.key} className="text-[11px] font-medium text-[#686474]">{field.label}{field.required?" *":""}<input type={field.secret===false?"text":"password"} autoComplete="off" value={credentialValues[item.id]?.[field.key]??""} onChange={e=>setCredentialValues(prev=>({...prev,[item.id]:{...(prev[item.id]??{}),[field.key]:e.target.value}}))} className="mt-1.5 w-full rounded-xl border border-[#e7e3ed] px-3 py-2.5 text-xs" placeholder={state?.credentials?.fields.includes(field.key)?"Kaydedilmiş · değiştirmek için yeniden girin":""}/></label>)}</div>{credentialFields.length?<button onClick={()=>void saveCredentials(item)} disabled={busy!==null} className="mt-3 rounded-xl bg-[#2f2d3a] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Credential Kaydet</button>:<p className="mt-3 text-[11px] text-[#9995a2]">Bu adapter credential alanı yayınlamıyor.</p>}</div>:null}</div>:null}</div>
      }):<Empty text="Henüz finansal entegrasyon yok."/>}</div></div>
    </section>

    <section className="grid gap-6 xl:grid-cols-2"><Panel title="Banka pozisyonu">{totals.length?totals.map(([currency,value])=><div key={currency} className="mb-3 flex items-center justify-between rounded-2xl bg-[#f9f7fc] px-4 py-3"><div><p className="text-xs font-semibold text-[#656273]">{currency}</p><p className="mt-1 text-[11px] text-[#9895a1]">Kullanılabilir bakiye</p></div><div className="text-right"><p className="text-sm font-semibold text-[#2c2a39]">{money(value.available,currency)}</p><p className="mt-1 text-[11px] text-[#9895a1]">Current: {money(value.current,currency)}</p></div></div>):<Empty text="Bağlı banka hesabı bulunmuyor."/>}</Panel><Panel title="POS pozisyonu">{posSummary?.currencies?.length?posSummary.currencies.map(row=><div key={row.currency} className="mb-3 rounded-2xl bg-[#f9f7fc] px-4 py-3"><div className="flex justify-between"><span className="text-xs font-semibold text-[#656273]">{row.currency}</span><span className="text-[11px] text-[#9895a1]">{row.transactionCount} işlem</span></div><div className="mt-3 grid grid-cols-2 gap-3"><Mini label="Near Cash" value={money(row.nearCash,row.currency)}/><Mini label="Settled" value={money(row.settled,row.currency)}/></div></div>):<Empty text="POS işlemi bulunmuyor."/>}</Panel></section>

    <Panel title="Son banka hareketleri"><div className="overflow-x-auto"><table className="min-w-full text-left text-xs"><thead><tr className="border-b border-[#eeebf3] text-[#9895a2]"><th className="px-3 py-3 font-medium">Tarih</th><th className="px-3 py-3 font-medium">Banka</th><th className="px-3 py-3 font-medium">Açıklama</th><th className="px-3 py-3 font-medium">Tutar</th><th className="px-3 py-3 font-medium">Mutabakat</th></tr></thead><tbody>{transactions.map(tx=><tr key={tx.id} className="border-b border-[#f3f1f6]"><td className="whitespace-nowrap px-3 py-3">{dateTime(tx.bookedAt)}</td><td className="px-3 py-3 font-medium">{tx.bankName}</td><td className="max-w-[420px] truncate px-3 py-3">{tx.counterpartyName||tx.description||"—"}</td><td className={`whitespace-nowrap px-3 py-3 font-semibold ${Number(tx.amount)>=0?"text-emerald-700":"text-rose-700"}`}>{money(tx.amount,tx.currency)}</td><td className="px-3 py-3"><span className="rounded-full bg-[#f2f0f6] px-2 py-1 text-[10px] font-semibold">{tx.reconciliationStatus}</span></td></tr>)}</tbody></table>{!transactions.length?<Empty text="Henüz banka hareketi senkronize edilmedi."/>:null}</div></Panel>
  </div>;
}

function Metric({title,value,subtitle}:{title:string;value:string;subtitle:string}){return <div className="rounded-[22px] border border-white/80 bg-white/90 p-5 shadow-[0_10px_32px_rgba(43,35,72,.05)]"><p className="text-[11px] font-medium uppercase tracking-[.12em] text-[#9996a2]">{title}</p><p className="mt-2 text-xl font-semibold text-[#292736]">{value}</p><p className="mt-1 text-xs text-[#918e9b]">{subtitle}</p></div>}
function Panel({title,children}:{title:string;children:React.ReactNode}){return <section className="rounded-[26px] border border-white/80 bg-white/90 p-5 shadow-[0_12px_40px_rgba(43,35,72,.06)]"><h2 className="mb-4 text-base font-semibold text-[#282736]">{title}</h2>{children}</section>}
function Mini({label,value}:{label:string;value:string}){return <div className="rounded-xl bg-[#f8f6fb] p-3"><p className="text-[9px] uppercase tracking-[.1em] text-[#9b97a4]">{label}</p><p className="mt-1.5 text-sm font-semibold text-[#393644]">{value}</p></div>}
function Empty({text}:{text:string}){return <div className="rounded-2xl border border-dashed border-[#e7e3ed] px-4 py-7 text-center text-xs leading-5 text-[#9996a2]">{text}</div>}
