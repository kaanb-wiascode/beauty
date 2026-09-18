"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FinanceMetric, FinancePanel } from "@/components/finance-view";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type InventoryOverview = { totalProducts?: number; lowStockProducts?: number; totalStockValue?: number; totalAssets?: number; expiringLots?: number };
type Reconciliation = { subledgerValue: number | string; glBalance: number | string; variance: number | string; reconciled: boolean; scope: "BRANCH" | "COMPANY" };
type Detail = { warehouseId: string; warehouseName: string; productId: string; productName: string; sku?: string | null; unit: string; quantity: number | string; unitCost: number | string; inventoryValue: number | string; minimumQuantity: number | string; targetQuantity: number | string; stockUpdatedAt: string };
type PurchaseRequest = { id: string; status: string; warehouseName?: string; productName?: string; sku?: string | null; currentQuantity?: number | string; requestedQuantity?: number | string; reason?: string | null; createdAt?: string };
type Transit = { transferId: string; dispatchedAt?: string | null; sourceWarehouseName: string; destinationWarehouseName: string; itemCount: number | string; unitsInTransit: number | string; valueInTransit: number | string };
type Load<T> = { data: T | null; error: string };

const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });
const qty = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 3 });
function n(value: number | string | undefined | null) { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0; }
function date(value?: string | null) { if (!value) return "—"; const d = new Date(value); return Number.isNaN(d.getTime()) ? "—" : new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(d); }

