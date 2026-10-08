"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/modal";
import { Alert, Button, EmptyState, Field, Select, Spinner, TextArea, TextInput } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, ApiError, withQuery } from "@/lib/api";
import { userErrorMessage } from "@/lib/user-language";
import { hasActiveBranch, hasPermission } from "@/lib/auth";
import { type CrmAssignee, type CrmOpportunity, type OpportunityStage } from "@/lib/crm-types";

const stages: OpportunityStage[] = ["QUALIFIED", "NEEDS_ANALYSIS", "PROPOSAL", "NEGOTIATION", "WON", "LOST"];
const activeStages: OpportunityStage[] = ["QUALIFIED", "NEEDS_ANALYSIS", "PROPOSAL", "NEGOTIATION"];
const closedStages: OpportunityStage[] = ["WON", "LOST"];
const stageLabels: Record<OpportunityStage, string> = {
  QUALIFIED: "İlk Değerlendirme",
  NEEDS_ANALYSIS: "İhtiyaç Belirlendi",
  PROPOSAL: "Teklif Verildi",
  NEGOTIATION: "Karar Bekleniyor",
  WON: "Kazanıldı",
  LOST: "Kaybedildi",
};
const nextStages: Record<OpportunityStage, OpportunityStage[]> = {
  QUALIFIED: ["NEEDS_ANALYSIS", "LOST"], NEEDS_ANALYSIS: ["PROPOSAL", "LOST"],
  PROPOSAL: ["NEGOTIATION", "WON", "LOST"], NEGOTIATION: ["PROPOSAL", "WON", "LOST"], WON: [], LOST: [],
};

type Customer = { id: string; firstName: string; lastName: string };
type Service = { id: string; name: string; price: string | number };
type ServicePackage = { id: string; name: string; price: string | number; active: boolean };
type SaleReferenceType = "SERVICE" | "PACKAGE";
type DraftSaleItem = { key: string; type: SaleReferenceType; referenceId: string; quantity: string };
type SaleConversionResponse = { idempotent: boolean; sale: { id: string; status: string; total: string | number } };

function formatMoney(value: string | number | null, currency: string) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value ?? 0));
}
function formatDate(value: string) { return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)); }
function daysSince(value: string) { return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000)); }
function staleBefore() { const d = new Date(); d.setDate(d.getDate() - 14); return d.toISOString(); }
function newSaleItem(index: number): DraftSaleItem { return { key: `sale-item-${index}`, type: "SERVICE", referenceId: "", quantity: "1" }; }

