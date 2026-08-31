"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, ApiError, withQuery } from "@/lib/api";
import { GlassCard, Button, Alert, Spinner } from "@/components/ui";
import type { Paginated, Staff } from "@/lib/types";
import { useParams } from "next/navigation";

type Section = "employees" | "personnel-files" | "attendance" | "leaves" | "payroll" | "payments" | "sgk";

const meta: Record<Section, { title: string; subtitle: string }> = {
  employees: { title: "Çalışanlar", subtitle: "Mevcut personel kayıtlarını İK süreçlerine bağlayın." },
  "personnel-files": { title: "Özlük Dosyaları", subtitle: "Personelin özlük bilgileri ve belge durumunu tek ekranda yönetin." },
  attendance: { title: "Puantaj & Giriş Çıkış", subtitle: "Çalışma, giriş-çıkış, eksik gün ve fazla mesai kayıtlarını yönetin." },
  leaves: { title: "İzin Yönetimi", subtitle: "Yıllık izin ve diğer izin kayıtlarını çalışan bazında takip edin." },
  payroll: { title: "Bordro", subtitle: "Dönem bazlı bordro hesaplama ve bordro çıktılarının merkezi ekranı." },
  payments: { title: "Maaş Ödemeleri", subtitle: "Hazırlanan bordrolardan banka ödeme listesini ve ödeme durumunu yönetin." },
  sgk: { title: "SGK İşlemleri", subtitle: "İşe giriş, işten ayrılış ve aylık SGK süreçleri için kontrol merkezi." },
};

function Card({ title, value, note }: { title: string; value: string | number; note: string }) {
  return <GlassCard className="!rounded-[16px] !p-4"><p className="text-[11px] text-[var(--muted)]">{title}</p><strong className="mt-1 block text-[25px] font-semibold tracking-[-.04em]">{value}</strong><p className="mt-1 text-[10px] text-[var(--muted)]">{note}</p></GlassCard>;
}

function money(value: number) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(value);
}

