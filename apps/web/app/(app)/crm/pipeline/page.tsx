"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/modal";
import { Alert, Button, EmptyState, Field, PageHeader, Select, Spinner, TextArea, TextInput } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, ApiError, withQuery } from "@/lib/api";
import { userErrorMessage } from "@/lib/user-language";
import { hasActiveBranch, hasPermission } from "@/lib/auth";
import { opportunityStageLabels, type CrmAssignee, type CrmOpportunity, type OpportunityStage } from "@/lib/crm-types";

const stages: OpportunityStage[] = ["QUALIFIED", "NEEDS_ANALYSIS", "PROPOSAL", "NEGOTIATION", "WON", "LOST"];
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
    return { count: open.length, raw: open.reduce((s, r) => s + Number(r.estimatedValue ?? 0), 0), weighted: open.reduce((s, r) => s + Number(r.estimatedValue ?? 0) * r.probability / 100, 0) };
  }, [rows]);

  function referencesFor(type: SaleReferenceType) { return type === "SERVICE" ? services.map((x) => ({ id: x.id, label: x.name, price: x.price })) : packages.filter((x) => x.active).map((x) => ({ id: x.id, label: x.name, price: x.price })); }
  function requireActiveBranch() { if (hasActiveBranch()) return true; showToast("Satış Fırsatını Güncellemek İçin Önce Çalışma Kapsamından Bir Şube Seçin.", "error"); return false; }
  function openTransition(row: CrmOpportunity) { if (!requireActiveBranch()) return; const first = nextStages[row.stage][0] ?? ""; setTransitioning(row); setTargetStage(first); setProbability(first === "WON" ? "100" : first === "LOST" ? "0" : String(row.probability)); setLostReason(""); setError(""); }
  async function transition(event: FormEvent) {
    event.preventDefault(); if (!transitioning || !targetStage || !requireActiveBranch()) return;
    if (targetStage === "LOST" && !lostReason.trim()) return setError("Kaybedilen Satış Fırsatı İçin Neden Gereklidir.");
    setSaving(true); setError("");
    try { await api(`/crm/opportunities/${transitioning.id}/transition`, { method: "POST", body: { version: transitioning.version, stage: targetStage, probability: Number(probability), ...(targetStage === "LOST" ? { lostReason: lostReason.trim() } : {}) } }); setTransitioning(null); showToast("Satış Fırsatı Aşaması Güncellendi.", "success"); await load(); }
    catch (e) { setError(e instanceof ApiError ? userErrorMessage(e.message, "Satış fırsatı güncellenemedi.") : "Satış fırsatı güncellenemedi."); } finally { setSaving(false); }
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
    try { const result = await api<SaleConversionResponse>(`/sales/from-opportunity/${saleOpportunity.id}`, { method: "POST", body: { version: saleOpportunity.version, customerId: saleCustomerId, discountTotal, items: normalizedItems } }); setSaleOpportunity(null); showToast(result.idempotent ? "Bu fırsat için satış taslağı zaten mevcut." : `Satış taslağı oluşturuldu: ${formatMoney(result.sale.total, "TRY")}.`, "success"); await load(); }
    catch (e) { setError(e instanceof ApiError ? userErrorMessage(e.message, "Satış taslağı oluşturulamadı.") : "Satış taslağı oluşturulamadı."); } finally { setSaving(false); }
  }

  const hasFilters = Boolean(ownerUserId || stageFilter || search.trim() || staleOnly);
  return <div className="space-y-6">
    <PageHeader title="Satış Süreci" description="Satış fırsatlarını aşama, sorumlu, arama ve risk sinyalleriyle yönetin." />
    {error && !transitioning && !saleOpportunity ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
    <section className="grid gap-3 rounded-[20px] border border-[var(--line)] bg-white p-4 shadow-[var(--shadow-soft)] md:grid-cols-[1.4fr_.8fr_.8fr_auto]">
      <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Fırsat veya müşteri ara..." aria-label="Satış sürecinde ara" />
      <Select value={ownerUserId} onChange={(e) => setOwnerUserId(e.target.value)}><option value="">Tüm Sorumlular</option>{assignees.map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}</Select>
      <Select value={stageFilter} onChange={(e) => setStageFilter(e.target.value as OpportunityStage | "")}><option value="">Tüm Aşamalar</option>{stages.map((s) => <option key={s} value={s}>{opportunityStageLabels[s]}</option>)}</Select>
      <div className="flex gap-2"><Button variant={staleOnly ? "primary" : "secondary"} onClick={() => setStaleOnly((v) => !v)}>14+ Gün Risk</Button>{hasFilters ? <Button variant="ghost" onClick={() => { setOwnerUserId(""); setStageFilter(""); setSearch(""); setStaleOnly(false); }}>Temizle</Button> : null}</div>
    </section>
    <section className="grid gap-3 sm:grid-cols-3">{[["Açık Satış Fırsatı", totals.count], ["Toplam Satış Değeri", formatMoney(totals.raw, "TRY")], ["Ağırlıklı Değer", formatMoney(totals.weighted, "TRY")]].map(([label, value]) => <article key={String(label)} className="rounded-[20px] border border-[var(--line)] bg-white p-4 shadow-[var(--shadow-soft)]"><p className="text-[10px] text-[var(--muted)]">{label}</p><strong className="mt-2 block text-[22px] tracking-[-.04em]">{value}</strong></article>)}</section>
    {loading ? <Spinner label="Satış süreci hazırlanıyor..." /> : rows.length ? <div className="grid items-start gap-4 xl:grid-cols-3 2xl:grid-cols-6">{stages.map((stage) => {
      const stageRows = rows.filter((row) => row.stage === stage); return <section key={stage} className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[#f7fbfd]"><header className="flex items-center justify-between border-b border-[var(--line)] bg-white px-4 py-3"><h2 className="text-[11px] font-semibold">{opportunityStageLabels[stage]}</h2><span className="rounded-full bg-[#EAF5FB] px-2 py-0.5 text-[10px] font-bold text-[#1674BD]">{stageRows.length}</span></header><div className="space-y-3 p-3">{stageRows.map((row) => {
        const subjectName = [row.leadFirstName, row.leadLastName].filter(Boolean).join(" ") || [row.customerFirstName, row.customerLastName].filter(Boolean).join(" ") || "Müşteri Bağlantısı Yok";
        const subjectHref = row.leadId ? `/crm/leads/${row.leadId}` : row.customerId && canReadCustomers ? `/customers/${row.customerId}` : "/crm";
        const age = daysSince(row.updatedAt); const closeLate = row.expectedCloseDate ? new Date(row.expectedCloseDate).getTime() < Date.now() && !["WON", "LOST"].includes(row.stage) : false;
        return <article key={row.id} className="rounded-[16px] border border-[#dfeaf1] bg-white p-3 shadow-[0_3px_14px_rgba(17,70,104,.05)]"><div className="flex flex-wrap gap-1.5">{age >= 14 && !["WON", "LOST"].includes(row.stage) ? <span className="rounded-full bg-[#fff1ec] px-2 py-1 text-[9px] font-semibold text-[#9c513f]">{age} gündür hareketsiz</span> : null}{closeLate ? <span className="rounded-full bg-[#fff1ec] px-2 py-1 text-[9px] font-semibold text-[#9c513f]">Kapanış gecikti</span> : null}</div><Link href={`/crm/opportunities/${row.id}`} className="mt-2 block text-[12px] font-semibold leading-5 hover:text-[#1674BD]">{row.title}</Link><Link href={subjectHref} className="mt-1 block truncate text-[10px] text-[var(--muted)] hover:text-[#1674BD]">{subjectName}</Link><strong className="mt-4 block text-[15px]">{formatMoney(row.estimatedValue, row.currency)}</strong><div className="mt-2 flex items-center gap-2"><div className="h-1 flex-1 overflow-hidden rounded-full bg-[#e5f2f7]"><span className="block h-full rounded-full bg-[#1674BD]" style={{ width: `${row.probability}%` }} /></div><span className="text-[9px] text-[var(--muted)]">%{row.probability}</span></div><div className="mt-3 space-y-1 text-[9px] text-[var(--muted)]"><p>Son aktivite: {formatDate(row.updatedAt)}</p><p>Beklenen kapanış: {row.expectedCloseDate ? formatDate(row.expectedCloseDate) : "—"}</p></div>{canManage && nextStages[row.stage].length ? <Button variant="ghost" className="mt-3 min-h-8 w-full px-2 py-1 text-[10px]" onClick={() => openTransition(row)}>Aşamayı İlerlet</Button> : null}{canCreateSale && row.stage === "WON" ? <Button variant="ghost" className="mt-3 min-h-8 w-full px-2 py-1 text-[10px]" onClick={() => void openSale(row)}>Satış Taslağını Oluştur / Aç</Button> : null}</article>;
      })}{!stageRows.length ? <p className="py-7 text-center text-[10px] text-[var(--muted-soft)]">Bu Aşamada Satış Fırsatı Yok</p> : null}</div></section>;
    })}</div> : <EmptyState title="Satış Süreci Boş" description={hasFilters ? "Seçili filtrelerle eşleşen fırsat bulunamadı." : "Potansiyel müşteri havuzundan ilk satış fırsatını oluşturun."} action={<Link href="/crm/leads"><Button>Potansiyel Müşteri Havuzuna Git</Button></Link>} />}

    <Modal open={Boolean(transitioning)} onClose={() => setTransitioning(null)} title="Satış Fırsatı Aşamasını Değiştir" description={transitioning?.title}><form onSubmit={transition} className="space-y-4">{error ? <Alert>{error}</Alert> : null}<Field label="Yeni Aşama" required><Select value={targetStage} onChange={(e) => { const v = e.target.value as OpportunityStage; setTargetStage(v); if (v === "WON") setProbability("100"); else if (v === "LOST") setProbability("0"); }}>{transitioning ? nextStages[transitioning.stage].map((s) => <option key={s} value={s}>{opportunityStageLabels[s]}</option>) : null}</Select></Field><Field label="Kazanma Olasılığı (%)"><TextInput type="number" min="0" max="100" value={probability} disabled={["WON", "LOST"].includes(targetStage)} onChange={(e) => setProbability(e.target.value)} /></Field>{targetStage === "LOST" ? <Field label="Kaybetme Nedeni" required><TextArea rows={3} value={lostReason} onChange={(e) => setLostReason(e.target.value)} /></Field> : null}<div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setTransitioning(null)} disabled={saving}>Vazgeç</Button><Button type="submit" disabled={saving}>{saving ? "Güncelleniyor..." : "Aşamayı Güncelle"}</Button></div></form></Modal>

    <Modal open={Boolean(saleOpportunity)} onClose={() => { if (!saving) setSaleOpportunity(null); }} title="Satış Taslağı Oluştur" description={saleOpportunity?.title}>{saleReferencesLoading ? <Spinner label="Satış Seçenekleri Hazırlanıyor..." /> : <form onSubmit={createSale} className="space-y-4">{error ? <Alert>{error}</Alert> : null}<Field label="Müşteri" required><Select value={saleCustomerId} onChange={(e) => setSaleCustomerId(e.target.value)}><option value="">Müşteri Seçin</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}</Select></Field><div className="space-y-3"><div className="flex items-center justify-between gap-3"><p className="text-[12px] font-semibold text-[var(--ink)]">Satış Kalemleri</p><Button type="button" variant="secondary" className="min-h-8 px-3 py-1 text-[10px]" onClick={addSaleItem}>+ Kalem Ekle</Button></div>{saleItems.map((item, index) => <div key={item.key} className="space-y-3 rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)]/40 p-3"><div className="flex items-center justify-between gap-3"><span className="text-[10px] font-semibold text-[var(--muted)]">Kalem {index + 1}</span>{saleItems.length > 1 ? <Button type="button" variant="ghost" className="min-h-7 px-2 py-1 text-[10px]" onClick={() => removeSaleItem(item.key)}>Kaldır</Button> : null}</div><div className="grid gap-3 sm:grid-cols-[.8fr_1.4fr_.5fr]"><Field label="Tür" required><Select value={item.type} onChange={(e) => updateSaleItem(item.key, { type: e.target.value as SaleReferenceType, referenceId: "" })}><option value="SERVICE">Hizmet</option><option value="PACKAGE">Paket</option></Select></Field><Field label={item.type === "SERVICE" ? "Hizmet" : "Paket"} required><Select value={item.referenceId} onChange={(e) => updateSaleItem(item.key, { referenceId: e.target.value })}><option value="">Seçin</option>{referencesFor(item.type).map((r) => <option key={r.id} value={r.id}>{r.label} · {formatMoney(r.price, "TRY")}</option>)}</Select></Field><Field label="Miktar" required><TextInput type="number" min="1" step="1" value={item.quantity} onChange={(e) => updateSaleItem(item.key, { quantity: e.target.value })} /></Field></div></div>)}</div><Field label="Toplam İndirim (₺)"><TextInput type="number" min="0" step="0.01" value={saleDiscount} onChange={(e) => setSaleDiscount(e.target.value)} /></Field><Alert tone="success">Bu işlem muhasebe kaydı oluşturmaz. Önce satış taslağı oluşur.</Alert><div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setSaleOpportunity(null)} disabled={saving}>Vazgeç</Button><Button type="submit" disabled={saving}>{saving ? "Oluşturuluyor..." : "Satış Taslağı Oluştur"}</Button></div></form>}</Modal>
  </div>;
}
