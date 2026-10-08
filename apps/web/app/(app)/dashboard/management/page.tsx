"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type CrmSummary = {
  newLeads: number;
  openOpportunities: number;
  weightedPipeline: number;
  overdueFollowUps: number;
  staleOpportunities: number;
  conversionRate: number;
};

type FinanceCockpit = {
  health?: { score?: number; status?: string };
  liquidity?: { runwayWeeks?: number | null; risk?: boolean };
  workingCapital?: { netWorkingCapital?: number };
  actions?: { summary?: { open?: number; overdue?: number } };
};

type InventoryOverview = {
  totalProducts?: number;
  lowStockProducts?: number;
  totalStockValue?: number;
  totalAssets?: number;
  expiringLots?: number;
};

type PurchaseRequest = { id: string; status: string; requestedQuantity?: number; createdAt?: string };
type PurchaseOrder = { id: string; status: string; totalAmount?: number; supplierName?: string | null; warehouseName?: string | null };
type StaffPage = { data?: Array<{ id: string; status?: string }> };

type AdminOverview = {
  users: { active: number; suspended: number; withoutBranchScope: number; broadCentral: number };
  invitations: { pending: number };
  roles: { total: number };
  branches: { active: number; inactive: number };
  temporaryAccess: { active: number; expiringSoon: number };
  mfa: { enrolled: number; eligible: number; coveragePercent: number };
  integrations: { total: number; unhealthy: number };
};

type DailyTrend = {
  date: string;
  gross: number;
  refunds: number;
  net: number;
  appointments: number;
  completed: number;
};

type PaymentReport = {
  summary: {
    gross: number;
    refunds: number;
    net: number;
    paymentCount: number;
    appointmentCount: number;
    completedAppointments: number;
    scheduledAppointments: number;
    confirmedAppointments: number;
    cancelledAppointments: number;
    noShowAppointments: number;
  };
  dailyTrend: DailyTrend[];
};

type ModuleLoad<T> = { data: T | null; error: string };

