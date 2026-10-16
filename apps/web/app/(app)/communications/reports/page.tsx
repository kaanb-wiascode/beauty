"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MarketingFinanceTransferPanel } from "@/components/marketing-finance-transfer-panel";
import { Alert, Button, Spinner, Select } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import { userErrorMessage, userLabel } from "@/lib/user-language";

type PeriodMetrics = {
  leads: number;
  crmLeads: number;
  customers: number;
  appointments: number;
  sales: number;
  revenue: number;
  spend: number;
  postedSpend: number;
  financePending: number;
  contentPublished: number;
  prActivities: number;
  prReach: number;
  prMediaValue: number;
  creatorCollaborations: number;
  appointmentRate: number;
  saleRate: number;
  roas: number | null;
  costPerLead: number | null;
};

type Report = {
  range: {
    from: string;
    to: string;
    previousFrom: string;
    previousTo: string;
    days: number;
  };
  current: PeriodMetrics;
  previous: PeriodMetrics;
  channels: Array<{
    provider: string;
    leads: number;
    appointments: number;
    sales: number;
    revenue: number;
    appointmentRate: number;
    saleRate: number;
  }>;
  expenseCategories: Array<{
    category: string;
    sourceType: string;
    amount: number;
    count: number;
    pendingCount: number;
  }>;
  daily: Array<{
    date: string;
    leads: number;
    appointments: number;
    sales: number;
    revenue: number;
    spend: number;
    contentPublished: number;
  }>;
};

type FinanceExpense = {
  id: string;
  sourceType: string;
  sourceId: string;
  periodKey?: string | null;
  vendorName?: string | null;
  campaignName?: string | null;
  supplierBillId?: string | null;
  category: string;
  description: string;
  amount: string | number;
  currency: string;
  incurredOn: string;
  dueOn?: string | null;
  invoiceNumber?: string | null;
  status: string;
  createdAt: string;
};

type TrendMetric = "LEADS" | "SPEND" | "REVENUE" | "CONTENT";

const money = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 0,
});
const number = new Intl.NumberFormat("tr-TR");

const expenseLabels: Record<string, string> = {
  AD_SPEND: "Reklam Harcaması",
  AGENCY_FEE: "Ajans & Hizmet",
  INFLUENCER_FEE: "İçerik Üreticisi",
  SPONSORSHIP: "Sponsorluk",
  PR_MEDIA: "PR & Medya",
};

function expenseSourceHref(sourceType: string) {
  if (sourceType === "CAMPAIGN") return "/communications/campaigns";
  if (sourceType === "VENDOR") return "/communications/vendors";
  if (sourceType === "CREATOR") return "/communications/creators";
  if (sourceType === "PR_MEDIA") return "/communications/pr-media";
  return "/communications";
}

function expenseSourceLabel(sourceType: string) {
  if (sourceType === "CAMPAIGN") return "Kampanya";
  if (sourceType === "VENDOR") return "Ajans / İş Ortağı";
  if (sourceType === "CREATOR") return "İçerik Üreticisi";
  if (sourceType === "PR_MEDIA") return "PR & Medya";
  return userLabel(sourceType);
}

function inputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

function rangeFor(days: number) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days + 1);
  return { from: inputDate(from), to: inputDate(to) };
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value + "T12:00:00"));
}

function percentage(value: number) {
  return "%" + (value * 100).toFixed(1).replace(".", ",");
}

function delta(current: number, previous: number) {
  if (previous === 0) return current === 0 ? "Değişmedi" : "Yeni";
  const value = ((current - previous) / Math.abs(previous)) * 100;
  const sign = value > 0 ? "+" : "";
  return sign + value.toFixed(1).replace(".", ",") + "%";
}

function rateDelta(current: number, previous: number) {
  const value = (current - previous) * 100;
  const sign = value > 0 ? "+" : "";
  return sign + value.toFixed(1).replace(".", ",") + " puan";
}

