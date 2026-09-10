"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { Alert, Button, Spinner } from "@/components/ui";

type TreasuryPosition = {
  accountCount:number;
  byCurrency:Record<string,{cash:number;nearCash:number;totalLiquidity:number;currentBankBalance:number;settledPos:number}>;
};
type ForecastDay = {date:string;currency:string;transactionCount:number;grossAmount:number|string;feeAmount:number|string;netAmount:number|string};
type SettlementForecast = {horizonDays:number;totals:Record<string,{grossAmount:number;feeAmount:number;netAmount:number;transactionCount:number}>;days:ForecastDay[]};
type Reconciliation = {total:number;matched:number;unmatched:number;unmatchedAmount:number|string;unmatchedBankTransactions:number;ignoredBankTransactions:number};
type BankAccount = {id:string;bankName:string;accountName:string;ibanMasked:string|null;currency:string;availableBalance:number|string|null;currentBalance:number|string|null;balanceAsOf:string|null};

export default function TreasuryCockpitPage(){
  const [position,setPosition]=useState<TreasuryPosition|null>(null);
  const [forecast,setForecast]=useState<SettlementForecast|null>(null);
  const [reconciliation,setReconciliation]=useState<Reconciliation|null>(null);
  const [accounts,setAccounts]=useState<BankAccount[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try{
      const [p,f,r,a]=await Promise.all([
        api<TreasuryPosition>("/financial-integrations/treasury-position"),
        api<SettlementForecast>("/financial-integrations/pos/settlement-forecast?days=14"),
        api<Reconciliation>("/financial-integrations/pos/reconciliation/summary"),
        api<BankAccount[]>("/financial-integrations/bank-accounts"),
      ]);
      setPosition(p);setForecast(f);setReconciliation(r);setAccounts(a);
    }catch(e){setError(e instanceof ApiError?e.message:"Treasury verileri yüklenemedi.")}
    finally{setLoading(false)}
  },[]);

  useEffect(()=>{void load()},[load]);
  const tryPosition=position?.byCurrency?.TRY;
  const forecastTry=forecast?.totals?.TRY;
  const chartDays=useMemo(()=>forecast?.days.filter(d=>d.currency==="TRY")??[],[forecast]);

  if(loading&&!position)return <div className="mx-auto max-w-[1500px] py-20"><Spinner label="Canlı treasury pozisyonu hazırlanıyor..."/></div>;

  return <div className="mx-auto max-w-[1500px] space-y-6 pb-12">
    <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[#9b97a7]">FİNANS & CFO / TREASURY</p>
        <h1 className="mt-2 text-[36px] font-semibold tracking-[-.045em] text-[#20202a]">Canlı Nakit Pozisyonu</h1>
        <p className="mt-2 max-w-3xl text-[14px] leading-6 text-[#85828e]">Gerçek banka bakiyelerini, settle olmamış POS alacaklarını, beklenen banka geçişlerini ve mutabakat durumunu tek yerde izleyin.</p>
      </div>
      <div className="flex gap-2"><Link href="/finance/cfo" className="rounded-[14px] border border-[#e9e5ef] bg-white px-4 py-2.5 text-[12px] font-semibold text-[#615d6d]">CFO Kokpitine Dön</Link><Button onClick={()=>void load()}>Verileri Yenile</Button></div>
    </header>
    {error?<Alert onClose={()=>setError("")}>{error}</Alert>:null}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Metric label="Cash" value={money(tryPosition?.cash)} sub="Kullanılabilir banka bakiyesi" tone="good"/>
      <Metric label="Near Cash" value={money(tryPosition?.nearCash)} sub="Henüz settle olmamış POS"/>
      <Metric label="Total Liquidity" value={money(tryPosition?.totalLiquidity)} sub="Cash + Near Cash" tone="good"/>
      <Metric label="14 Gün Beklenen POS" value={money(forecastTry?.netAmount)} sub={`${forecastTry?.transactionCount??0} işlem`}/>
      <Metric label="Mutabakatsız POS" value={String(reconciliation?.unmatched??0)} sub={money(reconciliation?.unmatchedAmount)} tone={(reconciliation?.unmatched??0)>0?"warn":"good"}/>
    </section>

    <section className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
      <Panel title="14 Günlük POS Settlement Forecast" subtitle="Beklenen net banka geçişleri">
        <ForecastBars days={chartDays}/>
      </Panel>
      <Panel title="Treasury Kontrol" subtitle="Canlı operasyonel finans görünümü">
        <div className="grid gap-3 sm:grid-cols-2">
          <Mini label="Banka Hesabı" value={String(position?.accountCount??0)}/>
          <Mini label="Current Bank" value={money(tryPosition?.currentBankBalance)}/>
          <Mini label="Settled POS" value={money(tryPosition?.settledPos)}/>
          <Mini label="Mutabakat Oranı" value={percent(reconciliation?.matched,reconciliation?.total)}/>
        </div>
        <div className="mt-4 rounded-[16px] border border-[#ece9f0] bg-[#faf9fc] p-4 text-[11px] leading-5 text-[#777382]">Cash yalnız kullanılabilir banka bakiyesidir. Near Cash, karttan çekilmiş ancak henüz bankaya geçmemiş POS alacaklarını ifade eder; iki değer birbirine karıştırılmaz.</div>
        <Link href="/finance/reconciliation" className="mt-4 inline-flex rounded-[13px] bg-[#7657e8] px-4 py-2.5 text-[11px] font-semibold text-white">Mutabakat Merkezine Git</Link>
      </Panel>
    </section>

    <Panel title="Banka Hesapları" subtitle="Senkronize hesapların canlı bakiye pozisyonu">
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead><tr className="border-b border-[#eeeaf2] text-[10px] uppercase tracking-[.12em] text-[#9c98a6]"><th className="px-3 py-3">Banka</th><th className="px-3 py-3">Hesap</th><th className="px-3 py-3">IBAN</th><th className="px-3 py-3">Para Birimi</th><th className="px-3 py-3">Current</th><th className="px-3 py-3">Available</th><th className="px-3 py-3">Bakiye Tarihi</th></tr></thead><tbody>{accounts.map(a=><tr key={a.id} className="border-b border-[#f3f0f5] text-[12px]"><td className="px-3 py-4 font-semibold text-[#34313e]">{a.bankName}</td><td className="px-3 py-4">{a.accountName||"—"}</td><td className="px-3 py-4 text-[#777382]">{a.ibanMasked||"—"}</td><td className="px-3 py-4">{a.currency}</td><td className="px-3 py-4">{money(a.currentBalance,a.currency)}</td><td className="px-3 py-4 font-semibold">{money(a.availableBalance,a.currency)}</td><td className="px-3 py-4 text-[#8e8997]">{dateTime(a.balanceAsOf)}</td></tr>)}</tbody></table>{!accounts.length?<Empty text="Henüz senkronize banka hesabı yok."/>:null}</div>
    </Panel>
  </div>
}

