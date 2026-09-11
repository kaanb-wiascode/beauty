"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { Alert, Button, Spinner } from "@/components/ui";

type ProviderBalance = {currency:string;currentBalance:number;availableBalance:number;balanceAsOf:string|null;accountCount:number};
type SettlementDay = {date:string;currency:string;transactionCount:number;grossAmount:number;feeAmount:number;netAmount:number;overdue:boolean};
type SettlementCurrencyTotal = {currency:string;grossAmount:number;feeAmount:number;netAmount:number;transactionCount:number};
type LiquidityPosition = {
  asOf:string;
  reportingCurrency:string|null;
  book:{cashOnHand:number;bankBalance:number;actualCash:number;posReceivables:number;nearCash:number;totalLiquidPosition:number};
  provider:{bankBalancesByCurrency:ProviderBalance[]};
  bankVariance:{comparable:boolean;currency:string|null;bookBankBalance:number;providerCurrentBalance:number|null;providerAvailableBalance:number|null;currentVariance:number|null;availableVariance:number|null;balanceAsOf:string|null};
  posSettlementForecast:{scheduled:SettlementDay[];totalsByCurrency:SettlementCurrencyTotal[];unknownTiming:SettlementCurrencyTotal[]};
};
type Reconciliation = {total:number;matched:number;unmatched:number;unmatchedAmount:number|string;unmatchedBankTransactions:number;ignoredBankTransactions:number};
type BankAccount = {id:string;bankName:string;accountName:string;ibanMasked:string|null;currency:string;availableBalance:number|string|null;currentBalance:number|string|null;balanceAsOf:string|null};

