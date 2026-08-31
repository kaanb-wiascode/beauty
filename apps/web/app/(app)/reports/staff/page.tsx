"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Alert,
  Field,
  GlassCard,
  PageHeader,
  Panel,
  Spinner,
  TableWrap,
  Td,
  Th,
  TextInput,
} from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";

type StaffPerformance = {
  staff: { id: string; firstName: string; lastName: string; status: string };
  appointmentCount: number;
  completedAppointments: number;
  collected: number;
};

function dateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function money(value: number) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(value);
}

function name(row: StaffPerformance) {
  return `${row.staff.firstName} ${row.staff.lastName}`.trim();
}

const presets = [
  { label: "Bugün", days: 0 },
  { label: "Dün", days: 1 },
  { label: "Son 7 gün", days: 6 },
  { label: "Son 30 gün", days: 29 },
  { label: "Son 90 gün", days: 89 },
];

export default function StaffReportPage() {
  const today = useMemo(() => dateValue(new Date()), []);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<StaffPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (from > to) {
      setRows([]);
      setError("Başlangıç tarihi bitiş tarihinden sonra olamaz.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const result = await api<StaffPerformance[]>(withQuery("/staff/performance", {
          from: new Date(`${from}T00:00:00`).toISOString(),
          to: new Date(`${to}T23:59:59.999`).toISOString(),
        }));
        if (!cancelled) setRows([...result].sort((a, b) => b.collected - a.collected || b.completedAppointments - a.completedAppointments));
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Personel raporu yüklenemedi.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [from, to]);

  const totals = useMemo(() => rows.reduce((t, row) => ({
    appointments: t.appointments + row.appointmentCount,
    completed: t.completed + row.completedAppointments,
    collected: t.collected + row.collected,
  }), { appointments: 0, completed: 0, collected: 0 }), [rows]);

  const averageTicket = totals.completed ? totals.collected / totals.completed : 0;
  const completionRate = totals.appointments ? Math.round((totals.completed / totals.appointments) * 100) : 0;
  const top = rows[0];
  const maxCollected = Math.max(...rows.map((row) => row.collected), 1);

  function applyPreset(days: number) {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setFrom(dateValue(start));
    setTo(dateValue(end));
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title="Personel Raporları" description="Personel performansını analiz edin, veriye dayalı kararlar alın." />

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <Panel>
        <div className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => (
              <button key={preset.label} type="button" onClick={() => applyPreset(preset.days)} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-[12px] font-medium text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)]">
                {preset.label}
              </button>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Özel tarih aralığı"><TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="Bitiş tarihi"><TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          </div>
        </div>
      </Panel>

      {loading ? <Spinner label="Personel raporu hazırlanıyor..." /> : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Toplam ciro" value={money(totals.collected)} detail="Seçilen dönem" />
            <Metric label="Tahsilat" value={money(totals.collected)} detail={`${rows.length} aktif personel`} />
            <Metric label="Randevu sayısı" value={totals.appointments.toLocaleString("tr-TR")} detail={`${totals.completed} tamamlandı`} />
            <Metric label="Ortalama sepet" value={money(averageTicket)} detail={`Tamamlanma %${completionRate}`} />
          </section>

          <section className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
            <Panel>
              <div className="border-b border-[var(--line)] px-5 py-4">
                <h2 className="text-[16px] font-semibold text-[var(--ink)]">Personel ciro performansı</h2>
                <p className="mt-1 text-[12px] text-[var(--muted)]">Tahsilata göre sıralanmış performans</p>
              </div>
              <div className="space-y-5 p-5">
                {rows.length === 0 ? <Empty /> : rows.slice(0, 8).map((row, index) => (
                  <div key={row.staff.id} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3">
                    <span className="text-[12px] font-semibold text-[var(--muted-soft)]">{index + 1}</span>
                    <div className="min-w-0">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-[13px] font-medium text-[var(--ink)]">{name(row)}</span>
                        <span className="shrink-0 text-[12px] font-semibold text-[var(--ink)]">{money(row.collected)}</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                        <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(4, (row.collected / maxCollected) * 100)}%` }} />
                      </div>
                    </div>
                    <span className="text-[11px] text-[var(--muted)]">{row.completedAppointments} işlem</span>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel>
              <div className="border-b border-[var(--line)] px-5 py-4">
                <h2 className="text-[16px] font-semibold text-[var(--ink)]">Performans özeti</h2>
                <p className="mt-1 text-[12px] text-[var(--muted)]">Dönem içindeki genel görünüm</p>
              </div>
              <div className="space-y-4 p-5">
                <SummaryRow label="En yüksek tahsilat" value={top ? name(top) : "—"} detail={top ? money(top.collected) : "Veri yok"} />
                <SummaryRow label="Tamamlanan randevu" value={totals.completed.toLocaleString("tr-TR")} detail={`Toplam ${totals.appointments} randevudan`} />
                <SummaryRow label="Tamamlanma oranı" value={`%${completionRate}`} detail="Randevu bazında" />
                <SummaryRow label="Personel sayısı" value={rows.length.toLocaleString("tr-TR")} detail="Rapora dahil" />
              </div>
            </Panel>
          </section>

          <Panel>
            <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
              <div><h2 className="text-[16px] font-semibold text-[var(--ink)]">Personel performans detayları</h2><p className="mt-1 text-[12px] text-[var(--muted)]">Randevu ve tahsilat kırılımı</p></div>
              <span className="rounded-full bg-[var(--surface-muted)] px-3 py-1 text-[11px] font-medium text-[var(--muted)]">{rows.length} personel</span>
            </div>
            {rows.length === 0 ? <Empty /> : <TableWrap><thead><tr><Th>Personel</Th><Th>Randevu</Th><Th>Tamamlanan</Th><Th>Tamamlanma</Th><Th>Tahsilat</Th></tr></thead><tbody>{rows.map((row) => { const rate = row.appointmentCount ? Math.round((row.completedAppointments / row.appointmentCount) * 100) : 0; return <tr key={row.staff.id}><Td label="Personel" className="font-medium">{name(row)}</Td><Td label="Randevu">{row.appointmentCount}</Td><Td label="Tamamlanan">{row.completedAppointments}</Td><Td label="Tamamlanma"><span className="font-medium">%{rate}</span></Td><Td label="Tahsilat" className="font-semibold">{money(row.collected)}</Td></tr>; })}</tbody></TableWrap>}
          </Panel>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <GlassCard><p className="text-[12px] font-medium text-[var(--muted)]">{label}</p><p className="mt-2 text-[27px] font-semibold leading-tight tracking-[-0.04em] text-[var(--ink)]">{value}</p><p className="mt-2 text-[11px] text-[var(--muted-soft)]">{detail}</p></GlassCard>;
}
function SummaryRow({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-2xl border border-[var(--line)] p-4"><p className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted-soft)]">{label}</p><div className="mt-1 flex items-baseline justify-between gap-3"><span className="truncate text-[14px] font-semibold text-[var(--ink)]">{value}</span><span className="shrink-0 text-[11px] text-[var(--muted)]">{detail}</span></div></div>;
}
function Empty() { return <div className="px-5 py-12 text-center text-[13px] text-[var(--muted)]">Seçilen tarih aralığında veri bulunamadı.</div>; }
