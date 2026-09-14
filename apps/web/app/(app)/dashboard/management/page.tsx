"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FinanceMetric, FinancePanel } from "@/components/finance-view";
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

type ModuleLoad<T> = { data: T | null; error: string };

const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 });

export default function ManagementCockpitPage() {
  const [crm, setCrm] = useState<ModuleLoad<CrmSummary>>({ data: null, error: "" });
  const [finance, setFinance] = useState<ModuleLoad<FinanceCockpit>>({ data: null, error: "" });
  const [inventory, setInventory] = useState<ModuleLoad<InventoryOverview>>({ data: null, error: "" });
  const [requests, setRequests] = useState<ModuleLoad<PurchaseRequest[]>>({ data: null, error: "" });
  const [orders, setOrders] = useState<ModuleLoad<PurchaseOrder[]>>({ data: null, error: "" });
  const [staff, setStaff] = useState<ModuleLoad<StaffPage>>({ data: null, error: "" });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const now = new Date();
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    const calls = await Promise.allSettled([
      api<CrmSummary>(`/crm/operations-summary?dayStart=${encodeURIComponent(start.toISOString())}&dayEnd=${encodeURIComponent(end.toISOString())}`),
      api<FinanceCockpit>("/profitability/cfo/management-cockpit"),
      api<InventoryOverview>("/inventory/overview"),
      api<PurchaseRequest[]>("/procurement/purchase-requests"),
      api<PurchaseOrder[]>("/procurement/purchase-orders"),
      api<StaffPage>("/staff?page=1&limit=100"),
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
      openValue: orderRows.filter((row) => !["RECEIVED", "CANCELLED"].includes(row.status)).reduce((sum, row) => sum + Number(row.totalAmount ?? 0), 0),
    };
  }, [orders.data, requests.data]);

  const activeStaff = (staff.data?.data ?? []).filter((row) => row.status === "ACTIVE").length;
  const moduleErrors = [crm.error, finance.error, inventory.error, requests.error, orders.error, staff.error].filter(Boolean);

  if (loading && !crm.data && !finance.data && !inventory.data) {
    return <div className="mx-auto max-w-[1480px] py-20"><Spinner label="ERP yönetim görünümü hazırlanıyor..." /></div>;
  }

  return (
    <div className="mx-auto max-w-[1480px] space-y-6 pb-12">
      <header className="flex flex-col gap-5 rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[0_12px_36px_rgba(17,70,104,0.04)] xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-[var(--accent)]">ERP Yönetimi</p>
          <h1 className="text-[32px] font-semibold tracking-[-.045em] text-[var(--ink)]">Yönetim Cockpit</h1>
          <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[var(--muted)]">CRM, finans, satın alma, envanter ve insan kaynakları operasyonlarını aynı yönetim yüzeyinde izleyin.</p>
        </div>
        <Button variant="secondary" onClick={() => void load()} disabled={loading}>Yenile</Button>
      </header>

      {moduleErrors.length ? <Alert>Bazı modül verileri alınamadı. Diğer modüller güncel verilerle gösterilmeye devam ediyor.</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <FinanceMetric label="CRM Pipeline" value={money.format(Number(crm.data?.weightedPipeline ?? 0))} detail={`${crm.data?.openOpportunities ?? 0} açık fırsat`} />
        <FinanceMetric label="Geciken CRM Takibi" value={crm.data?.overdueFollowUps ?? "—"} detail={`${crm.data?.staleOpportunities ?? 0} durağan fırsat`} tone={(crm.data?.overdueFollowUps ?? 0) > 0 ? "warning" : "neutral"} />
        <FinanceMetric label="Finansal Sağlık" value={finance.data?.health?.score ?? "—"} detail={finance.data?.health?.status ?? "Veri bekleniyor"} tone={finance.data?.health?.status === "CRITICAL" ? "danger" : "neutral"} />
        <FinanceMetric label="Net Çalışma Sermayesi" value={money.format(Number(finance.data?.workingCapital?.netWorkingCapital ?? 0))} detail={`${finance.data?.actions?.summary?.overdue ?? 0} gecikmiş finans görevi`} tone={(finance.data?.workingCapital?.netWorkingCapital ?? 0) < 0 ? "danger" : "neutral"} />
        <FinanceMetric label="Satın Alma" value={purchase.pendingRequests} detail={`${purchase.openOrders} açık sipariş · ${money.format(purchase.openValue)}`} tone={purchase.pendingRequests > 0 ? "warning" : "neutral"} />
        <FinanceMetric label="Aktif Personel" value={activeStaff || "—"} detail="İK aktif çalışan" />
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <FinancePanel title="CRM & Satış" description="Pipeline, takip riski ve dönüşüm">
          <ModuleRows rows={[
            ["Yeni Lead", crm.data?.newLeads ?? "—"],
            ["Açık Fırsat", crm.data?.openOpportunities ?? "—"],
            ["Dönüşüm", crm.data ? `%${number.format(Number(crm.data.conversionRate ?? 0))}` : "—"],
            ["Geciken Takip", crm.data?.overdueFollowUps ?? "—"],
          ]} />
          <ModuleLinks links={[["CRM Genel Bakış", "/crm"], ["Aksiyon Merkezi", "/crm/actions"], ["Pipeline", "/crm/pipeline"]]} />
        </FinancePanel>

        <FinancePanel title="Finans & Nakit" description="Likidite ve finansal aksiyonlar">
          <ModuleRows rows={[
            ["Sağlık Skoru", finance.data?.health?.score ?? "—"],
            ["Likidite Riski", finance.data?.liquidity?.risk ? "Var" : finance.data ? "Yok" : "—"],
            ["Nakit Dayanma", finance.data?.liquidity?.runwayWeeks == null ? "—" : `${number.format(finance.data.liquidity.runwayWeeks)} hafta`],
            ["Açık Finans Görevi", finance.data?.actions?.summary?.open ?? "—"],
          ]} />
          <ModuleLinks links={[["Finans Genel Bakış", "/finance/cfo"], ["Nakit Yönetimi", "/finance/cfo/treasury"], ["Mutabakat", "/finance/reconciliation"]]} />
        </FinancePanel>

        <FinancePanel title="Satın Alma & Envanter" description="Talep, sipariş ve stok riski">
          <ModuleRows rows={[
            ["Bekleyen Talep", purchase.pendingRequests],
            ["Onaylı Talep", purchase.approvedRequests],
            ["Açık Sipariş", purchase.openOrders],
            ["Kritik Stok", inventory.data?.lowStockProducts ?? "—"],
            ["Stok Değeri", money.format(Number(inventory.data?.totalStockValue ?? 0))],
          ]} />
          <ModuleLinks links={[["Aksiyon Merkezi", "/inventory/actions"], ["Satın Alma", "/inventory/purchases"], ["Envanter", "/inventory"], ["Stok Sayımları", "/inventory/counts"]]} />
        </FinancePanel>

        <FinancePanel title="İnsan Kaynakları & Gelişim" description="Personel, bordro ve yetkinlik operasyonu">
          <ModuleRows rows={[
            ["Aktif Personel", activeStaff || "—"],
            ["Personel Kaydı", staff.data?.data?.length ?? "—"],
            ["İK Veri Durumu", staff.error ? "Kontrol gerekli" : "Güncel"],
          ]} />
          <ModuleLinks links={[["İK Aksiyon Merkezi", "/hr/actions"], ["İK Kontrol Merkezi", "/hr"], ["Bordro", "/hr/payroll-dashboard"], ["Eğitim & Yetkinlik", "/training"], ["Kalite", "/quality/comparison"]]} />
        </FinancePanel>
      </section>
    </div>
  );
}

function ModuleRows({ rows }: { rows: Array<[string, string | number]> }) {
  return <div className="space-y-2">{rows.map(([label, value]) => <div key={label} className="flex items-center justify-between gap-4 rounded-[12px] bg-[var(--surface-2)]/55 px-4 py-3"><span className="text-[12px] text-[var(--muted)]">{label}</span><strong className="text-[13px] text-[var(--ink)]">{value}</strong></div>)}</div>;
}

function ModuleLinks({ links }: { links: Array<[string, string]> }) {
  return <div className="mt-4 flex flex-wrap gap-2">{links.map(([label, href]) => <Link key={href} href={href} className="rounded-[10px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[11px] font-semibold text-[var(--ink)] transition hover:bg-[var(--surface-2)]">{label}</Link>)}</div>;
}
