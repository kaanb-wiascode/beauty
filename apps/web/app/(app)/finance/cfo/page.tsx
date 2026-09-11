"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  FinanceEmpty,
  FinanceMetric,
  FinancePanel,
  FinanceStatus,
  FinanceTab,
  FinanceTabs,
} from "@/components/finance-view";
import { Alert, Button, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, ApiError } from "@/lib/api";
import {
  CFO_STATUS_LABEL,
  formatCfoMoney,
  formatCfoNumber,
  formatCfoSigned,
  type CfoActionItem,
  type CfoAnomalies,
  type CfoBenchmark,
  type CfoCashFlow,
  type CfoCashFlowWeek,
  type CfoCockpit,
  type CfoExecutiveAlert,
  type CfoHealthHistoryItem,
  type CfoPriorityItem,
  type CfoSeverity,
  type CfoSla,
  type CfoTabKey,
} from "@/lib/cfo-types";

export default function CfoCockpitPage() {
  const { showToast } = useToast();
  const [cockpit, setCockpit] = useState<CfoCockpit | null>(null);
  const [benchmark, setBenchmark] = useState<CfoBenchmark | null>(null);
  const [anomalies, setAnomalies] = useState<CfoAnomalies | null>(null);
  const [actions, setActions] = useState<CfoActionItem[]>([]);
  const [history, setHistory] = useState<CfoHealthHistoryItem[]>([]);
  const [cashFlow, setCashFlow] = useState<CfoCashFlow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<CfoTabKey>("overview");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [c, b, a, acts, h, cf] = await Promise.all([
        api<CfoCockpit>("/profitability/cfo/management-cockpit"),
        api<CfoBenchmark>("/profitability/cfo/branches/benchmark"),
        api<CfoAnomalies>("/profitability/cfo/anomalies?days=60"),
        api<CfoActionItem[]>("/profitability/cfo/actions?limit=100"),
        api<CfoHealthHistoryItem[]>("/profitability/cfo/health/history?limit=180"),
        api<CfoCashFlow>("/profitability/cash-flow/13-week?scenario=BASE"),
      ]);
      setCockpit(c);
      setBenchmark(b);
      setAnomalies(a);
      setActions(acts);
      setHistory(h);
      setCashFlow(cf);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "CFO verileri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openActions = useMemo(
    () => actions.filter((action) => !["COMPLETED", "CANCELLED"].includes(action.status)),
    [actions],
  );

  async function syncRecommendations() {
    setBusy(true);
    setError("");
    try {
      await api("/profitability/cfo/actions/sync-recommendations", { method: "POST" });
      showToast("Finansal öneriler aksiyon listesiyle eşleştirildi.");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Öneriler eşitlenemedi.");
    } finally {
      setBusy(false);
    }
  }

  async function escalate() {
    setBusy(true);
    setError("");
    try {
      await api("/profitability/cfo/actions/escalate", { method: "POST" });
      showToast("SLA escalation kontrolü tamamlandı.");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Escalation çalıştırılamadı.");
    } finally {
      setBusy(false);
    }
  }

  async function setActionStatus(id: string, status: "IN_PROGRESS" | "COMPLETED") {
    setBusy(true);
    setError("");
    try {
      await api(`/profitability/cfo/actions/${id}`, { method: "PATCH", body: { status } });
      showToast(status === "COMPLETED" ? "Aksiyon tamamlandı." : "Aksiyon başlatıldı.");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Aksiyon güncellenemedi.");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !cockpit) {
    return (
      <div className="mx-auto max-w-[1500px] py-20">
        <Spinner label="CFO yönetim kokpiti hazırlanıyor..." />
      </div>
    );
  }

  const health = cockpit?.health;
  const liquidity = cockpit?.liquidity;
  const workingCapital = cockpit?.workingCapital;
  const actionSummary = cockpit?.actions?.summary;
  const sla = cockpit?.actions?.sla;

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-12">
      <header className="flex flex-col gap-5 rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[0_12px_36px_rgba(17,70,104,0.04)] xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-[var(--accent)]">Finans & CFO</p>
          <h1 className="text-[32px] font-semibold tracking-[-.045em] text-[var(--ink)]">Yönetim Kokpiti</h1>
          <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[var(--muted)]">
            Likidite, çalışma sermayesi, finansal sağlık, trendler, şube kıyaslaması ve yönetim aksiyonlarını tek ekrandan yönetin.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void syncRecommendations()}>
            Önerileri Aksiyona Çevir
          </Button>
          <Button disabled={busy} onClick={() => void escalate()} className="!border-[var(--ink)] !bg-[var(--ink)] !text-white">
            SLA Kontrolü
          </Button>
        </div>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <FinanceMetric
          label="Finansal Sağlık"
          value={health?.score ?? "—"}
          detail={CFO_STATUS_LABEL[health?.status ?? ""] ?? health?.status}
          tone={health?.status === "CRITICAL" ? "danger" : health?.status === "WEAK" ? "warning" : "success"}
        />
        <FinanceMetric
          label="Nakit Runway"
          value={liquidity?.runwayWeeks == null ? "Self-funded" : `${formatCfoNumber(liquidity.runwayWeeks)} hf`}
          detail="Likidite tabanına kadar"
          tone={liquidity?.risk ? "danger" : "success"}
        />
        <FinanceMetric
          label="Net Çalışma Sermayesi"
          value={formatCfoMoney(workingCapital?.netWorkingCapital)}
          detail="Alacak + stok − borç"
          tone={(workingCapital?.netWorkingCapital ?? 0) < 0 ? "danger" : "neutral"}
        />
        <FinanceMetric
          label="DSO / DPO"
          value={`${formatCfoNumber(workingCapital?.dsoDays)} / ${formatCfoNumber(workingCapital?.dpoDays)}`}
          detail="Gün"
        />
        <FinanceMetric
          label="Açık Aksiyon"
          value={actionSummary?.open ?? openActions.length}
          detail={`${actionSummary?.overdue ?? 0} gecikmiş`}
          tone={(actionSummary?.overdue ?? 0) > 0 ? "warning" : "neutral"}
        />
        <FinanceMetric
          label="Anomali"
          value={anomalies?.anomalyCount ?? 0}
          detail={`${anomalies?.criticalCount ?? 0} kritik`}
          tone={(anomalies?.criticalCount ?? 0) > 0 ? "danger" : "neutral"}
        />
      </section>

      <FinanceTabs>
        <FinanceTab active={tab === "overview"} onClick={() => setTab("overview")}>Genel Bakış</FinanceTab>
        <FinanceTab active={tab === "trends"} onClick={() => setTab("trends")}>Trend & Nakit</FinanceTab>
        <FinanceTab active={tab === "branches"} onClick={() => setTab("branches")}>Şube Kıyaslama</FinanceTab>
        <FinanceTab active={tab === "actions"} onClick={() => setTab("actions")}>Aksiyon Merkezi</FinanceTab>
        <FinanceTab active={tab === "risk"} onClick={() => setTab("risk")}>Risk & Anomali</FinanceTab>
      </FinanceTabs>

      {tab === "overview" ? <Overview cockpit={cockpit} benchmark={benchmark} actions={openActions} /> : null}
      {tab === "trends" ? <TrendCenter history={history} cashFlow={cashFlow} /> : null}
      {tab === "branches" ? <BranchComparison benchmark={benchmark} /> : null}
      {tab === "actions" ? <ActionCenter actions={actions} sla={sla} busy={busy} onStatus={setActionStatus} /> : null}
      {tab === "risk" ? <RiskCenter cockpit={cockpit} anomalies={anomalies} /> : null}
    </div>
  );
}

