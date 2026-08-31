"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError, withQuery } from "@/lib/api";
import { GlassCard, Button, Alert, Spinner } from "@/components/ui";

const cfg: any = {
  employees: { title: "Çalışanlar", get: "/hr/employees", post: "/staff", fields: ["firstName","lastName","phone","email","personnelNumber","position","department","employmentType","hireDate","salary","iban","bankName"] },
  "personnel-files": { title: "Özlük Dosyaları", get: "/hr/personnel-files", fields: ["firstName","lastName","identityNumber","department","position","hireDate","salary","iban","bankName"] },
  attendance: { title: "Puantaj", get: "/hr/attendance", post: "/hr/attendance", fields: ["staffId","workDate","checkIn","checkOut","breakMinutes","workedMinutes","overtimeMinutes","status","note"] },
  leaves: { title: "İzinler", get: "/hr/leaves", post: "/hr/leaves", fields: ["staffId","type","startDate","endDate","days","status","reason"] },
  payroll: { title: "Bordro", get: "/hr/payroll", post: "/hr/payroll/periods", fields: ["year","month"] },
  payments: { title: "Maaş Ödemeleri", get: "/hr/payments", post: "/hr/payments", fields: ["staffId","year","month","amount","method","status","paidAt","note"] },
  sgk: { title: "SGK İşlemleri", get: "/hr/sgk", post: "/hr/sgk", fields: ["staffId","year","month","status","documentNo","recordDate","note"] },
};
const labels: any = { firstName:"Ad",lastName:"Soyad",phone:"Telefon",email:"E-posta",personnelNumber:"Sicil No",identityNumber:"T.C. Kimlik No",position:"Pozisyon",department:"Departman",employmentType:"Çalışma Tipi",hireDate:"İşe Giriş",salary:"Brüt Maaş",iban:"IBAN",bankName:"Banka",staffId:"Personel",workDate:"Tarih",checkIn:"Giriş",checkOut:"Çıkış",breakMinutes:"Mola dk",workedMinutes:"Çalışma dk",overtimeMinutes:"Fazla Mesai dk",status:"Durum",note:"Not",type:"İzin Türü",startDate:"Başlangıç",endDate:"Bitiş",days:"Gün",reason:"Açıklama",year:"Yıl",month:"Ay",amount:"Tutar",method:"Yöntem",paidAt:"Ödeme Tarihi",documentNo:"Belge No",recordDate:"Kayıt Tarihi" };
const dateFields = new Set(["hireDate","workDate","startDate","endDate","paidAt","recordDate"]);
const numberFields = new Set(["salary","breakMinutes","workedMinutes","overtimeMinutes","days","year","month","amount"]);
const selectValues: any = { status: ["PENDING","APPROVED","PAID","PRESENT","ABSENT","DRAFT"], type:["ANNUAL","SICK","EXCUSE","UNPAID","OTHER"], method:["BANK","CASH"] };
function display(v:any){ if(v===null||v===undefined||v==="") return "—"; if(typeof v==="string" && v.includes("T")) return new Date(v).toLocaleString("tr-TR"); return String(v); }

