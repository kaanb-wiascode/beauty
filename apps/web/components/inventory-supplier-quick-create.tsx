"use client";

import { useState, type FormEvent } from "react";

import { Alert, Button, Field, Modal, TextInput } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

export type QuickSupplier = {
  id: string;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  taxNumber?: string | null;
};

export function InventorySupplierQuickCreate({
  open,
  initialName = "",
  onClose,
  onCreated,
}: {
  open: boolean;
  initialName?: string;
  onClose: () => void;
  onCreated: (supplier: QuickSupplier) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();

    if (!name) {
      setError("Tedarikçi adı zorunludur.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const supplier = await api<QuickSupplier>("/inventory/suppliers", {
        method: "POST",
        body: {
          name,
          contactName: String(form.get("contactName") || "").trim() || undefined,
          phone: String(form.get("phone") || "").trim() || undefined,
          email: String(form.get("email") || "").trim() || undefined,
          taxNumber: String(form.get("taxNumber") || "").trim() || undefined,
        },
      });
      onCreated(supplier);
      onClose();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Tedarikçi oluşturulamadı.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Yeni tedarikçi"
      description="Ana işlemden ayrılmadan tedarikçiyi oluşturun. Kaydedildiğinde otomatik seçilir."
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Firma adı" required>
            <TextInput
              name="name"
              required
              defaultValue={initialName}
              autoFocus
              placeholder="ABC Tedarik"
            />
          </Field>
          <Field label="Yetkili kişi">
            <TextInput name="contactName" />
          </Field>
          <Field label="Telefon">
            <TextInput name="phone" placeholder="+90" />
          </Field>
          <Field label="E-posta">
            <TextInput name="email" type="email" />
          </Field>
          <Field label="Vergi no">
            <TextInput name="taxNumber" />
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
