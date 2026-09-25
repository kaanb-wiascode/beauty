"use client";

import { CardInfo } from "@/components/card-info";
import { getCardHelp } from "@/lib/card-help";
import { useEffect, useState } from "react";
import { Alert, GlassCard, PageHeader, Panel, Spinner, TableWrap, Td, Th } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { ReportFilterBar, reportDateInputValue, reportRangeIsInvalid, reportRangeToQuery, type ReportDateRange } from "../report-filter-bar";
import { fetchReportPreview, type TableReportPreview } from "../report-preview-client";

type Row={periodDate:string;status:string;employeeCount:number;gross:number;net:number;employerCost:number;salaryPaid:number;salaryRemaining:number;taxLiability:number;socialLiability:number;payrollSettlementRate:number};
type Summary={rowCount:number;employeeCount:number;gross:number;net:number;employerCost:number;salaryPaid:number;salaryRemaining:number;taxLiability:number;socialLiability:number;payrollSettlementRate:number};
const COLUMNS=["periodDate","status","employeeCount","gross","net","employerCost","salaryPaid","salaryRemaining","taxLiability","socialLiability","payrollSettlementRate"] as const;
const LABELS:Record<(typeof COLUMNS)[number],string>={periodDate:"Dönem",status:"Durum",employeeCount:"Çalışan",gross:"Brüt",net:"Net",employerCost:"İşveren Maliyeti",salaryPaid:"Ödenen",salaryRemaining:"Kalan",taxLiability:"Vergi",socialLiability:"SGK",payrollSettlementRate:"Ödeme %"};
const EMPTY:Summary={rowCount:0,employeeCount:0,gross:0,net:0,employerCost:0,salaryPaid:0,salaryRemaining:0,taxLiability:0,socialLiability:0,payrollSettlementRate:0};
const money=(v:number)=>new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY",maximumFractionDigits:0}).format(v);
export default function PayrollReportPage(){const[range,setRange]=useState<ReportDateRange>(()=>{const t=reportDateInputValue(new Date());return{from:t,to:t}});const[rows,setRows]=useState<Row[]>([]);const[summary,setSummary]=useState<Summary>(EMPTY);const[loading,setLoading]=useState(true);const[error,setError]=useState("");useEffect(()=>{if(reportRangeIsInvalid(range)){setError("Başlangıç tarihi bitiş tarihinden sonra olamaz.");setLoading(false);return}let cancelled=false;(async()=>{setLoading(true);setError("");try{const result=await fetchReportPreview<TableReportPreview<Row,Summary>>({reportKey:"payroll.summary",filters:reportRangeToQuery(range),columns:COLUMNS,sort:{key:"periodDate",direction:"desc"},page:1,limit:100});if(!cancelled){setRows(result.data);setSummary(result.meta.summary)}}catch(err){if(!cancelled)setError(err instanceof ApiError?err.message:"Bordro raporu yüklenemedi.")}finally{if(!cancelled)setLoading(false)}})();return()=>{cancelled=true}},[range]);return <div className="mx-auto max-w-6xl space-y-5"><PageHeader title="Bordro Raporları" description="Brüt/net ücret, işveren maliyeti ve ödeme kapanışını yalnız hr_sensitive yetkili kullanıcılar için gösterir."/>{error?<Alert onClose={()=>setError("")}>{error}</Alert>:null}<ReportFilterBar from={range.from} to={range.to} onChange={setRange}/>{loading?<Spinner label="Bordro raporu hazırlanıyor..."/>:<><section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Net Bordro" value={money(summary.net)} detail={`${summary.employeeCount} çalışan kaydı`}/><Metric label="İşveren Maliyeti" value={money(summary.employerCost)} detail="Toplam maliyet"/><Metric label="Ödenen Maaş" value={money(summary.salaryPaid)} detail={`%${summary.payrollSettlementRate} kapanış`}/><Metric label="Kalan Maaş" value={money(summary.salaryRemaining)} detail="Henüz ödenmemiş"/></section><Panel><TableWrap><thead><tr>{COLUMNS.map(c=><Th key={c}>{LABELS[c]}</Th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={`${r.periodDate}-${i}`}>{COLUMNS.map(c=><Td key={c} label={LABELS[c]}>{["gross","net","employerCost","salaryPaid","salaryRemaining","taxLiability","socialLiability"].includes(c)?money(Number(r[c])):c==="payrollSettlementRate"?`%${r[c]}`:String(r[c])}</Td>)}</tr>)}</tbody></TableWrap></Panel></>}</div>}
function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <GlassCard>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] text-[var(--muted)]">{label}</p>
        <CardInfo help={getCardHelp(label, detail)} />
      </div>
      <p className="mt-1.5 text-[24px] font-semibold text-[var(--ink)]">{value}</p>
      <p className="mt-1 text-[10px] text-[var(--muted-soft)]">{detail}</p>
    </GlassCard>
  );
}
