"use client";

import { useEffect, useState } from "react";

import { DateTimePicker } from "@/components/date-time-picker";
import {
  FormActions,
  FormSection,
  FormSummary,
  FormSummaryItem,
} from "@/components/form-system";
import { Modal } from "@/components/modal";
import {
  Alert,
  Field,
  TextInput,
} from "@/components/ui";
import { ValooSegmentedControl } from "@/components/valoo-controls";

import { api, ApiError } from "@/lib/api";

type PaymentMethod = "CASH" | "CARD" | "TRANSFER";

type PaymentAppointment = {
  id: string;
  startAt?: string;
};

type PaymentModalProps = {
  open: boolean;
  onClose: () => void;
  appointment: PaymentAppointment | null;
  customerName: string;
  serviceName: string;
  defaultAmount: string | number;
  onSaved: () => void | Promise<void>;
};

function localDateTimeNow() {
  const date = new Date();
  date.setSeconds(0, 0);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatAppointmentTime(value?: string) {
  if (!value) return "Randevu bilgisi yok";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(new Date(value))
    .replaceAll(".", "");
}

export function PaymentModal({
  open,
  onClose,
  appointment,
  customerName,
  serviceName,
  defaultAmount,
  onSaved,
}: PaymentModalProps) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CARD");
  const [paidAt, setPaidAt] = useState(localDateTimeNow);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !appointment) return;
    setAmount(
      defaultAmount !== undefined && defaultAmount !== null
        ? String(defaultAmount)
        : "",
    );
    setMethod("CARD");
    setPaidAt(localDateTimeNow());
    setError("");
  }, [appointment, defaultAmount, open]);

  function handleClose() {
    if (saving) return;
    setError("");
    onClose();
  }

  async function save() {
    if (!appointment) return;

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("Geçerli bir ödeme tutarı girin.");
      return;
    }
    if (!paidAt) {
      setError("Ödeme tarihi ve saati gereklidir.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await api("/payments", {
        method: "POST",
        body: {
          appointmentId: appointment.id,
          amount: numericAmount,
          method,
          paidAt: new Date(paidAt).toISOString(),
        },
      });

      await onSaved();
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Ödeme kaydedilemedi.",
      );
    } finally {
      setSaving(false);
    }
  }

  const numericAmount = Number(amount);
  const serviceAmount = Number(defaultAmount);

  return (
    <Modal
      size="md"
      open={open}
      onClose={handleClose}
      title="Ödeme al"
      description={
        appointment
          ? `${customerName} · ${serviceName}`
          : "Randevu ödemesi"
      }
    >
      {appointment ? (
        <div className="space-y-5">
          {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

          <FormSummary title="Tahsilat özeti" description="Ödeme kaydının bağlı olduğu randevu">
            <FormSummaryItem label="Müşteri" value={customerName || "—"} />
            <FormSummaryItem label="Hizmet" value={serviceName || "—"} />
            <FormSummaryItem
              label="Randevu"
              value={formatAppointmentTime(appointment.startAt)}
            />
            <FormSummaryItem
              label="Hizmet tutarı"
              value={
                Number.isFinite(serviceAmount)
                  ? `₺${serviceAmount.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}`
                  : "—"
              }
            />
          </FormSummary>

          <FormSection
            title="Tahsilat bilgileri"
            description="Tutar, ödeme yöntemi ve işlem zamanını kaydedin."
          >
            <Field label="Tahsil edilecek tutar" required>
              <TextInput
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0,00"
                disabled={saving}
              />
            </Field>

            <Field label="Ödeme yöntemi" required>
              <ValooSegmentedControl
                value={method}
                onChange={setMethod}
                disabled={saving}
                ariaLabel="Ödeme yöntemi"
                options={[
                  { value: "CARD", label: "Kart" },
                  { value: "CASH", label: "Nakit" },
                  { value: "TRANSFER", label: "Havale / EFT" },
                ]}
              />
            </Field>

            <Field label="Ödeme tarihi ve saati" required>
              <DateTimePicker
                value={paidAt}
                max={localDateTimeNow()}
                ariaLabel="Ödeme tarihi ve saati"
                onChange={setPaidAt}
              />
            </Field>
          </FormSection>

          {Number.isFinite(numericAmount) && Number.isFinite(serviceAmount) && numericAmount !== serviceAmount ? (
            <div className="rounded-[12px] border border-[var(--line)] bg-[var(--surface-2)]/60 px-4 py-3 text-[11px] text-[var(--muted)]">
              Hizmet tutarı ile tahsilat tutarı arasında{" "}
              <strong className="text-[var(--ink)]">
                ₺{Math.abs(serviceAmount - numericAmount).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}
              </strong>{" "}
              fark var. Kaydı göndermeden önce tutarı kontrol edin.
            </div>
          ) : null}

          <FormActions sticky>
            <button
              type="button"
              disabled={saving}
              onClick={handleClose}
              className="min-h-11 rounded-[var(--radius-control)] border border-[var(--line)] bg-white px-4 text-[13px] font-medium text-[var(--ink)] transition hover:bg-[var(--surface-2)] disabled:opacity-50"
            >
              Vazgeç
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="min-h-11 rounded-[var(--radius-control)] bg-[var(--accent)] px-4 text-[13px] font-semibold text-white transition hover:brightness-[0.97] disabled:opacity-50"
            >
              {saving ? "Kaydediliyor..." : "Ödemeyi kaydet"}
            </button>
          </FormActions>
        </div>
      ) : null}
    </Modal>
  );
}
