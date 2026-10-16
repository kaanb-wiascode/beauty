"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, Button, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
type Ledger=Record<string,unknown>;
function rows(value:unknown):Array<Record<string,unknown>>{if(Array.isArray(value))return value.filter((x):x is Record<string,unknown>=>Boolean(x)&&typeof x==="object");if(value&&typeof value==="object"){const r=value as Record<string,unknown>;for(const k of ["entries","items","transactions","data","rows"]){if(Array.isArray(r[k]))return (r[k] as unknown[]).filter((x):x is Record<string,unknown>=>Boolean(x)&&typeof x==="object")}return[r]}return[]}
export default function CustomerLedgerPage({params}:{params:Promise<{id:string}>}){
 const[data,setData]=useState<Ledger|null>(null),[customerId,setCustomerId]=useState(""),[loading,setLoading]=useState(true),[error,setError]=useState("");
 useEffect(()=>{void(async()=>{try{const{id}=await params;setCustomerId(id);setData(await api<Ledger>(`/customer-ledger/${id}`))}catch(e){setError(e instanceof ApiError?e.message:"Müşteri cari ekstresi yüklenemedi.")}finally{setLoading(false)}})()},[params]);
 if(loading)return <Spinner label="Cari ekstre yükleniyor..."/>;
 const list=rows(data),keys=list.length?[...new Set(list.slice(0,10).flatMap(x=>Object.keys(x)))].filter(k=>typeof list[0]?.[k]!=="object").slice(0,9):[];
 return <div className="mx-auto max-w-[1300px] space-y-6 pb-12"><PageHeader title="Müşteri Cari Ekstresi" description="Müşterinin satış, ödeme, iade ve bakiye hareketlerini tek finansal görünümde izleyin." action={<Link href={`/customers/${customerId}`}><Button variant="secondary">Müşteri Dosyasına Dön</Button></Link>}/>
 {error?<Alert>{error}</Alert>:null}
 {list.length?<section className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)]"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead><tr className="border-b border-[var(--line)] bg-[var(--surface-2)]/40">{keys.map(k=><th key={k} className="px-4 py-3">{k.replace(/([a-z])([A-Z])/g,"$1 $2")}</th>)}</tr></thead><tbody>{list.map((row,i)=><tr key={String(row.id??i)} className="border-b border-[var(--line)] last:border-0">{keys.map(k=><td key={k} className="px-4 py-4 text-[var(--muted)]">{String(row[k]??"—")}</td>)}</tr>)}</tbody></table></div></section>:<EmptyState title="Cari hareket bulunamadı" description="Bu müşteri için henüz finansal hareket yok."/>}
 </div>
}