export default function HRSection(){
  const { section } = useParams<{section:string}>();
  const c = cfg[section];
  const now = new Date();
  const [year,setYear]=useState(now.getFullYear());
  const [month,setMonth]=useState(now.getMonth()+1);
  const [rows,setRows]=useState<any[]>([]);
  const [staff,setStaff]=useState<any[]>([]);
  const [form,setForm]=useState<any>({year:now.getFullYear(),month:now.getMonth()+1});
  const [edit,setEdit]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");

  const load=async()=>{ if(!c)return; setLoading(true); setError(""); try{
    const needsPeriod=["attendance","payroll","payments","sgk"].includes(section);
    const r=await api<any>(needsPeriod?withQuery(c.get,{year,month}):c.get);
    setRows(Array.isArray(r)?r:r?.data??[]);
    if(section!=="employees"&&section!=="personnel-files"){
      const s=await api<any>("/hr/employees"); setStaff(Array.isArray(s)?s:s?.data??[]);
    } else setStaff(Array.isArray(r)?r:r?.data??[]);
  }catch(e){setError(e instanceof ApiError?e.message:"İK verileri yüklenemedi.");}finally{setLoading(false);} };
  useEffect(()=>{void load();},[section,year,month]);

  const normalize=(raw:any)=>{const b={...raw}; if(section==="employees"){
      const profile:any={}; for(const k of ["personnelNumber","identityNumber","position","department","employmentType","hireDate","salary","iban","bankName"]){if(b[k]!==undefined&&b[k]!=="")profile[k]=numberFields.has(k)?Number(b[k]):b[k];}
      return {firstName:b.firstName,lastName:b.lastName,phone:b.phone||undefined,email:b.email||undefined,profile};
    }
    for(const k of Object.keys(b)) if(numberFields.has(k)&&b[k]!=="") b[k]=Number(b[k]);
    return b;
  };
  const save=async()=>{if(!c.post)return; setSaving(true); setError(""); try{await api(edit&&section!=="attendance"?`${c.get}/${edit.id}`:c.post,{method:edit&&section!=="attendance"?"PATCH":"POST",body:normalize(form)});setForm({year,month});setEdit(null);await load();}catch(e){setError(e instanceof ApiError?e.message:"Kayıt kaydedilemedi.");}finally{setSaving(false);}};
  const startEdit=(r:any)=>{setEdit(r);setForm({...r,year:r.year??year,month:r.month??month});window.scrollTo({top:0,behavior:"smooth"});};
  const remove=async(id:string)=>{if(!id||!confirm("Bu kayıt silinsin/arşivlensin mi?"))return;try{await api(`${c.get}/${id}`,{method:"DELETE"});await load();}catch(e){setError(e instanceof ApiError?e.message:"Silme işlemi başarısız.");}};

  if(!c)return <GlassCard>İK sayfası bulunamadı.</GlassCard>;
  const editable=["employees","attendance","leaves"].includes(section);
  return <div className="mx-auto max-w-[1280px] space-y-5 pb-10">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-[11px] uppercase tracking-[.15em] text-[var(--muted)]">İnsan Kaynakları & Özlük</p><h1 className="text-[30px] font-semibold">{c.title}</h1><p className="text-xs text-[var(--muted)]">Canlı API + veritabanı kayıt ekranı.</p></div>{["attendance","payroll","payments","sgk"].includes(section)&&<div className="flex gap-2"><input className="w-24 rounded-lg border p-2 text-xs" type="number" value={year} onChange={e=>setYear(Number(e.target.value))}/><select className="rounded-lg border p-2 text-xs" value={month} onChange={e=>setMonth(Number(e.target.value))}>{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1}. Ay</option>)}</select></div>}</div>
    {error&&<Alert onClose={()=>setError("")}>{error}</Alert>}
    {c.post&&<GlassCard><div className="mb-4 flex items-center justify-between"><div><h2 className="text-sm font-semibold">{edit?"Kaydı Güncelle":"Yeni Kayıt"}</h2><p className="text-[10px] text-[var(--muted)]">Alanları doldurun ve kaydedin.</p></div>{edit&&<button className="text-xs text-[var(--muted)]" onClick={()=>{setEdit(null);setForm({year,month});}}>Vazgeç</button>}</div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{c.fields.map((f:string)=><div key={f}><label className="mb-1 block text-[10px] text-[var(--muted)]">{labels[f]||f}</label>{f==="staffId"?<select className="w-full rounded-lg border p-2 text-xs" value={form[f]??""} onChange={e=>setForm({...form,[f]:e.target.value})}><option value="">Personel seçin</option>{staff.map(s=><option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}</select>:selectValues[f]?<select className="w-full rounded-lg border p-2 text-xs" value={form[f]??""} onChange={e=>setForm({...form,[f]:e.target.value})}><option value="">Seçin</option>{selectValues[f].map((x:string)=><option key={x} value={x}>{x}</option>)}</select>:<input className="w-full rounded-lg border p-2 text-xs" type={dateFields.has(f)?"date":numberFields.has(f)?"number":"text"} value={form[f]??""} onChange={e=>setForm({...form,[f]:e.target.value})}/>}</div>)}</div><div className="mt-4 flex gap-2"><Button onClick={save} disabled={saving}>{saving?"Kaydediliyor…":edit?"Güncelle":"Kaydet"}</Button>{edit&&<Button variant="secondary" onClick={()=>{setEdit(null);setForm({year,month});}}>İptal</Button>}</div></GlassCard>}
    {loading?<GlassCard className="flex h-56 items-center justify-center"><Spinner/></GlassCard>:<GlassCard className="!overflow-hidden !p-0"><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b bg-[#faf9fc]">{c.fields.slice(0,8).map((f:string)=><th key={f} className="p-4">{labels[f]||f}</th>)}<th className="p-4">İşlem</th></tr></thead><tbody>{rows.map((r:any)=><tr key={r.id||JSON.stringify(r)} className="border-b last:border-0">{c.fields.slice(0,8).map((f:string)=><td key={f} className="p-4">{f==="staffId"?display(r.firstName?`${r.firstName} ${r.lastName}`:r[f]):display(r[f])}</td>)}<td className="p-4"><div className="flex gap-3">{editable&&r.id&&<button className="text-[#7657e8]" onClick={()=>startEdit(r)}>Düzenle</button>}{(section==="employees"||section==="leaves")&&r.id&&<button className="text-red-500" onClick={()=>remove(r.id)}>Sil</button>}</div></td></tr>)}</tbody></table>{rows.length===0&&<div className="p-10 text-center text-xs text-[var(--muted)]">Bu dönem için kayıt bulunmuyor.</div>}</div></GlassCard>}
  </div>;
}