function Overview({ cockpit, benchmark, actions }: { cockpit: CfoCockpit | null; benchmark: CfoBenchmark | null; actions: CfoActionItem[] }) {
  const alerts = cockpit?.executiveAlerts ?? [];
  const priorities = cockpit?.priorities ?? [];

  return (
    <div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
      <section className="space-y-5">
        <FinancePanel title="13 Haftalık Likidite" description="Tahmini nakit pozisyonu ve minimum seviye">
          <div className="grid gap-3 sm:grid-cols-3">
            <Mini label="Açılış Likiditesi" value={formatCfoMoney(cockpit?.liquidity?.opening)} />
            <Mini label="13. Hafta Kapanış" value={formatCfoMoney(cockpit?.liquidity?.thirteenWeekClosing)} />
            <Mini label="En Düşük Likidite" value={formatCfoMoney(cockpit?.liquidity?.thirteenWeekLowest)} danger={(cockpit?.liquidity?.thirteenWeekLowest ?? 0) < 0} />
          </div>
        </FinancePanel>

        <FinancePanel title="Şube Sağlık Dağılımı" description={`${benchmark?.scoredBranchCount ?? benchmark?.branches.length ?? 0} şube skorlandı`}>
          <div className="grid gap-3 sm:grid-cols-4">
            <Mini label="Ortalama" value={formatCfoNumber(benchmark?.averageHealthScore)} />
            <Mini label="Medyan" value={formatCfoNumber(benchmark?.medianHealthScore)} />
            <Mini label="En Güçlü" value={formatCfoNumber(benchmark?.bestScore)} />
            <Mini label="En Zayıf" value={formatCfoNumber(benchmark?.worstScore)} danger={(benchmark?.worstScore ?? 100) < 60} />
          </div>
          <div className="mt-4 space-y-2">
            {(benchmark?.branches ?? []).slice(0, 6).map((branch, index) => (
              <div key={branch.branchId} className="flex items-center gap-3 rounded-[14px] bg-[var(--surface-2)]/55 px-4 py-3">
                <span className="w-6 text-[11px] font-semibold text-[var(--muted-soft)]">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-[var(--ink)]">{branch.branchName}</p>
                  <p className="text-[11px] text-[var(--muted)]">Percentile {formatCfoNumber(branch.percentile)} · Ortalamaya göre {formatCfoSigned(branch.varianceFromAverage)}</p>
                </div>
                <Score value={branch.healthScore} />
              </div>
            ))}
          </div>
        </FinancePanel>
      </section>

      <aside className="space-y-5">
        <FinancePanel title="Yönetim Öncelikleri" description="Finansal health engine önerileri">
          <div className="space-y-2">
            {priorities.length ? priorities.slice(0, 6).map((priority, index) => (
              <PriorityNotice key={`${priority.code}-${index}`} priority={priority} />
            )) : <FinanceEmpty title="Aktif finansal öncelik yok." />}
          </div>
        </FinancePanel>

        <FinancePanel title="Executive Alerts" description={`${alerts.length} aktif uyarı`}>
          <div className="space-y-2">
            {alerts.length ? alerts.slice(0, 6).map((alert, index) => (
              <AlertNotice key={`${alert.code}-${index}`} alert={alert} />
            )) : <FinanceEmpty title="Aktif executive alert yok." />}
          </div>
        </FinancePanel>

        <FinancePanel title="Aksiyon Kuyruğu" description={`${actions.length} açık aksiyon`}>
          <div className="space-y-2">
            {actions.slice(0, 5).map((action) => (
              <div key={action.id} className="rounded-[14px] border border-[var(--line)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[12px] font-semibold leading-5 text-[var(--ink)]">{action.title}</p>
                  <PriorityBadge value={action.priority} />
                </div>
                <p className="mt-2 text-[10px] text-[var(--muted-soft)]">
                  {CFO_STATUS_LABEL[action.status] ?? action.status}{action.dueAt ? ` · ${formatDate(action.dueAt)}` : ""}
                </p>
              </div>
            ))}
            {!actions.length ? <FinanceEmpty title="Açık aksiyon yok." /> : null}
          </div>
        </FinancePanel>
      </aside>
    </div>
  );
}

