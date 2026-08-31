"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, ApiError, withQuery } from "@/lib/api";
import { GlassCard, Button, Alert, Spinner } from "@/components/ui";
import type { Paginated, Staff } from "@/lib/types";

type Performance = {
  id: string;
  collected: number;
  appointmentCount: number;
};

type PerformanceResponse = Performance[] | { data?: Performance[] };

type IconName = "users" | "clock" | "calendar" | "wallet" | "document" | "shield" | "plus" | "arrow";

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "users") return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7" r="3.5"/><path d="M17 3.5a3.5 3.5 0 0 1 0 7M21 21v-2a4 4 0 0 0-3-3.87"/></svg>;
  if (name === "clock") return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
  if (name === "calendar") return <svg {...common}><rect x="3" y="4.5" width="18" height="17" rx="3"/><path d="M8 2.5v4M16 2.5v4M3 9h18"/></svg>;
  if (name === "wallet") return <svg {...common}><path d="M4 5h15a2 2 0 0 1 2 2v12H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/><path d="M3 8h18M16 14h3"/></svg>;
  if (name === "document") return <svg {...common}><path d="M6 3h9l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v5h5M8 13h8M8 17h6"/></svg>;
  if (name === "shield") return <svg {...common}><path d="M12 3 20 6v5c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10V6l8-3Z"/><path d="m9 12 2 2 4-4"/></svg>;
  if (name === "plus") return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
  return <svg {...common}><path d="M5 12h13M13 7l5 5-5 5"/></svg>;
}

function money(value: number) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(value);
}

function initials(member: Staff) {
  return `${member.firstName?.[0] ?? ""}${member.lastName?.[0] ?? ""}`.toUpperCase();
}

function Metric({ label, value, note, icon, tone = "purple" }: { label: string; value: string | number; note: string; icon: IconName; tone?: "purple" | "green" | "orange" | "red" | "blue" }) {
  const tones = {
    purple: "bg-[#eee8ff] text-[#7657e8]",
    green: "bg-[#e5f7ef] text-[#23996b]",
    orange: "bg-[#fff0dc] text-[#c77b21]",
    red: "bg-[#ffe7e7] text-[#d65c64]",
    blue: "bg-[#e7f1ff] text-[#4d7edb]",
  };
  return <GlassCard className="!rounded-[18px] !p-4 sm:!p-5"><div className="flex items-start justify-between gap-3"><span className={`flex h-10 w-10 items-center justify-center rounded-[12px] ${tones[tone]}`}><Icon name={icon} size={19}/></span><span className="mt-1 h-2 w-2 rounded-full bg-[#b9b5c4]"/></div><p className="mt-4 text-[11px] text-[var(--muted)]">{label}</p><strong className="mt-1 block truncate text-[25px] font-semibold tracking-[-0.045em] text-[var(--ink)]">{value}</strong><p className="mt-1 text-[10px] text-[var(--muted)]">{note}</p></GlassCard>;
}

