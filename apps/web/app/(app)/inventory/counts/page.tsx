"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  Alert,
  Button,
  Field,
  Modal,
  PageHeader,
  Panel,
  Select,
  Spinner,
  Td,
  TextArea,
  TextInput,
  Th,
  TableWrap,
} from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { formatDate, formatPrice } from "@/lib/format";

type Warehouse = {
  id: string;
  name: string;
  type: string;
  branchId: string | null;
};

type InventoryOverview = {
  warehouses: Warehouse[];
};

type StockLine = {
  warehouseId: string;
  warehouseName: string;
  productId: string;
  productName: string;
  sku?: string | null;
  unit: string;
  quantity: number | string;
  unitCost: number | string;
  inventoryValue: number | string;
};

type CycleCountStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "POSTED";

type CycleCount = {
  id: string;
  warehouseId: string;
  warehouseName: string;
  branchId: string | null;
  status: CycleCountStatus;
  reason: string;
  totalVarianceValue: number | string;
  createdAt: string;
  postedAt?: string | null;
  itemCount: number | string;
};

type CountForm = {
  warehouseId: string;
  reason: string;
  quantities: Record<string, string>;
};

const STATUS_LABELS: Record<CycleCountStatus, string> = {
  DRAFT: "Taslak",
  SUBMITTED: "Onay Bekliyor",
  APPROVED: "Onaylandı",
  REJECTED: "Reddedildi",
  POSTED: "Stoğa İşlendi",
};

const STATUS_TONES: Record<CycleCountStatus, string> = {
  DRAFT: "bg-black/[0.05] text-[var(--muted)]",
  SUBMITTED: "bg-[rgba(177,111,38,0.10)] text-[#80571f]",
  APPROVED: "bg-[rgba(22,116,189,0.10)] text-[#0551B0]",
  REJECTED: "bg-[rgba(143,61,61,0.08)] text-[#7a3333]",
  POSTED: "bg-[rgba(47,122,86,0.10)] text-[#2d5c45]",
};

const UNIT_LABELS: Record<string, string> = {
  UNIT: "Adet",
  ML: "Ml",
  LITER: "Lt",
  GRAM: "Gr",
  KG: "Kg",
  METER: "M",
  PAIR: "Çift",
  BOX: "Kutu",
};

