"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, EmptyState, Select, Spinner, TextInput } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { userErrorMessage } from "@/lib/user-language";

type DailyReport = {
  date: string;
  leadCount: number;
  contactedCount: number;
  qualifiedCount: number;
  convertedCount: number;
  lostLeadCount: number;
  opportunityCount: number;
  openOpportunityCount: number;
  wonCount: number;
  lostOpportunityCount: number;
  pipelineValue: number;
  wonValue: number;
  leadConversionRate: number;
  winRate: number;
};

type SurveyorReport = {
  staffId: string;
  firstName: string;
  lastName: string;
  leadCount: number;
  opportunityCount: number;
  wonCount: number;
  actualSalesValue: number;
  dailyDeskQuota: number | null;
  weeklyDeskQuota: number | null;
  leadToOpportunityRate: number;
  leadToSaleRate: number;
};

type SalespersonReport = {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  leadCount: number;
  interactionCount: number;
  notReachedInteractionCount: number;
  appointmentOutcomeCount: number;
  saleOutcomeCount: number;
  interactionToAppointmentRate: number;
  opportunityCount: number;
  wonCount: number;
  lostCount: number;
  wonValue: number;
  actualSalesValue: number;
  completedFollowUpCount: number;
  overdueFollowUpCount: number;
  averageFirstResponseMinutes: number;
  leadToOpportunityRate: number;
  winRate: number;
};

type View = "OVERVIEW" | "TEAM" | "SURVEYORS" | "DAILY";
type TeamSort = "SALES" | "WON" | "WIN_RATE" | "RESPONSE" | "OVERDUE";
type TrendMetric = "LEADS" | "OPPORTUNITIES" | "WON";

function localDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function money(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(value);
}

function number(value: number) {
  return new Intl.NumberFormat("tr-TR").format(value);
}

function percent(value: number) {
  return `%${Math.round(value)}`;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value + "T12:00:00"));
}

function fullDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(value + "T12:00:00"));
}

function rangeDays(from: string, to: string) {
  const start = new Date(from + "T12:00:00");
  const end = new Date(to + "T12:00:00");
  return Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1);
}

function previousRange(from: string, to: string) {
  const days = rangeDays(from, to);
  const previousTo = new Date(from + "T12:00:00");
  previousTo.setDate(previousTo.getDate() - 1);
  const previousFrom = new Date(previousTo);
  previousFrom.setDate(previousTo.getDate() - days + 1);
  return {
    from: localDateInput(previousFrom),
    to: localDateInput(previousTo),
  };
}