export default function CommunicationsReportsPage() {
  const canFinanceRead =
    hasPermission("finance", "read") || hasPermission("finance", "manage");
  const canFinanceManage = hasPermission("finance", "manage");
  const initial = useMemo(() => rangeFor(30), []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [report, setReport] = useState<Report | null>(null);
  const [pendingExpenses, setPendingExpenses] = useState<FinanceExpense[]>([]);
  const [transferExpense, setTransferExpense] = useState<FinanceExpense | null>(
    null,
  );
  const [financeWarning, setFinanceWarning] = useState("");
  const [trendMetric, setTrendMetric] = useState<TrendMetric>("LEADS");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!from || !to) return;
    setLoading(true);
    setError("");

    try {
      const reportResult = await api<Report>(
        "/corporate-communications/reports/summary?from=" +
          encodeURIComponent(from) +
          "&to=" +
          encodeURIComponent(to),
      );
      setReport(reportResult);

      if (canFinanceRead) {
        const financeResults = await Promise.allSettled([
          api<FinanceExpense[]>(
            "/marketing-finance/expenses?status=PENDING_FINANCE",
          ),
          api<FinanceExpense[]>("/marketing-finance/expenses?status=APPROVED"),
        ]);

        const financeFailed = financeResults.some(
          (result) => result.status === "rejected",
        );
        const financeRows = financeResults.flatMap((result) =>
          result.status === "fulfilled" ? result.value : [],
        );

        setPendingExpenses(
          financeRows.filter((item) => {
            const date = String(item.incurredOn).slice(0, 10);
            return date >= from && date <= to;
          }),
        );
        setFinanceWarning(
          financeFailed
            ? "Finans bekleyen giderlerin bir bölümü yüklenemedi."
            : "",
        );
      } else {
        setPendingExpenses([]);
        setFinanceWarning("");
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? userErrorMessage(
              err.message,
              "Kurumsal iletişim raporu oluşturulamadı.",
            )
          : "Kurumsal iletişim raporu oluşturulamadı.",
      );
    } finally {
      setLoading(false);
    }
  }, [from, to, canFinanceRead]);

  useEffect(() => {
    void load();
  }, [load]);

  function applyRange(days: number) {
    const range = rangeFor(days);
    setFrom(range.from);
    setTo(range.to);
  }

  function exportCsv() {
    if (!report) return;

    const rows = [
      ["Tarih", "Potansiyel Müşteri", "Randevu", "Satış", "Gelir", "Pazarlama Harcaması", "Yayınlanan İçerik"],
      ...report.daily.map((row) => [
        row.date,
        String(row.leads),
        String(row.appointments),
        String(row.sales),
        String(row.revenue),
        String(row.spend),
        String(row.contentPublished),
      ]),
      [],
      ["Kanal", "Potansiyel Müşteri", "Randevu", "Satış", "Gelir", "Randevu Oranı", "Satış Oranı"],
      ...report.channels.map((row) => [
        userLabel(row.provider),
        String(row.leads),
        String(row.appointments),
        String(row.sales),
        String(row.revenue),
        String(row.appointmentRate),
        String(row.saleRate),
      ]),
    ];

    const csv = rows
      .map((row) =>
        row
          .map((cell) => '"' + String(cell).replaceAll('"', '""') + '"')
          .join(";"),
      )
      .join("\n");

    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "kurumsal-iletisim-raporu-" + from + "-" + to + ".csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (loading && !report) {
    return (
      <div className="py-20">
        <Spinner label="Kurumsal iletişim raporu hazırlanıyor..." />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-12">
      <header className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[var(--accent)]">
              Yönetim Görünümü
            </p>
            <h1 className="mt-2 text-[30px] font-semibold tracking-[-.04em] text-[var(--ink)]">
              Kurumsal İletişim Raporları
            </h1>
            <p className="mt-2 max-w-4xl text-[12px] leading-5 text-[var(--muted)]">
              Pazarlama harcamasını, müşteri dönüşümünü, içerik üretimini,
              PR görünürlüğünü ve dış iş birliklerini seçili dönem ile önceki
              eşit dönem arasında karşılaştırın.
            </p>
          </div>

          <Button variant="secondary" disabled={!report} onClick={exportCsv}>
            CSV Dışa Aktar
          </Button>
        </div>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
      {financeWarning ? (
        <Alert onClose={() => setFinanceWarning("")}>{financeWarning}</Alert>
      ) : null}

      <section className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {[7, 30, 90].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => applyRange(days)}
                className="h-9 rounded-[10px] border border-[var(--line)] px-3 text-[9px] font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]"
              >
                Son {days} Gün
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-[170px_170px_auto] sm:items-end">
            <label className="text-[9px] font-semibold text-[var(--muted)]">
              Başlangıç
              <input
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className="mt-1.5 h-10 w-full rounded-[10px] border border-[var(--line)] bg-white px-3 text-[10px]"
              />
            </label>
            <label className="text-[9px] font-semibold text-[var(--muted)]">
              Bitiş
              <input
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className="mt-1.5 h-10 w-full rounded-[10px] border border-[var(--line)] bg-white px-3 text-[10px]"
              />
            </label>
            <Button disabled={loading} onClick={() => void load()}>
              {loading ? "Hazırlanıyor..." : "Raporu Yenile"}
            </Button>
          </div>
        </div>

        {report ? (
          <p className="mt-3 text-[8px] text-[var(--muted)]">
            Karşılaştırma dönemi: {displayDate(report.range.previousFrom)} –{" "}
            {displayDate(report.range.previousTo)}
          </p>
        ) : null}
      </section>

      {report ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <CompareMetric
              label="Pazarlama Harcaması"
              value={money.format(report.current.spend)}
              comparison={delta(report.current.spend, report.previous.spend)}
              detail="Gerçek gider kayıtları"
            />
            <CompareMetric
              label="Potansiyel Müşteri"
              value={number.format(report.current.leads)}
              comparison={delta(report.current.leads, report.previous.leads)}
              detail="Dönemde gelen talepler"
            />
            <CompareMetric
              label="Randevu"
              value={number.format(report.current.appointments)}
              comparison={delta(
                report.current.appointments,
                report.previous.appointments,
              )}
              detail={percentage(report.current.appointmentRate) + " dönüşüm"}
            />
            <CompareMetric
              label="Satış"
              value={number.format(report.current.sales)}
              comparison={delta(report.current.sales, report.previous.sales)}
              detail={percentage(report.current.saleRate) + " dönüşüm"}
            />
            <CompareMetric
              label="Atfedilen Gelir"
              value={money.format(report.current.revenue)}
              comparison={delta(
                report.current.revenue,
                report.previous.revenue,
              )}
              detail="Seçili dönemde gelen talepler"
            />
            <CompareMetric
              label="Reklam Getirisi"
              value={
                report.current.roas == null
                  ? "—"
                  : report.current.roas.toFixed(2) + "x"
              }
              comparison={
                report.current.roas == null || report.previous.roas == null
                  ? "—"
                  : delta(report.current.roas, report.previous.roas)
              }
              detail={
                report.current.costPerLead == null
                  ? "Talep maliyeti —"
                  : "Talep maliyeti " +
                    money.format(report.current.costPerLead)
              }
            />
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
            <Panel
              title="Günlük Performans"
              description="Seçili dönemin günlük operasyon hareketi."
              action={
                <Select
                  value={trendMetric}
                  onChange={(event) =>
                    setTrendMetric(event.target.value as TrendMetric)
                  }
                  className="h-9 rounded-[10px] border border-[var(--line)] bg-white px-3 text-[9px]"
                >
                  <option value="LEADS">Potansiyel Müşteri</option>
                  <option value="SPEND">Pazarlama Harcaması</option>
                  <option value="REVENUE">Gelir</option>
                  <option value="CONTENT">Yayınlanan İçerik</option>
                </Select>
              }
            >
              <DailyChart rows={report.daily} metric={trendMetric} />
            </Panel>

            <Panel
              title="Dönüşüm Hunisi"
              description="Seçili dönemde gelen taleplerin bugünkü dönüşüm seviyesi."
            >
              <Funnel metrics={report.current} />
              <div className="mt-4 grid grid-cols-2 gap-2">
                <SmallMetric
                  label="Randevu Oranı"
                  value={percentage(report.current.appointmentRate)}
                  detail={rateDelta(
                    report.current.appointmentRate,
                    report.previous.appointmentRate,
                  )}
                />
                <SmallMetric
                  label="Satış Oranı"
                  value={percentage(report.current.saleRate)}
                  detail={rateDelta(
                    report.current.saleRate,
                    report.previous.saleRate,
                  )}
                />
              </div>
            </Panel>
          </section>

          <section className="grid gap-5 xl:grid-cols-2">
            <Panel
              title="Kanal Performansı"
              description="Kaynak bazında talep, randevu, satış ve gelir."
            >
              <ChannelTable rows={report.channels} />
            </Panel>

            <Panel
              title="Pazarlama Gider Dağılımı"
              description="Gerçek finans kuyruğundaki giderlerin kategori ve kaynak kırılımı."
            >
              <ExpenseBreakdown rows={report.expenseCategories} />
            </Panel>
          </section>

          {canFinanceRead && report.current.financePending > 0 ? (
            <Panel
              title="Finans Bekleyen Giderler"
              description="Seçili dönemde henüz tedarikçi borcu kaydına dönüşmemiş gerçek pazarlama giderleri."
              action={
                <Link
                  href="/finance"
                  className="text-[8px] font-semibold text-[var(--accent)]"
                >
                  Finans Merkezi →
                </Link>
              }
            >
              <PendingFinanceExpenses
                rows={pendingExpenses}
                canManage={canFinanceManage}
                onTransfer={setTransferExpense}
              />
            </Panel>
          ) : null}

          {transferExpense ? (
            <MarketingFinanceTransferPanel
              expenseId={transferExpense.id}
              title={transferExpense.description}
              amountLabel={money.format(Number(transferExpense.amount || 0))}
              onClose={() => setTransferExpense(null)}
              onDone={async () => {
                setTransferExpense(null);
                await load();
              }}
            />
          ) : null}

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <OperationalMetric
              label="Yayınlanan İçerik"
              value={number.format(report.current.contentPublished)}
              detail={delta(
                report.current.contentPublished,
                report.previous.contentPublished,
              )}
            />
            <OperationalMetric
              label="PR & Medya Faaliyeti"
              value={number.format(report.current.prActivities)}
              detail={delta(
                report.current.prActivities,
                report.previous.prActivities,
              )}
            />
            <OperationalMetric
              label="PR Erişimi"
              value={number.format(report.current.prReach)}
              detail={delta(report.current.prReach, report.previous.prReach)}
            />
            <OperationalMetric
              label="İçerik Üreticisi İş Birliği"
              value={number.format(report.current.creatorCollaborations)}
              detail={delta(
                report.current.creatorCollaborations,
                report.previous.creatorCollaborations,
              )}
            />
            <OperationalMetric
              label="Finans Bekleyen"
              value={number.format(report.current.financePending)}
              detail={
                money.format(report.current.postedSpend) +
                " finansa aktarıldı"
              }
              attention={report.current.financePending > 0}
            />
          </section>
        </>
      ) : null}
    </div>
  );
}

