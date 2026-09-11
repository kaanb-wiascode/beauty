"use client";

import { useEffect, useMemo, useState } from "react";
import { api, ApiError, withQuery } from "@/lib/api";
import { Alert, Button, GlassCard, Spinner } from "@/components/ui";

type Dashboard = {
  period:{year:number;month:number};
  totals:{employeeCount:number;gross:number|string;net:number|string;employerCost:number|string;tax:number|string;social:number|string;other:number|string};
  settlements:{salaryPaid:number|string;salaryRemaining:number;taxPaid:number|string;taxRemaining:number;socialPaid:number|string;socialRemaining:number;otherPaid:number|string;otherRemaining:number};
  costCenters:Array<{costCenterId:string|null;code:string;name:string;amount:number|string;employeeCount:number}>;
  periods:Array<{id:string;year:number;month:number;status:string;branchId:string|null;branchName:string|null;approvedAt:string|null;postedAt:string|null;cancelledAt:string|null;reversedAt:string|null}>;
};

const money=(v:number|string|undefined)=>new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY",maximumFractionDigits:2}).format(Number(v??0));
const statusLabel=(s:string)=>({DRAFT:"Taslak",SUBMITTED:"Onay Bekliyor",APPROVED:"Onaylandı",POSTED:"Muhasebeleşti",CANCELLED:"İptal",REVERSED:"Ters Kayıt"}[s]??s);

