"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DatePicker } from "@/components/date-picker";
import { Alert, Button, EmptyState, Field, Modal, Spinner, TextArea, TextInput } from "@/components/ui";
import { ValooSelect } from "@/components/valoo-controls";
import { api, apiFormData, apiResponse, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import { userErrorMessage, userLabel } from "@/lib/user-language";

type DocumentRow={id:string;documentType:string;documentNumber?:string|null;title:string;issuedAt?:string|null;expiresAt?:string|null;status:string;fileName?:string|null;mimeType?:string|null;fileSize?:string|null;version:number;restricted:boolean;verificationNote?:string|null;createdAt?:string};
type FormState={documentType:string;documentNumber:string;title:string;issuedAt:string;expiresAt:string;restricted:boolean;notes:string};
const EMPTY:FormState={documentType:"",documentNumber:"",title:"",issuedAt:"",expiresAt:"",restricted:true,notes:""};
const date=(v?:string|null)=>v?new Date(v).toLocaleDateString("tr-TR"):"—";
const daysLeft=(v?:string|null)=>v?Math.ceil((new Date(v).getTime()-Date.now())/86400000):null;
const fileSize=(v?:string|null)=>{const n=Number(v??0);if(!n)return "";if(n<1024*1024)return `${Math.round(n/1024)} KB`;return `${(n/1024/1024).toFixed(1)} MB`};

const DOCUMENT_TYPES=[
  {value:"IDENTITY",label:"Kimlik Belgesi"},
  {value:"EMPLOYMENT_CONTRACT",label:"İş Sözleşmesi"},
  {value:"DIPLOMA",label:"Diploma / Mezuniyet"},
  {value:"CERTIFICATE",label:"Sertifika"},
  {value:"HEALTH_REPORT",label:"Sağlık Raporu"},
  {value:"CRIMINAL_RECORD",label:"Adli Sicil Belgesi"},
  {value:"ADDRESS",label:"İkamet / Adres Belgesi"},
  {value:"PAYROLL",label:"Bordro / Ücret Belgesi"},
  {value:"OTHER",label:"Diğer"},
];

export default function EmployeeDocumentsPage(){
  const{id}=useParams<{id:string}>();
  const[rows,setRows]=useState<DocumentRow[]>([]);
  const[loading,setLoading]=useState(true);
  const[saving,setSaving]=useState(false);
  const[error,setError]=useState("");
  const[notice,setNotice]=useState("");
  const[uploadOpen,setUploadOpen]=useState(false);
  const[form,setForm]=useState<FormState>(EMPTY);
  const[file,setFile]=useState<File|null>(null);
  const canSensitive=hasPermission("hr_sensitive","read");
  const canManage=hasPermission("hr","manage")&&canSensitive;

  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try{
      const path=canSensitive?`/hr/employees/${id}/documents/sensitive`:`/hr/employees/${id}/documents`;
      setRows(await api<DocumentRow[]>(path));
    }catch(e){
      setError(e instanceof ApiError?userErrorMessage(e.message,"Personel belgeleri yüklenemedi."):"Personel belgeleri yüklenemedi.");
    }finally{setLoading(false)}
  },[canSensitive,id]);

  useEffect(()=>{void load()},[load]);

  const summary=useMemo(()=>({
    total:rows.length,
    pending:rows.filter(x=>x.status==="PENDING").length,
    verified:rows.filter(x=>x.status==="VERIFIED").length,
    expiring:rows.filter(x=>{const left=daysLeft(x.expiresAt);return left!==null&&left>=0&&left<=30}).length,
  }),[rows]);

  async function upload(){
    if(!canManage)return;
    if(!file){setError("Yüklenecek dosyayı seçin.");return}
    if(!form.documentType){setError("Belge türünü seçin.");return}
    if(!form.title.trim()){setError("Belge başlığı zorunludur.");return}
    setSaving(true);setError("");setNotice("");
    try{
      const data=new FormData();
      data.append("file",file);
      data.append("documentType",form.documentType);
      data.append("title",form.title.trim());
      if(form.documentNumber.trim())data.append("documentNumber",form.documentNumber.trim());
      if(form.issuedAt)data.append("issuedAt",form.issuedAt);
      if(form.expiresAt)data.append("expiresAt",form.expiresAt);
      data.append("restricted",String(form.restricted));
      if(form.notes.trim())data.append("notes",form.notes.trim());
      await apiFormData(`/hr/employees/${id}/documents/upload`,data);
      setUploadOpen(false);setForm(EMPTY);setFile(null);setNotice("Belge başarıyla yüklendi.");await load();
    }catch(e){
      setError(e instanceof ApiError?userErrorMessage(e.message,"Belge yüklenemedi."):"Belge yüklenemedi.");
    }finally{setSaving(false)}
  }

  async function download(row:DocumentRow){
    try{
      const response=await apiResponse(`/hr/employees/${id}/documents/${row.id}/download`);
      if(!response.ok)throw new ApiError("Belge indirilemedi.",response.status);
      const blob=await response.blob();
      const url=URL.createObjectURL(blob);
      const anchor=document.createElement("a");
      anchor.href=url;anchor.download=row.fileName||row.title||"belge";document.body.appendChild(anchor);anchor.click();anchor.remove();
      URL.revokeObjectURL(url);
    }catch(e){setError(e instanceof ApiError?userErrorMessage(e.message,"Belge indirilemedi."):"Belge indirilemedi.")}
  }

  async function verify(row:DocumentRow,status:"VERIFIED"|"REJECTED"){
    let note="";
    if(status==="REJECTED"){note=window.prompt("Belgenin reddedilme gerekçesini yazın.")?.trim()||"";if(!note)return}
    try{
      await api(`/hr/employees/${id}/documents/${row.id}/verify`,{method:"PATCH",body:{status,note:note||undefined}});
      setNotice(status==="VERIFIED"?"Belge doğrulandı.":"Belge reddedildi.");await load();
    }catch(e){setError(e instanceof ApiError?userErrorMessage(e.message,"Belge doğrulanamadı."):"Belge doğrulanamadı.")}
  }

  async function archive(row:DocumentRow){
    if(!window.confirm(`${row.title} arşivlensin mi?`))return;
    try{await api(`/hr/employees/${id}/documents/${row.id}/archive`,{method:"POST"});setNotice("Belge arşivlendi.");await load()}
    catch(e){setError(e instanceof ApiError?userErrorMessage(e.message,"Belge arşivlenemedi."):"Belge arşivlenemedi.")}
  }

  return <div className="mx-auto max-w-[1320px] space-y-6 pb-12">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <Link href={`/hr/employees/${id}`} className="text-xs font-semibold text-[var(--accent)]">← Personel 360°</Link>
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[.15em] text-[var(--muted-soft)]">Özlük · Belge ve Uyum</p>
        <h1 className="mt-1 text-[30px] font-semibold tracking-[-.035em]">Personel Belgeleri</h1>
        <p className="mt-1 text-xs text-[var(--muted)]">Belgeleri yükleyin, sürümlerini takip edin ve doğrulama süreçlerini yönetin.</p>
      </div>
      {canManage?<Button onClick={()=>setUploadOpen(true)}>+ Belge Yükle</Button>:null}
    </header>

    {error?<Alert onClose={()=>setError("")}>{error}</Alert>:null}
    {notice?<Alert tone="success" onClose={()=>setNotice("")}>{notice}</Alert>:null}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Toplam Belge" value={summary.total}/>
      <Metric label="Doğrulanan" value={summary.verified}/>
      <Metric label="Bekleyen" value={summary.pending}/>
      <Metric label="30 Gün İçinde Dolacak" value={summary.expiring}/>
    </section>

    <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--surface)]">
      <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
        <div><h2 className="text-sm font-semibold">Belge Envanteri</h2><p className="mt-1 text-[11px] text-[var(--muted)]">Yüklenen dosyalar ve doğrulama durumları.</p></div>
        <span className="text-xs text-[var(--muted)]">{rows.length} kayıt</span>
      </div>
      {loading?<div className="flex h-48 items-center justify-center"><Spinner/></div>:rows.length?
        <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-xs">
          <thead><tr className="border-b border-[var(--line)] bg-[var(--surface-2)]/45 text-[10px] uppercase tracking-[.08em] text-[var(--muted-soft)]"><th className="p-4">Belge</th><th className="p-4">Dosya</th><th className="p-4">Sürüm</th><th className="p-4">Durum</th><th className="p-4">Geçerlilik</th><th className="p-4">Erişim</th><th className="p-4 text-right">İşlemler</th></tr></thead>
          <tbody>{rows.map(r=>{const left=daysLeft(r.expiresAt);return <tr key={r.id} className="border-b border-[var(--line)] last:border-0">
            <td className="p-4"><strong>{r.title}</strong><p className="mt-1 text-[10px] text-[var(--muted)]">{userLabel(r.documentType)}{r.documentNumber?` · ${r.documentNumber}`:""}</p></td>
            <td className="p-4 text-[var(--muted)]">{r.fileName?<><span className="font-medium text-[var(--ink)]">{r.fileName}</span>{r.fileSize?<p className="mt-1 text-[10px]">{fileSize(r.fileSize)}</p>:null}</>:"Dosya eklenmemiş"}</td>
            <td className="p-4">Sürüm {r.version}</td>
            <td className="p-4"><span className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[10px] font-semibold">{userLabel(r.status)}</span>{r.verificationNote?<p className="mt-2 max-w-52 text-[10px] text-[var(--muted)]">{r.verificationNote}</p>:null}</td>
            <td className="p-4">{date(r.expiresAt)}<p className={`mt-1 text-[10px] ${left!==null&&left<=30?"text-[var(--danger)]":"text-[var(--muted)]"}`}>{left===null?"Süresiz":left<0?`${Math.abs(left)} gün önce doldu`:`${left} gün kaldı`}</p></td>
            <td className="p-4 text-[var(--muted)]">{r.restricted?"Kısıtlı":"Standart"}</td>
            <td className="p-4"><div className="flex justify-end gap-2">
              {r.fileName?<Button size="sm" variant="secondary" onClick={()=>void download(r)}>İndir</Button>:null}
              {canManage&&r.status==="PENDING"?<><Button size="sm" variant="secondary" onClick={()=>void verify(r,"VERIFIED")}>Doğrula</Button><Button size="sm" variant="secondary" onClick={()=>void verify(r,"REJECTED")}>Reddet</Button></>:null}
              {canManage&&r.status!=="ARCHIVED"?<Button size="sm" variant="ghost" onClick={()=>void archive(r)}>Arşivle</Button>:null}
            </div></td>
          </tr>})}</tbody>
        </table></div>:
        <div className="p-8"><EmptyState title="Henüz belge yok" description="Personel için ilk belgeyi bilgisayarınızdan yükleyerek başlayın." />{canManage?<div className="mt-4 flex justify-center"><Button onClick={()=>setUploadOpen(true)}>+ İlk Belgeyi Yükle</Button></div>:null}</div>}
    </section>

    {!canManage?<div className="rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)] p-4 text-xs text-[var(--muted)]">Belge ekleme, doğrulama ve arşivleme için personel belgelerini yönetme ve hassas personel verilerini görüntüleme yetkileri gerekir.</div>:null}

    <Modal open={uploadOpen} onClose={()=>{if(!saving)setUploadOpen(false)}} title="Belge Yükle" description="Bilgisayarınızdan belge seçin. Dosya adı, türü ve boyutu otomatik kaydedilir.">
      <div className="space-y-5">
        <label className="block cursor-pointer rounded-[18px] border border-dashed border-[var(--line-strong)] bg-[var(--surface-2)]/45 p-6 text-center transition hover:bg-[var(--accent-soft)]/35">
          <input className="sr-only" type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" onChange={e=>setFile(e.target.files?.[0]??null)}/>
          <span className="block text-sm font-semibold text-[var(--ink)]">{file?file.name:"Dosya seçmek için tıklayın"}</span>
          <span className="mt-1 block text-[11px] text-[var(--muted)]">{file?`${fileSize(String(file.size))} · ${file.type||"Dosya"}`:"PDF, JPG, PNG, Word veya Excel · En fazla 10 MB"}</span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Belge Türü" required><ValooSelect value={form.documentType} onChange={documentType=>setForm(x=>({...x,documentType}))} options={DOCUMENT_TYPES} placeholder="Belge türünü seçin"/></Field>
          <Field label="Belge No"><TextInput value={form.documentNumber} onChange={e=>setForm(x=>({...x,documentNumber:e.target.value}))}/></Field>
        </div>
        <Field label="Belge Başlığı" required><TextInput value={form.title} placeholder="Örn. Kimlik Kartı" onChange={e=>setForm(x=>({...x,title:e.target.value}))}/></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Düzenlenme Tarihi"><DatePicker value={form.issuedAt} onChange={issuedAt=>setForm(x=>({...x,issuedAt}))} ariaLabel="Düzenlenme Tarihi"/></Field>
          <Field label="Son Geçerlilik"><DatePicker value={form.expiresAt} onChange={expiresAt=>setForm(x=>({...x,expiresAt}))} ariaLabel="Son Geçerlilik"/></Field>
        </div>
        <Field label="Not"><TextArea rows={3} value={form.notes} onChange={e=>setForm(x=>({...x,notes:e.target.value}))}/></Field>
        <label className="flex items-start gap-3 rounded-[14px] border border-[var(--line)] p-4">
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={form.restricted} onChange={e=>setForm(x=>({...x,restricted:e.target.checked}))}/>
          <span><span className="block text-xs font-semibold text-[var(--ink)]">Kısıtlı / hassas belge</span><span className="mt-1 block text-[11px] text-[var(--muted)]">Yalnız hassas personel verisi yetkisi olan kullanıcılar görüntüleyebilir.</span></span>
        </label>
        <div className="flex justify-end gap-2 border-t border-[var(--line)] pt-4">
          <Button variant="secondary" onClick={()=>setUploadOpen(false)} disabled={saving}>Vazgeç</Button>
          <Button onClick={()=>void upload()} disabled={saving||!file}>{saving?"Yükleniyor…":"Belgeyi Yükle"}</Button>
        </div>
      </div>
    </Modal>
  </div>
}

function Metric({label,value}:{label:string;value:string|number}){return <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4"><p className="text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--muted-soft)]">{label}</p><p className="mt-2 text-xl font-semibold text-[var(--ink)]">{value}</p></div>}
