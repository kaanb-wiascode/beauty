"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/modal";
import {
  Alert,
  Button,
  EmptyState,
  Field,
  PageHeader,
  Select,
  Spinner,
  TextArea,
  TextInput,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, ApiError, withQuery } from "@/lib/api";
import { hasActiveBranch, hasPermission } from "@/lib/auth";
import {
  opportunityStageLabels,
  type CrmAssignee,
  type CrmOpportunity,
  type OpportunityStage,
} from "@/lib/crm-types";

const stages: OpportunityStage[] = [
  "QUALIFIED",
  "NEEDS_ANALYSIS",
  "PROPOSAL",
  "NEGOTIATION",
  "WON",
  "LOST",
];
const nextStages: Record<OpportunityStage, OpportunityStage[]> = {
  QUALIFIED: ["NEEDS_ANALYSIS", "LOST"],
  NEEDS_ANALYSIS: ["PROPOSAL", "LOST"],
  PROPOSAL: ["NEGOTIATION", "WON", "LOST"],
  NEGOTIATION: ["PROPOSAL", "WON", "LOST"],
  WON: [],
  LOST: [],
};

type Customer = { id: string; firstName: string; lastName: string };
type Service = { id: string; name: string; price: string | number };
type ServicePackage = { id: string; name: string; price: string | number; active: boolean };
type SaleReferenceType = "SERVICE" | "PACKAGE";
type DraftSaleItem = {
  key: string;
  type: SaleReferenceType;
  referenceId: string;
  quantity: string;
};
type SaleConversionResponse = {
  idempotent: boolean;
  sale: { id: string; status: string; total: string | number };
};

function formatMoney(value: string | number | null, currency: string) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

function newSaleItem(index: number): DraftSaleItem {
  return { key: `sale-item-${index}`, type: "SERVICE", referenceId: "", quantity: "1" };
}

