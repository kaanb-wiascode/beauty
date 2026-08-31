"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Alert,
  GlassCard,
  PageHeader,
  Spinner,
  TextInput,
} from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";

type Summary = {
  gross: number;
  refunds: number;
  net: number;
  paymentCount: number;
  refundCount: number;
  methods: {
    CASH: number;
    CARD: number;
    TRANSFER: number;
  };
};

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

function formatDate(value: string) {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function rangeIsInvalid(from: string, to: string) {
  return Boolean(from && to && from > to);
}

export default function PaymentReportsPage() {
  const today = useMemo(() => toDateInputValue(new Date()), []);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const applyPreset = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    setFrom(toDateInputValue(start));
    setTo(toDateInputValue(end));
  };

  useEffect(() => {
    if (rangeIsInvalid(from, to)) {
      setSummary(null);
      setError("Başlangıç tarihi bitiş tarihinden sonra olamaz.");
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const start = new Date(`${from}T00:00:00`);
        const end = new Date(`${to}T23:59:59.999`);
        const result = await api<Summary>(
          withQuery("/payments/summary", {
            from: start.toISOString(),
            to: end.toISOString(),
          }),
        );

        if (!cancelled) setSummary(result);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Ödeme raporu yüklenemedi.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const methodTotal = summary
    ? summary.methods.CASH + summary.methods.CARD + summary.methods.TRANSFER
    : 0;

  const averagePayment =
    summary && summary.paymentCount > 0
      ? summary.gross / summary.paymentCount
      : 0;

  const methodRows = summary
    ? [
        { key: "CARD", label: "Kart", value: summary.methods.CARD },
        { key: "CASH", label: "Nakit", value: summary.methods.CASH },
        {
          key: "TRANSFER",
          label: "Havale / EFT",
          value: summary.methods.TRANSFER,
        },
      ]
    : [];

  return (
    <div className="mx-auto max-w-[1280px] space-y-6 pb-10">
      <PageHeader
        title="Ödeme Raporları"
        description="Ödeme performansını analiz edin, tahsilat ve iade detaylarını inceleyin."
      />

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="flex flex-col gap-3 rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[0_8px_30px_rgba(30,25,20,0.035)] sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3 rounded-[13px] border border-[var(--line)] bg-white px-4 py-3">
          <span className="text-[17px] text-[var(--muted)]">▣</span>
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted-soft)]">
              Rapor dönemi
            </p>
            <p className="truncate text-[14px] font-semibold text-[var(--ink)]">
              {formatDate(from)} — {formatDate(to)}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="h-11 rounded-[12px] border border-[var(--line)] bg-white px-4 text-[13px] font-semibold text-[var(--ink)] transition hover:bg-[var(--surface-muted)]"
        >
          ↓ Raporu yazdır
        </button>
      </section>

      <section className="flex flex-col gap-3 rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_8px_30px_rgba(30,25,20,0.035)] lg:flex-row lg:items-end">
        <div className="flex flex-wrap gap-2">
          {[{ label: "Bugün", days: 1 }, { label: "Dün", days: 2 }, { label: "Son 7 gün", days: 7 }, { label: "Son 30 gün", days: 30 }, { label: "Son 90 gün", days: 90 }].map((preset) => {
            const active =
              preset.days === 1
                ? from === today && to === today
                : false;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset.days)}
                className={`h-10 rounded-[10px] border px-4 text-[13px] font-semibold transition ${
                  active
                    ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                    : "border-[var(--line)] bg-white text-[var(--ink)] hover:bg-[var(--surface-muted)]"
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        <div className="hidden h-10 w-px bg-[var(--line)] lg:block" />

        <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:max-w-[520px]">
          <TextInput
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
          <TextInput
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </div>
      </section>

      {loading ? (
        <div className="flex min-h-[360px] items-center justify-center">
          <Spinner label="Ödeme raporu hazırlanıyor..." />
        </div>
      ) : summary ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="Net tahsilat" value={formatMoney(summary.net)} detail="Brüt tahsilat − iadeler" accent="purple" />
            <MetricCard label="Brüt tahsilat" value={formatMoney(summary.gross)} detail={`${summary.paymentCount} işlem`} accent="green" />
            <MetricCard label="İadeler" value={formatMoney(summary.refunds)} detail={`${summary.refundCount} iade`} accent="rose" />
            <MetricCard label="Ortalama işlem" value={formatMoney(averagePayment)} detail="Tahsilat başına" accent="amber" />
            <MetricCard label="İşlem sayısı" value={String(summary.paymentCount)} detail="Tamamlanan tahsilat" accent="blue" />
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
            <GlassCard className="overflow-hidden p-0">
              <CardHeader title="Tahsilat özeti" subtitle="Seçilen dönem içindeki finansal görünüm" />
              <div className="p-5">
                <div className="rounded-[15px] border border-[var(--line)] bg-[var(--surface-muted)] p-5">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--muted-soft)]">Net tahsilat</p>
                      <p className="mt-2 text-[32px] font-semibold tracking-[-0.045em] text-[var(--ink)]">{formatMoney(summary.net)}</p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-[var(--muted)]">{summary.paymentCount} işlem</span>
                  </div>
                </div>

                <div className="mt-6 space-y-5">
                  <SummaryRow label="Brüt tahsilat" value={formatMoney(summary.gross)} />
                  <SummaryRow label="İadeler" value={formatMoney(summary.refunds)} negative />
                  <div className="h-px bg-[var(--line)]" />
                  <SummaryRow label="Net tahsilat" value={formatMoney(summary.net)} strong />
                </div>
              </div>
            </GlassCard>

            <GlassCard className="overflow-hidden p-0">
              <CardHeader title="Ödeme yöntemlerine göre dağılım" subtitle="Tamamlanan tahsilatların ödeme kanalları" />
              <div className="grid gap-6 p-5 sm:grid-cols-[180px_1fr] sm:items-center">
                <div
                  className="mx-auto flex h-[170px] w-[170px] items-center justify-center rounded-full"
                  style={{
                    background:
                      methodTotal > 0
                        ? `conic-gradient(var(--accent) 0 ${(summary.methods.CARD / methodTotal) * 100}%, #55a77a 0 ${((summary.methods.CARD + summary.methods.CASH) / methodTotal) * 100}%, #e9a44d 0 100%)`
                        : "#eee",
                  }}
                >
                  <div className="flex h-[108px] w-[108px] flex-col items-center justify-center rounded-full bg-white text-center shadow-sm">
                    <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted-soft)]">Toplam</span>
                    <strong className="mt-1 text-[17px] tracking-[-0.03em] text-[var(--ink)]">{formatMoney(methodTotal)}</strong>
                  </div>
                </div>

                <div className="space-y-4">
                  {methodRows.map((row, index) => {
                    const percent = methodTotal > 0 ? (row.value / methodTotal) * 100 : 0;
                    const dotClass = index === 0 ? "bg-[var(--accent)]" : index === 1 ? "bg-[#55a77a]" : "bg-[#e9a44d]";
                    return (
                      <div key={row.key}>
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-2 text-[13px] font-medium text-[var(--ink)]">
                            <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
                            {row.label}
                          </span>
                          <span className="text-[13px] font-semibold text-[var(--ink)]">{formatMoney(row.value)}</span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                          <div className={`h-full rounded-full ${dotClass}`} style={{ width: `${percent}%` }} />
                        </div>
                        <p className="mt-1 text-right text-[11px] text-[var(--muted-soft)]">%{percent.toFixed(1)}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </GlassCard>
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
            <GlassCard className="overflow-hidden p-0">
              <CardHeader title="Ödeme hareketleri" subtitle="Seçilen dönem için özet işlem görünümü" action={`${summary.paymentCount} işlem`} />
              <div className="p-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <ActivityStat label="Kart" value={formatMoney(summary.methods.CARD)} percentage={methodTotal ? (summary.methods.CARD / methodTotal) * 100 : 0} />
                  <ActivityStat label="Nakit" value={formatMoney(summary.methods.CASH)} percentage={methodTotal ? (summary.methods.CASH / methodTotal) * 100 : 0} />
                  <ActivityStat label="Havale / EFT" value={formatMoney(summary.methods.TRANSFER)} percentage={methodTotal ? (summary.methods.TRANSFER / methodTotal) * 100 : 0} />
                  <ActivityStat label="İade" value={formatMoney(summary.refunds)} percentage={summary.gross ? (summary.refunds / summary.gross) * 100 : 0} negative />
                </div>
              </div>
            </GlassCard>

            <GlassCard className="overflow-hidden p-0">
              <CardHeader title="Dönem özeti" subtitle={`${formatDate(from)} — ${formatDate(to)}`} />
              <div className="p-5">
                <div className="space-y-0 rounded-[14px] border border-[var(--line)] bg-white">
                  <MiniSummary label="Brüt tahsilat" value={formatMoney(summary.gross)} />
                  <MiniSummary label="Toplam iade" value={formatMoney(summary.refunds)} negative />
                  <MiniSummary label="İşlem sayısı" value={String(summary.paymentCount)} />
                  <MiniSummary label="Ortalama işlem" value={formatMoney(averagePayment)} />
                </div>
                <div className="mt-4 rounded-[14px] bg-[#edf8f1] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#4c8762]">Net tahsilat</p>
                  <p className="mt-1 text-[24px] font-semibold tracking-[-0.04em] text-[#2d7b4b]">{formatMoney(summary.net)}</p>
                </div>
              </div>
            </GlassCard>
          </section>
        </>
      ) : null}
    </div>
  );
}

function MetricCard({ label, value, detail, accent }: { label: string; value: string; detail: string; accent: "purple" | "green" | "rose" | "amber" | "blue" }) {
  const accents = {
    purple: "bg-[#f1edff] text-[#7357d9]",
    green: "bg-[#eaf7ef] text-[#4a9665]",
    rose: "bg-[#fff0f1] text-[#d76a73]",
    amber: "bg-[#fff5e8] text-[#c8872d]",
    blue: "bg-[#edf4fb] text-[#5b87b4]",
  };

  return (
    <GlassCard className="min-w-0 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--muted-soft)]">{label}</p>
          <p className="mt-2 truncate text-[22px] font-semibold tracking-[-0.04em] text-[var(--ink)]">{value}</p>
        </div>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-[15px] ${accents[accent]}`}>₺</span>
      </div>
      <p className="mt-2 truncate text-[11px] text-[var(--muted)]">{detail}</p>
    </GlassCard>
  );
}

function CardHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
      <div>
        <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--ink)]">{title}</h2>
        <p className="mt-1 text-[11px] text-[var(--muted)]">{subtitle}</p>
      </div>
      {action ? <span className="rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-[10px] font-semibold text-[var(--muted)]">{action}</span> : null}
    </div>
  );
}

function SummaryRow({ label, value, negative = false, strong = false }: { label: string; value: string; negative?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={`text-[13px] ${strong ? "font-semibold text-[var(--ink)]" : "text-[var(--muted)]"}`}>{label}</span>
      <span className={`text-[14px] ${strong ? "font-semibold" : "font-medium"} ${negative ? "text-[#c85e68]" : "text-[var(--ink)]"}`}>{value}</span>
    </div>
  );
}

function ActivityStat({ label, value, percentage, negative = false }: { label: string; value: string; percentage: number; negative?: boolean }) {
  return (
    <div className="rounded-[14px] border border-[var(--line)] p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] font-medium text-[var(--muted)]">{label}</span>
        <span className={`text-[13px] font-semibold ${negative ? "text-[#c85e68]" : "text-[var(--ink)]"}`}>{value}</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
        <div className={`h-full rounded-full ${negative ? "bg-[#e29aa0]" : "bg-[var(--accent)]"}`} style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }} />
      </div>
      <p className="mt-1 text-right text-[10px] text-[var(--muted-soft)]">%{percentage.toFixed(1)}</p>
    </div>
  );
}

function MiniSummary({ label, value, negative = false }: { label: string; value: string; negative?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3 last:border-b-0">
      <span className="text-[12px] text-[var(--muted)]">{label}</span>
      <span className={`text-[12px] font-semibold ${negative ? "text-[#c85e68]" : "text-[var(--ink)]"}`}>{value}</span>
    </div>
  );
}