function TrendCenter({ history, cashFlow }: { history: CfoHealthHistoryItem[]; cashFlow: CfoCashFlow | null }) {
  const healthPoints = history.slice(-90).map((item) => ({ label: shortDate(item.snapshotDate), value: Number(item.healthScore) }));
  const liquidityPoints = (cashFlow?.weeks ?? []).map((item) => ({ label: `H${item.week}`, value: Number(item.closingLiquidity) }));

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <FinancePanel title="Financial Health Trend" description="Son 90 snapshot">
          <LineChart points={healthPoints} minFloor={0} maxCeil={100} empty="Trend için yeterli snapshot yok." />
        </FinancePanel>
        <FinancePanel title="13 Haftalık Likidite Eğrisi" description="BASE senaryosu · haftalık kapanış likiditesi">
          <LineChart points={liquidityPoints} empty="Cash-flow projeksiyonu bulunamadı." moneyAxis />
        </FinancePanel>
      </div>

      <FinancePanel title="Haftalık Nakit Giriş / Çıkış" description="Öngörülen tahsilat ve tedarikçi ödeme yükü">
        <CashBars weeks={cashFlow?.weeks ?? []} />
      </FinancePanel>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniCard label="Toplam Beklenen Giriş" value={formatCfoMoney(cashFlow?.projectedInflows)} />
        <MiniCard label="Toplam Beklenen Çıkış" value={formatCfoMoney(cashFlow?.projectedOutflows)} />
        <MiniCard label="13H Net Nakit" value={formatCfoMoney(cashFlow?.projectedNetCashFlow)} danger={(cashFlow?.projectedNetCashFlow ?? 0) < 0} />
        <MiniCard label="En Düşük Likidite" value={formatCfoMoney(cashFlow?.lowestLiquidity)} danger={(cashFlow?.lowestLiquidity ?? 0) < 0} />
      </div>
    </div>
  );
}