const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 });

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export default function ManagementCockpitPage() {
  const [crm, setCrm] = useState<ModuleLoad<CrmSummary>>({ data: null, error: "" });
  const [finance, setFinance] = useState<ModuleLoad<FinanceCockpit>>({ data: null, error: "" });
  const [inventory, setInventory] = useState<ModuleLoad<InventoryOverview>>({ data: null, error: "" });
  const [requests, setRequests] = useState<ModuleLoad<PurchaseRequest[]>>({ data: null, error: "" });
  const [orders, setOrders] = useState<ModuleLoad<PurchaseOrder[]>>({ data: null, error: "" });
  const [staff, setStaff] = useState<ModuleLoad<StaffPage>>({ data: null, error: "" });
  const [admin, setAdmin] = useState<ModuleLoad<AdminOverview>>({ data: null, error: "" });
  const [payments, setPayments] = useState<ModuleLoad<PaymentReport>>({ data: null, error: "" });
  const [loading, setLoading] = useState(true);
  const [selectedTrend, setSelectedTrend] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { start, end } = todayRange();
    const calls = await Promise.allSettled([
      api<CrmSummary>(`/crm/operations-summary?dayStart=${encodeURIComponent(start.toISOString())}&dayEnd=${encodeURIComponent(end.toISOString())}`),
      api<FinanceCockpit>("/profitability/cfo/management-cockpit"),
      api<InventoryOverview>("/inventory/overview"),
      api<PurchaseRequest[]>("/procurement/purchase-requests"),
      api<PurchaseOrder[]>("/procurement/purchase-orders"),
      api<StaffPage>("/staff?page=1&limit=100"),
      api<AdminOverview>("/admin/dashboard"),
      api<PaymentReport>(`/payments/dashboard-report?from=${encodeURIComponent(start.toISOString())}&to=${encodeURIComponent(end.toISOString())}`),
    ]);

    const apply = <T,>(result: PromiseSettledResult<T>): ModuleLoad<T> => result.status === "fulfilled"
      ? { data: result.value, error: "" }
      : { data: null, error: result.reason instanceof ApiError ? result.reason.message : "Veri yüklenemedi." };

    setCrm(apply(calls[0] as PromiseSettledResult<CrmSummary>));
    setFinance(apply(calls[1] as PromiseSettledResult<FinanceCockpit>));
    setInventory(apply(calls[2] as PromiseSettledResult<InventoryOverview>));
    setRequests(apply(calls[3] as PromiseSettledResult<PurchaseRequest[]>));
    setOrders(apply(calls[4] as PromiseSettledResult<PurchaseOrder[]>));
    setStaff(apply(calls[5] as PromiseSettledResult<StaffPage>));
    setAdmin(apply(calls[6] as PromiseSettledResult<AdminOverview>));
    setPayments(apply(calls[7] as PromiseSettledResult<PaymentReport>));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const purchase = useMemo(() => {
    const requestRows = requests.data ?? [];
    const orderRows = orders.data ?? [];
    return {
      pendingRequests: requestRows.filter((row) => row.status === "PENDING").length,
      approvedRequests: requestRows.filter((row) => row.status === "APPROVED").length,
      openOrders: orderRows.filter((row) => !["RECEIVED", "CANCELLED"].includes(row.status)).length,
      openValue: orderRows
        .filter((row) => !["RECEIVED", "CANCELLED"].includes(row.status))
        .reduce((sum, row) => sum + Number(row.totalAmount ?? 0), 0),
    };
  }, [orders.data, requests.data]);

  const activeStaff = (staff.data?.data ?? []).filter((row) => row.status === "ACTIVE").length;
  const financeOverdue = Number(finance.data?.actions?.summary?.overdue ?? 0);
  const crmOverdue = Number(crm.data?.overdueFollowUps ?? 0);
  const lowStock = Number(inventory.data?.lowStockProducts ?? 0);
  const unhealthyConnections = Number(admin.data?.integrations.unhealthy ?? 0);
  const delayedWork = crmOverdue + financeOverdue + purchase.pendingRequests;

  const issues = useMemo(() => {
    const rows: Array<{ label: string; detail: string; href: string; level: "warning" | "danger" | "info" }> = [];
    if (crmOverdue > 0) rows.push({ label: `${crmOverdue} müşteri takibi gecikmiş`, detail: "Satış ekibinin geri dönüş bekleyen kayıtları var.", href: "/crm/follow-ups", level: "warning" });
    if (financeOverdue > 0) rows.push({ label: `${financeOverdue} finans işlemi gecikmiş`, detail: "Finans tarafında tamamlanması gereken işlemler bulunuyor.", href: "/finance/cfo", level: "danger" });
    if (purchase.pendingRequests > 0) rows.push({ label: `${purchase.pendingRequests} satın alma talebi onay bekliyor`, detail: "Bekleyen talepler operasyonu etkileyebilir.", href: "/inventory/purchases", level: "warning" });
    if (lowStock > 0) rows.push({ label: `${lowStock} ürün kritik stok seviyesinde`, detail: "Stok yenileme ihtiyacı bulunan ürünler var.", href: "/inventory", level: "danger" });
    if (unhealthyConnections > 0) rows.push({ label: `${unhealthyConnections} bağlantı sorunu var`, detail: "Bağlı sistemlerden bazıları kontrol edilmeli.", href: "/settings/integrations", level: "info" });
    return rows;
  }, [crmOverdue, financeOverdue, purchase.pendingRequests, lowStock, unhealthyConnections]);

  const moduleErrors = [crm.error, finance.error, inventory.error, requests.error, orders.error, staff.error, admin.error, payments.error].filter(Boolean);

  if (loading && !crm.data && !finance.data && !inventory.data && !payments.data) {
    return <div className="mx-auto max-w-[1480px] py-20"><Spinner label="Yönetim merkezi hazırlanıyor..." /></div>;
  }

  const healthScore = Number(finance.data?.health?.score ?? 0);
  const todayNet = Number(payments.data?.summary.net ?? 0);
  const trend = payments.data?.dailyTrend ?? [];
  const appointmentTotal = Number(payments.data?.summary.appointmentCount ?? 0);

  return (
    <div className="mx-auto max-w-[1480px] space-y-5 pb-12">
      <header className="flex flex-col gap-5 rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)] xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-[var(--muted)]">Bugünün yönetim görünümü</p>
          <h1 className="mt-1 text-[32px] font-semibold tracking-[-.045em] text-[var(--ink)]">Yönetim Merkezi</h1>
          <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[var(--muted)]">Satış, finans, stok, satın alma ve ekip durumunu tek ekrandan takip edin; dikkat gerektiren konulara doğrudan geçin.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-[11px] font-semibold text-[var(--ink)]">Bugün</span>
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>{loading ? "Güncelleniyor..." : "Verileri Güncelle"}</Button>
        </div>
      </header>

      {moduleErrors.length ? <Alert>Bazı yönetim verileri şu anda alınamıyor. Erişilebilen alanlar güncel verilerle gösterilmeye devam ediyor.</Alert> : null}

      <section className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <span className="text-[11px] font-medium text-[var(--muted)]">Yönetim Özeti</span>
            <h2 className="mt-1 text-[20px] font-semibold tracking-[-.03em] text-[var(--ink)]">
              {issues.length ? `Bugün dikkat edilmesi gereken ${issues.length} konu var.` : "Bugünkü yönetim görünümü dengeli."}
            </h2>
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              {issues.length ? "Öncelikli konular aşağıda önem sırasıyla gösteriliyor." : "Şu anda kritik bir yönetim uyarısı görünmüyor."}
            </p>
          </div>
          {issues.length ? <Link href={issues[0].href} className="inline-flex min-h-10 items-center justify-center rounded-[11px] bg-[var(--accent)] px-4 text-[11px] font-semibold text-white">İlk Konuya Git</Link> : null}
        </div>
        {issues.length ? <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{issues.slice(0, 6).map((item) => <Link key={item.label} href={item.href} className="group rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] p-3 transition hover:border-[var(--line-strong)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <b className="block text-[11px] font-semibold text-[var(--ink)]">{item.label}</b>
              <span className="mt-1 block text-[9px] leading-4 text-[var(--muted)]">{item.detail}</span>
            </div>
            <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.level === "danger" ? "bg-[var(--danger)]" : item.level === "warning" ? "bg-[var(--warning)]" : "bg-[var(--accent)]"}`} />
          </div>
        </Link>)}</div> : null}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <ManagementMetric label="Bugünkü Tahsilat" value={money.format(todayNet)} detail={`${payments.data?.summary.paymentCount ?? 0} ödeme işlemi`} href="/finance/income" />
        <ManagementMetric label="Satış Fırsatları" value={money.format(Number(crm.data?.weightedPipeline ?? 0))} detail={`${crm.data?.openOpportunities ?? 0} açık fırsat`} href="/crm/pipeline" />
        <ManagementMetric label="Geciken İşler" value={delayedWork} detail="Takip, finans ve satın alma" href="/approvals" tone={delayedWork > 0 ? "warning" : "neutral"} />
        <ManagementMetric label="Kritik Stok" value={lowStock} detail={`${inventory.data?.totalProducts ?? 0} ürün içinden`} href="/inventory" tone={lowStock > 0 ? "danger" : "neutral"} />
        <ManagementMetric label="Aktif Personel" value={activeStaff || "—"} detail={`${staff.data?.data?.length ?? 0} kayıtlı personel`} href="/hr" />
        <ManagementMetric label="Yönetim Sağlığı" value={healthScore || "—"} detail={healthLabel(finance.data?.health?.status)} href="/finance/cfo" tone={healthScore && healthScore < 60 ? "danger" : healthScore && healthScore < 80 ? "warning" : "neutral"} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.55fr)]">
        <section className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
            <div><h2 className="text-[14px] font-semibold text-[var(--ink)]">Tahsilat Eğilimi</h2><p className="mt-1 text-[10px] text-[var(--muted)]">Son 7 günün günlük net tahsilatı</p></div>
            <Link href="/finance/income" className="text-[10px] font-semibold text-[var(--accent)]">Finansa Git</Link>
          </div>
          <RevenueTrend data={trend} selected={selectedTrend} onSelect={setSelectedTrend} />
        </section>

        <section className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)]">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <h2 className="text-[14px] font-semibold text-[var(--ink)]">Operasyon Sağlığı</h2>
            <p className="mt-1 text-[10px] text-[var(--muted)]">Bugünkü temel yönetim sinyalleri</p>
          </div>
          <OperationsHealth
            healthy={Math.max(0, 5 - [crmOverdue, financeOverdue, lowStock, purchase.pendingRequests, unhealthyConnections].filter((value) => value > 0).length)}
            warning={[crmOverdue, purchase.pendingRequests].filter((value) => value > 0).length}
            critical={[financeOverdue, lowStock, unhealthyConnections].filter((value) => value > 0).length}
          />
        </section>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <ManagementPanel title="Müşteri ve Satış" description="Satış fırsatları, dönüşüm ve geciken müşteri takipleri" href="/crm" actionLabel="Satış Sürecini Aç">
          <StatRows rows={[
            ["Yeni Potansiyel Müşteri", crm.data?.newLeads ?? "—"],
            ["Açık Satış Fırsatı", crm.data?.openOpportunities ?? "—"],
            ["Dönüşüm Oranı", crm.data ? `%${number.format(Number(crm.data.conversionRate ?? 0))}` : "—"],
            ["Geciken Müşteri Takibi", crm.data?.overdueFollowUps ?? "—"],
          ]} />
        </ManagementPanel>

        <ManagementPanel title="Finans" description="Finansal durum, nakit dayanıklılığı ve geciken işlemler" href="/finance/cfo" actionLabel="Finans Yönetimini Aç">
          <StatRows rows={[
            ["Finansal Durum Puanı", finance.data?.health?.score ?? "—"],
            ["Nakit Riski", finance.data?.liquidity?.risk ? "Dikkat gerekiyor" : finance.data ? "Normal" : "—"],
            ["Nakit Dayanma Süresi", finance.data?.liquidity?.runwayWeeks == null ? "—" : `${number.format(finance.data.liquidity.runwayWeeks)} hafta`],
            ["Geciken Finans İşlemi", finance.data?.actions?.summary?.overdue ?? "—"],
          ]} />
        </ManagementPanel>

        <ManagementPanel title="Stok ve Satın Alma" description="Kritik stoklar, satın alma talepleri ve açık siparişler" href="/inventory" actionLabel="Stok Yönetimini Aç">
          <StatRows rows={[
            ["Bekleyen Satın Alma Talebi", purchase.pendingRequests],
            ["Onaylanan Talep", purchase.approvedRequests],
            ["Açık Sipariş", purchase.openOrders],
            ["Kritik Stoktaki Ürün", inventory.data?.lowStockProducts ?? "—"],
            ["Toplam Stok Değeri", money.format(Number(inventory.data?.totalStockValue ?? 0))],
          ]} />
        </ManagementPanel>

        <ManagementPanel title="İnsan Kaynakları" description="Personel durumu ve insan kaynakları kayıtlarının güncelliği" href="/hr" actionLabel="İK Yönetimini Aç">
          <StatRows rows={[
            ["Aktif Personel", activeStaff || "—"],
            ["Toplam Personel Kaydı", staff.data?.data?.length ?? "—"],
            ["Kayıt Durumu", staff.error ? "Kontrol gerekiyor" : "Güncel"],
          ]} />
        </ManagementPanel>

        <ManagementPanel title="Sistem ve Güvenlik" description="Kullanıcı hesapları, yetkiler ve bağlı sistemlerin durumu" href="/settings" actionLabel="Sistem Ayarlarını Aç">
          <StatRows rows={[
            ["Aktif Kullanıcı", admin.data?.users.active ?? "—"],
            ["Askıya Alınmış Kullanıcı", admin.data?.users.suspended ?? "—"],
            ["Şube Yetkisi Eksik", admin.data?.users.withoutBranchScope ?? "—"],
            ["Hesap Güvenliği", admin.data ? `%${number.format(admin.data.mfa.coveragePercent)}` : "—"],
            ["Bekleyen Davet", admin.data?.invitations.pending ?? "—"],
            ["Bağlantı Sorunu", admin.data?.integrations.unhealthy ?? "—"],
          ]} />
        </ManagementPanel>

        <ManagementPanel title="Bugünkü Operasyon" description="Randevu hareketi ve günün operasyon yoğunluğu" href="/operations" actionLabel="Operasyon Merkezini Aç">
          <StatRows rows={[
            ["Toplam Randevu", appointmentTotal || "—"],
            ["Tamamlanan", payments.data?.summary.completedAppointments ?? "—"],
            ["Bekleyen", payments.data?.summary.scheduledAppointments ?? "—"],
            ["İptal / Gelmedi", payments.data ? Number(payments.data.summary.cancelledAppointments) + Number(payments.data.summary.noShowAppointments) : "—"],
          ]} />
        </ManagementPanel>
      </section>
    </div>
  );
}

function healthLabel(status?: string) {
  if (!status) return "Veri bekleniyor";
  if (status === "CRITICAL") return "Kritik";
  if (status === "WARNING") return "Dikkat gerekiyor";
  if (status === "HEALTHY" || status === "GOOD") return "İyi";
  return "Güncel durum";
}

function ManagementMetric({ label, value, detail, href, tone = "neutral" }: { label: string; value: string | number; detail: string; href: string; tone?: "neutral" | "warning" | "danger" }) {
  return <Link href={href} className="group rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5 hover:border-[var(--line-strong)]">
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] font-medium text-[var(--muted)]">{label}</span>
      <span className={`h-2 w-2 rounded-full ${tone === "danger" ? "bg-[var(--danger)]" : tone === "warning" ? "bg-[var(--warning)]" : "bg-[var(--accent)]"}`} />
    </div>
    <strong className="mt-3 block truncate text-[22px] font-semibold leading-none tracking-[-.04em] text-[var(--ink)]">{value}</strong>
    <span className="mt-2 block truncate text-[9px] text-[var(--muted)]">{detail}</span>
  </Link>;
}

function ManagementPanel({ title, description, href, actionLabel, children }: { title: string; description: string; href: string; actionLabel: string; children: React.ReactNode }) {
  return <section className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)]">
    <div className="border-b border-[var(--line)] px-5 py-4">
      <h2 className="text-[14px] font-semibold text-[var(--ink)]">{title}</h2>
      <p className="mt-1 text-[10px] leading-4 text-[var(--muted)]">{description}</p>
    </div>
    <div className="p-4">{children}</div>
    <Link href={href} className="flex min-h-11 items-center justify-between border-t border-[var(--line)] px-5 text-[10px] font-semibold text-[var(--ink)] transition hover:bg-[var(--surface-2)]"><span>{actionLabel}</span><span className="text-[16px] text-[var(--muted-soft)]">›</span></Link>
  </section>;
}

function StatRows({ rows }: { rows: Array<[string, string | number]> }) {
  return <div className="divide-y divide-[var(--line)]">{rows.map(([label, value]) => <div key={label} className="flex min-h-10 items-center justify-between gap-4 py-2">
    <span className="text-[10px] text-[var(--muted)]">{label}</span>
    <strong className="text-right text-[11px] font-semibold text-[var(--ink)]">{value}</strong>
  </div>)}</div>;
}

function RevenueTrend({ data, selected, onSelect }: { data: DailyTrend[]; selected: number | null; onSelect: (index: number) => void }) {
  if (!data.length) return <div className="flex min-h-[250px] items-center justify-center text-[11px] text-[var(--muted)]">Tahsilat trendi için yeterli veri yok.</div>;
  const width = 720;
  const height = 240;
  const left = 28;
  const right = 22;
  const top = 28;
  const bottom = 40;
  const max = Math.max(...data.map((item) => Math.max(0, item.net)), 1);
  const usableW = width - left - right;
  const usableH = height - top - bottom;
  const points = data.map((item, index) => ({
    x: left + (data.length === 1 ? usableW / 2 : (index / (data.length - 1)) * usableW),
    y: top + usableH - (Math.max(0, item.net) / max) * usableH,
    item,
    index,
  }));
  const path = points.map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const activeIndex = selected == null ? data.length - 1 : Math.min(selected, data.length - 1);
  const active = data[activeIndex];
  const day = (value: string) => new Intl.DateTimeFormat("tr-TR", { weekday: "short", day: "2-digit" }).format(new Date(`${value}T12:00:00`));

  return <div className="p-5">
    <div className="mb-2 flex items-end justify-between gap-4">
      <div><span className="block text-[10px] text-[var(--muted)]">Seçili Gün</span><strong className="mt-1 block text-[24px] leading-none tracking-[-.04em] text-[var(--ink)]">{money.format(active.net)}</strong></div>
      <div className="text-right"><span className="block text-[10px] text-[var(--muted)]">{day(active.date)}</span><b className="mt-1 block text-[10px] font-semibold text-[var(--ink)]">{active.appointments} randevu</b></div>
    </div>
    <svg className="h-auto min-h-[220px] w-full overflow-visible" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Son 7 günlük net tahsilat grafiği">
      {[0, .5, 1].map((ratio) => <line key={ratio} x1={left} x2={width - right} y1={top + usableH * ratio} y2={top + usableH * ratio} stroke="var(--line)" strokeWidth="1" strokeDasharray="3 5" />)}
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((point) => <g key={point.item.date} role="button" tabIndex={0} className="cursor-pointer outline-none" onClick={() => onSelect(point.index)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(point.index); } }}>
        <circle cx={point.x} cy={point.y} r={point.index === activeIndex ? 7 : 5} fill={point.index === activeIndex ? "var(--accent)" : "var(--surface)"} stroke="var(--accent)" strokeWidth="3" />
        <text x={point.x} y={height - 12} textAnchor="middle" fill="var(--muted-soft)" fontSize="10" fontWeight="600">{day(point.item.date).split(" ")[0]}</text>
      </g>)}
    </svg>
  </div>;
}

function OperationsHealth({ healthy, warning, critical }: { healthy: number; warning: number; critical: number }) {
  const [selected, setSelected] = useState<"healthy" | "warning" | "critical">("healthy");
  const values = { healthy, warning, critical };
  const labels = { healthy: "Normal", warning: "Dikkat", critical: "Kritik" };
  const colors = { healthy: "var(--accent)", warning: "var(--warning)", critical: "var(--danger)" };
  const total = Math.max(1, healthy + warning + critical);
  const normalEnd = (healthy / total) * 100;
  const warningEnd = normalEnd + (warning / total) * 100;
  const active = values[selected];

  return <div className="p-5">
    <div className="mx-auto grid aspect-square w-[168px] place-items-center rounded-full" style={{ background: `conic-gradient(var(--accent) 0% ${normalEnd}%, var(--warning) ${normalEnd}% ${warningEnd}%, var(--danger) ${warningEnd}% 100%)` }}>
      <div className="grid h-[124px] w-[124px] place-items-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-center">
        <div><strong className="block text-[28px] leading-none tracking-[-.04em] text-[var(--ink)]">{active}</strong><span className="mt-1 block text-[10px] font-medium text-[var(--muted)]">{labels[selected]}</span></div>
      </div>
    </div>
    <div className="mt-5 space-y-2">{(["healthy", "warning", "critical"] as const).map((key) => <button key={key} type="button" onClick={() => setSelected(key)} className={`grid min-h-10 w-full grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-2 rounded-[10px] border px-3 text-left text-[10px] transition ${selected === key ? "border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]" : "border-transparent text-[var(--muted)] hover:bg-[var(--surface-2)]"}`}>
      <span className="h-2 w-2 rounded-full" style={{ background: colors[key] }} />
      <span>{labels[key]}</span>
      <strong className="text-[var(--ink)]">{values[key]}</strong>
    </button>)}</div>
  </div>;
}