export default function InventoryActionCenterPage() {
  const [overview, setOverview] = useState<Load<InventoryOverview>>({ data: null, error: "" });
  const [reconciliation, setReconciliation] = useState<Load<Reconciliation>>({ data: null, error: "" });
  const [details, setDetails] = useState<Load<Detail[]>>({ data: null, error: "" });
  const [requests, setRequests] = useState<Load<PurchaseRequest[]>>({ data: null, error: "" });
  const [transit, setTransit] = useState<Load<Transit[]>>({ data: null, error: "" });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      api<InventoryOverview>("/inventory/overview"),
      api<Reconciliation>("/inventory/accounting/reconciliation"),
      api<Detail[]>("/inventory/accounting/valuation/detail"),
      api<PurchaseRequest[]>("/procurement/purchase-requests?status=PENDING"),
      api<Transit[]>("/inventory/accounting/in-transit"),
    ]);
    const apply = <T,>(result: PromiseSettledResult<T>): Load<T> => result.status === "fulfilled"
      ? { data: result.value, error: "" }
      : { data: null, error: result.reason instanceof ApiError ? result.reason.message : "Veri yüklenemedi." };
    setOverview(apply(results[0] as PromiseSettledResult<InventoryOverview>));
    setReconciliation(apply(results[1] as PromiseSettledResult<Reconciliation>));
    setDetails(apply(results[2] as PromiseSettledResult<Detail[]>));
    setRequests(apply(results[3] as PromiseSettledResult<PurchaseRequest[]>));
    setTransit(apply(results[4] as PromiseSettledResult<Transit[]>));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const critical = useMemo(() => (details.data ?? []).filter((row) => n(row.minimumQuantity) > 0 && n(row.quantity) <= n(row.minimumQuantity)).sort((a, b) => (n(a.quantity) - n(a.minimumQuantity)) - (n(b.quantity) - n(b.minimumQuantity))), [details.data]);
  const severe = useMemo(() => critical.filter((row) => n(row.quantity) <= 0), [critical]);
  const transitValue = useMemo(() => (transit.data ?? []).reduce((sum, row) => sum + n(row.valueInTransit), 0), [transit.data]);
  const moduleErrors = [overview.error, reconciliation.error, details.error, requests.error, transit.error].filter(Boolean).length;

  if (loading && !overview.data && !details.data) return <div className="mx-auto max-w-[1480px] py-20"><Spinner label="Envanter aksiyonları hazırlanıyor..." /></div>;

  return <div className="mx-auto max-w-[1480px] space-y-6 pb-12">
    <header className="flex flex-col gap-5 rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[0_12px_36px_rgba(17,70,104,0.04)] xl:flex-row xl:items-end xl:justify-between">
      <div><p className="mb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-[var(--accent)]">Envanter Operasyonu</p><h1 className="text-[32px] font-semibold tracking-[-.045em] text-[var(--ink)]">Envanter Aksiyon Merkezi</h1><p className="mt-2 max-w-3xl text-[13px] leading-6 text-[var(--muted)]">Kritik stokları, bekleyen satın alma taleplerini, muhasebe mutabakat farklarını ve transferdeki stokları öncelik sırasıyla yönetin.</p></div>
      <div className="flex flex-wrap gap-2"><Link href="/inventory/analysis" className="rounded-[12px] border border-[var(--line)] px-4 py-2.5 text-[12px] font-semibold text-[var(--ink)]">Envanter Analizi</Link><Button variant="secondary" onClick={() => void load()} disabled={loading}>Yenile</Button></div>
    </header>

    {moduleErrors ? <Alert>{moduleErrors} envanter veri kaynağına erişilemedi. Kullanılabilir kuyruklar gösterilmeye devam ediyor.</Alert> : null}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <FinanceMetric label="Kritik Stok" value={critical.length} detail={`${severe.length} tükenmiş`} tone={critical.length ? "warning" : "success"} />
      <FinanceMetric label="Bekleyen Satın Alma" value={requests.data?.length ?? "—"} detail="Onay bekleyen talep" tone={(requests.data?.length ?? 0) > 0 ? "warning" : "neutral"} />
      <FinanceMetric label="Transferde" value={transit.data?.length ?? "—"} detail={money.format(transitValue)} />
      <FinanceMetric label="Mutabakat" value={reconciliation.data?.reconciled ? "Tam" : reconciliation.data ? "Fark Var" : "—"} detail={money.format(Math.abs(n(reconciliation.data?.variance)))} tone={reconciliation.data?.reconciled ? "success" : reconciliation.data ? "danger" : "neutral"} />
      <FinanceMetric label="Stok Değeri" value={money.format(n(overview.data?.totalStockValue))} detail={`${overview.data?.totalProducts ?? 0} ürün`} />
      <FinanceMetric label="Yaklaşan SKT" value={overview.data?.expiringLots ?? "—"} detail="Lot riski" tone={(overview.data?.expiringLots ?? 0) > 0 ? "warning" : "neutral"} />
    </section>

    <section className="grid gap-5 xl:grid-cols-2">
      <FinancePanel title="Kritik Stok Kuyruğu" description="Minimum stok seviyesine ulaşan veya altına düşen ürünler">
        <div className="space-y-2">{critical.slice(0, 20).map((row) => <article key={`${row.warehouseId}:${row.productId}`} className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)]/45 p-4"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="truncate text-[13px] font-semibold text-[var(--ink)]">{row.productName}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{row.warehouseName}{row.sku ? ` · ${row.sku}` : ""}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${n(row.quantity) <= 0 ? "bg-[var(--danger-soft)] text-[var(--danger)]" : "bg-[var(--warning-soft)] text-[var(--warning)]"}`}>{n(row.quantity) <= 0 ? "Tükendi" : "Kritik"}</span></div><div className="mt-3 grid grid-cols-3 gap-2 text-[10px]"><Value label="Mevcut" value={qty.format(n(row.quantity))} /><Value label="Minimum" value={qty.format(n(row.minimumQuantity))} /><Value label="Hedef" value={qty.format(n(row.targetQuantity))} /></div></article>)}{!critical.length ? <Empty text="Kritik stok bulunmuyor." /> : null}</div>
        <Links links={[["Satın Alma", "/inventory/purchases"], ["Stok Hareketleri", "/inventory/movements"], ["Stok Sayımları", "/inventory/counts"]]} />
      </FinancePanel>

      <FinancePanel title="Bekleyen Satın Alma Talepleri" description="Stok ihtiyacından oluşmuş, onay bekleyen talepler">
        <div className="space-y-2">{(requests.data ?? []).slice(0, 20).map((row) => <article key={row.id} className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)]/45 p-4"><p className="text-[13px] font-semibold text-[var(--ink)]">{row.productName ?? "Satın alma talebi"}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{row.warehouseName ?? "Depo"}{row.sku ? ` · ${row.sku}` : ""}</p><div className="mt-3 flex flex-wrap gap-3 text-[10px] text-[var(--muted)]"><span>Mevcut: <b className="text-[var(--ink)]">{qty.format(n(row.currentQuantity))}</b></span><span>Talep: <b className="text-[var(--ink)]">{qty.format(n(row.requestedQuantity))}</b></span><span>{date(row.createdAt)}</span></div></article>)}{!requests.data?.length ? <Empty text="Onay bekleyen satın alma talebi yok." /> : null}</div>
        <Links links={[["Satın Alma Merkezi", "/inventory/purchases"]]} />
      </FinancePanel>

      <FinancePanel title="Muhasebe Mutabakat Riski" description="Stok alt defteri ile 150 hesap bakiyesi karşılaştırması">
        <Rows rows={[["Stok Alt Defteri", money.format(n(reconciliation.data?.subledgerValue))], ["GL Bakiyesi", money.format(n(reconciliation.data?.glBalance))], ["Fark", money.format(n(reconciliation.data?.variance))], ["Kapsam", reconciliation.data?.scope === "BRANCH" ? "Aktif Şube" : reconciliation.data?.scope === "COMPANY" ? "Şirket" : "—"]]} />
        <Links links={[["Mutabakat Detayı", "/inventory/analysis"], ["Muhasebe", "/finance/accounting"]]} />
      </FinancePanel>

      <FinancePanel title="Transferdeki Stok" description="Henüz hedef depoda teslim alınmamış transferler">
        <div className="space-y-2">{(transit.data ?? []).slice(0, 20).map((row) => <article key={row.transferId} className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)]/45 p-4"><div className="flex items-start justify-between gap-4"><div><p className="text-[12px] font-semibold text-[var(--ink)]">{row.sourceWarehouseName} → {row.destinationWarehouseName}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{qty.format(n(row.itemCount))} kalem · {qty.format(n(row.unitsInTransit))} birim</p></div><b className="text-[12px] text-[var(--ink)]">{money.format(n(row.valueInTransit))}</b></div><p className="mt-2 text-[10px] text-[var(--muted-soft)]">Sevk: {date(row.dispatchedAt)}</p></article>)}{!transit.data?.length ? <Empty text="Transferde bekleyen stok yok." /> : null}</div>
        <Links links={[["Depo Transferleri", "/inventory/transfers"]]} />
      </FinancePanel>
    </section>
  </div>;
}

function Value({ label, value }: { label: string; value: string }) { return <div className="rounded-[10px] bg-[var(--surface)] p-2"><p className="text-[var(--muted-soft)]">{label}</p><p className="mt-1 font-semibold text-[var(--ink)]">{value}</p></div>; }
function Rows({ rows }: { rows: Array<[string, string | number]> }) { return <div className="space-y-2">{rows.map(([label, value]) => <div key={label} className="flex items-center justify-between gap-4 rounded-[12px] bg-[var(--surface-2)]/55 px-4 py-3"><span className="text-[12px] text-[var(--muted)]">{label}</span><strong className="text-[13px] text-[var(--ink)]">{value}</strong></div>)}</div>; }
function Links({ links }: { links: Array<[string, string]> }) { return <div className="mt-4 flex flex-wrap gap-2">{links.map(([label, href]) => <Link key={href} href={href} className="rounded-[10px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[11px] font-semibold text-[var(--ink)] transition hover:bg-[var(--surface-2)]">{label}</Link>)}</div>; }
function Empty({ text }: { text: string }) { return <div className="rounded-[14px] border border-dashed border-[var(--line)] px-4 py-8 text-center text-[11px] text-[var(--muted)]">{text}</div>; }
