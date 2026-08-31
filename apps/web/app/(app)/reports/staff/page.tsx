"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Field, GlassCard, PageHeader, Panel, Spinner, TableWrap, Td, Th, TextInput } from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";

type Row = { staff: { id: string; firstName: string; lastName: string; status: string }; appointmentCount: number; completedAppointments: number; collected: number };
const presets = [{ label: "Bugün", days: 0 }, { label: "Dün", days: 1 }, { label: "7 Gün", days: 6 }, { label: "30 Gün", days: 29 }, { label: "90 Gün", days: 89 }];
const money = (v: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(v);
const dateValue = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const staffName = (r: Row) => `${r.staff.firstName} ${r.staff.lastName}`.trim();

export default function StaffReportPage() {
  const today = useMemo(() => dateValue(new Date()), []);
  const [from, setFrom] = useState(today), [to, setTo] = useState(today);
  const [rows, setRows] = useState<Row[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [metric, setMetric] = useState<"revenue" | "completed">("revenue");
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (from > to) { setRows([]); setError("Başlangıç tarihi bitiş tarihinden sonra olamaz."); setLoading(false); return; }
    let cancelled = false;
    async function load() {
      setLoading(true); setError("");
      try {
        const result = await api<Row[]>(withQuery("/staff/performance", { from: new Date(`${from}T00:00:00`).toISOString(), to: new Date(`${to}T23:59:59.999`).toISOString() }));
        if (!cancelled) { const sorted = [...result].sort((a, b) => b.collected - a.collected || b.completedAppointments - a.completedAppointments); setRows(sorted); setSelected(sorted[0]?.staff.id ?? null); }
      } catch (err) { if (!cancelled) setError(err instanceof ApiError ? err.message : "Personel raporu yüklenemedi."); }
      finally { if (!cancelled) setLoading(false); }
    }
    void load(); return () => { cancelled = true; };
  }, [from, to]);

  const totals = useMemo(() => rows.reduce((t, r) => ({ appointments: t.appointments + r.appointmentCount, completed: t.completed + r.completedAppointments, collected: t.collected + r.collected }), { appointments: 0, completed: 0, collected: 0 }), [rows]);
  const filtered = useMemo(() => rows.filter(r => staffName(r).toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR"))), [rows, query]);
  const top = rows[0];
  const selectedRow = rows.find(r => r.staff.id === selected) ?? top;
  const completion = totals.appointments ? Math.round(totals.completed / totals.appointments * 100) : 0;
  const average = totals.completed ? totals.collected / totals.completed : 0;
  const max = Math.max(...rows.map(r => metric === "revenue" ? r.collected : r.completedAppointments), 1);

  function preset(days: number) { const end = new Date(); const start = new Date(); start.setDate(end.getDate() - days); setFrom(dateValue(start)); setTo(dateValue(end)); }

  return <div className="mx-auto max-w-6xl space-y-5">
    <PageHeader title="Personel Raporları" description="Ekibinizin performansını tek ekranda görün, güçlü noktaları kolayca keşfedin." />
    {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

    <Panel><div className="flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        {presets.map(p => <button key={p.label} type="button" onClick={() => preset(p.days)} className="rounded-xl border border-[var(--line)] px-3.5 py-2 text-[12px] font-medium text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--ink)]">{p.label}</button>)}
        <span className="hidden h-5 w-px bg-[var(--line)] sm:block" />
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2"><Field label="Başlangıç"><TextInput type="date" value={from} onChange={e => setFrom(e.target.value)} /></Field><Field label="Bitiş"><TextInput type="date" value={to} onChange={e => setTo(e.target.value)} /></Field></div>
      </div>
    </div></Panel>

    {loading ? <Spinner label="Personel raporu hazırlanıyor..." /> : <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Toplam tahsilat" value={money(totals.collected)} detail="Seçilen dönem" />
        <Metric label="Tamamlanan" value={totals.completed.toLocaleString("tr-TR")} detail={`${completion}% tamamlanma`} />
        <Metric label="Toplam randevu" value={totals.appointments.toLocaleString("tr-TR")} detail={`${rows.length} personel`} />
        <Metric label="Ortalama işlem" value={money(average)} detail="Tamamlanan başına" />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.45fr_0.75fr]">
        <Panel>
          <div className="flex flex-col gap-3 border-b border-[var(--line)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="text-[16px] font-semibold text-[var(--ink)]">Ekip performansı</h2><p className="mt-1 text-[12px] text-[var(--muted)]">Bir personele dokunarak detayını açın.</p></div>
            <div className="flex rounded-xl bg-[var(--surface-muted)] p-1"><button type="button" onClick={() => setMetric("revenue")} className={`rounded-lg px-3 py-1.5 text-[11px] font-medium ${metric === "revenue" ? "bg-[var(--surface)] text-[var(--ink)] shadow-sm" : "text-[var(--muted)]"}`}>Ciro</button><button type="button" onClick={() => setMetric("completed")} className={`rounded-lg px-3 py-1.5 text-[11px] font-medium ${metric === "completed" ? "bg-[var(--surface)] text-[var(--ink)] shadow-sm" : "text-[var(--muted)]"}`}>İşlem</button></div>
          </div>
          <div className="space-y-2 p-4 sm:p-5">
            {rows.length === 0 ? <Empty /> : rows.map((r, i) => { const value = metric === "revenue" ? r.collected : r.completedAppointments; const pct = Math.max(4, value / max * 100); const rate = r.appointmentCount ? Math.round(r.completedAppointments / r.appointmentCount * 100) : 0; return <button key={r.staff.id} type="button" onClick={() => setSelected(r.staff.id)} className={`grid w-full grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl p-3 text-left transition ${selected === r.staff.id ? "bg-[var(--surface-muted)]" : "hover:bg-[var(--surface-muted)]"}`}><span className="text-[11px] font-semibold text-[var(--muted-soft)]">{i + 1}</span><span className="min-w-0"><span className="flex items-center justify-between gap-3"><span className="truncate text-[13px] font-semibold text-[var(--ink)]">{staffName(r)}</span><span className="shrink-0 text-[12px] font-semibold text-[var(--ink)]">{metric === "revenue" ? money(value) : `${value} işlem`}</span></span><span className="mt-2 block h-2 overflow-hidden rounded-full bg-[var(--surface-muted)]"><span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} /></span></span><span className="text-right text-[11px] text-[var(--muted)]">%{rate}</span></button>; })}
          </div>
        </Panel>

        <Panel>
          <div className="border-b border-[var(--line)] px-5 py-4"><p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted-soft)]">Seçili personel</p><h2 className="mt-1 truncate text-[19px] font-semibold text-[var(--ink)]">{selectedRow ? staffName(selectedRow) : "—"}</h2></div>
          {selectedRow ? <div className="space-y-4 p-5"><div className="flex items-center gap-3"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--surface-muted)] text-[13px] font-semibold text-[var(--muted)]">{selectedRow.staff.firstName[0]}{selectedRow.staff.lastName[0]}</div><div><p className="text-[13px] font-medium text-[var(--ink)]">Performans detayı</p><p className="text-[11px] text-[var(--muted)]">{selectedRow.staff.status === "ACTIVE" ? "Aktif personel" : selectedRow.staff.status}</p></div></div><Detail label="Tahsilat" value={money(selectedRow.collected)} /><Detail label="Randevu" value={String(selectedRow.appointmentCount)} /><Detail label="Tamamlanan" value={String(selectedRow.completedAppointments)} /><Detail label="Başarı oranı" value={`%${selectedRow.appointmentCount ? Math.round(selectedRow.completedAppointments / selectedRow.appointmentCount * 100) : 0}`} /></div> : <Empty />}
        </Panel>
      </section>

      <Panel>
        <div className="flex flex-col gap-3 border-b border-[var(--line)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-[16px] font-semibold text-[var(--ink)]">Personel detayları</h2><p className="mt-1 text-[12px] text-[var(--muted)]">Arama yapın ve satırları karşılaştırın.</p></div><input aria-label="Personel ara" value={query} onChange={e => setQuery(e.target.value)} placeholder="Personel ara..." className="h-9 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-[12px] outline-none focus:border-[var(--accent)] sm:w-56" /></div>
        {filtered.length === 0 ? <Empty /> : <TableWrap><thead><tr><Th>Personel</Th><Th>Randevu</Th><Th>Tamamlanan</Th><Th>Başarı</Th><Th>Tahsilat</Th></tr></thead><tbody>{filtered.map(r => { const rate = r.appointmentCount ? Math.round(r.completedAppointments / r.appointmentCount * 100) : 0; return <tr key={r.staff.id} className="cursor-pointer" onClick={() => setSelected(r.staff.id)}><Td label="Personel" className="font-medium">{staffName(r)}</Td><Td label="Randevu">{r.appointmentCount}</Td><Td label="Tamamlanan">{r.completedAppointments}</Td><Td label="Başarı">%{rate}</Td><Td label="Tahsilat" className="font-semibold">{money(r.collected)}</Td></tr>; })}</tbody></TableWrap>}
      </Panel>
    </>}
  </div>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) { return <GlassCard><p className="text-[11px] font-medium text-[var(--muted)]">{label}</p><p className="mt-1.5 text-[24px] font-semibold tracking-[-0.04em] text-[var(--ink)]">{value}</p><p className="mt-1 text-[10px] text-[var(--muted-soft)]">{detail}</p></GlassCard>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between border-b border-[var(--line)] pb-3 last:border-0 last:pb-0"><span className="text-[12px] text-[var(--muted)]">{label}</span><span className="text-[13px] font-semibold text-[var(--ink)]">{value}</span></div>; }
function Empty() { return <div className="px-5 py-10 text-center text-[13px] text-[var(--muted)]">Seçilen tarih aralığında veri bulunamadı.</div>; }
