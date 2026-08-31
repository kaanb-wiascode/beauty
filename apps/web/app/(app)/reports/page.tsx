"use client";

import { useEffect, useMemo, useState } from "react";

import { Alert, Button, PageHeader, Panel, Spinner } from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";

type DashboardReport = {
  summary: {
    gross: number;
    refunds: number;
    net: number;
    paymentCount: number;
    refundCount: number;
    appointmentCount: number;
    completedAppointments: number;
    methods: { CASH: number; CARD: number; TRANSFER: number };
  };
  topService: { id: string; name: string; collected: number; appointmentCount: number } | null;
  topStaff: { id: string; name: string; collected: number; appointmentCount: number } | null;
  servicePerformance: { id: string; name: string; collected: number; appointmentCount: number }[];
  staffPerformance: { id: string; name: string; collected: number; appointmentCount: number }[];
};

const palette = ["#6658E8", "#45B97C", "#F59A32", "#4F8EE8", "#E86F9C"];

type IconName = "money" | "calendar" | "users" | "receipt" | "cart" | "download";

function Icon({ name }: { name: IconName }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      {name === "money" && <><path {...common} d="M4 6.5h16v11H4z" /><path {...common} d="M8 10.5c.6-1 1.5-1.5 2.7-1.5 1.6 0 2.5.8 2.5 2s-.9 2-2.5 2c-1.2 0-2.1-.5-2.7-1.5" /><path {...common} d="M17 9v6" /></>}
      {name === "calendar" && <><rect {...common} x="4" y="5.5" width="16" height="14" rx="2" /><path {...common} d="M8 3.5v4M16 3.5v4M4 9.5h16" /></>}
      {name === "users" && <><circle {...common} cx="9" cy="8" r="3" /><path {...common} d="M3.5 19c.4-3.3 2.2-5 5.5-5s5.1 1.7 5.5 5" /><path {...common} d="M16 5.5a3 3 0 0 1 0 5.7M17 14c2.2.4 3.4 2 3.5 4" /></>}
      {name === "receipt" && <><path {...common} d="M6 3.5h12v17l-2.5-1.6-3.5 1.6-3.5-1.6L6 20.5z" /><path {...common} d="M9 8h6M9 12h6M9 16h3" /></>}
      {name === "cart" && <><path {...common} d="M4 5h2l1.3 9h9.8l2-6.5H7" /><circle {...common} cx="9" cy="18.5" r="1" /><circle {...common} cx="17" cy="18.5" r="1" /></>}
      {name === "download" && <><path {...common} d="M12 4v10M8 10l4 4 4-4M5 19.5h14" /></>}
    </svg>
  );
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDateRange(from: string, to: string) {
  const formatter = new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `${formatter.format(new Date(`${from}T12:00:00`))} - ${formatter.format(new Date(`${to}T12:00:00`))}`;
}

function setRangeFromEnd(endValue: string, days: number, setFrom: (value: string) => void) {
  const end = new Date(`${endValue}T12:00:00`);
  const start = new Date(end);
  start.setDate(end.getDate() - days + 1);
  setFrom(toDateInputValue(start));
}

function MetricCard({
  label,
  value,
  note,
  tone,
  icon,
}: {
  label: string;
  value: string;
  note: string;
  tone: "purple" | "green" | "orange" | "pink" | "indigo";
  icon: IconName;
}) {
  const tones = {
    purple: "bg-[#F1EEFF] text-[#6658E8]",
    green: "bg-[#EAF8F0] text-[#45A873]",
    orange: "bg-[#FFF4E5] text-[#E9982F]",
    pink: "bg-[#FDECF2] text-[#D9658D]",
    indigo: "bg-[#EEF0FF] text-[#5C68D8]",
  };

  return (
    <article className="surface min-w-0 rounded-[18px] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] ${tones[tone]}`}>
          <Icon name={icon} />
        </div>
        <span className="rounded-full bg-[#F5F5F6] px-2 py-1 text-[10px] font-medium text-[#8990A2]">{note}</span>
      </div>
      <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.07em] text-[#69738C]">{label}</p>
      <p className="mt-1 truncate text-[23px] font-semibold tracking-[-0.045em] text-[var(--ink)]">{value}</p>
      <p className="mt-1 text-[10px] text-[var(--muted)]">Seçili dönem</p>
    </article>
  );
}