export default function PayrollDashboardPage(){
  const now=new Date();
  const [year,setYear]=useState(now.getFullYear());
  const [month,setMonth]=useState(now.getMonth()+1);
  const [data,setData]=useState<Dashboard|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  const load=async()=>{setLoading(true);setError("");try{setData(await api<Dashboard>(withQuery("/hr/payroll/dashboard",{year,month})));}catch(e){setError(e instanceof ApiError?e.message:"Bordro kontrol merkezi yüklenemedi.");}finally{setLoading(false);}};
  useEffect(()=>{void load();},[year,month]);

  const employerCost=Number(data?.totals?.employerCost??0);
  const costCenters=useMemo(()=>data?.costCenters??[],[data]);

  return <div className="mx-auto max-w-[1380px] space-y-5 pb-10">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div><p className="text-[11px] uppercase tracking-[.15em] text-[var(--muted)]">İnsan Kaynakları / Bordro</p><h1 className="text-[30px] font-semibold">Bordro Kontrol Merkezi</h1><p className="text-xs text-[var(--muted)]">Tahakkuk, ödeme, yükümlülük ve maliyet merkezi dağılımını tek ekrandan izleyin.</p></div>
      <div className="flex gap-2"><input className="w-24 rounded-lg border p-2 text-xs" type="number" value={year} onChange={e=>setYear(Number(e.target.value))}/><select className="rounded-lg border p-2 text-xs" value={month} onChange={e=>setMonth(Number(e.target.value))}>{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1}. Ay</option>)}</select><Button variant="secondary" onClick={()=>void load()}>Yenile</Button></div>
    </div>
    {error&&<Alert onClose={()=>setError("")}>{error}</Alert>}
    {loading?<GlassCard className="flex h-64 items-center justify-center"><Spinner/></GlassCard>:<>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric title="İşveren Maliyeti" value={money(data?.totals.employerCost)} sub={`${Number(data?.totals.employeeCount??0)} çalışan`}/>
        <Metric title="Net Ücret" value={money(data?.totals.net)} sub={`Ödenen ${money(data?.settlements.salaryPaid)}`}/>
        <Metric title="Kalan Maaş Borcu" value={money(data?.settlements.salaryRemaining)} sub="335 Personele Borçlar"/>
        <Metric title="Vergi + SGK Kalan" value={money(Number(data?.settlements.taxRemaining??0)+Number(data?.settlements.socialRemaining??0)+Number(data?.settlements.otherRemaining??0))} sub="360 / 361 / 369"/>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
        <GlassCard><div className="mb-4"><h2 className="text-sm font-semibold">Yükümlülük Durumu</h2><p className="text-[10px] text-[var(--muted)]">Bordro tahakkuku ile gerçekleşen ödeme karşılaştırması.</p></div><div className="space-y-4">
          <Liability label="Maaş" due={Number(data?.totals.net??0)} paid={Number(data?.settlements.salaryPaid??0)} remaining={Number(data?.settlements.salaryRemaining??0)}/>
          <Liability label="Vergi" due={Number(data?.totals.tax??0)} paid={Number(data?.settlements.taxPaid??0)} remaining={Number(data?.settlements.taxRemaining??0)}/>
          <Liability label="SGK / İşsizlik" due={Number(data?.totals.social??0)} paid={Number(data?.settlements.socialPaid??0)} remaining={Number(data?.settlements.socialRemaining??0)}/>
          <Liability label="Diğer" due={Number(data?.totals.other??0)} paid={Number(data?.settlements.otherPaid??0)} remaining={Number(data?.settlements.otherRemaining??0)}/>
        </div></GlassCard>

        <GlassCard><div className="mb-4"><h2 className="text-sm font-semibold">Maliyet Merkezi Dağılımı</h2><p className="text-[10px] text-[var(--muted)]">İşveren maliyetinin cost-center kırılımı.</p></div><div className="space-y-3">{costCenters.map(c=>{const amount=Number(c.amount??0);const pct=employerCost>0?Math.round((amount/employerCost)*1000)/10:0;return <div key={c.costCenterId??"unallocated"} className="rounded-xl border p-3"><div className="flex items-center justify-between"><div><div className="text-xs font-semibold">{c.code} · {c.name}</div><div className="mt-1 text-[10px] text-[var(--muted)]">{c.employeeCount} çalışan · %{pct}</div></div><div className="text-xs font-semibold">{money(amount)}</div></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#eeeaf8]"><div className="h-full rounded-full bg-[#7657e8]" style={{width:`${Math.min(100,pct)}%`}}/></div></div>})}{costCenters.length===0&&<p className="text-xs text-[var(--muted)]">Bu dönem için maliyet merkezi dağılımı yok.</p>}</div></GlassCard>
      </div>

      <GlassCard className="!overflow-hidden !p-0"><div className="border-b p-5"><h2 className="text-sm font-semibold">Son Bordro Dönemleri</h2><p className="mt-1 text-[10px] text-[var(--muted)]">Lifecycle ve muhasebeleştirme görünümü.</p></div><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b bg-[#faf9fc]"><th className="p-4">Dönem</th><th className="p-4">Şube</th><th className="p-4">Durum</th><th className="p-4">Onay</th><th className="p-4">Muhasebe</th><th className="p-4">İptal / Ters</th></tr></thead><tbody>{(data?.periods??[]).map(p=><tr key={p.id} className="border-b last:border-0"><td className="p-4 font-medium">{p.year}/{String(p.month).padStart(2,"0")}</td><td className="p-4">{p.branchName??"Şirket Geneli"}</td><td className="p-4"><span className="rounded-full bg-[#f1edff] px-2 py-1 text-[10px] font-semibold text-[#7657e8]">{statusLabel(p.status)}</span></td><td className="p-4">{p.approvedAt?new Date(p.approvedAt).toLocaleString("tr-TR"):"—"}</td><td className="p-4">{p.postedAt?new Date(p.postedAt).toLocaleString("tr-TR"):"—"}</td><td className="p-4">{p.reversedAt?`Ters: ${new Date(p.reversedAt).toLocaleString("tr-TR")}`:p.cancelledAt?`İptal: ${new Date(p.cancelledAt).toLocaleString("tr-TR")}`:"—"}</td></tr>)}</tbody></table>{(data?.periods??[]).length===0&&<div className="p-10 text-center text-xs text-[var(--muted)]">Bordro dönemi bulunamadı.</div>}</div></GlassCard>
    </>}
  </div>;
}

function Metric({title,value,sub}:{title:string;value:string;sub:string}){return <GlassCard><p className="text-[10px] uppercase tracking-[.12em] text-[var(--muted)]">{title}</p><div className="mt-2 text-2xl font-semibold">{value}</div><p className="mt-2 text-[10px] text-[var(--muted)]">{sub}</p></GlassCard>}
function Liability({label,due,paid,remaining}:{label:string;due:number;paid:number;remaining:number}){const pct=due>0?Math.min(100,Math.round((paid/due)*1000)/10):0;return <div><div className="flex items-center justify-between text-xs"><span className="font-medium">{label}</span><span>{money(paid)} / {money(due)}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[#eeeaf8]"><div className="h-full rounded-full bg-[#7657e8]" style={{width:`${pct}%`}}/></div><div className="mt-1 text-right text-[10px] text-[var(--muted)]">Kalan {money(remaining)}</div></div>}