function LineChart({ points, minFloor, maxCeil, empty, moneyAxis = false }: { points: Array<{ label: string; value: number }>; minFloor?: number; maxCeil?: number; empty: string; moneyAxis?: boolean }) {
  if (points.length < 2) return <FinanceEmpty title={empty} />;
  const width = 720;
  const height = 230;
  const pad = 28;
  const values = points.map((point) => point.value).filter(Number.isFinite);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const min = minFloor !== undefined ? Math.min(minFloor, rawMin) : rawMin;
  const max = maxCeil !== undefined ? Math.max(maxCeil, rawMax) : rawMax;
  const range = Math.max(1, max - min);
  const coords = points.map((point, index) => ({
    x: pad + (index * (width - pad * 2)) / Math.max(1, points.length - 1),
    y: height - pad - ((point.value - min) / range) * (height - pad * 2),
    ...point,
  }));
  const path = coords.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");

  return (
    <div>
      <div className="overflow-hidden rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)]/35 p-2">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-[230px] w-full" role="img" aria-label="Finansal trend grafiği">
          <line x1={pad} x2={width - pad} y1={height - pad} y2={height - pad} stroke="currentColor" className="text-[var(--line)]" strokeWidth="1" />
          <line x1={pad} x2={width - pad} y1={pad} y2={pad} stroke="currentColor" className="text-[var(--line)]" strokeWidth="1" />
          <path d={path} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {coords.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="3.5" fill="white" stroke="var(--accent)" strokeWidth="2" />)}
        </svg>
      </div>
      <div className="mt-2 flex items-center justify-between text-[9px] text-[var(--muted-soft)]">
        <span>{points[0]?.label}</span>
        <span>{moneyAxis ? `${formatCfoMoney(min)} → ${formatCfoMoney(max)}` : `${formatCfoNumber(min)} → ${formatCfoNumber(max)}`}</span>
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </div>
  );
}