function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="border-b border-[var(--line)] px-5 py-4 sm:px-6">
      <h2 className="text-[15px] font-semibold text-[var(--ink)]">{title}</h2>
      {description ? <p className="mt-1 text-[11px] text-[var(--muted)]">{description}</p> : null}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="flex min-h-[170px] items-center justify-center text-[12px] text-[var(--muted)]">{label}</div>;
}

function DonutChart({ data }: { data: { name: string; value: number }[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  let cursor = 0;
  const gradient = data.length && total > 0
    ? `conic-gradient(${data.map((item, index) => {
        const start = (cursor / total) * 100;
        cursor += item.value;
        const end = (cursor / total) * 100;
        return `${palette[index % palette.length]} ${start}% ${end}%`;
      }).join(", ")})`
    : "#EEF0F5 0 100%";

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row">
      <div className="relative h-[150px] w-[150px] shrink-0 rounded-full p-[20px]" style={{ background: gradient }}>
        <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white text-center">
          <span className="text-[10px] text-[var(--muted)]">Toplam Ciro</span>
          <strong className="mt-1 text-[17px] tracking-[-0.04em]">{formatMoney(total).replace(",00", "")}</strong>
        </div>
      </div>
      <div className="w-full space-y-3">
        {data.map((item, index) => {
          const percent = total ? (item.value / total) * 100 : 0;
          return (
            <div key={item.name} className="flex items-center gap-2 text-[11px]">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: palette[index % palette.length] }} />
              <span className="min-w-0 flex-1 truncate text-[#293044]">{item.name}</span>
              <strong className="shrink-0 text-[#1D2435]">{formatMoney(item.value)}</strong>
              <span className="w-9 text-right text-[#8990A2]">{percent.toFixed(0)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const initialRange = useMemo(() => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - 6);
    return { from: toDateInputValue(start), to: toDateInputValue(end) };
  }, []);

  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [report, setReport] = useState<DashboardReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const result = await api<DashboardReport>(withQuery("/payments/dashboard-report", {
          from: new Date(`${from}T00:00:00`).toISOString(),
          to: new Date(`${to}T23:59:59.999`).toISOString(),
        }));
        if (!cancelled) setReport(result);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Rapor verileri yüklenemedi.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [from, to]);

  const serviceMix = useMemo(
    () => report?.servicePerformance.filter((item) => item.collected > 0).slice(0, 5).map((item) => ({ name: item.name, value: item.collected })) ?? [],
    [report],
  );
  const paymentMix = useMemo(
    () => report ? [
      { name: "Kart", value: report.summary.methods.CARD },
      { name: "Nakit", value: report.summary.methods.CASH },
      { name: "Havale / EFT", value: report.summary.methods.TRANSFER },
    ] : [],
    [report],
  );
  const maxService = Math.max(...(report?.servicePerformance.map((item) => item.collected) ?? [1]), 1);
  const collectionRate = report && report.summary.gross > 0 ? (report.summary.net / report.summary.gross) * 100 : 0;

  return (
    <div className="mx-auto w-full max-w-[1320px] space-y-5 pb-8">
      <PageHeader
        title="Raporlar"
        description="İşletmenizin performansını analiz edin, veriye dayalı kararlar alın."
        action={(
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="control flex min-h-11 items-center gap-2 rounded-[13px] bg-white px-3 text-[12px] font-medium text-[#3E4658]">
              <Icon name="calendar" />
              <span className="hidden md:inline">{formatDateRange(from, to)}</span>
              <input aria-label="Başlangıç tarihi" type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="w-[118px] bg-transparent text-[11px] outline-none md:hidden" />
            </div>
            <Button variant="secondary" className="min-h-11 rounded-[13px] px-3 text-[12px]" onClick={() => setRangeFromEnd(to, 7, setFrom)}>
              Son 7 gün
            </Button>
            <Button className="min-h-11 rounded-[13px] bg-[#6658E8] px-4 text-white hover:bg-[#584BD5]" onClick={() => window.print()}>
              <Icon name="download" />
              Raporu dışa aktar
            </Button>
          </div>
        )}
      />

      <section className="surface overflow-hidden rounded-[18px] print:hidden">
        <div className="grid gap-5 p-5 lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:p-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#69738C]">Hızlı aralık</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {[{ label: "Bugün", days: 1 }, { label: "Dün", days: 2 }, { label: "Son 7 gün", days: 7 }, { label: "Son 30 gün", days: 30 }, { label: "Son 90 gün", days: 90 }].map((item) => {
                const active = item.days === 7 && from === initialRange.from;
                return (
                  <button
                    key={item.days}
                    type="button"
                    onClick={() => setRangeFromEnd(to, item.days, setFrom)}
                    className={`h-10 rounded-[11px] border px-4 text-[12px] font-medium transition ${active ? "border-[#E5DEFF] bg-[#F1EEFF] text-[#6658E8]" : "border-[var(--line)] bg-white text-[#303648] hover:bg-[#F8F7F6]"}`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="hidden h-14 w-px bg-[var(--line)] lg:block" />

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#69738C]">Özel aralık</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="control flex h-10 min-w-[170px] flex-1 items-center gap-2 rounded-[11px] bg-white px-3 text-[11px] text-[#3E4658]">
                <Icon name="calendar" />
                <input aria-label="Başlangıç tarihi" type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="w-full bg-transparent outline-none" />
              </label>
              <span className="text-xs text-[#9AA1AE]">—</span>
              <label className="control flex h-10 min-w-[170px] flex-1 items-center gap-2 rounded-[11px] bg-white px-3 text-[11px] text-[#3E4658]">
                <Icon name="calendar" />
                <input aria-label="Bitiş tarihi" type="date" value={to} onChange={(event) => setTo(event.target.value)} className="w-full bg-transparent outline-none" />
              </label>
            </div>
          </div>
        </div>
      </section>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
      {loading ? <Spinner label="Rapor hazırlanıyor..." /> : report ? <>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Toplam ciro" value={formatMoney(report.summary.gross)} note="Brüt" tone="purple" icon="money" />
          <MetricCard label="Toplam tahsilat" value={formatMoney(report.summary.net)} note="Net" tone="green" icon="cart" />
          <MetricCard label="Toplam randevu" value={String(report.summary.appointmentCount)} note="Adet" tone="orange" icon="calendar" />
          <MetricCard label="Ödeme işlemi" value={String(report.summary.paymentCount)} note="Adet" tone="pink" icon="users" />
          <MetricCard label="Ortalama sepet" value={formatMoney(report.summary.appointmentCount ? report.summary.gross / report.summary.appointmentCount : 0)} note="Ciro / randevu" tone="indigo" icon="receipt" />
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.25fr_1.25fr_.8fr]">
          <Panel>
            <SectionTitle title="Ciro performansı" description="Hizmet bazında seçili dönem cirosu" />
            <div className="space-y-5 p-5 sm:p-6">
              {report.servicePerformance.length ? report.servicePerformance.slice(0, 7).map((item, index) => (
                <div key={item.id}>
                  <div className="mb-2 flex items-center gap-3 text-[12px]">
                    <span className="w-4 text-[10px] text-[#9AA1B0]">{index + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-medium text-[#303648]">{item.name}</span>
                    <span className="text-[10px] text-[#8990A2]">{item.appointmentCount} randevu</span>
                    <strong className="w-[86px] shrink-0 text-right text-[#202637]">{formatMoney(item.collected)}</strong>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#EEF0F3]">
                    <div className="h-full rounded-full bg-[#6658E8]" style={{ width: `${Math.max(3, (item.collected / maxService) * 100)}%` }} />
                  </div>
                </div>
              )) : <EmptyState label="Bu dönemde hizmet verisi yok" />}
            </div>
          </Panel>

          <Panel>
            <SectionTitle title="Ciro dağılımı" description="En yüksek ciro üreten hizmetler" />
            <div className="p-5 sm:p-6">{serviceMix.length ? <DonutChart data={serviceMix} /> : <EmptyState label="Dağılım için tahsilat verisi yok" />}</div>
          </Panel>

          <Panel>
            <SectionTitle title="Dönem özeti" />
            <div className="space-y-0 px-5 pb-4 sm:px-6">
              {[
                ["Brüt ciro", formatMoney(report.summary.gross)],
                ["Toplam tahsilat", formatMoney(report.summary.net)],
                ["İadeler", formatMoney(-report.summary.refunds)],
                ["Randevu sayısı", String(report.summary.appointmentCount)],
                ["Tamamlanan", String(report.summary.completedAppointments)],
                ["Ödeme işlemi", String(report.summary.paymentCount)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between border-b border-[var(--line)] py-3 text-[11px]">
                  <span className="text-[var(--muted)]">{label}</span>
                  <strong className={label === "İadeler" ? "text-[#D9658D]" : "text-[#293044]"}>{value}</strong>
                </div>
              ))}
              <div className="mt-4 rounded-[12px] border border-[#D8F0E1] bg-[#EEFAF3] p-3">
                <div className="flex items-center justify-between text-[11px] text-[#47745B]"><span>Tahsilat oranı</span><strong>%{collectionRate.toFixed(1)}</strong></div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#D8EDE0]"><div className="h-full rounded-full bg-[#45B97C]" style={{ width: `${Math.min(100, Math.max(0, collectionRate))}%` }} /></div>
              </div>
            </div>
          </Panel>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1fr_1.4fr_.9fr]">
          <Panel>
            <SectionTitle title="En çok tercih edilen hizmetler" />
            <div className="divide-y divide-[var(--line)] px-5">
              {report.servicePerformance.slice(0, 5).map((item, index) => (
                <div key={item.id} className="flex items-center gap-3 py-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-[#F1EEFF] text-[10px] font-semibold text-[#6658E8]">{index + 1}</span>
                  <div className="min-w-0 flex-1"><p className="truncate text-[12px] font-semibold text-[#273044]">{item.name}</p><p className="mt-0.5 text-[10px] text-[var(--muted)]">{item.appointmentCount} randevu</p></div>
                  <strong className="text-[11px] text-[#263044]">{formatMoney(item.collected)}</strong>
                </div>
              ))}
            </div>
          </Panel>

          <Panel>
            <SectionTitle title="Personel performansı" />
            <div className="overflow-x-auto px-5 pb-2">
              <table className="min-w-full text-left text-[11px]">
                <thead><tr className="border-b border-[var(--line)] text-[10px] uppercase tracking-[0.04em] text-[#8B92A2]"><th className="py-3 font-medium">Personel</th><th className="py-3 font-medium">Randevu</th><th className="py-3 font-medium">Ciro</th><th className="py-3 text-right font-medium">Ort. sepet</th></tr></thead>
                <tbody>{report.staffPerformance.slice(0, 6).map((item) => <tr key={item.id} className="border-b border-[var(--line)] last:border-0"><td className="py-3.5"><div className="flex min-w-[150px] items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F0F1F5] text-[10px] font-semibold text-[#626A7B]">{item.name.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase()}</span><span className="truncate font-semibold text-[#2A3142]">{item.name}</span></div></td><td className="py-3.5 font-medium text-[#293144]">{item.appointmentCount}</td><td className="py-3.5 font-medium text-[#293144]">{formatMoney(item.collected)}</td><td className="py-3.5 text-right font-medium text-[#293144]">{formatMoney(item.appointmentCount ? item.collected / item.appointmentCount : 0)}</td></tr>)}</tbody>
              </table>
            </div>
          </Panel>

          <Panel>
            <SectionTitle title="Tahsilat dağılımı" description="Ödeme yöntemlerine göre" />
            <div className="space-y-3 p-5 sm:p-6">
              {paymentMix.map((item, index) => {
                const total = paymentMix.reduce((sum, entry) => sum + entry.value, 0);
                const percent = total ? (item.value / total) * 100 : 0;
                return <div key={item.name} className="rounded-[12px] border border-[var(--line)] p-3"><div className="flex items-center gap-2 text-[11px]"><span className="h-2 w-2 rounded-full" style={{ background: palette[index] }} /><span className="flex-1 text-[#303648]">{item.name}</span><strong>{formatMoney(item.value)}</strong></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#EEF0F3]"><div className="h-full rounded-full" style={{ width: `${percent}%`, background: palette[index] }} /></div></div>;
              })}
            </div>
          </Panel>
        </section>
      </> : null}
    </div>
  );
}