function ForecastBars({days}:{days:ForecastDay[]}){if(!days.length)return <Empty text="Beklenen settlement verisi bulunamadı."/>;const max=Math.max(1,...days.map(d=>Number(d.netAmount)));return <div className="overflow-x-auto"><div className="flex min-w-[720px] items-end gap-3 rounded-[16px] border border-[#efedf3] bg-[#fbfafe] px-4 py-4">{days.map((d,i)=><div key={`${d.date}-${i}`} className="flex min-w-[48px] flex-1 flex-col items-center gap-2"><div className="flex h-[180px] items-end"><div className="w-7 rounded-t-[8px] bg-[#7657e8]" style={{height:`${Math.max(4,(Number(d.netAmount)/max)*160)}px`}} title={money(d.netAmount)}/></div><span className="text-[9px] font-semibold text-[#918d9b]">{shortDate(d.date)}</span><span className="text-[8px] text-[#aaa6b2]">{d.transactionCount} tx</span></div>)}</div></div>}
function Metric({label,value,sub,tone="default"}:{label:string;value:string;sub:string;tone?:"default"|"good"|"warn"}){const cls=tone==="good"?"border-[#d7eadf] bg-[#f4fbf7]":tone==="warn"?"border-[#f1e1bc] bg-[#fffaf0]":"border-[#ece9f0] bg-white/85";return <div className={`rounded-[20px] border p-4 shadow-[0_8px_28px_rgba(49,38,74,.035)] ${cls}`}><p className="text-[10px] font-semibold uppercase tracking-[.11em] text-[#9b97a5]">{label}</p><p className="mt-3 text-[22px] font-semibold tracking-[-.035em] text-[#292734]">{value}</p><p className="mt-1 text-[10px] text-[#9d99a6]">{sub}</p></div>}
function Panel({title,subtitle,children}:{title:string;subtitle?:string;children:React.ReactNode}){return <section className="rounded-[22px] border border-[#ece9f0] bg-white/85 p-5 shadow-[0_12px_36px_rgba(49,38,74,.04)]"><div className="mb-4"><h2 className="text-[16px] font-semibold tracking-[-.02em] text-[#2d2b37]">{title}</h2>{subtitle?<p className="mt-1 text-[11px] text-[#9995a2]">{subtitle}</p>:null}</div>{children}</section>}
function Mini({label,value}:{label:string;value:string}){return <div className="rounded-[15px] border border-[#efedf2] bg-[#faf9fc] p-3"><p className="text-[9px] uppercase tracking-[.1em] text-[#aaa6b2]">{label}</p><p className="mt-2 text-[16px] font-semibold text-[#373540]">{value}</p></div>}
function Empty({text}:{text:string}){return <div className="rounded-[14px] border border-dashed border-[#e6e2ea] px-4 py-7 text-center text-[11px] text-[#aaa6b2]">{text}</div>}
function money(v:unknown,currency="TRY"){const n=Number(v??0);return new Intl.NumberFormat("tr-TR",{style:"currency",currency,maximumFractionDigits:0}).format(Number.isFinite(n)?n:0)}
function percent(a?:number,b?:number){if(!b)return "—";return `%${new Intl.NumberFormat("tr-TR",{maximumFractionDigits:1}).format(((a??0)/b)*100)}`}
function dateTime(v?:string|null){if(!v)return "—";return new Intl.DateTimeFormat("tr-TR",{dateStyle:"medium",timeStyle:"short"}).format(new Date(v))}
function shortDate(v:string){return new Intl.DateTimeFormat("tr-TR",{day:"2-digit",month:"short"}).format(new Date(v))}