function CompareMetric({
  label,
  value,
  comparison,
  detail,
}: {
  label: string;
  value: string;
  comparison: string;
  detail: string;
}) {
  return (
    <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)]">
      <p className="text-[8px] font-semibold uppercase tracking-[.1em] text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-3 text-[21px] font-semibold tracking-[-.04em] text-[var(--ink)]">
        {value}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[8px] font-semibold text-[var(--accent)]">
          {comparison}
        </span>
        <span className="text-right text-[7px] text-[var(--muted)]">
          {detail}
        </span>
      </div>
    </div>
  );
}

function Panel({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[13px] font-semibold text-[var(--ink)]">
            {title}
          </h2>
          <p className="mt-1 text-[8px] leading-4 text-[var(--muted)]">
            {description}
          </p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function DailyChart({
  rows,
  metric,
}: {
  rows: Report["daily"];
  metric: TrendMetric;
}) {
  const valueOf = (row: Report["daily"][number]) =>
    metric === "LEADS"
      ? row.leads
      : metric === "SPEND"
        ? row.spend
        : metric === "REVENUE"
          ? row.revenue
          : row.contentPublished;

  const max = Math.max(1, ...rows.map(valueOf));

  if (!rows.length) {
    return (
      <div className="py-10 text-center text-[9px] text-[var(--muted)]">
        Bu dönem için günlük veri bulunmuyor.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div
        className="flex min-w-full items-end gap-1.5"
        style={{ width: Math.max(720, rows.length * 28) }}
      >
        {rows.map((row) => {
          const value = valueOf(row);
          const label =
            metric === "SPEND" || metric === "REVENUE"
              ? money.format(value)
              : number.format(value);

          return (
            <div
              key={row.date}
              className="group flex min-w-[20px] flex-1 flex-col items-center"
              title={displayDate(row.date) + " · " + label}
            >
              <span className="mb-1 hidden text-[7px] text-[var(--muted)] group-hover:block">
                {label}
              </span>
              <div className="flex h-36 w-full items-end rounded-[6px] bg-[var(--surface-2)] px-[2px]">
                <div
                  className="w-full rounded-[4px] bg-[var(--accent)]"
                  style={{
                    height:
                      Math.max(value > 0 ? 4 : 0, (value / max) * 100) + "%",
                  }}
                />
              </div>
              <span className="mt-1 text-[6px] text-[var(--muted-soft)]">
                {new Date(row.date + "T12:00:00").getDate()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Funnel({ metrics }: { metrics: PeriodMetrics }) {
  const steps = [
    ["Potansiyel Müşteri", metrics.leads],
    ["CRM'e Aktarılan", metrics.crmLeads],
    ["Müşteriye Dönüşen", metrics.customers],
    ["Randevu", metrics.appointments],
    ["Satış", metrics.sales],
  ] as const;
  const base = Math.max(1, metrics.leads);

  return (
    <div className="space-y-3">
      {steps.map(([label, value]) => (
        <div key={label}>
          <div className="mb-1 flex justify-between gap-3 text-[8px]">
            <span className="font-medium text-[var(--ink)]">{label}</span>
            <span className="font-semibold text-[var(--muted)]">
              {value} · %{Math.round((value / base) * 100)}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
            <div
              className="h-full rounded-full bg-[var(--accent)]"
              style={{
                width:
                  Math.max(value > 0 ? 4 : 0, (value / base) * 100) + "%",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function ChannelTable({ rows }: { rows: Report["channels"] }) {
  if (!rows.length) {
    return (
      <div className="py-8 text-center text-[9px] text-[var(--muted)]">
        Seçili dönemde kanal verisi bulunmuyor.
      </div>
    );
  }

  return (
    <div className="divide-y divide-[var(--line)]">
      {rows.map((row) => (
        <div
          key={row.provider}
          className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(120px,1fr)_70px_70px_70px_110px]"
        >
          <div>
            <p className="text-[9px] font-semibold text-[var(--ink)]">
              {userLabel(row.provider)}
            </p>
            <p className="mt-1 text-[7px] text-[var(--muted)]">
              Randevu {percentage(row.appointmentRate)} · Satış{" "}
              {percentage(row.saleRate)}
            </p>
          </div>
          <DataCell label="Talep" value={String(row.leads)} />
          <DataCell label="Randevu" value={String(row.appointments)} />
          <DataCell label="Satış" value={String(row.sales)} />
          <DataCell label="Gelir" value={money.format(row.revenue)} />
        </div>
      ))}
    </div>
  );
}

function ExpenseBreakdown({
  rows,
}: {
  rows: Report["expenseCategories"];
}) {
  const total = rows.reduce((sum, row) => sum + row.amount, 0);

  if (!rows.length) {
    return (
      <div className="py-8 text-center text-[9px] text-[var(--muted)]">
        Seçili dönemde pazarlama gideri bulunmuyor.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const share = total > 0 ? row.amount / total : 0;
        return (
          <div key={row.category + row.sourceType}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[9px] font-semibold text-[var(--ink)]">
                  {expenseLabels[row.category] ?? userLabel(row.category)}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="text-[7px] text-[var(--muted)]">
                    {row.count} kayıt · {userLabel(row.sourceType)}
                  </p>
                  {row.pendingCount > 0 ? (
                    <span className="rounded-full bg-[var(--warning-soft)] px-2 py-0.5 text-[7px] font-semibold text-[var(--warning)]">
                      {row.pendingCount} finans bekliyor
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-semibold text-[var(--ink)]">
                  {money.format(row.amount)}
                </p>
                {row.pendingCount > 0 ? (
                  <Link
                    href={expenseSourceHref(row.sourceType)}
                    className="mt-1 inline-block text-[7px] font-semibold text-[var(--accent)]"
                  >
                    İlgili kayıtları aç →
                  </Link>
                ) : null}
              </div>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
              <div
                className="h-full rounded-full bg-[var(--accent)]"
                style={{ width: share * 100 + "%" }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PendingFinanceExpenses({
  rows,
  canManage,
  onTransfer,
}: {
  rows: FinanceExpense[];
  canManage: boolean;
  onTransfer: (row: FinanceExpense) => void;
}) {
  if (!rows.length) {
    return (
      <div className="rounded-[12px] bg-[var(--surface-2)] p-5 text-center text-[8px] text-[var(--muted)]">
        Rapor toplamında finans bekleyen gider bulunuyor ancak seçili dönem için
        ayrıntı görüntüleme yetkisiyle eşleşen kayıt bulunamadı.
      </div>
    );
  }

  const visible = rows.slice(0, 20);

  return (
    <div className="divide-y divide-[var(--line)]">
      {visible.map((row) => (
        <div
          key={row.id}
          className="grid gap-3 py-3 first:pt-0 last:pb-0 lg:grid-cols-[minmax(240px,1.3fr)_150px_130px_150px]"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-[9px] font-semibold text-[var(--ink)]">
                {row.description}
              </p>
              <span className="rounded-full bg-[var(--warning-soft)] px-2 py-0.5 text-[7px] font-semibold text-[var(--warning)]">
                {row.status === "APPROVED"
                  ? "Finansa Hazır"
                  : "Finans Bekliyor"}
              </span>
            </div>
            <p className="mt-1 text-[7px] text-[var(--muted)]">
              {expenseSourceLabel(row.sourceType)}
              {row.campaignName ? " · " + row.campaignName : ""}
              {row.vendorName ? " · " + row.vendorName : ""}
            </p>
          </div>

          <DataCell
            label="Gider Tarihi"
            value={displayDate(String(row.incurredOn).slice(0, 10))}
          />

          <DataCell
            label="Tutar"
            value={money.format(Number(row.amount || 0))}
          />

          <div className="flex items-center gap-2 lg:justify-end">
            <Link
              href={expenseSourceHref(row.sourceType)}
              className="inline-flex h-8 items-center rounded-[9px] border border-[var(--line)] px-2.5 text-[7px] font-semibold text-[var(--ink)]"
            >
              Kaynağı Aç
            </Link>
            {canManage ? (
              <button
                type="button"
                onClick={() => onTransfer(row)}
                className="h-8 rounded-[9px] bg-[var(--accent)] px-2.5 text-[7px] font-semibold text-white"
              >
                Finansa Aktar
              </button>
            ) : null}
          </div>
        </div>
      ))}

      {rows.length > visible.length ? (
        <p className="pt-3 text-[7px] font-medium text-[var(--muted)]">
          +{rows.length - visible.length} finans bekleyen kayıt daha var.
        </p>
      ) : null}
    </div>
  );
}

function SmallMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[12px] bg-[var(--surface-2)] p-3">
      <span className="block text-[7px] text-[var(--muted)]">{label}</span>
      <strong className="mt-1.5 block text-[12px] text-[var(--ink)]">
        {value}
      </strong>
      <span className="mt-1 block text-[7px] text-[var(--muted)]">
        {detail}
      </span>
    </div>
  );
}

function OperationalMetric({
  label,
  value,
  detail,
  attention,
}: {
  label: string;
  value: string;
  detail: string;
  attention?: boolean;
}) {
  return (
    <div
      className={
        attention
          ? "rounded-[16px] border border-[var(--warning)]/25 bg-[var(--warning-soft)] p-4"
          : "rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-4"
      }
    >
      <span className="text-[8px] font-semibold text-[var(--muted)]">
        {label}
      </span>
      <strong className="mt-2 block text-[18px] text-[var(--ink)]">
        {value}
      </strong>
      <span className="mt-1 block text-[7px] text-[var(--muted)]">
        {detail}
      </span>
    </div>
  );
}

function DataCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="block text-[6px] uppercase tracking-[.08em] text-[var(--muted-soft)]">
        {label}
      </span>
      <strong className="mt-1 block text-[8px] text-[var(--ink)]">
        {value}
      </strong>
    </div>
  );
}