export default function CrmPipelinePage() {
  const canManage = hasPermission("crm", "manage");
  const canReadCustomers = hasPermission("customers", "read");
  const canCreateSale = hasPermission("payments", "create") && canReadCustomers && hasPermission("services", "read");
  const { showToast } = useToast();
  const [rows, setRows] = useState<CrmOpportunity[]>([]);
  const [assignees, setAssignees] = useState<CrmAssignee[]>([]);
  const [ownerUserId, setOwnerUserId] = useState("");
  const [stageFilter, setStageFilter] = useState<OpportunityStage | "">("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [staleOnly, setStaleOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [transitioning, setTransitioning] = useState<CrmOpportunity | null>(null);
  const [targetStage, setTargetStage] = useState<OpportunityStage | "">("");
  const [probability, setProbability] = useState("");
  const [lostReason, setLostReason] = useState("");
  const [saleOpportunity, setSaleOpportunity] = useState<CrmOpportunity | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [saleReferencesLoading, setSaleReferencesLoading] = useState(false);
  const [saleCustomerId, setSaleCustomerId] = useState("");
  const [saleItems, setSaleItems] = useState<DraftSaleItem[]>([newSaleItem(1)]);
  const [saleItemSequence, setSaleItemSequence] = useState(1);
  const [saleDiscount, setSaleDiscount] = useState("0");
  const [viewGroup, setViewGroup] = useState<"ACTIVE" | "CLOSED">("ACTIVE");
  const [viewMode, setViewMode] = useState<"BOARD" | "LIST">("BOARD");
  const [selectedOpportunity, setSelectedOpportunity] = useState<CrmOpportunity | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragTarget, setDragTarget] = useState<OpportunityStage | null>(null);

  useEffect(() => { const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 250); return () => window.clearTimeout(t); }, [search]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (ownerUserId) params.set("ownerUserId", ownerUserId);
      if (stageFilter) params.set("stage", stageFilter);
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (staleOnly) params.set("updatedBefore", staleBefore());
      const [opportunityRows, assigneeRows] = await Promise.all([
        api<CrmOpportunity[]>(`/crm/opportunities?${params}`), api<CrmAssignee[]>("/crm/assignees"),
      ]);
      setRows(opportunityRows); setAssignees(assigneeRows);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? userErrorMessage(requestError.message, "Satış süreci yüklenemedi.") : "Satış süreci yüklenemedi.");
    } finally { setLoading(false); }
  }, [ownerUserId, stageFilter, debouncedSearch, staleOnly]);
  useEffect(() => { void load(); }, [load]);

  const totals = useMemo(() => {
    const open = rows.filter((row) => !["WON", "LOST"].includes(row.stage));
    const overdue = open.filter((row) => row.expectedCloseDate && new Date(row.expectedCloseDate).getTime() < Date.now()).length;
    const closingSoon = open.filter((row) => {
      if (!row.expectedCloseDate) return false;
      const diff = new Date(row.expectedCloseDate).getTime() - Date.now();
      return diff >= 0 && diff <= 30 * 86400000;
    }).length;
    return {
      count: open.length,
      raw: open.reduce((s, r) => s + Number(r.estimatedValue ?? 0), 0),
      weighted: open.reduce((s, r) => s + Number(r.estimatedValue ?? 0) * r.probability / 100, 0),
      overdue,
      closingSoon,
      stale: open.filter((row) => daysSince(row.updatedAt) >= 14).length,
      highProbability: open.filter((row) => row.probability >= 80).length,
    };
  }, [rows]);

  const assigneeNames = useMemo(
    () => new Map(assignees.map((person) => [person.id, `${person.firstName} ${person.lastName}`])),
    [assignees],
  );

  const visibleStages = viewGroup === "ACTIVE" ? activeStages : closedStages;
  const visibleRows = rows.filter((row) => visibleStages.includes(row.stage));

  function referencesFor(type: SaleReferenceType) { return type === "SERVICE" ? services.map((x) => ({ id: x.id, label: x.name, price: x.price })) : packages.filter((x) => x.active).map((x) => ({ id: x.id, label: x.name, price: x.price })); }
  function requireActiveBranch() { if (hasActiveBranch()) return true; showToast("Satış fırsatını güncellemek için önce çalışma kapsamından bir şube seçin.", "error"); return false; }
  function openTransition(row: CrmOpportunity) { if (!requireActiveBranch()) return; const first = nextStages[row.stage][0] ?? ""; setTransitioning(row); setTargetStage(first); setProbability(first === "WON" ? "100" : first === "LOST" ? "0" : String(row.probability)); setLostReason(""); setError(""); }
  async function transition(event: FormEvent) {
    event.preventDefault(); if (!transitioning || !targetStage || !requireActiveBranch()) return;
    if (targetStage === "LOST" && !lostReason.trim()) return setError("Kaybedilen satış fırsatı için neden gereklidir.");
    setSaving(true); setError("");
    try { await api(`/crm/opportunities/${transitioning.id}/transition`, { method: "POST", body: { version: transitioning.version, stage: targetStage, probability: Number(probability), ...(targetStage === "LOST" ? { lostReason: lostReason.trim() } : {}) } }); setTransitioning(null); showToast("Satış fırsatı aşaması güncellendi.", "success"); await load(); }
    catch (e) { setError(e instanceof ApiError ? userErrorMessage(e.message, "Satış fırsatı güncellenemedi.") : "Satış fırsatı güncellenemedi."); } finally { setSaving(false); }
  }

  async function moveOpportunity(row: CrmOpportunity, target: OpportunityStage) {
    if (row.stage === target) return;
    if (!nextStages[row.stage].includes(target)) {
      showToast("Bu satış fırsatı doğrudan seçilen aşamaya taşınamaz.", "error");
      return;
    }
    if (target === "LOST") {
      setTransitioning(row);
      setTargetStage("LOST");
      setProbability("0");
      setLostReason("");
      return;
    }
    if (!requireActiveBranch()) return;
    setSaving(true);
    setError("");
    try {
      await api(`/crm/opportunities/${row.id}/transition`, {
        method: "POST",
        body: {
          version: row.version,
          stage: target,
          probability: target === "WON" ? 100 : row.probability,
        },
      });
      showToast(`Satış fırsatı “${stageLabels[target]}” aşamasına taşındı.`, "success");
      setSelectedOpportunity(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? userErrorMessage(e.message, "Satış fırsatı taşınamadı.") : "Satış fırsatı taşınamadı.");
    } finally {
      setSaving(false);
      setDraggingId(null);
      setDragTarget(null);
    }
  }

  async function openSale(row: CrmOpportunity) {
    if (!requireActiveBranch()) return;
    const linkedCustomer = row.customerId ? [{ id: row.customerId, firstName: row.customerFirstName ?? "", lastName: row.customerLastName ?? "" }] : [];
    setSaleOpportunity(row); setSaleCustomerId(row.customerId ?? ""); setCustomers(linkedCustomer); setSaleItems([newSaleItem(1)]); setSaleItemSequence(1); setSaleDiscount("0"); setError(""); setSaleReferencesLoading(true);
    try {
      const customerRequest = row.customerId ? Promise.resolve({ data: linkedCustomer }) : api<{ data: Customer[] }>(withQuery("/customers", { page: 1, limit: 100 }));
      const [serviceResult, packageResult, customerResult] = await Promise.all([api<{ data: Service[] }>(withQuery("/services", { page: 1, limit: 200 })), api<ServicePackage[]>("/packages"), customerRequest]);
      setServices(serviceResult.data); setPackages(packageResult); setCustomers(customerResult.data);
    } catch (e) { setError(e instanceof ApiError ? userErrorMessage(e.message, "Satış seçenekleri yüklenemedi.") : "Satış seçenekleri yüklenemedi."); } finally { setSaleReferencesLoading(false); }
  }
  function updateSaleItem(key: string, patch: Partial<Omit<DraftSaleItem, "key">>) { setSaleItems((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item)); }
  function addSaleItem() { const next = saleItemSequence + 1; setSaleItemSequence(next); setSaleItems((current) => [...current, newSaleItem(next)]); }
  function removeSaleItem(key: string) { setSaleItems((current) => current.length > 1 ? current.filter((item) => item.key !== key) : current); }
  async function createSale(event: FormEvent) {
    event.preventDefault(); if (!saleOpportunity || !saleCustomerId) return setError("Müşteri seçilmelidir.");
    const normalizedItems = saleItems.map((item) => ({ type: item.type, referenceId: item.referenceId, quantity: Number(item.quantity) }));
    if (normalizedItems.some((item) => !item.referenceId || !Number.isInteger(item.quantity) || item.quantity <= 0)) return setError("Her satış kalemi için ürün/hizmet ve pozitif tam sayı miktar seçilmelidir.");
    const discountTotal = Number(saleDiscount); if (!Number.isFinite(discountTotal) || discountTotal < 0) return setError("İndirim sıfır veya pozitif olmalıdır.");
    setSaving(true); setError("");
    try { const result = await api<SaleConversionResponse>(`/sales/from-opportunity/${saleOpportunity.id}`, { method: "POST", body: { version: saleOpportunity.version, customerId: saleCustomerId, discountTotal, items: normalizedItems } }); setSaleOpportunity(null); showToast(result.idempotent ? "Bu fırsat için satış hazırlığı zaten mevcut." : `Satış hazırlığı oluşturuldu: ${formatMoney(result.sale.total, "TRY")}.`, "success"); await load(); }
    catch (e) { setError(e instanceof ApiError ? userErrorMessage(e.message, "Satış hazırlığı oluşturulamadı.") : "Satış taslağı oluşturulamadı."); } finally { setSaving(false); }
  }

  const hasFilters = Boolean(ownerUserId || stageFilter || search.trim() || staleOnly);
  const closedCount = rows.filter((row) => closedStages.includes(row.stage)).length;

  return <div className="space-y-5">
    <header className="flex flex-col gap-5 rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)] xl:flex-row xl:items-end xl:justify-between">
      <div>
        <p className="text-[12px] font-medium text-[var(--muted)]">Satış fırsatı yönetimi</p>
        <h1 className="mt-1 text-[32px] font-semibold tracking-[-.045em] text-[var(--ink)]">Satış Süreci</h1>
        <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[var(--muted)]">Satış fırsatlarını aşamalar arasında yönetin, kapanışa yaklaşan işleri önceliklendirin ve ekip sorumluluklarını tek ekrandan takip edin.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => void load()} disabled={loading}>{loading ? "Güncelleniyor…" : "Verileri Güncelle"}</Button>
        <Link href="/crm/leads?new=1"><Button>Yeni Potansiyel Müşteri</Button></Link>
      </div>
    </header>

    {error && !transitioning && !saleOpportunity ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {[
        ["Açık Satış Fırsatları", totals.count, "Aktif satış sürecindeki fırsatlar"],
        ["Toplam Satış Potansiyeli", formatMoney(totals.raw, "TRY"), "Açık fırsatların toplam değeri"],
        ["Beklenen Satış", formatMoney(totals.weighted, "TRY"), "Gerçekleşme ihtimaline göre"],
        ["30 Gün İçinde Sonuçlanacak", totals.closingSoon, "Yaklaşan kapanışlar"],
        ["Geciken Fırsatlar", totals.overdue, "Kapanış tarihi geçenler"],
      ].map(([label,value,detail],index)=><article key={String(label)} className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-medium text-[var(--muted)]">{label}</span>
          <span className={index===4&&Number(value)>0?"h-2 w-2 rounded-full bg-[var(--danger)]":"h-2 w-2 rounded-full bg-[var(--accent)]"} />
        </div>
        <strong className="mt-3 block truncate text-[22px] font-semibold leading-none tracking-[-.04em] text-[var(--ink)]">{value}</strong>
        <span className="mt-2 block truncate text-[9px] text-[var(--muted)]">{detail}</span>
      </article>)}
    </section>

    <section className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)]">
      <div className="border-b border-[var(--line)] px-5 py-4">
        <h2 className="text-[14px] font-semibold text-[var(--ink)]">Bugünkü Satış Öncelikleri</h2>
        <p className="mt-1 text-[10px] text-[var(--muted)]">Önce ele alınması gereken satış fırsatları</p>
      </div>
      <div className="grid gap-2 p-4 md:grid-cols-3">
        <button type="button" onClick={() => {setViewGroup("ACTIVE");setStaleOnly(false);}} className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] p-3 text-left transition hover:border-[var(--line-strong)]">
          <b className="block text-[10px] font-semibold text-[var(--ink)]">{totals.overdue} kapanışı geciken fırsat</b>
          <span className="mt-1.5 block text-[9px] leading-4 text-[var(--muted)]">Kapanış tarihi geçmiş fırsatları öncelikli kontrol edin.</span>
        </button>
        <button type="button" onClick={() => {setViewGroup("ACTIVE");setStaleOnly(true);}} className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] p-3 text-left transition hover:border-[var(--line-strong)]">
          <b className="block text-[10px] font-semibold text-[var(--ink)]">{totals.stale} uzun süredir güncellenmeyen fırsat</b>
          <span className="mt-1.5 block text-[9px] leading-4 text-[var(--muted)]">14 günden uzun süredir hareket görmeyen fırsatlar.</span>
        </button>
        <button type="button" onClick={() => {setViewGroup("ACTIVE");setStaleOnly(false);}} className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] p-3 text-left transition hover:border-[var(--line-strong)]">
          <b className="block text-[10px] font-semibold text-[var(--ink)]">{totals.highProbability} yüksek gerçekleşme ihtimalli fırsat</b>
          <span className="mt-1.5 block text-[9px] leading-4 text-[var(--muted)]">%80 ve üzeri gerçekleşme ihtimali olan satışlar.</span>
        </button>
      </div>
    </section>

    <section className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)]">
      <div className="flex flex-col gap-3 border-b border-[var(--line)] p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex rounded-[11px] bg-[var(--surface-2)] p-1">
          <button type="button" onClick={() => {setViewGroup("ACTIVE");setStageFilter("");}} className={viewGroup==="ACTIVE"?"rounded-[8px] bg-[var(--surface)] px-3 py-2 text-[10px] font-semibold text-[var(--ink)] shadow-sm":"rounded-[8px] px-3 py-2 text-[10px] font-semibold text-[var(--muted)]"}>
            Aktif Fırsatlar <span className="ml-1 text-[8px]">{totals.count}</span>
          </button>
          <button type="button" onClick={() => {setViewGroup("CLOSED");setStageFilter("");setStaleOnly(false);}} className={viewGroup==="CLOSED"?"rounded-[8px] bg-[var(--surface)] px-3 py-2 text-[10px] font-semibold text-[var(--ink)] shadow-sm":"rounded-[8px] px-3 py-2 text-[10px] font-semibold text-[var(--muted)]"}>
            Sonuçlananlar <span className="ml-1 text-[8px]">{closedCount}</span>
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-2 sm:flex-row lg:max-w-[760px]">
          <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Fırsat veya müşteri ara…" aria-label="Satış sürecinde ara" />
          <details className="relative shrink-0">
            <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-[10px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[10px] font-semibold text-[var(--ink)] hover:bg-[var(--surface-2)]">
              Filtreler
              {hasFilters?<span className="rounded-full bg-[var(--accent-soft)] px-1.5 py-0.5 text-[8px] text-[var(--accent)]">Aktif</span>:null}
              <span className="text-[11px] text-[var(--muted)]">⌄</span>
            </summary>
            <div className="absolute right-0 z-40 mt-2 w-[310px] space-y-2 rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[0_18px_48px_rgba(23,35,28,.14)]">
              <Select value={ownerUserId} onChange={(e) => setOwnerUserId(e.target.value)}>
                <option value="">Tüm sorumlular</option>
                {assignees.map((person)=><option key={person.id} value={person.id}>{person.firstName} {person.lastName}</option>)}
              </Select>
              <Select value={stageFilter} onChange={(e) => setStageFilter(e.target.value as OpportunityStage|"")}>
                <option value="">Tüm aşamalar</option>
                {visibleStages.map((stage)=><option key={stage} value={stage}>{stageLabels[stage]}</option>)}
              </Select>
              {viewGroup==="ACTIVE"?<button type="button" onClick={() => setStaleOnly((value)=>!value)} className={staleOnly?"w-full rounded-[10px] border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2 text-left text-[10px] font-semibold text-[var(--accent)]":"w-full rounded-[10px] border border-[var(--line)] px-3 py-2 text-left text-[10px] font-semibold text-[var(--muted)] hover:bg-[var(--surface-2)]"}>Uzun süredir güncellenmeyenler</button>:null}
              <button type="button" onClick={() => {setOwnerUserId("");setStageFilter("");setSearch("");setStaleOnly(false);}} className="w-full rounded-[10px] px-3 py-2 text-left text-[10px] font-semibold text-[var(--muted)] hover:bg-[var(--surface-2)]">Filtreleri Temizle</button>
            </div>
          </details>
          <div className="flex rounded-[10px] border border-[var(--line)] bg-[var(--surface)] p-1">
            <button type="button" onClick={() => setViewMode("BOARD")} className={viewMode==="BOARD"?"rounded-[7px] bg-[var(--accent-soft)] px-3 py-1.5 text-[9px] font-semibold text-[var(--accent)]":"rounded-[7px] px-3 py-1.5 text-[9px] font-semibold text-[var(--muted)]"}>Pano</button>
            <button type="button" onClick={() => setViewMode("LIST")} className={viewMode==="LIST"?"rounded-[7px] bg-[var(--accent-soft)] px-3 py-1.5 text-[9px] font-semibold text-[var(--accent)]":"rounded-[7px] px-3 py-1.5 text-[9px] font-semibold text-[var(--muted)]"}>Liste</button>
          </div>
        </div>
      </div>

      {loading ? <div className="p-6"><Spinner label="Satış süreci hazırlanıyor..." /></div> : visibleRows.length ? (
        viewMode==="BOARD" ? <div className={viewGroup==="ACTIVE"?"grid items-start gap-3 p-4 xl:grid-cols-4":"grid items-start gap-3 p-4 md:grid-cols-2"}>
          {visibleStages.map((stage)=>{
            const stageRows=visibleRows.filter((row)=>row.stage===stage);
            const stageTotal=stageRows.reduce((sum,row)=>sum+Number(row.estimatedValue??0),0);
            const stageExpected=stageRows.reduce((sum,row)=>sum+Number(row.estimatedValue??0)*row.probability/100,0);
            const draggedRow=draggingId?rows.find((row)=>row.id===draggingId):null;
            const canDrop=Boolean(viewGroup==="ACTIVE"&&draggedRow&&nextStages[draggedRow.stage].includes(stage));
            return <section
              key={stage}
              onDragOver={(event)=>{if(canDrop){event.preventDefault();setDragTarget(stage)}}}
              onDragLeave={()=>{if(dragTarget===stage)setDragTarget(null)}}
              onDrop={(event)=>{event.preventDefault();const dragged=rows.find((row)=>row.id===draggingId);if(dragged&&canDrop)void moveOpportunity(dragged,stage)}}
              className={dragTarget===stage&&canDrop?"min-h-[260px] overflow-hidden rounded-[18px] border border-[var(--accent)] bg-[var(--accent-soft)]/40":"min-h-[260px] overflow-hidden rounded-[18px] border border-[var(--line)] bg-[var(--surface-2)]/50"}
            >
              <header className="border-b border-[var(--line)] bg-[var(--surface)] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-[11px] font-semibold text-[var(--ink)]">{stageLabels[stage]}</h2>
                  <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[9px] font-bold text-[var(--accent)]">{stageRows.length}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 text-[8px] text-[var(--muted)]">
                  <span>{formatMoney(stageTotal,"TRY")} toplam</span>
                  <span>{formatMoney(stageExpected,"TRY")} beklenen</span>
                </div>
              </header>

              <div className="space-y-2.5 p-3">
                {stageRows.map((row)=>{
                  const subjectName=[row.leadFirstName,row.leadLastName].filter(Boolean).join(" ")||[row.customerFirstName,row.customerLastName].filter(Boolean).join(" ")||"Müşteri bağlantısı yok";
                  const age=daysSince(row.updatedAt);
                  const ownerName=row.ownerUserId?(assigneeNames.get(row.ownerUserId)||"Atanmış kullanıcı"):"Sorumlu atanmamış";
                  const closeTime=row.expectedCloseDate?new Date(row.expectedCloseDate).getTime():null;
                  const diffDays=closeTime==null?null:Math.ceil((closeTime-Date.now())/86400000);
                  const closeLate=diffDays!=null&&diffDays<0&&!closedStages.includes(row.stage);
                  const canDrag=canManage&&viewGroup==="ACTIVE"&&nextStages[row.stage].some((target)=>activeStages.includes(target));
                  return <article
                    key={row.id}
                    draggable={canDrag}
                    onDragStart={()=>{setDraggingId(row.id);setSelectedOpportunity(null)}}
                    onDragEnd={()=>{setDraggingId(null);setDragTarget(null)}}
                    onClick={()=>setSelectedOpportunity(row)}
                    onKeyDown={(event)=>{if(event.key==="Enter")setSelectedOpportunity(row)}}
                    role="button"
                    tabIndex={0}
                    className={draggingId===row.id?"cursor-grabbing rounded-[15px] border border-[var(--accent)] bg-[var(--surface)] p-3 opacity-60 shadow-[var(--shadow-soft)]":"cursor-pointer rounded-[15px] border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5 hover:border-[var(--line-strong)]"}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-semibold text-[var(--ink)]">{row.title}</p>
                        <p className="mt-1 truncate text-[9px] text-[var(--muted)]">{subjectName}</p>
                      </div>
                      <details onClick={(event)=>event.stopPropagation()} className="relative shrink-0">
                        <summary className="cursor-pointer list-none rounded-[8px] px-2 py-1 text-[14px] leading-none text-[var(--muted)] hover:bg-[var(--surface-2)]">•••</summary>
                        <div className="absolute right-0 z-30 mt-1 w-[170px] rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-1.5 shadow-[0_12px_32px_rgba(23,35,28,.14)]">
                          <Link href={"/crm/opportunities/"+row.id} className="block rounded-[8px] px-2.5 py-2 text-[9px] font-medium text-[var(--ink)] hover:bg-[var(--surface-2)]">Fırsatı Aç</Link>
                          {canManage&&nextStages[row.stage].length?<button type="button" onClick={()=>openTransition(row)} className="block w-full rounded-[8px] px-2.5 py-2 text-left text-[9px] font-medium text-[var(--ink)] hover:bg-[var(--surface-2)]">Aşamayı Değiştir</button>:null}
                          {canCreateSale&&row.stage==="WON"?<button type="button" onClick={()=>void openSale(row)} className="block w-full rounded-[8px] px-2.5 py-2 text-left text-[9px] font-medium text-[var(--ink)] hover:bg-[var(--surface-2)]">Satışı Hazırla</button>:null}
                        </div>
                      </details>
                    </div>

                    <strong className="mt-3 block text-[15px] tracking-[-.03em] text-[var(--ink)]">{formatMoney(row.estimatedValue,row.currency)}</strong>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]"><span className="block h-full rounded-full bg-[var(--accent)]" style={{width:Math.max(2,Math.min(100,row.probability))+"%"}} /></div>
                      <span className="text-[8px] font-medium text-[var(--muted)]">%{row.probability}</span>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3 text-[8px] text-[var(--muted)]">
                      <span className="truncate">{ownerName}</span>
                      <span className={age>=14?"whitespace-nowrap font-semibold text-[var(--warning)]":"whitespace-nowrap"}>{age===0?"Bugün güncellendi":age+" gündür bu aşamada"}</span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-3 text-[8px]">
                      <span className="text-[var(--muted)]">{row.expectedCloseDate?"Kapanış "+formatDate(row.expectedCloseDate):"Kapanış tarihi yok"}</span>
                      {closeLate?<span className="font-semibold text-[var(--danger)]">Gecikti</span>:diffDays!=null&&diffDays>=0&&diffDays<=3?<span className="font-semibold text-[var(--warning)]">{diffDays===0?"Bugün":diffDays+" gün kaldı"}</span>:null}
                    </div>
                  </article>;
                })}
                {!stageRows.length?<div className="rounded-[14px] border border-dashed border-[var(--line)] px-3 py-8 text-center text-[9px] text-[var(--muted-soft)]">{viewGroup==="ACTIVE"?"Bu aşamaya fırsat sürükleyebilirsiniz.":"Bu aşamada sonuçlanan fırsat yok."}</div>:null}
              </div>
            </section>;
          })}
        </div> : <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-[1.35fr_180px_150px_130px_180px_130px] gap-3 border-b border-[var(--line)] bg-[var(--surface-2)] px-4 py-2.5 text-[8px] font-semibold text-[var(--muted)]">
              <span>Fırsat / Müşteri</span><span>Aşama</span><span>Değer</span><span>İhtimal</span><span>Sorumlu</span><span>Kapanış</span>
            </div>
            <div className="divide-y divide-[var(--line)]">
              {visibleRows.map((row)=>{
                const subjectName=[row.leadFirstName,row.leadLastName].filter(Boolean).join(" ")||[row.customerFirstName,row.customerLastName].filter(Boolean).join(" ")||"Müşteri bağlantısı yok";
                const ownerName=row.ownerUserId?(assigneeNames.get(row.ownerUserId)||"Atanmış kullanıcı"):"Sorumlu atanmamış";
                return <button key={row.id} type="button" onClick={()=>setSelectedOpportunity(row)} className="grid w-full grid-cols-[1.35fr_180px_150px_130px_180px_130px] items-center gap-3 px-4 py-3 text-left transition hover:bg-[var(--surface-2)]">
                  <span className="min-w-0"><b className="block truncate text-[10px] text-[var(--ink)]">{row.title}</b><small className="mt-1 block truncate text-[8px] text-[var(--muted)]">{subjectName}</small></span>
                  <span className="text-[9px] font-medium text-[var(--ink)]">{stageLabels[row.stage]}</span>
                  <strong className="text-[10px] text-[var(--ink)]">{formatMoney(row.estimatedValue,row.currency)}</strong>
                  <span className="text-[9px] text-[var(--muted)]">%{row.probability}</span>
                  <span className="truncate text-[9px] text-[var(--muted)]">{ownerName}</span>
                  <span className="text-[9px] text-[var(--muted)]">{row.expectedCloseDate?formatDate(row.expectedCloseDate):"—"}</span>
                </button>;
              })}
            </div>
          </div>
        </div>
      ) : <div className="p-6"><EmptyState title="Satış fırsatı bulunamadı" description={hasFilters?"Seçili filtrelerle eşleşen fırsat bulunamadı.":"Potansiyel müşteri havuzundan ilk satış fırsatını oluşturun."} action={<Link href="/crm/leads"><Button>Potansiyel Müşterilere Git</Button></Link>} /></div>}
    </section>

    {selectedOpportunity?<div className="fixed inset-0 z-[80] flex justify-end bg-black/20" onClick={()=>setSelectedOpportunity(null)}>
      <aside className="h-full w-full max-w-[430px] overflow-y-auto border-l border-[var(--line)] bg-[var(--surface)] p-5 shadow-[-18px_0_48px_rgba(23,35,28,.16)]" onClick={(event)=>event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="text-[9px] font-semibold text-[var(--accent)]">{stageLabels[selectedOpportunity.stage]}</span>
            <h2 className="mt-1 text-[20px] font-semibold tracking-[-.035em] text-[var(--ink)]">{selectedOpportunity.title}</h2>
            <p className="mt-1 text-[10px] text-[var(--muted)]">{[selectedOpportunity.leadFirstName,selectedOpportunity.leadLastName].filter(Boolean).join(" ")||[selectedOpportunity.customerFirstName,selectedOpportunity.customerLastName].filter(Boolean).join(" ")||"Müşteri bağlantısı yok"}</p>
          </div>
          <button type="button" onClick={()=>setSelectedOpportunity(null)} className="rounded-[9px] border border-[var(--line)] px-2.5 py-1.5 text-[12px] text-[var(--muted)] hover:bg-[var(--surface-2)]">×</button>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-[13px] bg-[var(--surface-2)] p-3"><span className="text-[8px] text-[var(--muted)]">Tahmini Satış</span><strong className="mt-1 block text-[13px] text-[var(--ink)]">{formatMoney(selectedOpportunity.estimatedValue,selectedOpportunity.currency)}</strong></div>
          <div className="rounded-[13px] bg-[var(--surface-2)] p-3"><span className="text-[8px] text-[var(--muted)]">Gerçekleşme İhtimali</span><strong className="mt-1 block text-[13px] text-[var(--ink)]">%{selectedOpportunity.probability}</strong></div>
          <div className="rounded-[13px] bg-[var(--surface-2)] p-3"><span className="text-[8px] text-[var(--muted)]">Sorumlu</span><strong className="mt-1 block truncate text-[10px] text-[var(--ink)]">{selectedOpportunity.ownerUserId?(assigneeNames.get(selectedOpportunity.ownerUserId)||"Atanmış kullanıcı"):"Sorumlu atanmamış"}</strong></div>
          <div className="rounded-[13px] bg-[var(--surface-2)] p-3"><span className="text-[8px] text-[var(--muted)]">Beklenen Kapanış</span><strong className="mt-1 block text-[10px] text-[var(--ink)]">{selectedOpportunity.expectedCloseDate?formatDate(selectedOpportunity.expectedCloseDate):"Belirlenmedi"}</strong></div>
        </div>

        <div className="mt-5 rounded-[14px] border border-[var(--line)] p-4">
          <h3 className="text-[10px] font-semibold text-[var(--ink)]">Fırsat Durumu</h3>
          <div className="mt-3 flex items-center justify-between text-[9px] text-[var(--muted)]"><span>Bu aşamada geçen süre</span><strong className={daysSince(selectedOpportunity.updatedAt)>=14?"text-[var(--warning)]":"text-[var(--ink)]"}>{daysSince(selectedOpportunity.updatedAt)} gün</strong></div>
          <div className="mt-2 flex items-center justify-between text-[9px] text-[var(--muted)]"><span>Son güncelleme</span><strong className="text-[var(--ink)]">{formatDate(selectedOpportunity.updatedAt)}</strong></div>
        </div>

        <div className="mt-6 space-y-2">
          {canManage&&nextStages[selectedOpportunity.stage].length?<Button className="w-full" onClick={()=>{openTransition(selectedOpportunity);setSelectedOpportunity(null)}}>Aşamayı Değiştir</Button>:null}
          {canCreateSale&&selectedOpportunity.stage==="WON"?<Button className="w-full" onClick={()=>{void openSale(selectedOpportunity);setSelectedOpportunity(null)}}>Satışı Hazırla</Button>:null}
          <Link href={"/crm/opportunities/"+selectedOpportunity.id} className="flex min-h-10 w-full items-center justify-center rounded-[10px] border border-[var(--line)] text-[10px] font-semibold text-[var(--ink)] hover:bg-[var(--surface-2)]">Fırsat Detayına Git</Link>
        </div>
      </aside>
    </div>:null}

    <Modal open={Boolean(transitioning)} onClose={() => setTransitioning(null)} title="Satış fırsatı aşamasını değiştir" description={transitioning?.title}><form onSubmit={transition} className="space-y-4">{error ? <Alert>{error}</Alert> : null}<Field label="Yeni Aşama" required><Select value={targetStage} onChange={(e) => { const v = e.target.value as OpportunityStage; setTargetStage(v); if (v === "WON") setProbability("100"); else if (v === "LOST") setProbability("0"); }}>{transitioning ? nextStages[transitioning.stage].map((s) => <option key={s} value={s}>{stageLabels[s]}</option>) : null}</Select></Field><Field label="Kazanma Olasılığı (%)"><TextInput type="number" min="0" max="100" value={probability} disabled={["WON", "LOST"].includes(targetStage)} onChange={(e) => setProbability(e.target.value)} /></Field>{targetStage === "LOST" ? <Field label="Kaybetme Nedeni" required><TextArea rows={3} value={lostReason} onChange={(e) => setLostReason(e.target.value)} /></Field> : null}<div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setTransitioning(null)} disabled={saving}>Vazgeç</Button><Button type="submit" disabled={saving}>{saving ? "Güncelleniyor..." : "Aşamayı Güncelle"}</Button></div></form></Modal>

    <Modal open={Boolean(saleOpportunity)} onClose={() => { if (!saving) setSaleOpportunity(null); }} title="Satışı Hazırla" description={saleOpportunity?.title}>{saleReferencesLoading ? <Spinner label="Satış seçenekleri hazırlanıyor..." /> : <form onSubmit={createSale} className="space-y-4">{error ? <Alert>{error}</Alert> : null}<Field label="Müşteri" required><Select value={saleCustomerId} onChange={(e) => setSaleCustomerId(e.target.value)}><option value="">Müşteri seçin</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}</Select></Field><div className="space-y-3"><div className="flex items-center justify-between gap-3"><p className="text-[12px] font-semibold text-[var(--ink)]">Satış kalemleri</p><Button type="button" variant="secondary" className="min-h-8 px-3 py-1 text-[10px]" onClick={addSaleItem}>+ Kalem ekle</Button></div>{saleItems.map((item, index) => <div key={item.key} className="space-y-3 rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)]/40 p-3"><div className="flex items-center justify-between gap-3"><span className="text-[10px] font-semibold text-[var(--muted)]">Kalem {index + 1}</span>{saleItems.length > 1 ? <Button type="button" variant="ghost" className="min-h-7 px-2 py-1 text-[10px]" onClick={() => removeSaleItem(item.key)}>Kaldır</Button> : null}</div><div className="grid gap-3 sm:grid-cols-[.8fr_1.4fr_.5fr]"><Field label="Tür" required><Select value={item.type} onChange={(e) => updateSaleItem(item.key, { type: e.target.value as SaleReferenceType, referenceId: "" })}><option value="SERVICE">Hizmet</option><option value="PACKAGE">Paket</option></Select></Field><Field label={item.type === "SERVICE" ? "Hizmet" : "Paket"} required><Select value={item.referenceId} onChange={(e) => updateSaleItem(item.key, { referenceId: e.target.value })}><option value="">Seçin</option>{referencesFor(item.type).map((r) => <option key={r.id} value={r.id}>{r.label} · {formatMoney(r.price, "TRY")}</option>)}</Select></Field><Field label="Miktar" required><TextInput type="number" min="1" step="1" value={item.quantity} onChange={(e) => updateSaleItem(item.key, { quantity: e.target.value })} /></Field></div></div>)}</div><Field label="Toplam indirim (₺)"><TextInput type="number" min="0" step="0.01" value={saleDiscount} onChange={(e) => setSaleDiscount(e.target.value)} /></Field><Alert tone="success">Bu işlem doğrudan muhasebe kaydı oluşturmaz. Satış önce hazırlık aşamasında kaydedilir.</Alert><div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setSaleOpportunity(null)} disabled={saving}>Vazgeç</Button><Button type="submit" disabled={saving}>{saving ? "Oluşturuluyor..." : "Satışı Hazırla"}</Button></div></form>}</Modal>
  </div>;
}
