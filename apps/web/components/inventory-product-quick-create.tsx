"use client";

import { useState, type FormEvent } from "react";

import { Modal } from "@/components/modal";
import { Alert, Button, Field, Select, TextInput } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

export type QuickProduct = {
  id: string;
  name: string;
  sku?: string | null;
  unit: string;
  status?: string;
};

const UNITS = [
  ["UNIT", "Adet"],
  ["ML", "Mililitre"],
  ["LITER", "Litre"],
  ["GRAM", "Gram"],
  ["KG", "Kilogram"],
  ["METER", "Metre"],
  ["PAIR", "Çift"],
  ["BOX", "Kutu"],
] as const;

export function InventoryProductQuickCreate({
  open,
  initialName = "",
  onClose,
  onCreated,
}: {
  open: boolean;
  initialName?: string;
  onClose: () => void;
  onCreated: (product: QuickProduct) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    if (!name) {
      setError("Ürün adı zorunludur.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const product = await api<QuickProduct>("/inventory/products", {
        method: "POST",
        body: {
          name,
          sku: String(form.get("sku") || "").trim() || undefined,
          unit: String(form.get("unit") || "UNIT"),
          trackStock: true,
          initialQuantity: 0,
        },
      });
      onCreated(product);
      onClose();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Ürün oluşturulamadı.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Yeni ürün"
      description="Ana işlemden ayrılmadan temel ürün kartını oluşturun. Stok ve tedarik ayrıntılarını daha sonra tamamlayabilirsiniz."
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Ürün adı" required>
          <TextInput
            name="name"
            required
            defaultValue={initialName}
            autoFocus
            placeholder="Örn. Tek kullanımlık başlık"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="SKU">
            <TextInput name="sku" placeholder="ÜR-001" />
          </Field>
          <Field label="Birim" required>
            <Select name="unit" defaultValue="UNIT">
              {UNITS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {error ? <Alert>{error}</Alert> : null}
        <div className="flex justify-end gap-2 border-t border-[var(--line)] pt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={saving}
          >
            Vazgeç
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Oluşturuluyor..." : "Oluştur ve seç"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
