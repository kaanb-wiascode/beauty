"use client";

import { useState, type FormEvent } from "react";

import { Modal } from "@/components/modal";
import { Alert, Button, Field, TextInput } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

export type FinanceQuickCreateKind =
  | "expense-category"
  | "income-category"
  | "cost-center";

export type FinanceQuickCreated = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  parentId?: string | null;
};

function slugCode(value: string) {
  return value
    .toLocaleUpperCase("tr-TR")
    .replace(/Ğ/g, "G")
    .replace(/Ü/g, "U")
    .replace(/Ş/g, "S")
    .replace(/İ/g, "I")
    .replace(/Ö/g, "O")
    .replace(/Ç/g, "C")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
}

export function FinanceQuickCreate({
  open,
  kind,
  initialName = "",
  onClose,
  onCreated,
}: {
  open: boolean;
  kind: FinanceQuickCreateKind;
  initialName?: string;
  onClose: () => void;
  onCreated: (entity: FinanceQuickCreated) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const title =
    kind === "expense-category"
      ? "Yeni gider kategorisi"
      : kind === "income-category"
        ? "Yeni gelir kategorisi"
        : "Yeni maliyet merkezi";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const code = String(form.get("code") || "").trim().toUpperCase();

    if (!name) {
      setError("Ad alanı zorunludur.");
      return;
    }
    if (!code) {
      setError("Kod alanı zorunludur.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const path =
        kind === "expense-category"
          ? "/finance/setup/expense-categories"
          : kind === "income-category"
            ? "/finance/setup/income-categories"
            : "/finance/setup/cost-centers";

      const created = await api<FinanceQuickCreated>(path, {
        method: "POST",
        body: { name, code },
      });

      onCreated(created);
      onClose();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Kayıt oluşturulamadı.",
      );
    } finally {
      setSaving(false);
    }
  }

  const initialCode = slugCode(initialName);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description="Ana formdan ayrılmadan oluşturun. Yeni kayıt kaydedildiğinde otomatik seçilir."
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Ad" required>
          <TextInput
            name="name"
            required
            defaultValue={initialName}
            autoFocus
            placeholder={
              kind === "cost-center"
                ? "Örn. Pazarlama"
                : "Örn. Danışmanlık Gelirleri"
            }
          />
        </Field>
        <Field label="Kod" required>
          <TextInput
            name="code"
            required
            defaultValue={initialCode}
            placeholder="Örn. PAZARLAMA"
          />
        </Field>
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