export default function HRDashboardPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [performance, setPerformance] = useState<Record<string, Performance>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("Genel Bakış");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const staffResult = await api<Paginated<Staff>>(withQuery("/staff", { page: 1, limit: 100 }));
      setStaff(staffResult.data ?? []);
      const from = new Date(); from.setHours(0, 0, 0, 0);
      const to = new Date(); to.setHours(23, 59, 59, 999);
      try {
        const performanceResult = await api<PerformanceResponse>(withQuery("/staff/performance", { from: from.toISOString(), to: to.toISOString() }));
        const rows = Array.isArray(performanceResult) ? performanceResult : performanceResult.data ?? [];
        const map: Record<string, Performance> = {};
        for (const row of rows) map[row.id] = row;
        setPerformance(map);
      } catch {
        setPerformance({});
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "İK verileri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const activeStaff = useMemo(() => staff.filter((item) => item.status === "ACTIVE"), [staff]);
  const archivedStaff = useMemo(() => staff.filter((item) => item.status !== "ACTIVE"), [staff]);
  const totalAppointments = useMemo(() => Object.values(performance).reduce((sum, item) => sum + item.appointmentCount, 0), [performance]);
  const totalCollected = useMemo(() => Object.values(performance).reduce((sum, item) => sum + item.collected, 0), [performance]);
  const ranking = useMemo(() => [...activeStaff].sort((a, b) => (performance[b.id]?.collected ?? 0) - (performance[a.id]?.collected ?? 0)).slice(0, 5), [activeStaff, performance]);
  const maxCollected = Math.max(1, ...ranking.map((item) => performance[item.id]?.collected ?? 0));

  const tabs = ["Genel Bakış", "Puantaj", "İzinler", "Bordro", "Ödemeler", "SGK İşlemleri", "Raporlar"];

  return (
    <div className="mx-auto max-w-[1280px] space-y-5 pb-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--muted)]">İnsan Kaynakları & Özlük Yönetimi</p>
          <h1 className="mt-1 text-[30px] font-semibold tracking-[-0.05em] text-[var(--ink)] sm:text-[34px]">İK Dashboard</h1>
          <p className="mt-1 max-w-[720px] text-[13px] leading-6 text-[var(--muted)]">Çalışan, puantaj, izin, özlük, bordro ve yasal süreçleri tek merkezden yönetin.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/staff"><Button variant="secondary">Personel Yönetimi</Button></Link>
          <Link href="/staff"><Button><Icon name="plus" size={15}/><span className="ml-1.5">Yeni Çalışan</span></Button></Link>
        </div>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <div className="flex gap-1 overflow-x-auto rounded-[16px] border border-[var(--line)] bg-white p-1.5 shadow-[0_8px_24px_rgba(35,27,67,0.04)]">
        {tabs.map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={`shrink-0 rounded-[11px] px-4 py-2.5 text-[11px] font-medium transition ${tab === item ? "bg-[#f0eaff] text-[#7657e8]" : "text-[var(--muted)] hover:bg-[#f8f7fb] hover:text-[var(--ink)]"}`}>{item}</button>)}
      </div>

      {loading ? <GlassCard className="flex min-h-[260px] items-center justify-center"><Spinner/></GlassCard> : tab !== "Genel Bakış" ? (
        <GlassCard className="flex min-h-[360px] flex-col items-center justify-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-[17px] bg-[#eee8ff] text-[#7657e8]"><Icon name={tab === "Bordro" || tab === "Ödemeler" ? "wallet" : tab === "İzinler" ? "calendar" : tab === "Puantaj" ? "clock" : tab === "SGK İşlemleri" ? "shield" : "document"} size={25}/></span>
          <h2 className="mt-4 text-[17px] font-semibold">{tab}</h2>
          <p className="mt-1 max-w-[480px] text-[12px] leading-5 text-[var(--muted)]">Bu bölüm için ekran altyapısı hazır. Mevcut personel kayıtlarıyla aynı çalışan kimliğini kullanarak modülü genişletebiliriz.</p>
        </GlassCard>
      ) : <>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Metric label="Toplam Çalışan" value={staff.length} note={`${activeStaff.length} aktif · ${archivedStaff.length} arşiv`} icon="users"/>
          <Metric label="Aktif Çalışan" value={activeStaff.length} note="Mevcut personel kaydı" icon="users" tone="green"/>
          <Metric label="Bugünkü İzinli" value="—" note="İzin modülü ile otomatik" icon="calendar" tone="orange"/>
          <Metric label="Devamsız" value="—" note="Puantaj entegrasyonu bekliyor" icon="clock" tone="red"/>
          <Metric label="Fazla Mesai" value="—" note="Saat bazlı puantaj" icon="clock" tone="blue"/>
          <Metric label="Bordro" value="—" note="Dönem oluşturulmadı" icon="wallet"/>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.8fr)_minmax(300px,.75fr)]">
          <GlassCard className="!overflow-hidden !rounded-[18px] !p-0">
            <div className="border-b border-[var(--line)] p-5"><h2 className="text-[14px] font-semibold">Puantaj Durumu</h2><p className="mt-1 text-[10px] text-[var(--muted)]">Çalışanların aylık çalışma kayıtları</p></div>
            <div className="p-5"><div className="flex items-center justify-center"><div className="relative flex h-[180px] w-[180px] items-center justify-center rounded-full" style={{ background: "conic-gradient(#7657e8 0deg, #7657e8 270deg, #f1a43c 270deg, #f1a43c 315deg, #e7e5ec 315deg, #e7e5ec 360deg)" }}><div className="flex h-[122px] w-[122px] flex-col items-center justify-center rounded-full bg-white"><strong className="text-[28px] tracking-[-.05em]">{activeStaff.length}</strong><span className="text-[10px] text-[var(--muted)]">aktif çalışan</span></div></div></div><div className="mt-5 grid grid-cols-3 gap-2 text-center"><Mini label="Tamamlanan" value="—"/><Mini label="Eksik" value="—"/><Mini label="Onay" value="—"/></div></div>
            <div className="border-t border-[var(--line)] bg-[#fcfcfb] p-4"><Link href="/staff" className="flex items-center justify-center gap-1 text-[11px] font-medium text-[#7657e8]">Personel ve puantaj detayları <Icon name="arrow" size={14}/></Link></div>
          </GlassCard>

          <GlassCard className="!overflow-hidden !rounded-[18px] !p-0"><div className="border-b border-[var(--line)] p-5"><h2 className="text-[14px] font-semibold">Bordro Özeti</h2><p className="mt-1 text-[10px] text-[var(--muted)]">Mevcut dönemin finans özeti</p></div><div className="space-y-0 p-5"><SummaryRow label="Toplam çalışan" value={String(staff.length)}/><SummaryRow label="Net bordro" value="Henüz hesaplanmadı"/><SummaryRow label="İşveren maliyeti" value="Henüz hesaplanmadı"/><SummaryRow label="Ortalama net maaş" value="—"/><SummaryRow label="Prim / komisyon" value="—"/></div><div className="border-t border-[var(--line)] bg-[#fcfcfb] p-4"><button type="button" onClick={() => setTab("Bordro")} className="w-full rounded-[10px] bg-[#f0eaff] py-2.5 text-[11px] font-semibold text-[#7657e8]">Bordro dönemine git</button></div></GlassCard>

          <GlassCard className="!overflow-hidden !rounded-[18px] !p-0"><div className="border-b border-[var(--line)] p-5"><h2 className="text-[14px] font-semibold">Yasal İşlemler</h2><p className="mt-1 text-[10px] text-[var(--muted)]">İK operasyon kontrol merkezi</p></div><div className="space-y-2 p-4"><LegalRow title="İşe giriş bildirgeleri" status="Takip edilecek"/><LegalRow title="İşten ayrılış bildirgeleri" status="Takip edilecek"/><LegalRow title="Aylık SGK işlemleri" status="Hazırlanacak"/><LegalRow title="İş kazası bildirimleri" status="Kayıt yok"/></div><div className="border-t border-[var(--line)] bg-[#fcfcfb] p-4"><button type="button" onClick={() => setTab("SGK İşlemleri")} className="w-full rounded-[10px] border border-[var(--line)] py-2.5 text-[11px] font-semibold text-[var(--ink)]">Yasal takvimi aç</button></div></GlassCard>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(330px,.85fr)]">
          <GlassCard className="!overflow-hidden !rounded-[18px] !p-0"><div className="border-b border-[var(--line)] p-5"><h2 className="text-[14px] font-semibold">Personel Performansı</h2><p className="mt-1 text-[10px] text-[var(--muted)]">Mevcut personel ve operasyon verilerinden</p></div><div className="space-y-4 p-5">{ranking.length ? ranking.map((member) => { const collected = performance[member.id]?.collected ?? 0; const width = Math.max(4, Math.round(collected / maxCollected * 100)); return <div key={member.id} className="grid grid-cols-[34px_minmax(110px,150px)_minmax(90px,1fr)_85px] items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eee8ff] text-[9px] font-semibold text-[#7657e8]">{initials(member)}</div><div className="min-w-0"><p className="truncate text-[11px] font-semibold">{member.firstName} {member.lastName}</p><p className="mt-0.5 text-[9px] text-[var(--muted)]">{performance[member.id]?.appointmentCount ?? 0} randevu</p></div><div className="h-2 overflow-hidden rounded-full bg-[#efedf3]"><div className="h-full rounded-full bg-[#9c86ef]" style={{ width: `${width}%` }}/></div><div className="text-right text-[10px] font-semibold">{money(collected)}</div></div>; }) : <EmptyMessage text="Performans verisi bulunamadı."/>}</div><div className="grid grid-cols-3 divide-x border-t border-[var(--line)] bg-[#fcfcfb]"><Mini label="Randevu" value={String(totalAppointments)}/><Mini label="Tahsilat" value={money(totalCollected)}/><Mini label="Aktif ekip" value={String(activeStaff.length)}/></div></GlassCard>

          <GlassCard className="!overflow-hidden !rounded-[18px] !p-0"><div className="border-b border-[var(--line)] p-5"><h2 className="text-[14px] font-semibold">Yaklaşan Önemli Tarihler</h2><p className="mt-1 text-[10px] text-[var(--muted)]">Özlük modülüyle otomatik doldurulacak</p></div><div className="p-4"><ImportantDate title="Deneme süresi bitişleri" value="İK modülünde takip edilecek"/><ImportantDate title="Sözleşme bitişleri" value="İK modülünde takip edilecek"/><ImportantDate title="Yıllık izin hakedişleri" value="İK modülünde takip edilecek"/><ImportantDate title="Belge geçerlilikleri" value="Özlük dosyalarından takip edilecek"/></div></GlassCard>
        </section>

        <GlassCard className="!overflow-hidden !rounded-[18px] !p-0"><div className="border-b border-[var(--line)] p-5"><h2 className="text-[14px] font-semibold">Hızlı İşlemler</h2><p className="mt-1 text-[10px] text-[var(--muted)]">İK operasyonlarını başlatın</p></div><div className="grid grid-cols-2 divide-x sm:grid-cols-4 lg:grid-cols-8"><Quick label="Yeni Çalışan" icon="users" href="/staff"/><Quick label="İzin Talebi" icon="calendar" onClick={() => setTab("İzinler")}/><Quick label="Puantaj Girişi" icon="clock" onClick={() => setTab("Puantaj")}/><Quick label="Bordro Hesapla" icon="wallet" onClick={() => setTab("Bordro")}/><Quick label="Ödeme Listesi" icon="document" onClick={() => setTab("Ödemeler")}/><Quick label="SGK İşlemleri" icon="shield" onClick={() => setTab("SGK İşlemleri")}/><Quick label="Rapor Oluştur" icon="document" onClick={() => setTab("Raporlar")}/><Quick label="Özlük Dosyaları" icon="users" href="/staff"/></div></GlassCard>
      </>}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) { return <div className="rounded-[11px] bg-[#f8f7fb] px-2 py-3"><p className="text-[9px] text-[var(--muted)]">{label}</p><strong className="mt-1 block text-[13px]">{value}</strong></div>; }