function CashBars({ weeks }: { weeks: CfoCashFlowWeek[] }) {
  if (!weeks.length) return <FinanceEmpty title="Cash-flow haftaları bulunamadı." />;
  const max = Math.max(1, ...weeks.flatMap((week) => [Number(week.projectedInflows), Number(week.projectedOutflows)]));

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[820px] grid-cols-13 items-end gap-2">
        {weeks.map((week) => (
          <div key={week.week} className="flex flex-col items-center gap-2">
            <div className="flex h-[180px] w-full items-end justify-center gap-1 rounded-[12px] bg-[var(--surface-2)]/55 px-1.5 py-2">
              <div title={`Giriş ${formatCfoMoney(week.projectedInflows)}`} className="w-3 rounded-t bg-[var(--accent)]" style={{ height: `${Math.max(3, (Number(week.projectedInflows) / max) * 155)}px` }} />
              <div title={`Çıkış ${formatCfoMoney(week.projectedOutflows)}`} className="w-3 rounded-t bg-[var(--warning)]" style={{ height: `${Math.max(3, (Number(week.projectedOutflows) / max) * 155)}px` }} />
            </div>
            <span className="text-[9px] font-semibold text-[var(--muted-soft)]">H{week.week}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-[10px] text-[var(--muted)]"><span>■ Tahsilat</span><span>■ Ödeme</span></div>
    </div>
  );
}

function BranchComparison({ benchmark }: { benchmark: CfoBenchmark | null }) {
  return (
    <FinancePanel title="Şube Benchmark" description="Şubeleri finansal sağlık ve şirket ortalamasına göre karşılaştırın">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left">
          <thead><tr className="border-b border-[var(--line)] text-[10px] uppercase tracking-[.12em] text-[var(--muted-soft)]"><th className="px-3 py-3">Şube</th><th className="px-3 py-3">Skor</th><th className="px-3 py-3">Durum</th><th className="px-3 py-3">Percentile</th><th className="px-3 py-3">Ort. Farkı</th><th className="px-3 py-3">Konum</th></tr></thead>
          <tbody>
            {benchmark?.branches.map((branch, index) => (
              <tr key={branch.branchId} className="border-b border-[var(--line)] text-[12px] text-[var(--muted)]">
                <td className="px-3 py-4"><p className="font-semibold text-[var(--ink)]">{branch.branchName}</p><p className="mt-1 text-[10px] text-[var(--muted-soft)]">{branch.branchCode}</p></td>
                <td className="px-3 py-4"><Score value={branch.healthScore} /></td>
                <td className="px-3 py-4">{CFO_STATUS_LABEL[branch.healthStatus ?? ""] ?? branch.healthStatus ?? "—"}</td>
                <td className="px-3 py-4">{formatCfoNumber(branch.percentile)}</td>
                <td className="px-3 py-4">{formatCfoSigned(branch.varianceFromAverage)}</td>
                <td className="px-3 py-4">#{index + 1}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </FinancePanel>
  );
}

function ActionCenter({ actions, sla, busy, onStatus }: { actions: CfoActionItem[]; sla?: CfoSla; busy: boolean; onStatus: (id: string, status: "IN_PROGRESS" | "COMPLETED") => Promise<void> }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        <MiniCard label="Açık" value={sla?.open ?? 0} />
        <MiniCard label="Gecikmiş" value={sla?.overdue ?? 0} danger={(sla?.overdue ?? 0) > 0} />
        <MiniCard label="Kritik" value={sla?.critical ?? 0} danger={(sla?.critical ?? 0) > 0} />
        <MiniCard label="24 Saat İçinde" value={sla?.dueNext24Hours ?? 0} />
      </div>

      <FinancePanel title="Executive Action Center" description="Finansal risklerden doğan yönetim aksiyonları">
        <div className="space-y-3">
          {actions.map((action) => (
            <div key={action.id} className="grid gap-3 rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-4 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <PriorityBadge value={action.priority} />
                  <FinanceStatus status={action.status}>{CFO_STATUS_LABEL[action.status] ?? action.status}</FinanceStatus>
                  {action.autoGenerated ? <span className="rounded-full bg-[var(--accent-soft)] px-2 py-1 text-[9px] font-semibold text-[var(--accent)]">AUTO</span> : null}
                  {(action.escalationLevel ?? 0) > 0 ? <span className="rounded-full bg-[var(--danger-soft)] px-2 py-1 text-[9px] font-semibold text-[var(--danger)]">ESC L{action.escalationLevel}</span> : null}
                </div>
                <p className="mt-2 text-[13px] font-semibold text-[var(--ink)]">{action.title}</p>
                {action.description ? <p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">{action.description}</p> : null}
                <p className="mt-2 text-[10px] text-[var(--muted-soft)]">Kaynak: {action.sourceCode ?? "MANUAL"}{action.dueAt ? ` · Son tarih ${formatDate(action.dueAt)}` : ""}</p>
              </div>
              {!['COMPLETED', 'CANCELLED'].includes(action.status) ? (
                <div className="flex gap-2">
                  {action.status === "OPEN" ? <Button disabled={busy} onClick={() => void onStatus(action.id, "IN_PROGRESS")}>Başlat</Button> : null}
                  <Button disabled={busy} onClick={() => void onStatus(action.id, "COMPLETED")} className="!border-[var(--success)] !bg-[var(--success)] !text-white">Tamamla</Button>
                </div>
              ) : null}
            </div>
          ))}
          {!actions.length ? <FinanceEmpty title="Henüz yönetim aksiyonu yok." /> : null}
        </div>
      </FinancePanel>
    </div>
  );
}

function RiskCenter({ cockpit, anomalies }: { cockpit: CfoCockpit | null; anomalies: CfoAnomalies | null }) {
  const alerts = cockpit?.executiveAlerts ?? [];
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <FinancePanel title="Risk Heatmap" description="Executive threshold ihlalleri">
        <div className="grid gap-3 sm:grid-cols-2">
          {alerts.map((alert, index) => (
            <div key={`${alert.code}-${index}`} className={`rounded-[16px] border p-4 ${alert.severity === "CRITICAL" ? "border-[rgba(214,78,60,.18)] bg-[var(--danger-soft)]" : "border-[rgba(184,123,32,.18)] bg-[var(--warning-soft)]"}`}>
              <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--muted)]">{alert.severity}</p>
              <p className="mt-2 text-[13px] font-semibold text-[var(--ink)]">{alert.title ?? alert.code}</p>
              <p className="mt-2 text-[11px] text-[var(--muted)]">Gerçek: {String(alert.actual ?? "—")} · Eşik: {String(alert.threshold ?? "—")}</p>
            </div>
          ))}
          {!alerts.length ? <FinanceEmpty title="Aktif threshold ihlali yok." /> : null}
        </div>
      </FinancePanel>

      <FinancePanel title="Finansal Anomaliler" description={`Son 60 gün · ${anomalies?.anomalyCount ?? 0} tespit`}>
        <div className="space-y-2">
          {anomalies?.anomalies.slice(0, 12).map((anomaly, index) => (
            <Notice key={`${anomaly.snapshotDate}-${index}`} severity={anomaly.severity} title={anomaly.branchName ?? "Şirket geneli"} text={`${formatDate(anomaly.snapshotDate)} · Skor ${formatCfoNumber(anomaly.healthScore)} · Δ ${formatCfoSigned(anomaly.scoreDelta)} · Z ${formatCfoNumber(anomaly.zScore)}`} />
          ))}
          {!anomalies?.anomalyCount ? <FinanceEmpty title="İstatistiksel anomali tespit edilmedi." /> : null}
        </div>
      </FinancePanel>
    </div>
  );
}

function PriorityNotice({ priority }: { priority: CfoPriorityItem }) {
  return <Notice severity={priority.priority === "CRITICAL" ? "CRITICAL" : "WARNING"} title={priority.action ?? priority.code} text={priority.recommendation ?? "Yönetim aksiyonu gerekli."} />;
}

function AlertNotice({ alert }: { alert: CfoExecutiveAlert }) {
  return <Notice severity={alert.severity} title={alert.title ?? alert.code} text={`Gerçekleşen: ${String(alert.actual ?? "—")} · Eşik: ${String(alert.threshold ?? "—")}`} />;
}

function Mini({ label, value, danger = false }: { label: string; value: ReactNode; danger?: boolean }) {
  return <div className={`rounded-[15px] border p-3 ${danger ? "border-[rgba(214,78,60,.16)] bg-[var(--danger-soft)]" : "border-[var(--line)] bg-[var(--surface-2)]/45"}`}><p className="text-[9px] uppercase tracking-[.1em] text-[var(--muted-soft)]">{label}</p><div className="mt-2 text-[16px] font-semibold text-[var(--ink)]">{value}</div></div>;
}

function MiniCard({ label, value, danger = false }: { label: string; value: ReactNode; danger?: boolean }) {
  return <div className={`rounded-[18px] border p-4 ${danger ? "border-[rgba(214,78,60,.16)] bg-[var(--danger-soft)]" : "border-[var(--line)] bg-[var(--surface)]"}`}><p className="text-[10px] uppercase tracking-[.1em] text-[var(--muted-soft)]">{label}</p><div className="mt-2 text-[24px] font-semibold text-[var(--ink)]">{value}</div></div>;
}

function Score({ value }: { value: number | null }) {
  if (value == null) return <span className="text-[var(--muted-soft)]">—</span>;
  const tone = value >= 80 ? "success" : value >= 60 ? "PROCESSED" : value >= 40 ? "PROCESSING" : "FAILED";
  return <FinanceStatus status={tone}>{formatCfoNumber(value)}</FinanceStatus>;
}

function PriorityBadge({ value }: { value: string }) {
  const tone = value === "CRITICAL" ? "FAILED" : value === "HIGH" ? "PROCESSING" : value === "LOW" ? "RECEIVED" : "PROCESSED";
  return <FinanceStatus status={tone}>{value}</FinanceStatus>;
}

function Notice({ severity, title, text }: { severity: CfoSeverity; title: string; text: string }) {
  const critical = severity === "CRITICAL";
  return (
    <div className={`rounded-[14px] border p-3 ${critical ? "border-[rgba(214,78,60,.16)] bg-[var(--danger-soft)]" : "border-[rgba(184,123,32,.16)] bg-[var(--warning-soft)]"}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12px] font-semibold text-[var(--ink)]">{title}</p>
        <FinanceStatus status={critical ? "FAILED" : "PROCESSING"}>{severity}</FinanceStatus>
      </div>
      <p className="mt-1.5 text-[10px] leading-4 text-[var(--muted)]">{text}</p>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short" }).format(new Date(value));
}
