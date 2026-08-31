"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, ApiError, withQuery } from "@/lib/api";
import type { Paginated, Staff } from "@/lib/types";

const tabs = ["Genel Bakış", "Puantaj", "İzinler", "Bordro", "Ödemeler", "SGK İşlemleri", "Özlük Dosyaları"] as const;
type Tab = (typeof tabs)[number];

type Performance = { id: string; collected: number; appointmentCount: number };
type PayrollRow = { employeeId: string; gross: number; net: number; status: "DRAFT" | "APPROVED" | "PAID" };
type LeaveRow = { employeeId: string; days: number; status: "PENDING" | "APPROVED" | "REJECTED" };
type AttendanceRow = { employeeId: string; date: string; checkIn?: string; checkOut?: string; hours?: number };

function money(value: number) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(value);
}
function initials(s: Staff) { return `${s.firstName?.[0] ?? ""}${s.lastName?.[0] ?? ""}`.toUpperCase(); }
function Icon({ name }: { name: "users" | "clock" | "calendar" | "wallet" | "doc" | "shield" | "plus" }) {
  const p = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "users") return <svg {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7" r="3.5"/><path d="M17 3.5a3.5 3.5 0 0 1 0 7M21 21v-2a4 4 0 0 0-3-3.87"/></svg>;
  if (name === "clock") return <svg {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
  if (name === "calendar") return <svg {...p}><rect x="3" y="4.5" width="18" height="17" rx="3"/><path d="M8 2.5v4M16 2.5v4M3 9h18"/></svg>;
  if (name === "wallet") return <svg {...p}><path d="M4 5h15a2 2 0 0 1 2 2v12H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/><path d="M3 8h18M16 14h3"/></svg>;
  if (name === "doc") return <svg {...p}><path d="M6 3h9l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v5h5M8 13h8M8 17h6"/></svg>;
  if (name === "shield") return <svg {...p}><path d="M12 3 20 6v5c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10V6l8-3Z"/><path d="m9 12 2 2 4-4"/></svg>;
  return <svg {...p}><path d="M12 5v14M5 12h14"/></svg>;
}
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) { return <section className={`rounded-[20px] border border-[#ebe9f0] bg-white shadow-[0_10px_30px_rgba(30,20,60,.045)] ${className}`}>{children}</section>; }
function Metric({ label, value, note, icon }: { label: string; value: string | number; note: string; icon: "users" | "clock" | "calendar" | "wallet" }) { return <Card className="p-4"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f0eaff] text-[#7657e8]"><Icon name={icon}/></div><p className="mt-4 text-[11px] text-[#8b8895]">{label}</p><strong className="mt-1 block text-[24px] tracking-[-.04em]">{value}</strong><p className="mt-1 text-[10px] text-[#8b8895]">{note}</p></Card>; }

export default function HRPage() {
  const [tab, setTab] = useState<Tab>("Genel Bakış");
  const [staff, setStaff] = useState<Staff[]>([]);
  const [performance, setPerformance] = useState<Record<string, Performance>>({});
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [payroll, setPayroll] = useState<PayrollRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const result = await api<Paginated<Staff>>(withQuery("/staff", { page: 1, limit: 100 }));
      setStaff(result.data ?? []);
      try {
        const p = await api<Performance[] | { data?: Performance[] }>("/staff/performance");
        const rows = Array.isArray(p) ? p : p.data ?? [];
        setPerformance(Object.fromEntries(rows.map(x => [x.id, x])));
      } catch { setPerformance({}); }
      // These endpoints are optional until the HR migration is deployed. A missing endpoint must not break the dashboard.
      const safe = async <T,>(path: string, fallback: T) => { try { return await api<T>(path); } catch { return fallback; } };
      setAttendance(await safe("/hr/attendance", [] as AttendanceRow[]));
      setLeaves(await safe("/hr/leaves", [] as LeaveRow[]));
      setPayroll(await safe("/hr/payroll", [] as PayrollRow[]));
    } catch (e) { setError(e instanceof ApiError ? e.message : "İK verileri yüklenemedi."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const active = useMemo(() => staff.filter(s => s.status === "ACTIVE"), [staff]);
  const totalCollected = useMemo(() => Object.values(performance).reduce((n, x) => n + (x.collected || 0), 0), [performance]);
  const totalAppointments = useMemo(() => Object.values(performance).reduce((n, x) => n + (x.appointmentCount || 0), 0), [performance]);
  const payrollNet = payroll.reduce((n, x) => n + x.net, 0);
  const leaveDays = leaves.filter(x => x.status === "APPROVED").reduce((n, x) => n + x.days, 0);

  return <main className="mx-auto max-w-[1320px] space-y-5 pb-10">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[#8b8895]">İnsan Kaynakları & Özlük</p><h1 className="mt-1 text-[34px] font-semibold tracking-[-.055em]">İK Merkezi</h1><p className="mt-1 max-w-[760px] text-[13px] leading-6 text-[#77737f]">Mevcut personel kayıtlarını puantaj, izin, özlük, bordro ve ödeme süreçleriyle tek çalışan kimliği üzerinden yönetin.</p></div>
      <div className="flex flex-wrap gap-2"><Link href="/staff" className="rounded-xl border border-[#dedbe5] bg-white px-4 py-2.5 text-[12px] font-medium">Personel Yönetimi</Link><Link href="/staff" className="flex items-center rounded-xl bg-[#7657e8] px-4 py-2.5 text-[12px] font-medium text-white"><Icon name="plus"/><span className="ml-1.5">Yeni Çalışan</span></Link></div>
    </header>
    {error && <div className="rounded-xl border border-[#f0d4d4] bg-[#fff5f5] px-4 py-3 text-[12px] text-[#a34f55]">{error}</div>}
    <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-[#ebe9f0] bg-white p-1.5">{tabs.map(t => <button key={t} onClick={() => setTab(t)} className={`shrink-0 rounded-xl px-4 py-2.5 text-[11px] font-medium ${tab === t ? "bg-[#f0eaff] text-[#7657e8]" : "text-[#77737f] hover:bg-[#f7f6fa]"}`}>{t}</button>)}</nav>

    {loading ? <Card className="flex min-h-[320px] items-center justify-center"><span className="text-sm text-[#8b8895]">İK verileri yükleniyor…</span></Card> : <>
      {tab === "Genel Bakış" && <>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><Metric label="Toplam Çalışan" value={staff.length} note={`${active.length} aktif`} icon="users"/><Metric label="Aktif Çalışan" value={active.length} note="Mevcut Staff kaydı" icon="users"/><Metric label="Bugünkü İzin" value={leaves.filter(x => x.status === "APPROVED").length || "—"} note="İzin modülünden" icon="calendar"/><Metric label="Puantaj Kaydı" value={attendance.length || "—"} note="Giriş / çıkış" icon="clock"/><Metric label="Net Bordro" value={payrollNet ? money(payrollNet) : "—"} note={payroll.length ? `${payroll.length} kayıt` : "Dönem oluşturulmadı"} icon="wallet"/><Metric label="Hizmet Cirosu" value={money(totalCollected)} note={`${totalAppointments} randevu`} icon="wallet"/></section>
        <div className="grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
          <Card className="overflow-hidden"><div className="border-b border-[#eeeaf1] p-5"><h2 className="text-[14px] font-semibold">Çalışanlar</h2><p className="mt-1 text-[10px] text-[#8b8895]">Mevcut Personel modülünden beslenir</p></div><div className="divide-y divide-[#f0eef3]">{active.slice(0, 6).map(s => <div key={s.id} className="flex items-center gap-3 px-5 py-3.5"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#eee8ff] text-[11px] font-semibold text-[#7657e8]">{initials(s)}</span><div className="min-w-0 flex-1"><p className="truncate text-[12px] font-medium">{s.firstName} {s.lastName}</p><p className="truncate text-[10px] text-[#8b8895]">{s.role?.name ?? "Personel"}</p></div><div className="text-right"><p className="text-[11px] font-medium">{performance[s.id] ? money(performance[s.id].collected) : "—"}</p><p className="text-[9px] text-[#8b8895]">hizmet cirosu</p></div></div>)}{active.length === 0 && <div className="p-8 text-center text-[12px] text-[#8b8895]">Aktif personel bulunamadı.</div>}</div><div className="border-t border-[#eeeaf1] bg-[#fcfbfd] p-3 text-center"><Link href="/staff" className="text-[11px] font-medium text-[#7657e8]">Personel kartlarına git →</Link></div></Card>
          <Card className="p-5"><h2 className="text-[14px] font-semibold">İK Kontrol Merkezi</h2><p className="mt-1 text-[10px] text-[#8b8895]">Dönemsel süreçlerin özeti</p><div className="mt-5 space-y-3"><Row label="Onay bekleyen izin" value={String(leaves.filter(x => x.status === "PENDING").length)} tone="orange"/><Row label="Onay bekleyen bordro" value={String(payroll.filter(x => x.status === "DRAFT").length)} tone="purple"/><Row label="Onaylı izin günü" value={String(leaveDays)} tone="green"/><Row label="Eksik puantaj" value={attendance.length ? "Kontrol gerekli" : "—"} tone="red"/></div><div className="mt-6 rounded-xl bg-[#f7f6fa] p-3 text-[10px] leading-5 text-[#77737f]">Bordro ve puantaj servisleri devreye alındığında bu alanlar otomatik hesaplanır; mevcut Staff kimliği korunur.</div></Card>
        </div>
      </>}
      {tab === "Puantaj" && <Table title="Puantaj & Giriş / Çıkış" subtitle="Çalışan bazında çalışma saatleri" headers={["Tarih","Çalışan","Giriş","Çıkış","Saat"]} rows={attendance.map(x => [x.date, staff.find(s => s.id === x.employeeId)?.firstName ?? x.employeeId, x.checkIn ?? "—", x.checkOut ?? "—", x.hours?.toFixed(2) ?? "—"]) } empty="Henüz puantaj kaydı yok."/>}
      {tab === "İzinler" && <Table title="İzin Yönetimi" subtitle="Onay, bakiye ve kullanılan izinler" headers={["Çalışan","Gün","Durum"]} rows={leaves.map(x => [staff.find(s => s.id === x.employeeId)?.firstName ?? x.employeeId, String(x.days), x.status === "APPROVED" ? "Onaylandı" : x.status === "PENDING" ? "Bekliyor" : "Reddedildi"])} empty="Henüz izin kaydı yok."/>}
      {tab === "Bordro" && <Table title="Bordro Dönemi" subtitle="Brüt, kesintiler ve net ücret kayıtları" headers={["Çalışan","Brüt","Net","Durum"]} rows={payroll.map(x => [staff.find(s => s.id === x.employeeId)?.firstName ?? x.employeeId, money(x.gross), money(x.net), x.status === "PAID" ? "Ödendi" : x.status === "APPROVED" ? "Onaylandı" : "Taslak"])} empty="Henüz bordro dönemi oluşturulmadı."/>}
      {tab === "Ödemeler" && <Card className="p-6"><h2 className="text-[16px] font-semibold">Maaş Ödeme Listesi</h2><p className="mt-1 text-[12px] text-[#77737f]">Onaylı bordrolar finans ödeme listesine aktarılacak şekilde hazırlanır.</p><div className="mt-6 rounded-xl bg-[#f7f6fa] p-5 text-[12px]">{payroll.filter(x => x.status === "APPROVED").length ? `${payroll.filter(x => x.status === "APPROVED").length} onaylı bordro ödeme için hazır.` : "Ödeme için onaylı bordro bulunmuyor."}</div></Card>}
      {tab === "SGK İşlemleri" && <Card className="p-6"><div className="flex items-start gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e7f1ff] text-[#4d7edb]"><Icon name="shield"/></span><div><h2 className="text-[16px] font-semibold">SGK & Yasal Süreçler</h2><p className="mt-1 max-w-[700px] text-[12px] leading-6 text-[#77737f]">İşe giriş/çıkış, işyeri bilgileri, prim günleri ve bordro hesapları için ayrı yasal veri katmanı kullanılmalıdır. Bu sürümde mevzuat hesabı uydurulmaz; gerçek bordro motoru devreye alınmadan tutar gösterilmez.</p></div></div></Card>}
      {tab === "Özlük Dosyaları" && <Table title="Özlük Dosyaları" subtitle="Mevcut Staff kayıtlarını tamamlayan İK dosyaları" headers={["Çalışan","Durum","İşlem"]} rows={active.map(s => [`${s.firstName} ${s.lastName}`, "Staff kaydı mevcut", "Özlük bilgilerini tamamla"])} empty="Aktif personel yok."/>}
    </>}
  </main>;
}

function Row({ label, value, tone }: { label: string; value: string; tone: string }) { return <div className="flex items-center justify-between rounded-xl bg-[#faf9fb] px-3 py-3"><span className="text-[11px] text-[#77737f]">{label}</span><span className={`text-[11px] font-semibold ${tone === "red" ? "text-[#c25a61]" : tone === "green" ? "text-[#29956d]" : tone === "orange" ? "text-[#c57b24]" : "text-[#7657e8]"}`}>{value}</span></div>; }
function Table({ title, subtitle, headers, rows, empty }: { title: string; subtitle: string; headers: string[]; rows: string[][]; empty: string }) { return <Card className="overflow-hidden"><div className="border-b border-[#eeeaf1] p-5"><h2 className="text-[16px] font-semibold">{title}</h2><p className="mt-1 text-[11px] text-[#8b8895]">{subtitle}</p></div>{rows.length ? <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr className="border-b border-[#eeeaf1] bg-[#fcfbfd]">{headers.map(h => <th key={h} className="px-5 py-3 text-[10px] font-semibold uppercase tracking-[.08em] text-[#8b8895]">{h}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i} className="border-b border-[#f2f0f4] last:border-0">{r.map((c,j)=><td key={j} className="px-5 py-3.5 text-[11px]">{c}</td>)}</tr>)}</tbody></table></div> : <div className="p-14 text-center text-[12px] text-[#8b8895]">{empty}</div>}</Card>; }