function SummaryRow({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between border-b border-[#f0eef3] py-3 last:border-0"><span className="text-[10px] text-[var(--muted)]">{label}</span><strong className="max-w-[145px] text-right text-[11px]">{value}</strong></div>; }
function LegalRow({ title, status }: { title: string; status: string }) { return <div className="flex items-center gap-3 rounded-[11px] bg-[#faf9fc] px-3 py-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-[#eee8ff] text-[#7657e8]"><Icon name="shield" size={14}/></span><div className="min-w-0 flex-1"><p className="truncate text-[10px] font-semibold">{title}</p><p className="mt-0.5 truncate text-[9px] text-[var(--muted)]">{status}</p></div></div>; }
function ImportantDate({ title, value }: { title: string; value: string }) { return <div className="flex items-center gap-3 border-b border-[#f0eef3] py-3 last:border-0"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[#f0eaff] text-[#7657e8]"><Icon name="calendar" size={14}/></span><div className="min-w-0"><p className="text-[10px] font-semibold">{title}</p><p className="mt-0.5 text-[9px] text-[var(--muted)]">{value}</p></div></div>; }
function EmptyMessage({ text }: { text: string }) { return <div className="rounded-[12px] bg-[#faf9fc] p-8 text-center text-[11px] text-[var(--muted)]">{text}</div>; }
function Quick({ label, icon, href, onClick }: { label: string; icon: IconName; href?: string; onClick?: () => void }) { const content = <><span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-[#eee8ff] text-[#7657e8]"><Icon name={icon} size={16}/></span><span className="mt-2 text-center text-[9px] font-medium leading-4 text-[var(--ink)]">{label}</span></>; return href ? <Link href={href} className="flex min-h-[105px] flex-col items-center justify-center p-3 transition hover:bg-[#faf9fc]">{content}</Link> : <button type="button" onClick={onClick} className="flex min-h-[105px] flex-col items-center justify-center p-3 transition hover:bg-[#faf9fc]">{content}</button>; }