function delta(current: number, previous: number) {
  if (!previous) return current ? null : 0;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

function salespersonName(row: SalespersonReport) {
  return [row.firstName, row.lastName].filter(Boolean).join(" ") || row.email || "Kullanıcı";
}

export default function CrmReportsPage() {
  const [from, setFrom] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 29);
    return localDateInput(date);
  });
  const [to, setTo] = useState(() => localDateInput(new Date()));
  const [daily, setDaily] = useState<DailyReport[]>([]);
  const [salespeople, setSalespeople] = useState<SalespersonReport[]>([]);
  const [surveyors, setSurveyors] = useState<SurveyorReport[]>([]);
  const [previousDaily, setPreviousDaily] = useState<DailyReport[]>([]);
  const [previousSalespeople, setPreviousSalespeople] = useState<SalespersonReport[]>([]);
  const [view, setView] = useState<View>("OVERVIEW");
  const [trendMetric, setTrendMetric] = useState<TrendMetric>("LEADS");
  const [teamSort, setTeamSort] = useState<TeamSort>("SALES");
  const [teamSearch, setTeamSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!from || !to) return;
    if (new Date(from + "T12:00:00") > new Date(to + "T12:00:00")) {
      setError("Başlangıç tarihi bitiş tarihinden sonra olamaz.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const currentFrom = new Date(from + "T00:00:00").toISOString();
      const currentTo = new Date(to + "T23:59:59.999").toISOString();
      const previous = previousRange(from, to);
      const previousFrom = new Date(previous.from + "T00:00:00").toISOString();
      const previousTo = new Date(previous.to + "T23:59:59.999").toISOString();
      const currentQuery = new URLSearchParams({ from: currentFrom, to: currentTo });
      const previousQuery = new URLSearchParams({ from: previousFrom, to: previousTo });

      const [dailyRows, salespersonRows, surveyorRows, previousDailyRows, previousSalespersonRows] = await Promise.all([
        api<DailyReport[]>(`/crm/operations/reports/daily?${currentQuery}`),
        api<SalespersonReport[]>(`/crm/operations/reports/salespeople?${currentQuery}`),
        api<SurveyorReport[]>(`/crm/operations/reports/surveyors?${currentQuery}`),
        api<DailyReport[]>(`/crm/operations/reports/daily?${previousQuery}`),
        api<SalespersonReport[]>(`/crm/operations/reports/salespeople?${previousQuery}`),
      ]);

      setDaily(dailyRows);
      setSalespeople(salespersonRows);
      setSurveyors(surveyorRows);
      setPreviousDaily(previousDailyRows);
      setPreviousSalespeople(previousSalespersonRows);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? userErrorMessage(requestError.message, "CRM raporları yüklenemedi.")
          : "CRM raporları yüklenemedi.",
      );
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(
    () =>
      daily.reduce(
        (acc, row) => ({
          leads: acc.leads + row.leadCount,
          contacted: acc.contacted + row.contactedCount,
          qualified: acc.qualified + row.qualifiedCount,
          converted: acc.converted + row.convertedCount,
          opportunities: acc.opportunities + row.opportunityCount,
          won: acc.won + row.wonCount,
          lost: acc.lost + row.lostOpportunityCount,
          pipelineValue: acc.pipelineValue + row.pipelineValue,
          wonValue: acc.wonValue + row.wonValue,
        }),
        {
          leads: 0,
          contacted: 0,
          qualified: 0,
          converted: 0,
          opportunities: 0,
          won: 0,
          lost: 0,
          pipelineValue: 0,
          wonValue: 0,
        },
      ),
    [daily],
  );

  const previousTotals = useMemo(
    () =>
      previousDaily.reduce(
        (acc, row) => ({
          leads: acc.leads + row.leadCount,
          opportunities: acc.opportunities + row.opportunityCount,
          won: acc.won + row.wonCount,
          lost: acc.lost + row.lostOpportunityCount,
        }),
        { leads: 0, opportunities: 0, won: 0, lost: 0 },
      ),
    [previousDaily],
  );

  const teamTotals = useMemo(
    () =>
      salespeople.reduce(
        (acc, row) => ({
          interactions: acc.interactions + row.interactionCount,
          notReached: acc.notReached + row.notReachedInteractionCount,
          appointments: acc.appointments + row.appointmentOutcomeCount,
          saleOutcomes: acc.saleOutcomes + row.saleOutcomeCount,
          actualSalesValue: acc.actualSalesValue + row.actualSalesValue,
          completedFollowUps: acc.completedFollowUps + row.completedFollowUpCount,
          overdueFollowUps: acc.overdueFollowUps + row.overdueFollowUpCount,
          responseMinutes: acc.responseMinutes + (row.averageFirstResponseMinutes > 0 ? row.averageFirstResponseMinutes : 0),
          responseUsers: acc.responseUsers + (row.averageFirstResponseMinutes > 0 ? 1 : 0),
        }),
        {
          interactions: 0,
          notReached: 0,
          appointments: 0,
          saleOutcomes: 0,
          actualSalesValue: 0,
          completedFollowUps: 0,
          overdueFollowUps: 0,
          responseMinutes: 0,
          responseUsers: 0,
        },
      ),
    [salespeople],
  );

  const previousTeamTotals = useMemo(
    () =>
      previousSalespeople.reduce(
        (acc, row) => ({
          interactions: acc.interactions + row.interactionCount,
          actualSalesValue: acc.actualSalesValue + row.actualSalesValue,
        }),
        { interactions: 0, actualSalesValue: 0 },
      ),
    [previousSalespeople],
  );

  const leadToOpportunityRate = totals.leads ? Math.round((totals.opportunities / totals.leads) * 100) : 0;
  const decided = totals.won + totals.lost;
  const winRate = decided ? Math.round((totals.won / decided) * 100) : 0;
  const appointmentRate = teamTotals.interactions
    ? Math.round((teamTotals.appointments / teamTotals.interactions) * 100)
    : 0;
  const averageResponse = teamTotals.responseUsers
    ? Math.round(teamTotals.responseMinutes / teamTotals.responseUsers)
    : 0;

  const previousDecided = previousTotals.won + previousTotals.lost;
  const previousWinRate = previousDecided
    ? Math.round((previousTotals.won / previousDecided) * 100)
    : 0;

  const sortedSalespeople = useMemo(() => {
    const query = teamSearch.trim().toLocaleLowerCase("tr-TR");
    const rows = query
      ? salespeople.filter((row) =>
          `${salespersonName(row)} ${row.email ?? ""}`
            .toLocaleLowerCase("tr-TR")
            .includes(query),
        )
      : [...salespeople];

    return rows.sort((a, b) => {
      if (teamSort === "WON") return b.wonCount - a.wonCount;
      if (teamSort === "WIN_RATE") return b.winRate - a.winRate;
      if (teamSort === "RESPONSE") {
        const av = a.averageFirstResponseMinutes || Number.MAX_SAFE_INTEGER;
        const bv = b.averageFirstResponseMinutes || Number.MAX_SAFE_INTEGER;
        return av - bv;
      }
      if (teamSort === "OVERDUE") return b.overdueFollowUpCount - a.overdueFollowUpCount;
      return b.actualSalesValue - a.actualSalesValue;
    });
  }, [salespeople, teamSearch, teamSort]);

  const trendValues = useMemo(() => {
    return daily.map((row) =>
      trendMetric === "LEADS"
        ? row.leadCount
        : trendMetric === "OPPORTUNITIES"
          ? row.opportunityCount
          : row.wonCount,
    );
  }, [daily, trendMetric]);

  const trendMax = Math.max(1, ...trendValues);
  const topSalespeople = [...salespeople]
    .sort((a, b) => b.actualSalesValue - a.actualSalesValue || b.wonCount - a.wonCount)
    .slice(0, 5);
  const maxTeamSales = Math.max(1, ...topSalespeople.map((row) => row.actualSalesValue));
  const surveyorMaxSales = Math.max(1, ...surveyors.map((row) => row.actualSalesValue));

  function quickRange(days: number) {
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - days + 1);
    setFrom(localDateInput(start));
    setTo(localDateInput(end));
  }

  function exportCsv() {
    const headers = [
      "Satışçı",
      "E-posta",
      "Potansiyel Müşteri",
      "Görüşme",
      "Randevu",
      "Satış Fırsatı",
      "Kazanılan",
      "Kazanma Oranı",
      "Gerçekleşen Satış",
      "Tamamlanan Takip",
      "Geciken Takip",
      "İlk Dönüş Dakika",
    ];
    const rows = salespeople.map((row) => [
      salespersonName(row),
      row.email ?? "",
      row.leadCount,
      row.interactionCount,
      row.appointmentOutcomeCount,
      row.opportunityCount,
      row.wonCount,
      row.winRate,
      row.actualSalesValue,
      row.completedFollowUpCount,
      row.overdueFollowUpCount,
      row.averageFirstResponseMinutes || "",
    ]);
    const escape = (value: string | number) => {
      const text = String(value);
      return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    };
    const csv = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `crm-raporu-${from}-${to}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const currentPeriodLabel = `${fullDate(from)} – ${fullDate(to)}`;
  const previous = previousRange(from, to);
  const previousPeriodLabel = `${fullDate(previous.from)} – ${fullDate(previous.to)}`;

  const cards: Array<{
    label: string;
    value: string;
    change: number | null;
    detail: string;
    pointChange?: boolean;
  }> = [
    {
      label: "Potansiyel Müşteri",
      value: number(totals.leads),
      change: delta(totals.leads, previousTotals.leads),
      detail: "Dönemde oluşturulan kayıt",
    },
    {
      label: "Satış Fırsatı",
      value: number(totals.opportunities),
      change: delta(totals.opportunities, previousTotals.opportunities),
      detail: "Dönemde oluşturulan fırsat",
    },
    {
      label: "Kazanılan Fırsat",
      value: number(totals.won),
      change: delta(totals.won, previousTotals.won),
      detail: "Kazanıldı durumundaki fırsat",
    },
    {
      label: "Gerçekleşen Satış",
      value: money(teamTotals.actualSalesValue),
      change: delta(teamTotals.actualSalesValue, previousTeamTotals.actualSalesValue),
      detail: "Onaylı satış kayıtlarından",
    },
    {
      label: "Müşteri → Fırsat",
      value: percent(leadToOpportunityRate),
      change: null,
      detail: "Potansiyel müşteriden fırsata",
    },
    {
      label: "Kazanma Oranı",
      value: percent(winRate),
      change: previousDecided ? winRate - previousWinRate : null,
      detail: "Sonuçlanan fırsatlar içinde",
      pointChange: true,
    },
  ];

  if (loading && !daily.length && !salespeople.length) {
    return <Spinner label="CRM raporları hazırlanıyor..." />;
  }

  return (
    <div className="space-y-5">
      <header className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[12px] font-medium text-[var(--muted)]">Satış ve müşteri kazanımı</p>
            <h1 className="mt-1 text-[32px] font-semibold tracking-[-.045em] text-[var(--ink)]">CRM Rapor Merkezi</h1>
            <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[var(--muted)]">
              Potansiyel müşteri kazanımını, satış dönüşümünü, ekip performansını ve takip disiplinini tek görünümde değerlendirin.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={exportCsv} disabled={!salespeople.length}>Dışa Aktar</Button>
            <Button variant="secondary" onClick={() => void load()} disabled={loading}>
              {loading ? "Güncelleniyor…" : "Raporu Yenile"}
            </Button>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 border-t border-[var(--line)] pt-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => quickRange(7)} className="rounded-[9px] bg-[var(--surface-2)] px-3 py-2 text-[9px] font-semibold text-[var(--muted)] hover:text-[var(--ink)]">Son 7 Gün</button>
            <button type="button" onClick={() => quickRange(30)} className="rounded-[9px] bg-[var(--surface-2)] px-3 py-2 text-[9px] font-semibold text-[var(--muted)] hover:text-[var(--ink)]">Son 30 Gün</button>
            <button type="button" onClick={() => quickRange(90)} className="rounded-[9px] bg-[var(--surface-2)] px-3 py-2 text-[9px] font-semibold text-[var(--muted)] hover:text-[var(--ink)]">Son 90 Gün</button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label>
              <span className="mb-1 block text-[8px] font-medium text-[var(--muted)]">Başlangıç</span>
              <TextInput type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </label>
            <label>
              <span className="mb-1 block text-[8px] font-medium text-[var(--muted)]">Bitiş</span>
              <TextInput type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </label>
          </div>
        </div>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {cards.map((card) => (
          <article key={card.label} className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)]">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[9px] font-medium text-[var(--muted)]">{card.label}</span>
              {card.change == null ? null : (
                <span className={card.change > 0 ? "text-[8px] font-semibold text-[var(--accent)]" : card.change < 0 ? "text-[8px] font-semibold text-[var(--danger)]" : "text-[8px] font-semibold text-[var(--muted)]"}>
                  {card.change > 0 ? "+" : ""}{card.change}{card.pointChange ? " puan" : "%"}
                </span>
              )}
            </div>
            <strong className="mt-3 block text-[23px] font-semibold tracking-[-.04em] text-[var(--ink)]">{card.value}</strong>
            <span className="mt-2 block text-[8px] leading-4 text-[var(--muted)]">{card.detail}</span>
          </article>
        ))}
      </section>

      <section className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex overflow-x-auto rounded-[10px] bg-[var(--surface-2)] p-1">
            {([
              ["OVERVIEW", "Genel Bakış"],
              ["TEAM", "Satış Ekibi"],
              ["SURVEYORS", "Anketörler"],
              ["DAILY", "Günlük Hareketler"],
            ] as Array<[View, string]>).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setView(value)}
                className={view === value ? "whitespace-nowrap rounded-[7px] bg-[var(--surface)] px-3 py-2 text-[9px] font-semibold text-[var(--ink)] shadow-sm" : "whitespace-nowrap rounded-[7px] px-3 py-2 text-[9px] font-semibold text-[var(--muted)]"}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[8px] text-[var(--muted)]">
            {currentPeriodLabel} · önceki eş dönem: {previousPeriodLabel}
          </p>
        </div>
      </section>

      {view === "OVERVIEW" ? (
        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,.8fr)]">
            <section className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-[14px] font-semibold text-[var(--ink)]">Günlük Satış Akışı</h2>
                  <p className="mt-1 text-[9px] text-[var(--muted)]">Seçilen dönemde gün bazında yeni kayıt hareketi</p>
                </div>
                <Select value={trendMetric} onChange={(event) => setTrendMetric(event.target.value as TrendMetric)} className="sm:max-w-[175px]">
                  <option value="LEADS">Potansiyel Müşteriler</option>
                  <option value="OPPORTUNITIES">Satış Fırsatları</option>
                  <option value="WON">Kazanılan Fırsatlar</option>
                </Select>
              </div>

              {daily.length ? (
                <div className="mt-6">
                  <div className="flex h-[210px] items-end gap-[3px] overflow-hidden border-b border-[var(--line)] pb-1">
                    {daily.map((row, index) => {
                      const value = trendValues[index] ?? 0;
                      const height = value ? Math.max(7, Math.round((value / trendMax) * 100)) : 2;
                      return (
                        <div key={row.date} className="group relative flex h-full min-w-[5px] flex-1 items-end">
                          <div className="w-full rounded-t-[4px] bg-[var(--accent)]/75 transition group-hover:bg-[var(--accent)]" style={{ height: `${height}%` }} />
                          <div className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-[8px] shadow-lg group-hover:block">
                            {dateLabel(row.date)} · {value}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex justify-between text-[8px] text-[var(--muted)]">
                    <span>{daily[0] ? dateLabel(daily[0].date) : ""}</span>
                    <span>{daily[daily.length - 1] ? dateLabel(daily[daily.length - 1].date) : ""}</span>
                  </div>
                </div>
              ) : <EmptyState title="Trend verisi yok" description="Seçilen dönemde günlük CRM hareketi bulunmuyor." />}
            </section>

            <section className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
              <h2 className="text-[14px] font-semibold text-[var(--ink)]">Satış Hunisi</h2>
              <p className="mt-1 text-[9px] text-[var(--muted)]">Dönemde oluşturulan kayıtlardan satış sonucuna geçiş</p>
              <div className="mt-5 space-y-4">
                {[
                  ["Potansiyel Müşteri", totals.leads, totals.leads ? 100 : 0],
                  ["Satış Fırsatı", totals.opportunities, totals.leads ? Math.min(100, (totals.opportunities / totals.leads) * 100) : 0],
                  ["Kazanılan Fırsat", totals.won, totals.leads ? Math.min(100, (totals.won / totals.leads) * 100) : 0],
                ].map(([label, value, width]) => (
                  <div key={String(label)}>
                    <div className="flex items-end justify-between gap-3">
                      <span className="text-[9px] font-medium text-[var(--muted)]">{label}</span>
                      <strong className="text-[13px] text-[var(--ink)]">{number(Number(value))}</strong>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-[var(--surface-2)]">
                      <div className="h-2 rounded-full bg-[var(--accent)]" style={{ width: `${Number(width)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3 border-t border-[var(--line)] pt-4">
                <div><span className="text-[8px] text-[var(--muted)]">Müşteri → Fırsat</span><strong className="mt-1 block text-[16px] text-[var(--ink)]">{percent(leadToOpportunityRate)}</strong></div>
                <div><span className="text-[8px] text-[var(--muted)]">Sonuçlanan Fırsatta Kazanma</span><strong className="mt-1 block text-[16px] text-[var(--ink)]">{percent(winRate)}</strong></div>
              </div>
            </section>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,.75fr)]">
            <section className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[14px] font-semibold text-[var(--ink)]">Satış Ekibi Liderleri</h2>
                  <p className="mt-1 text-[9px] text-[var(--muted)]">Gerçekleşen satış tutarına göre ilk 5</p>
                </div>
                <button type="button" onClick={() => setView("TEAM")} className="text-[9px] font-semibold text-[var(--accent)]">Tüm Ekibi Gör</button>
              </div>
              {topSalespeople.length ? <div className="mt-5 space-y-3">
                {topSalespeople.map((row, index) => (
                  <div key={row.userId} className="grid grid-cols-[28px_minmax(150px,1fr)_minmax(140px,.8fr)_110px] items-center gap-3 rounded-[13px] border border-[var(--line)] px-3 py-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--surface-2)] text-[9px] font-semibold text-[var(--muted)]">{index + 1}</span>
                    <div className="min-w-0"><strong className="block truncate text-[10px] text-[var(--ink)]">{salespersonName(row)}</strong><span className="mt-1 block text-[8px] text-[var(--muted)]">{row.wonCount} kazanılan · %{row.winRate} kazanma</span></div>
                    <div><div className="h-1.5 rounded-full bg-[var(--surface-2)]"><div className="h-1.5 rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(3, (row.actualSalesValue / maxTeamSales) * 100)}%` }} /></div></div>
                    <strong className="text-right text-[10px] text-[var(--ink)]">{money(row.actualSalesValue)}</strong>
                  </div>
                ))}
              </div> : <div className="mt-5"><EmptyState title="Ekip verisi yok" description="Seçilen dönemde satışçı performans verisi bulunmuyor." /></div>}
            </section>

            <section className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
              <h2 className="text-[14px] font-semibold text-[var(--ink)]">Operasyon Sağlığı</h2>
              <p className="mt-1 text-[9px] text-[var(--muted)]">Satış sürecinin günlük çalışma kalitesi</p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-[13px] bg-[var(--surface-2)] p-3"><span className="text-[8px] text-[var(--muted)]">Görüşme</span><strong className="mt-1 block text-[18px] text-[var(--ink)]">{number(teamTotals.interactions)}</strong></div>
                <div className="rounded-[13px] bg-[var(--surface-2)] p-3"><span className="text-[8px] text-[var(--muted)]">Görüşme → Randevu</span><strong className="mt-1 block text-[18px] text-[var(--ink)]">{percent(appointmentRate)}</strong></div>
                <div className="rounded-[13px] bg-[var(--surface-2)] p-3"><span className="text-[8px] text-[var(--muted)]">Tamamlanan Takip</span><strong className="mt-1 block text-[18px] text-[var(--ink)]">{number(teamTotals.completedFollowUps)}</strong></div>
                <div className={teamTotals.overdueFollowUps ? "rounded-[13px] bg-[var(--danger-soft)] p-3" : "rounded-[13px] bg-[var(--surface-2)] p-3"}><span className="text-[8px] text-[var(--muted)]">Şu An Geciken Takip</span><strong className={teamTotals.overdueFollowUps ? "mt-1 block text-[18px] text-[var(--danger)]" : "mt-1 block text-[18px] text-[var(--ink)]"}>{number(teamTotals.overdueFollowUps)}</strong></div>
                <div className="col-span-2 rounded-[13px] bg-[var(--surface-2)] p-3"><span className="text-[8px] text-[var(--muted)]">Satışçı Ortalamalarına Göre İlk Dönüş</span><strong className="mt-1 block text-[18px] text-[var(--ink)]">{averageResponse ? `${averageResponse} dk` : "—"}</strong></div>
              </div>
              <p className="mt-3 text-[8px] leading-4 text-[var(--muted)]">Geciken takip göstergesi seçilen dönemden bağımsız olarak halen açık ve zamanı geçmiş görevleri gösterir.</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
                <Link href="/crm/follow-ups" className="flex min-h-9 items-center justify-center rounded-[9px] border border-[var(--line)] px-2 text-[8px] font-semibold text-[var(--ink)] hover:bg-[var(--surface-2)]">Takip Merkezi</Link>
                <Link href="/crm/pipeline" className="flex min-h-9 items-center justify-center rounded-[9px] border border-[var(--line)] px-2 text-[8px] font-semibold text-[var(--ink)] hover:bg-[var(--surface-2)]">Satış Süreci</Link>
                <Link href="/crm/interactions" className="flex min-h-9 items-center justify-center rounded-[9px] border border-[var(--line)] px-2 text-[8px] font-semibold text-[var(--ink)] hover:bg-[var(--surface-2)]">İletişim Geçmişi</Link>
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {view === "TEAM" ? (
        <section className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)]">
          <div className="flex flex-col gap-3 border-b border-[var(--line)] p-4 lg:flex-row lg:items-center lg:justify-between">
            <div><h2 className="text-[14px] font-semibold text-[var(--ink)]">Satış Ekibi Performansı</h2><p className="mt-1 text-[9px] text-[var(--muted)]">Müşteri kazanımı, görüşme, takip ve gerçek satış sonuçları</p></div>
            <div className="flex flex-1 flex-col gap-2 sm:flex-row lg:max-w-[620px]">
              <TextInput value={teamSearch} onChange={(event) => setTeamSearch(event.target.value)} placeholder="Satışçı ara…" />
              <Select value={teamSort} onChange={(event) => setTeamSort(event.target.value as TeamSort)} className="sm:max-w-[210px]">
                <option value="SALES">Gerçek Satışa Göre</option>
                <option value="WON">Kazanılana Göre</option>
                <option value="WIN_RATE">Kazanma Oranına Göre</option>
                <option value="RESPONSE">En Hızlı İlk Dönüş</option>
                <option value="OVERDUE">Geciken Takibe Göre</option>
              </Select>
            </div>
          </div>

          {sortedSalespeople.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] text-left">
                <thead className="border-b border-[var(--line)] bg-[var(--surface-2)] text-[8px] font-semibold text-[var(--muted)]">
                  <tr>
                    <th className="px-4 py-3">Satışçı</th>
                    <th className="px-3 py-3">Pot. Müşteri</th>
                    <th className="px-3 py-3">Görüşme</th>
                    <th className="px-3 py-3">Randevu</th>
                    <th className="px-3 py-3">Fırsat</th>
                    <th className="px-3 py-3">Kazanılan</th>
                    <th className="px-3 py-3">Müşteri → Fırsat</th>
                    <th className="px-3 py-3">Kazanma</th>
                    <th className="px-3 py-3">Gerçek Satış</th>
                    <th className="px-3 py-3">Tamamlanan Takip</th>
                    <th className="px-3 py-3">Geciken</th>
                    <th className="px-3 py-3">İlk Dönüş</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {sortedSalespeople.map((row) => (
                    <tr key={row.userId} className="text-[10px] hover:bg-[var(--surface-2)]/45">
                      <td className="px-4 py-3.5"><strong className="block text-[10px] text-[var(--ink)]">{salespersonName(row)}</strong><span className="mt-1 block text-[8px] text-[var(--muted)]">{row.email || "—"}</span></td>
                      <td className="px-3 py-3.5">{row.leadCount}</td>
                      <td className="px-3 py-3.5">{row.interactionCount}</td>
                      <td className="px-3 py-3.5">{row.appointmentOutcomeCount} <span className="text-[8px] text-[var(--muted)]">(%{row.interactionToAppointmentRate})</span></td>
                      <td className="px-3 py-3.5">{row.opportunityCount}</td>
                      <td className="px-3 py-3.5 font-semibold">{row.wonCount}</td>
                      <td className="px-3 py-3.5">%{row.leadToOpportunityRate}</td>
                      <td className="px-3 py-3.5">%{row.winRate}</td>
                      <td className="px-3 py-3.5 font-semibold text-[var(--ink)]">{money(row.actualSalesValue)}</td>
                      <td className="px-3 py-3.5">{row.completedFollowUpCount}</td>
                      <td className={row.overdueFollowUpCount ? "px-3 py-3.5 font-semibold text-[var(--danger)]" : "px-3 py-3.5"}>{row.overdueFollowUpCount}</td>
                      <td className="px-3 py-3.5">{row.averageFirstResponseMinutes ? `${row.averageFirstResponseMinutes} dk` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="p-6"><EmptyState title="Satışçı verisi bulunamadı" description="Seçilen dönemde veya arama sonucunda satışçı performans verisi yok." /></div>}
        </section>
      ) : null}

      {view === "SURVEYORS" ? (
        <section className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
          <div><h2 className="text-[14px] font-semibold text-[var(--ink)]">Anketör Performansı</h2><p className="mt-1 text-[9px] text-[var(--muted)]">Anketör kaynaklı potansiyel müşterilerin fırsat ve satışa dönüşümü</p></div>
          {surveyors.length ? <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {surveyors.map((row) => (
              <article key={row.staffId} className="rounded-[16px] border border-[var(--line)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div><strong className="text-[11px] text-[var(--ink)]">{row.firstName} {row.lastName}</strong><p className="mt-1 text-[8px] text-[var(--muted)]">Günlük kota: {row.dailyDeskQuota ?? "—"} · Haftalık kota: {row.weeklyDeskQuota ?? "—"}</p></div>
                  <strong className="text-[11px] text-[var(--ink)]">{money(row.actualSalesValue)}</strong>
                </div>
                <div className="mt-4 h-1.5 rounded-full bg-[var(--surface-2)]"><div className="h-1.5 rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(2, (row.actualSalesValue / surveyorMaxSales) * 100)}%` }} /></div>
                <div className="mt-4 grid grid-cols-4 gap-2">
                  <div><span className="text-[7px] text-[var(--muted)]">Pot. Müşteri</span><strong className="mt-1 block text-[11px]">{row.leadCount}</strong></div>
                  <div><span className="text-[7px] text-[var(--muted)]">Fırsat</span><strong className="mt-1 block text-[11px]">{row.opportunityCount}</strong></div>
                  <div><span className="text-[7px] text-[var(--muted)]">Fırsata Dönüşüm</span><strong className="mt-1 block text-[11px]">%{row.leadToOpportunityRate}</strong></div>
                  <div><span className="text-[7px] text-[var(--muted)]">Satışa Dönüşüm</span><strong className="mt-1 block text-[11px]">%{row.leadToSaleRate}</strong></div>
                </div>
              </article>
            ))}
          </div> : <div className="mt-5"><EmptyState title="Anketör verisi bulunamadı" description="Seçilen dönemde anketör kaynaklı performans verisi bulunmuyor." /></div>}
        </section>
      ) : null}

      {view === "DAILY" ? (
        <section className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)]">
          <div className="border-b border-[var(--line)] p-4"><h2 className="text-[14px] font-semibold text-[var(--ink)]">Günlük CRM Hareketleri</h2><p className="mt-1 text-[9px] text-[var(--muted)]">Her gün oluşturulan potansiyel müşteri ve fırsat kayıtlarının mevcut sonuçları</p></div>
          {daily.length ? <div className="divide-y divide-[var(--line)]">
            {daily.map((row) => (
              <div key={row.date} className="grid gap-3 px-4 py-3.5 sm:grid-cols-[120px_repeat(6,1fr)] sm:items-center">
                <strong className="text-[10px] text-[var(--ink)]">{dateLabel(row.date)}</strong>
                <div><span className="text-[7px] text-[var(--muted)]">Pot. Müşteri</span><strong className="mt-1 block text-[10px]">{row.leadCount}</strong></div>
                <div><span className="text-[7px] text-[var(--muted)]">Fırsat</span><strong className="mt-1 block text-[10px]">{row.opportunityCount}</strong></div>
                <div><span className="text-[7px] text-[var(--muted)]">Kazanılan</span><strong className="mt-1 block text-[10px]">{row.wonCount}</strong></div>
                <div><span className="text-[7px] text-[var(--muted)]">Kaybedilen</span><strong className="mt-1 block text-[10px]">{row.lostOpportunityCount}</strong></div>
                <div><span className="text-[7px] text-[var(--muted)]">Açık Fırsat Değeri</span><strong className="mt-1 block text-[10px]">{money(row.pipelineValue)}</strong></div>
                <div><span className="text-[7px] text-[var(--muted)]">Kazanılan Değer</span><strong className="mt-1 block text-[10px]">{money(row.wonValue)}</strong></div>
              </div>
            ))}
          </div> : <div className="p-6"><EmptyState title="Günlük hareket bulunamadı" description="Seçilen tarih aralığında günlük CRM hareketi bulunmuyor." /></div>}
        </section>
      ) : null}
    </div>
  );
}