export default function TreasuryCockpitPage(){
  const [position,setPosition]=useState<LiquidityPosition|null>(null);
  const [reconciliation,setReconciliation]=useState<Reconciliation|null>(null);
  const [accounts,setAccounts]=useState<BankAccount[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try{
      const [p,r,a]=await Promise.all([
        api<LiquidityPosition>("/profitability/treasury/liquidity-position"),
        api<Reconciliation>("/financial-integrations/pos/reconciliation/summary"),
        api<BankAccount[]>("/financial-integrations/bank-accounts"),
      ]);
      setPosition(p);setReconciliation(r);setAccounts(a);
    }catch(e){setError(e instanceof ApiError?e.message:"Treasury verileri yüklenemedi.")}
    finally{setLoading(false)}
  },[]);

  useEffect(()=>{void load()},[load]);
  const reportingCurrency=position?.reportingCurrency??"TRY";
  const providerBalance=position?.provider.bankBalancesByCurrency.find(item=>item.currency===position?.reportingCurrency);
  const forecastTotal=position?.posSettlementForecast.totalsByCurrency.find(item=>item.currency===reportingCurrency);
  const chartDays=useMemo(()=>position?.posSettlementForecast.scheduled.filter(d=>d.currency===reportingCurrency)??[],[position,reportingCurrency]);
  const unknownTiming=position?.posSettlementForecast.unknownTiming.find(item=>item.currency===reportingCurrency);

  if(loading&&!position)return <div className="mx-auto max-w-[1500px] py-20"><Spinner label="Canlı treasury pozisyonu hazırlanıyor..."/></div>;

  return <div className="mx-auto max-w-[1500px] space-y-6 pb-12">
    <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[#9b97a7]">FİNANS & CFO / TREASURY</p>
        <h1 className="mt-2 text-[36px] font-semibold tracking-[-.045em] text-[#20202a]">Canlı Nakit Pozisyonu</h1>
        <p className="mt-2 max-w-3xl text-[14px] leading-6 text-[#85828e]">Defter nakdini, banka API bakiyelerini, POS near-cash pozisyonunu, beklenen settlement akışını ve mutabakat farklarını tek ekranda izleyin.</p>
      </div>
      <div className="flex gap-2"><Link href="/finance/cfo" className="rounded-[14px] border border-[#e9e5ef] bg-white px-4 py-2.5 text-[12px] font-semibold text-[#615d6d]">CFO Kokpitine Dön</Link><Button onClick={()=>void load()}>Verileri Yenile</Button></div>
    </header>
    {error?<Alert onClose={()=>setError("")}>{error}</Alert>:null}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <Metric label="Actual Cash" value={money(position?.book.actualCash)} sub="100 Kasa + 102 Bankalar" tone="good"/>
      <Metric label="Near Cash" value={money(position?.book.nearCash)} sub="108 POS Alacakları"/>
      <Metric label="Total Liquid" value={money(position?.book.totalLiquidPosition)} sub="Actual Cash + Near Cash" tone="good"/>
      <Metric label="Live Bank" value={position?.bankVariance.comparable?money(position.bankVariance.providerCurrentBalance,reportingCurrency):"—"} sub={position?.bankVariance.comparable?`${reportingCurrency} provider current balance`:"Raporlama para birimi ayarlanmalı"}/>
      <Metric label="Bank Variance" value={position?.bankVariance.comparable?signedMoney(position.bankVariance.currentVariance,reportingCurrency):"—"} sub="Provider − 102 defter" tone={varianceTone(position?.bankVariance.currentVariance)}/>
      <Metric label="Beklenen POS" value={money(forecastTotal?.netAmount,reportingCurrency)} sub={`${forecastTotal?.transactionCount??0} işlem`}/>
    </section>

    <section className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
      <Panel title="POS Settlement Forecast" subtitle={`${reportingCurrency} beklenen net banka geçişleri`}>
        <ForecastBars days={chartDays} currency={reportingCurrency}/>
      </Panel>
      <Panel title="Treasury Kontrol" subtitle="Defter, banka ve POS köprü görünümü">
        <div className="grid gap-3 sm:grid-cols-2">
          <Mini label="100 Kasa" value={money(position?.book.cashOnHand)}/>
          <Mini label="102 Bankalar" value={money(position?.book.bankBalance)}/>
          <Mini label="Provider Available" value={providerBalance?money(providerBalance.availableBalance,providerBalance.currency):"—"}/>
          <Mini label="Mutabakat Oranı" value={percent(reconciliation?.matched,reconciliation?.total)}/>
          <Mini label="Zamanı Bilinmeyen POS" value={money(unknownTiming?.netAmount,reportingCurrency)}/>
          <Mini label="Mutabakatsız POS" value={`${reconciliation?.unmatched??0} · ${money(reconciliation?.unmatchedAmount)}`}/>
        </div>
        <div className="mt-4 rounded-[16px] border border-[#ece9f0] bg-[#faf9fc] p-4 text-[11px] leading-5 text-[#777382]">102 defter bakiyesi ile canlı banka bakiyesi yalnız raporlama para birimi tanımlandığında kıyaslanır. Fark, banka mutabakatı için sinyal üretir; provider bakiyesi muhasebe defterinin yerine geçmez.</div>
        <Link href="/finance/reconciliation" className="mt-4 inline-flex rounded-[13px] bg-[#7657e8] px-4 py-2.5 text-[11px] font-semibold text-white">Mutabakat Merkezine Git</Link>
      </Panel>
    </section>

    <section className="grid gap-5 xl:grid-cols-2">
      <Panel title="Provider Banka Bakiyeleri" subtitle="Para birimi bazında Open Banking görünümü">
        <div className="grid gap-3 sm:grid-cols-2">{(position?.provider.bankBalancesByCurrency??[]).map(item=><div key={item.currency} className="rounded-[16px] border border-[#efedf3] bg-[#faf9fc] p-4"><div className="flex items-center justify-between"><p className="text-[11px] font-semibold text-[#777382]">{item.currency}</p><span className="text-[9px] text-[#aaa6b2]">{item.accountCount} hesap</span></div><p className="mt-3 text-[19px] font-semibold text-[#302e39]">{money(item.currentBalance,item.currency)}</p><p className="mt-1 text-[10px] text-[#96919f]">Kullanılabilir {money(item.availableBalance,item.currency)}</p><p className="mt-2 text-[9px] text-[#aaa6b2]">{dateTime(item.balanceAsOf)}</p></div>)}{!(position?.provider.bankBalancesByCurrency.length)?<Empty text="Open Banking bakiyesi bulunamadı."/>:null}</div>
      </Panel>
      <Panel title="Settlement İstisnaları" subtitle="Nakit dönüşüm zamanlaması açısından izlenecek POS tutarları">
        <div className="space-y-2">{(position?.posSettlementForecast.unknownTiming??[]).map(item=><div key={item.currency} className="flex items-center justify-between rounded-[14px] border border-[#efedf3] px-4 py-3"><div><p className="text-[12px] font-semibold text-[#34313e]">{item.currency}</p><p className="mt-1 text-[10px] text-[#96919f]">{item.transactionCount} işlemin settlement tarihi bilinmiyor</p></div><p className="text-[14px] font-semibold text-[#34313e]">{money(item.netAmount,item.currency)}</p></div>)}{!(position?.posSettlementForecast.unknownTiming.length)?<Empty text="Settlement zamanı bilinmeyen POS işlemi yok."/>:null}</div>
      </Panel>
    </section>

    <Panel title="Banka Hesapları" subtitle="Senkronize hesapların canlı bakiye pozisyonu">
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead><tr className="border-b border-[#eeeaf2] text-[10px] uppercase tracking-[.12em] text-[#9c98a6]"><th className="px-3 py-3">Banka</th><th className="px-3 py-3">Hesap</th><th className="px-3 py-3">IBAN</th><th className="px-3 py-3">Para Birimi</th><th className="px-3 py-3">Current</th><th className="px-3 py-3">Available</th><th className="px-3 py-3">Bakiye Tarihi</th></tr></thead><tbody>{accounts.map(a=><tr key={a.id} className="border-b border-[#f3f0f5] text-[12px]"><td className="px-3 py-4 font-semibold text-[#34313e]">{a.bankName}</td><td className="px-3 py-4">{a.accountName||"—"}</td><td className="px-3 py-4 text-[#777382]">{a.ibanMasked||"—"}</td><td className="px-3 py-4">{a.currency}</td><td className="px-3 py-4">{money(a.currentBalance,a.currency)}</td><td className="px-3 py-4 font-semibold">{money(a.availableBalance,a.currency)}</td><td className="px-3 py-4 text-[#8e8997]">{dateTime(a.balanceAsOf)}</td></tr>)}</tbody></table>{!accounts.length?<Empty text="Henüz senkronize banka hesabı yok."/>:null}</div>
    </Panel>
  </div>
}