export default function HRSectionPage() {
  const params = useParams<{ section: string }>();
  const section = params.section as Section;
  const info = meta[section];
  const [staff, setStaff] = useState<Staff[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!info) return;
    let cancelled = false;
    async function load() {
      setLoading(true); setError("");
      try {
        const staffResult = await api<Paginated<Staff>>(withQuery("/staff", { page: 1, limit: 100 }));
        if (cancelled) return;
        setStaff(staffResult.data ?? []);
        if (section === "attendance") setRows((await api<any>("/hr/attendance")).data ?? []);
        else if (section === "leaves") setRows((await api<any>("/hr/leaves")).data ?? []);
        else if (section === "payroll") setRows((await api<any>("/hr/payroll")).data ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "İK verileri yüklenemedi.");
      } finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [section, info]);

  const active = useMemo(() => staff.filter(s => s.status === "ACTIVE"), [staff]);
  if (!info) return <GlassCard><h1 className="text-xl font-semibold">İK sayfası bulunamadı</h1><Link className="mt-4 inline-block text-sm underline" href="/hr">İK Dashboard'a dön</Link></GlassCard>;

  return <div className="mx-auto max-w-[1280px] space-y-5 pb-8">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><Link href="/hr" className="text-[11px] font-medium text-[#7657e8]">← İK Dashboard</Link><h1 className="mt-2 text-[30px] font-semibold tracking-[-.05em]">{info.title}</h1><p className="mt-1 text-[13px] text-[var(--muted)]">{info.subtitle}</p></div>
      {section === "employees" && <Link href="/staff"><Button>Personel Yönetimine Git</Button></Link>}
    </div>
    {error && <Alert onClose={() => setError("")}>{error}</Alert>}
    {loading ? <GlassCard className="flex min-h-[300px] items-center justify-center"><Spinner /></GlassCard> : <>
      {(section === "employees" || section === "personnel-files") && <>
        <div className="grid gap-3 sm:grid-cols-3"><Card title="Toplam çalışan" value={staff.length} note="Mevcut personel kaynağı"/><Card title="Aktif" value={active.length} note="Çalışan hesabı aktif"/><Card title="Özlük dosyası" value={active.length} note="Personel kaydıyla eşleşir"/></div>
        <GlassCard className="!p-0 !overflow-hidden"><div className="border-b border-[var(--line)] p-5"><h2 className="text-sm font-semibold">Personel listesi</h2></div><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b border-[var(--line)] text-[var(--muted)]"><th className="p-4">Çalışan</th><th className="p-4">Durum</th><th className="p-4">İK kaydı</th></tr></thead><tbody>{staff.map(s => <tr key={s.id} className="border-b border-[var(--line)] last:border-0"><td className="p-4 font-medium">{s.firstName} {s.lastName}</td><td className="p-4">{s.status === "ACTIVE" ? "Aktif" : "Pasif"}</td><td className="p-4">{section === "personnel-files" ? "Özlük dosyası bağlı" : "Personel kaydı bağlı"}</td></tr>)}</tbody></table></div></GlassCard>
      </>}
      {section === "attendance" && <><div className="grid gap-3 sm:grid-cols-4"><Card title="Aktif çalışan" value={active.length} note="Personel kaynağı"/><Card title="Bugün" value="—" note="Giriş/çıkış kayıtları"/><Card title="Eksik gün" value="—" note="Puantaj kontrolü"/><Card title="Fazla mesai" value="—" note="Saat bazlı hesap"/></div><GlassCard><h2 className="text-sm font-semibold">Puantaj kayıtları</h2><p className="mt-2 text-xs text-[var(--muted)]">API bağlantısı aktif. Henüz kayıt dönmüyorsa giriş-çıkış verisi oluşturulması gerekir.</p><pre className="mt-4 max-h-72 overflow-auto rounded-xl bg-[#f7f6fa] p-4 text-[11px]">{JSON.stringify(rows, null, 2)}</pre></GlassCard></>}
      {section === "leaves" && <><div className="grid gap-3 sm:grid-cols-4"><Card title="Çalışan" value={active.length} note="Aktif personel"/><Card title="Yıllık izin" value="—" note="Kullanılan gün"/><Card title="Kalan izin" value="—" note="Hakediş üzerinden"/><Card title="Bekleyen" value={rows.length} note="İzin talepleri"/></div><GlassCard><h2 className="text-sm font-semibold">İzin kayıtları</h2><pre className="mt-4 max-h-72 overflow-auto rounded-xl bg-[#f7f6fa] p-4 text-[11px]">{JSON.stringify(rows, null, 2)}</pre></GlassCard></>}
      {section === "payroll" && <><div className="grid gap-3 sm:grid-cols-4"><Card title="Bordro dönemi" value="—" note="Dönem seçimi"/><Card title="Çalışan" value={active.length} note="Hesaplanacak personel"/><Card title="Net toplam" value="—" note="Bordro hesaplandığında"/><Card title="İşveren maliyeti" value="—" note="SGK + vergi + ücret"/></div><GlassCard><h2 className="text-sm font-semibold">Bordro hesaplama merkezi</h2><p className="mt-2 text-xs leading-5 text-[var(--muted)]">Bu ekran mevcut HR payroll endpointine bağlıdır. Türkiye mevzuatına göre gerçek bordro hesabı için ücret, çalışma günü, eksik gün, prim, fazla mesai, SGK ve vergi parametrelerinin çalışan sözleşmesiyle tanımlanması gerekir.</p><pre className="mt-4 max-h-72 overflow-auto rounded-xl bg-[#f7f6fa] p-4 text-[11px]">{JSON.stringify(rows, null, 2)}</pre></GlassCard></>}
      {section === "payments" && <><div className="grid gap-3 sm:grid-cols-4"><Card title="Ödeme listesi" value={active.length} note="Aktif çalışan"/><Card title="Toplam net" value={money(0)} note="Bordrodan üretilecek"/><Card title="Bekleyen" value="—" note="Banka ödeme durumu"/><Card title="Ödenen" value="—" note="Mutabakat"/></div><GlassCard><h2 className="text-sm font-semibold">Maaş ödeme listesi</h2><p className="mt-2 text-xs text-[var(--muted)]">Ödeme listesi bordro döneminden üretilecek; banka dosyası ve ödeme durumu ayrıca tutulmalıdır.</p><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b border-[var(--line)]"><th className="p-3">Çalışan</th><th className="p-3">Banka</th><th className="p-3">IBAN</th><th className="p-3">Net</th><th className="p-3">Durum</th></tr></thead><tbody>{active.map(s => <tr key={s.id} className="border-b border-[var(--line)]"><td className="p-3">{s.firstName} {s.lastName}</td><td className="p-3">—</td><td className="p-3">—</td><td className="p-3">—</td><td className="p-3">Hazırlanacak</td></tr>)}</tbody></table></div></GlassCard></>}
      {section === "sgk" && <><div className="grid gap-3 sm:grid-cols-4"><Card title="Aktif sigortalı" value={active.length} note="Personel kaydından"/><Card title="İşe giriş" value="—" note="Bildirim bekleyen"/><Card title="İşten ayrılış" value="—" note="Bildirim bekleyen"/><Card title="Aylık dönem" value="—" note="SGK bildirgesi"/></div><GlassCard><h2 className="text-sm font-semibold">SGK işlem merkezi</h2><p className="mt-2 text-xs leading-5 text-[var(--muted)]">İşe giriş/çıkış ve aylık bildirge kayıtları çalışan özlük kaydıyla ilişkilendirilecek. e-SGK gönderimi için ayrıca yetkili kullanıcı ve resmi entegrasyon bilgileri gerekir.</p></GlassCard></>}
    </>}
  </div>;
}
