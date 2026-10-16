"use client";

import { FormEvent, useEffect, useState } from "react";
import { Alert, Button, Select, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { userErrorMessage } from "@/lib/user-language";

type FinanceSupplier = {
  id: string;
  name: string;
  contactName?: string | null;
  status: string;
};

export function MarketingFinanceTransferPanel({
  expenseId,
  title,
  amountLabel,
  onDone,
  onClose,
}: {
  expenseId: string;
  title: string;
  amountLabel: string;
  onDone: () => void | Promise<void>;
  onClose: () => void;
}) {
  const [suppliers, setSuppliers] = useState<FinanceSupplier[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    void api<FinanceSupplier[]>("/marketing-finance/suppliers")
      .then((rows) => {
        if (active) setSuppliers(rows);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? userErrorMessage(
                err.message,
                "Finans tedarikçileri yüklenemedi.",
              )
            : "Finans tedarikçileri yüklenemedi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supplierId) return;

    setSaving(true);
    setError("");

    try {
      await api("/marketing-finance/expenses/" + expenseId + "/account", {
        method: "POST",
        body: {
          supplierId,
          invoiceNumber: invoiceNumber.trim() || undefined,
          dueAt: dueAt
            ? new Date(dueAt + "T12:00:00").toISOString()
            : undefined,
        },
      });
      await onDone();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? userErrorMessage(
              err.message,
              "Pazarlama gideri finans sistemine aktarılamadı.",
            )
          : "Pazarlama gideri finans sistemine aktarılamadı.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="rounded-[18px] border border-[var(--accent)]/20 bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--accent)]">
            Finans Aktarımı
          </p>
          <h3 className="mt-1 text-[14px] font-semibold text-[var(--ink)]">
            {title}
          </h3>
          <p className="mt-1 text-[8px] leading-4 text-[var(--muted)]">
            {amountLabel} tutarındaki pazarlama gideri tedarikçi borcu kaydına
            dönüştürülecek.
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="text-[9px] font-semibold text-[var(--muted)]"
        >
          Kapat
        </button>
      </div>

      {error ? (
        <div className="mt-4">
          <Alert onClose={() => setError("")}>{error}</Alert>
        </div>
      ) : null}

      {loading ? (
        <div className="py-6">
          <Spinner label="Finans tedarikçileri yükleniyor..." />
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <label className="text-[10px] font-semibold text-[var(--muted)]">
              Finans Tedarikçisi
              <Select
                required
                value={supplierId}
                onChange={(event) => setSupplierId(event.target.value)}
                className="mt-2 h-11 w-full rounded-[12px] border border-[var(--line)] bg-white px-3 text-[11px] text-[var(--ink)]"
              >
                <option value="">Tedarikçi seçin</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </Select>
            </label>

            <label className="text-[10px] font-semibold text-[var(--muted)]">
              Fatura Numarası
              <input
                value={invoiceNumber}
                onChange={(event) => setInvoiceNumber(event.target.value)}
                className="mt-2 h-11 w-full rounded-[12px] border border-[var(--line)] bg-white px-3 text-[11px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                placeholder="İsteğe bağlı"
              />
            </label>

            <label className="text-[10px] font-semibold text-[var(--muted)]">
              Vade Tarihi
              <input
                type="date"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
                className="mt-2 h-11 w-full rounded-[12px] border border-[var(--line)] bg-white px-3 text-[11px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
              />
            </label>
          </div>

          {!suppliers.length ? (
            <p className="mt-3 text-[8px] leading-4 text-[var(--warning)]">
              Aktif finans tedarikçisi bulunmuyor. Önce Finans / Tedarikçi
              kayıtlarından bir tedarikçi oluşturun.
            </p>
          ) : null}

          <div className="mt-5 flex justify-end">
            <Button disabled={saving || !supplierId || !suppliers.length} type="submit">
              {saving ? "Finansa Aktarılıyor..." : "Finansa Aktar"}
            </Button>
          </div>
        </>
      )}
    </form>
  );
}