export default function CrmPipelinePage() {
  const canManage = hasPermission("crm", "manage");
  const canReadCustomers = hasPermission("customers", "read");
  const canCreateSale =
    hasPermission("payments", "create") &&
    canReadCustomers &&
    hasPermission("services", "read");
  const { showToast } = useToast();
  const [rows, setRows] = useState<CrmOpportunity[]>([]);
  const [assignees, setAssignees] = useState<CrmAssignee[]>([]);
  const [ownerUserId, setOwnerUserId] = useState("");
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

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (ownerUserId) params.set("ownerUserId", ownerUserId);
      const [opportunityRows, assigneeRows, customerResult] = await Promise.all([
        api<CrmOpportunity[]>(`/crm/opportunities?${params}`),
        api<CrmAssignee[]>("/crm/assignees"),
        canReadCustomers
          ? api<{ data: Customer[] }>(withQuery("/customers", { page: 1, limit: 200 }))
          : Promise.resolve({ data: [] as Customer[] }),
      ]);
      setRows(opportunityRows);
      setAssignees(assigneeRows);
      setCustomers(customerResult.data);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Satış Süreci Yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [canReadCustomers, ownerUserId]);
  useEffect(() => { void load(); }, [load]);

  const customerNameById = useMemo(
    () => new Map(customers.map((customer) => [customer.id, `${customer.firstName} ${customer.lastName}`.trim()])),
    [customers],
  );

  const totals = useMemo(() => {
    const open = rows.filter((row) => !["WON", "LOST"].includes(row.stage));
    return {
      count: open.length,
      raw: open.reduce((sum, row) => sum + Number(row.estimatedValue ?? 0), 0),
      weighted: open.reduce((sum, row) => sum + (Number(row.estimatedValue ?? 0) * row.probability) / 100, 0),
    };
  }, [rows]);

  function referencesFor(type: SaleReferenceType) {
    return type === "SERVICE"
      ? services.map((item) => ({ id: item.id, label: item.name, price: item.price }))
      : packages.filter((item) => item.active).map((item) => ({ id: item.id, label: item.name, price: item.price }));
  }

  function requireActiveBranch() {
    if (hasActiveBranch()) return true;
    showToast(
      "Satış Fırsatını Güncellemek İçin Önce Çalışma Kapsamından Bir Şube Seçin.",
      "error",
    );
    return false;
  }

  function openTransition(row: CrmOpportunity) {
    if (!requireActiveBranch()) return;
    const first = nextStages[row.stage][0] ?? "";
    setTransitioning(row);
    setTargetStage(first);
    setProbability(first === "WON" ? "100" : first === "LOST" ? "0" : String(row.probability));
    setLostReason("");
    setError("");
  }

  async function transition(event: FormEvent) {
    event.preventDefault();
    if (!transitioning || !targetStage) return;
    if (!requireActiveBranch()) return;
    if (targetStage === "LOST" && !lostReason.trim()) {
      setError("Kaybedilen Satış Fırsatı İçin Neden Gereklidir.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api(`/crm/opportunities/${transitioning.id}/transition`, {
        method: "POST",
        body: {
          version: transitioning.version,
          stage: targetStage,
          probability: Number(probability),
          ...(targetStage === "LOST" ? { lostReason: lostReason.trim() } : {}),
        },
      });
      setTransitioning(null);
      showToast("Satış Fırsatı Aşaması Güncellendi.", "success");
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Satış Fırsatı Güncellenemedi.");
    } finally {
      setSaving(false);
    }
  }

  async function openSale(row: CrmOpportunity) {
    if (!requireActiveBranch()) return;
    setSaleOpportunity(row);
    setSaleCustomerId(row.customerId ?? "");
    setSaleItems([newSaleItem(1)]);
    setSaleItemSequence(1);
    setSaleDiscount("0");
    setError("");
    setSaleReferencesLoading(true);
    try {
      const [serviceResult, packageResult] = await Promise.all([
        api<{ data: Service[] }>(withQuery("/services", { page: 1, limit: 200 })),
        api<ServicePackage[]>("/packages"),
      ]);
      setServices(serviceResult.data);
      setPackages(packageResult);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Satış seçenekleri yüklenemedi.");
    } finally {
      setSaleReferencesLoading(false);
    }
  }

  function updateSaleItem(key: string, patch: Partial<Omit<DraftSaleItem, "key">>) {
    setSaleItems((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item));
  }

  function addSaleItem() {
    const next = saleItemSequence + 1;
    setSaleItemSequence(next);
    setSaleItems((current) => [...current, newSaleItem(next)]);
  }

  function removeSaleItem(key: string) {
    setSaleItems((current) => current.length > 1 ? current.filter((item) => item.key !== key) : current);
  }

  async function createSale(event: FormEvent) {
    event.preventDefault();
    if (!saleOpportunity || !saleCustomerId) {
      setError("Müşteri seçilmelidir.");
      return;
    }
    const normalizedItems = saleItems.map((item) => ({
      type: item.type,
      referenceId: item.referenceId,
      quantity: Number(item.quantity),
    }));
    if (normalizedItems.some((item) => !item.referenceId || !Number.isInteger(item.quantity) || item.quantity <= 0)) {
      setError("Her satış kalemi için ürün/hizmet ve pozitif tam sayı miktar seçilmelidir.");
      return;
    }
    const discountTotal = Number(saleDiscount);
    if (!Number.isFinite(discountTotal) || discountTotal < 0) {
      setError("İndirim sıfır veya pozitif olmalıdır.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const result = await api<SaleConversionResponse>(`/sales/from-opportunity/${saleOpportunity.id}`, {
        method: "POST",
        body: {
          version: saleOpportunity.version,
          customerId: saleCustomerId,
          discountTotal,
          items: normalizedItems,
        },
      });
      setSaleOpportunity(null);
      showToast(
        result.idempotent
          ? `Bu fırsat için satış taslağı zaten mevcut (${String(result.sale.id).slice(0, 8)}…).`
          : `Satış taslağı oluşturuldu: ${formatMoney(result.sale.total, "TRY")}.`,
        "success",
      );
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Satış taslağı oluşturulamadı.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Satış Süreci"
        description="Satış Fırsatlarını Kontrollü Aşama Geçişleriyle İlerletin; Değer Ve Kazanma Olasılığını Birlikte İzleyin."
      />
      {error && !transitioning && !saleOpportunity ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
      <div className="flex justify-end">
        <Select
          value={ownerUserId}
          onChange={(event) => setOwnerUserId(event.target.value)}
          aria-label="Sorumluya Göre Filtrele"
          className="sm:max-w-[230px]"
        >
          <option value="">Tüm Sorumlular</option>
          {assignees.map((person) => (
            <option key={person.id} value={person.id}>{person.firstName} {person.lastName}</option>
          ))}
        </Select>
      </div>
      <section className="grid gap-3 sm:grid-cols-3">
        {[
          ["Açık Satış Fırsatı", totals.count],
          ["Toplam Satış Değeri", formatMoney(totals.raw, "TRY")],
          ["Ağırlıklı Değer", formatMoney(totals.weighted, "TRY")],
        ].map(([label, value]) => (
          <article key={String(label)} className="rounded-[20px] border border-[var(--line)] bg-white p-4 shadow-[var(--shadow-soft)]">
            <p className="text-[10px] text-[var(--muted)]">{label}</p>
            <strong className="mt-2 block text-[22px] tracking-[-.04em]">{value}</strong>
          </article>
        ))}
      </section>
      {loading ? (
        <Spinner label="Satış Süreci Hazırlanıyor..." />
      ) : rows.length ? (
        <div className="grid items-start gap-4 xl:grid-cols-3 2xl:grid-cols-6">
          {stages.map((stage) => {
            const stageRows = rows.filter((row) => row.stage === stage);
            return (
              <section key={stage} className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[#f7fbfd]">
                <header className="flex items-center justify-between border-b border-[var(--line)] bg-white px-4 py-3">
                  <h2 className="text-[11px] font-semibold">{opportunityStageLabels[stage]}</h2>
                  <span className="rounded-full bg-[#EAF5FB] px-2 py-0.5 text-[10px] font-bold text-[#1674BD]">{stageRows.length}</span>
                </header>
                <div className="space-y-3 p-3">
                  {stageRows.map((row) => {
                    const customerName = row.customerId ? customerNameById.get(row.customerId) : undefined;
                    const subjectName =
                      [row.leadFirstName, row.leadLastName].filter(Boolean).join(" ") ||
                      customerName ||
                      "Müşteri Bağlantısı Yok";
                    const subjectHref = row.leadId
                      ? `/crm/leads/${row.leadId}`
                      : row.customerId && canReadCustomers
                        ? `/customers/${row.customerId}`
                        : "/crm";

                    return (
                      <article key={row.id} className="rounded-[16px] border border-[#dfeaf1] bg-white p-3 shadow-[0_3px_14px_rgba(17,70,104,.05)]">
                        <Link href={subjectHref} className="block text-[12px] font-semibold leading-5 hover:text-[#1674BD]">
                          {row.title}
                        </Link>
                        <Link href={subjectHref} className="mt-1 block truncate text-[10px] text-[var(--muted)] hover:text-[#1674BD]">
                          {subjectName}
                        </Link>
                        <strong className="mt-4 block text-[15px]">{formatMoney(row.estimatedValue, row.currency)}</strong>
                        <div className="mt-2 flex items-center gap-2">
                          <div className="h-1 flex-1 overflow-hidden rounded-full bg-[#e5f2f7]">
                            <span className="block h-full rounded-full bg-[#1674BD]" style={{ width: `${row.probability}%` }} />
                          </div>
                          <span className="text-[9px] text-[var(--muted)]">%{row.probability}</span>
                        </div>
                        {canManage && nextStages[row.stage].length ? (
                          <Button variant="ghost" className="mt-3 min-h-8 w-full px-2 py-1 text-[10px]" onClick={() => openTransition(row)}>
                            Aşamayı İlerlet
                          </Button>
                        ) : null}
                        {canCreateSale && row.stage === "WON" ? (
                          <Button variant="ghost" className="mt-3 min-h-8 w-full px-2 py-1 text-[10px]" onClick={() => void openSale(row)}>
                            Satış Taslağını Oluştur / Aç
                          </Button>
                        ) : null}
                      </article>
                    );
                  })}
                  {!stageRows.length ? <p className="py-7 text-center text-[10px] text-[var(--muted-soft)]">Bu Aşamada Satış Fırsatı Yok</p> : null}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="Satış Süreci Boş"
          description="Potansiyel Müşteri Havuzundan Bir Müşteri Adayını Nitelendirerek İlk Satış Fırsatını Oluşturun."
          action={<Link href="/crm/leads"><Button>Potansiyel Müşteri Havuzuna Git</Button></Link>}
        />
      )}

      <Modal
        open={Boolean(transitioning)}
        onClose={() => setTransitioning(null)}
        title="Satış Fırsatı Aşamasını Değiştir"
        description={transitioning?.title}
      >
        <form onSubmit={transition} className="space-y-4">
          {error ? <Alert>{error}</Alert> : null}
          <Field label="Yeni Aşama" required>
            <Select
              value={targetStage}
              onChange={(event) => {
                const value = event.target.value as OpportunityStage;
                setTargetStage(value);
                if (value === "WON") setProbability("100");
                else if (value === "LOST") setProbability("0");
              }}
            >
              {transitioning ? nextStages[transitioning.stage].map((stage) => (
                <option key={stage} value={stage}>{opportunityStageLabels[stage]}</option>
              )) : null}
            </Select>
          </Field>
          <Field label="Kazanma Olasılığı (%)">
            <TextInput type="number" min="0" max="100" value={probability} disabled={["WON", "LOST"].includes(targetStage)} onChange={(event) => setProbability(event.target.value)} />
          </Field>
          {targetStage === "LOST" ? (
            <Field label="Kaybetme Nedeni" required>
              <TextArea rows={3} value={lostReason} onChange={(event) => setLostReason(event.target.value)} />
            </Field>
          ) : null}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setTransitioning(null)} disabled={saving}>Vazgeç</Button>
            <Button type="submit" disabled={saving}>{saving ? "Güncelleniyor..." : "Aşamayı Güncelle"}</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(saleOpportunity)}
        onClose={() => { if (!saving) setSaleOpportunity(null); }}
        title="Satış Taslağı Oluştur"
        description={saleOpportunity?.title}
      >
        {saleReferencesLoading ? (
          <Spinner label="Satış Seçenekleri Hazırlanıyor..." />
        ) : (
          <form onSubmit={createSale} className="space-y-4">
            {error ? <Alert>{error}</Alert> : null}
            <Field label="Müşteri" required>
              <Select value={saleCustomerId} onChange={(event) => setSaleCustomerId(event.target.value)}>
                <option value="">Müşteri Seçin</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>{customer.firstName} {customer.lastName}</option>
                ))}
              </Select>
            </Field>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[12px] font-semibold text-[var(--ink)]">Satış Kalemleri</p>
                <Button type="button" variant="secondary" className="min-h-8 px-3 py-1 text-[10px]" onClick={addSaleItem}>+ Kalem Ekle</Button>
              </div>
              {saleItems.map((item, index) => {
                const references = referencesFor(item.type);
                return (
                  <div key={item.key} className="space-y-3 rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)]/40 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[10px] font-semibold text-[var(--muted)]">Kalem {index + 1}</span>
                      {saleItems.length > 1 ? (
                        <Button type="button" variant="ghost" className="min-h-7 px-2 py-1 text-[10px]" onClick={() => removeSaleItem(item.key)}>Kaldır</Button>
                      ) : null}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[.8fr_1.4fr_.5fr]">
                      <Field label="Tür" required>
                        <Select
                          value={item.type}
                          onChange={(event) => updateSaleItem(item.key, { type: event.target.value as SaleReferenceType, referenceId: "" })}
                        >
                          <option value="SERVICE">Hizmet</option>
                          <option value="PACKAGE">Paket</option>
                        </Select>
                      </Field>
                      <Field label={item.type === "SERVICE" ? "Hizmet" : "Paket"} required>
                        <Select value={item.referenceId} onChange={(event) => updateSaleItem(item.key, { referenceId: event.target.value })}>
                          <option value="">Seçin</option>
                          {references.map((reference) => (
                            <option key={reference.id} value={reference.id}>{reference.label} · {formatMoney(reference.price, "TRY")}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Miktar" required>
                        <TextInput type="number" min="1" step="1" value={item.quantity} onChange={(event) => updateSaleItem(item.key, { quantity: event.target.value })} />
                      </Field>
                    </div>
                  </div>
                );
              })}
            </div>

            <Field label="Toplam İndirim (₺)">
              <TextInput type="number" min="0" step="0.01" value={saleDiscount} onChange={(event) => setSaleDiscount(event.target.value)} />
            </Field>
            <Alert tone="success">Bu işlem muhasebe kaydı oluşturmaz. Önce satış taslağı oluşur; mevcut satış onay ve ödeme akışı daha sonra kullanılır.</Alert>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setSaleOpportunity(null)} disabled={saving}>Vazgeç</Button>
              <Button type="submit" disabled={saving}>{saving ? "Oluşturuluyor..." : "Satış Taslağı Oluştur"}</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