function number(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatQuantity(value: number | string, unit?: string) {
  const formatted = new Intl.NumberFormat("tr-TR", {
    maximumFractionDigits: 3,
  }).format(number(value));
  return unit ? `${formatted} ${UNIT_LABELS[unit] ?? unit}` : formatted;
}

export default function InventoryCountsPage() {
  const [counts, setCounts] = useState<CycleCount[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [stockLines, setStockLines] = useState<StockLine[]>([]);
  const [statusFilter, setStatusFilter] = useState<"ALL" | CycleCountStatus>("ALL");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [rejecting, setRejecting] = useState<CycleCount | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [form, setForm] = useState<CountForm>({ warehouseId: "", reason: "", quantities: {} });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [countRows, overview, detailRows] = await Promise.all([
        api<CycleCount[]>("/inventory/cycle-counts"),
        api<InventoryOverview>("/inventory/overview"),
        api<StockLine[]>("/inventory/accounting/valuation/detail"),
      ]);
      setCounts(countRows);
      setWarehouses(overview.warehouses ?? []);
      setStockLines(detailRows);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Stok Sayımları Yüklenemedi.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const visibleCounts = useMemo(
    () => counts.filter((count) => statusFilter === "ALL" || count.status === statusFilter),
    [counts, statusFilter],
  );

  const selectedStock = useMemo(
    () => stockLines.filter((line) => line.warehouseId === form.warehouseId),
    [form.warehouseId, stockLines],
  );

  const enteredCount = useMemo(
    () => Object.values(form.quantities).filter((value) => value !== "").length,
    [form.quantities],
  );

  function openForm() {
    setForm({
      warehouseId: warehouses.length === 1 ? warehouses[0].id : "",
      reason: "",
      quantities: {},
    });
    setError("");
    setNotice("");
    setFormOpen(true);
  }

  function selectWarehouse(warehouseId: string) {
    setForm((current) => ({ ...current, warehouseId, quantities: {} }));
  }

  async function submitCount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    const items = selectedStock
      .filter((line) => form.quantities[line.productId] !== "" && form.quantities[line.productId] !== undefined)
      .map((line) => ({
        productId: line.productId,
        countedQuantity: Number(form.quantities[line.productId]),
      }));

    if (!form.warehouseId) {
      setError("Sayım İçin Bir Depo Seçin.");
      return;
    }
    if (!form.reason.trim()) {
      setError("Sayım Nedenini Yazın.");
      return;
    }
    if (!items.length) {
      setError("En Az Bir Ürün İçin Sayılan Miktarı Girin.");
      return;
    }
    if (items.some((item) => !Number.isFinite(item.countedQuantity) || item.countedQuantity < 0)) {
      setError("Sayılan Miktarlar Sıfırdan Küçük Olamaz.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api("/inventory/cycle-counts", {
        method: "POST",
        body: {
          warehouseId: form.warehouseId,
          reason: form.reason.trim(),
          items,
        },
      });
      setFormOpen(false);
      setForm({ warehouseId: "", reason: "", quantities: {} });
      setNotice("Stok Sayımı Taslak Olarak Oluşturuldu.");
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Stok Sayımı Oluşturulamadı.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function action(count: CycleCount, operation: "submit" | "approve" | "post") {
    if (workingId) return;
    setWorkingId(count.id);
    setError("");
    setNotice("");
    try {
      await api(`/inventory/cycle-counts/${count.id}/${operation}`, { method: "POST" });
      const messages = {
        submit: "Stok Sayımı Onaya Gönderildi.",
        approve: "Stok Sayımı Onaylandı.",
        post: "Sayım Farkları Stoğa Ve Muhasebeye İşlendi.",
      };
      setNotice(messages[operation]);
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Stok Sayımı İşlemi Tamamlanamadı.",
      );
    } finally {
      setWorkingId(null);
    }
  }

  async function reject() {
    if (!rejecting || saving) return;
    if (!rejectReason.trim()) {
      setError("Ret Nedenini Yazın.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api(`/inventory/cycle-counts/${rejecting.id}/reject`, {
        method: "POST",
        body: { reason: rejectReason.trim() },
      });
      setRejecting(null);
      setRejectReason("");
      setNotice("Stok Sayımı Reddedildi.");
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Stok Sayımı Reddedilemedi.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <Spinner label="Stok Sayımları Hazırlanıyor..." />;
  }

  return (
    <div className="mx-auto max-w-[1450px] space-y-6 pb-10">
      <PageHeader
        title="Stok Sayımları"
        description="Fiziksel Sayım Sonuçlarını Sistem Stoğuyla Karşılaştırın, Yetkili Onayından Geçirin Ve Farkları Kontrollü Olarak Stoğa İşleyin."
        action={<Button onClick={openForm}>Yeni Stok Sayımı</Button>}
      />

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
      {notice ? <Alert tone="success" onClose={() => setNotice("")}>{notice}</Alert> : null}

      <section className="flex flex-wrap gap-2">
        <FilterButton active={statusFilter === "ALL"} onClick={() => setStatusFilter("ALL")}>Tümü ({counts.length})</FilterButton>
        {(Object.keys(STATUS_LABELS) as CycleCountStatus[]).map((status) => (
          <FilterButton key={status} active={statusFilter === status} onClick={() => setStatusFilter(status)}>
            {STATUS_LABELS[status]} ({counts.filter((count) => count.status === status).length})
          </FilterButton>
        ))}
      </section>

      <Panel>
        <TableWrap>
          <thead>
            <tr>
              <Th>Depo</Th>
              <Th>Durum</Th>
              <Th>Sayım Nedeni</Th>
              <Th>Ürün Sayısı</Th>
              <Th>Fark Değeri</Th>
              <Th>Tarih</Th>
              <Th>İşlemler</Th>
            </tr>
          </thead>
          <tbody>
            {visibleCounts.map((count) => (
              <tr key={count.id}>
                <Td className="font-medium">{count.warehouseName}</Td>
                <Td>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_TONES[count.status]}`}>
                    {STATUS_LABELS[count.status]}
                  </span>
                </Td>
                <Td className="max-w-[320px] whitespace-normal">{count.reason}</Td>
                <Td>{formatQuantity(count.itemCount)}</Td>
                <Td className="font-semibold">{formatPrice(number(count.totalVarianceValue))}</Td>
                <Td>{formatDate(count.createdAt)}</Td>
                <Td actions>
                  <div className="flex flex-wrap justify-end gap-2">
                    {count.status === "DRAFT" ? (
                      <Button variant="secondary" disabled={workingId === count.id} onClick={() => void action(count, "submit")}>Onaya Gönder</Button>
                    ) : null}
                    {count.status === "SUBMITTED" ? (
                      <>
                        <Button variant="secondary" disabled={workingId === count.id} onClick={() => void action(count, "approve")}>Onayla</Button>
                        <Button variant="danger" disabled={workingId === count.id} onClick={() => { setRejecting(count); setRejectReason(""); setError(""); }}>Reddet</Button>
                      </>
                    ) : null}
                    {count.status === "APPROVED" ? (
                      <Button disabled={workingId === count.id} onClick={() => void action(count, "post")}>Stoğa İşle</Button>
                    ) : null}
                    {count.status === "POSTED" && count.postedAt ? (
                      <span className="self-center text-[11px] text-[var(--muted)]">{formatDate(count.postedAt)}</span>
                    ) : null}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
        {!visibleCounts.length ? (
          <p className="px-5 py-14 text-center text-[12px] text-[var(--muted)]">Seçili Durumda Stok Sayımı Bulunamadı.</p>
        ) : null}
      </Panel>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Yeni Stok Sayımı"
        description="Depoyu Seçin, Sayım Nedenini Yazın Ve Fiziksel Olarak Saydığınız Ürünlerin Miktarlarını Girin."
      >
        <form className="space-y-5" onSubmit={submitCount}>
          <Field label="Depo" required>
            <Select required value={form.warehouseId} onChange={(event) => selectWarehouse(event.target.value)}>
              <option value="">Depo Seçin</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
              ))}
            </Select>
          </Field>

          <Field label="Sayım Nedeni" required>
            <TextArea
              required
              rows={2}
              maxLength={500}
              value={form.reason}
              onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
              placeholder="Örn. Aylık Fiziksel Stok Kontrolü"
            />
          </Field>

          {form.warehouseId ? (
            <div className="overflow-hidden rounded-[18px] border border-[var(--line)]">
              <div className="grid grid-cols-[1fr_110px_120px] gap-3 bg-[var(--surface-2)] px-4 py-3 text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--muted-soft)]">
                <span>Ürün</span>
                <span>Sistem</span>
                <span>Sayılan</span>
              </div>
              <div className="max-h-[340px] divide-y divide-[var(--line)] overflow-y-auto">
                {selectedStock.map((line) => (
                  <div key={line.productId} className="grid grid-cols-[1fr_110px_120px] items-center gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-medium text-[var(--ink)]">{line.productName}</p>
                      <p className="mt-0.5 truncate text-[10px] text-[var(--muted)]">{line.sku || "Stok Ürünü"}</p>
                    </div>
                    <span className="text-[11px] text-[var(--muted)]">{formatQuantity(line.quantity, line.unit)}</span>
                    <TextInput
                      type="number"
                      min="0"
                      step="0.001"
                      aria-label={`${line.productName} Sayılan Miktar`}
                      value={form.quantities[line.productId] ?? ""}
                      onChange={(event) => setForm((current) => ({
                        ...current,
                        quantities: { ...current.quantities, [line.productId]: event.target.value },
                      }))}
                      placeholder="—"
                    />
                  </div>
                ))}
                {!selectedStock.length ? (
                  <p className="px-4 py-8 text-center text-[11px] text-[var(--muted)]">Bu Depoda Sayılabilecek Stok Kaydı Bulunamadı.</p>
                ) : null}
              </div>
              <div className="border-t border-[var(--line)] bg-[var(--surface-2)]/60 px-4 py-2 text-[10px] text-[var(--muted)]">
                {enteredCount} Ürün İçin Sayım Miktarı Girildi
              </div>
            </div>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Vazgeç</Button>
            <Button type="submit" disabled={saving || !selectedStock.length}>{saving ? "Kaydediliyor..." : "Sayımı Oluştur"}</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(rejecting)}
        onClose={() => setRejecting(null)}
        title="Stok Sayımını Reddet"
        description={rejecting ? `${rejecting.warehouseName} İçin Gönderilen Sayım Reddedilecek.` : undefined}
      >
        <div className="space-y-5">
          <Field label="Ret Nedeni" required>
            <TextArea
              rows={4}
              maxLength={500}
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              placeholder="Sayımın Neden Yenilenmesi Gerektiğini Yazın."
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRejecting(null)}>Vazgeç</Button>
            <Button variant="danger" disabled={saving} onClick={() => void reject()}>{saving ? "Reddediliyor..." : "Sayımı Reddet"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3.5 py-2 text-[12px] font-medium transition ${active ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-white/75 text-[var(--muted)] hover:bg-white hover:text-[var(--ink)]"}`}
    >
      {children}
    </button>
  );
}