function ForecastBars({days,currency}:{days:SettlementDay[];currency:string}){if(!days.length)return <Empty text="Beklenen settlement verisi bulunamadı."/>;const max=Math.max(1,...days.map(d=>Number(d.netAmount)));return <div className="overflow-x-auto"><div className="flex min-w-[720px] items-end gap-3 rounded-[16px] border border-[#efedf3] bg-[#fbfafe] px-4 py-4">{days.map((d,i)=><div key={`${d.date}-${i}`} className="flex min-w-[48px] flex-1 flex-col items-center gap-2"><div className="flex h-[180px] items-end"><div className={`w-7 rounded-t-[8px] ${d.overdue?"bg-[#d97757]":"bg-[#7657e8]"}`} style={{height:`${Math.max(4,(Number(d.netAmount)/max)*160)}px`}} title={money(d.netAmount,currency)}/></div><span className="text-[9px] font-semibold text-[#918d9b]">{shortDate(d.date)}</span><span className="text-[8px] text-[#aaa6b2]">{d.transactionCount} tx{d.overdue?" · gecikmiş":""}</span></div>)}</div></div>}
function Metric({label,value,sub,tone="default"}:{label:string;value:string;sub:string;tone?:"default"|"good"|"warn"}){const cls=tone==="good"?"border-[#d7eadf] bg-[#f4fbf7]":tone==="warn"?"border-[#f1e1bc] bg-[#fffaf0]":"border-[#ece9f0] bg-white/85";return <div className={`rounded-[20px] border p-4 shadow-[0_8px_28px_rgba(49,38,74,.035)] ${cls}`}><p className="text-[10px] font-semibold uppercase tracking-[.11em] text-[#9b97a5]">{label}</p><p className="mt-3 text-[22px] font-semibold tracking-[-.035em] text-[#292734]">{value}</p><p className="mt-1 text-[10px] text-[#9d99a6]">{sub}</p></div>}
function Panel({title,subtitle,children}:{title:string;subtitle?:string;children:ReactNode}){return <section className="rounded-[22px] border border-[#ece9f0] bg-white/85 p-5 shadow-[0_12px_36px_rgba(49,38,74,.04)]"><div className="mb-4"><h2 className="text-[16px] font-semibold tracking-[-.02em] text-[#2d2b37]">{title}</h2>{subtitle?<p className="mt-1 text-[11px] text-[#9995a2]">{subtitle}</p>:null}</div>{children}</section>}
function Mini({label,value}:{label:string;value:string}){return <div className="rounded-[15px] border border-[#efedf2] bg-[#faf9fc] p-3"><p className="text-[9px] uppercase tracking-[.1em] text-[#aaa6b2]">{label}</p><p className="mt-2 text-[16px] font-semibold text-[#373540]">{value}</p></div>}
function Empty({text}:{text:string}){return <div className="rounded-[14px] border border-dashed border-[#e6e2ea] px-4 py-7 text-center text-[11px] text-[#aaa6b2]">{text}</div>}
function money(v:unknown,currency="TRY"){const n=Number(v??0);return new Intl.NumberFormat("tr-TR",{style:"currency",currency,maximumFractionDigits:0}).format(Number.isFinite(n)?n:0)}
function signedMoney(v:unknown,currency="TRY"){if(v==null)return "—";const n=Number(v);if(!Number.isFinite(n))return "—";return `${n>0?"+":""}${money(n,currency)}`}
function varianceTone(v?:number|null):"default"|"good"|"warn"{if(v==null)return "default";return Math.abs(v)<1?"good":"warn"}
function percent(a?:number,b?:number){if(!b)return "—";return `%${new Intl.NumberFormat("tr-TR",{maximumFractionDigits:1}).format(((a??0)/b)*100)}`}
function dateTime(v?:string|null){if(!v)return "—";return new Intl.DateTimeFormat("tr-TR",{dateStyle:"medium",timeStyle:"short"}).format(new Date(v))}
function shortDate(v:string){return new Intl.DateTimeFormat("tr-TR",{day:"2-digit",month:"short"}).format(new Date(v))}
