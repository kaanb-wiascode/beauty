"use client";

import { useState } from "react";

import {
  Alert,
  Button,
  Field,
  Modal,
  TextInput,
} from "@/components/ui";
import { ValooSegmentedControl } from "@/components/valoo-controls";

import { api, ApiError } from "@/lib/api";

type PaymentMethod = "CASH" | "CARD" | "TRANSFER";

type PaymentAppointment = {
  id: string;
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
  const [method, setMethod] =
    useState<PaymentMethod>("CARD");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function handleOpen() {
    if (!appointment) return;

    setAmount(
      defaultAmount !== undefined && defaultAmount !== null
        ? String(defaultAmount)
        : "",
    );
    setMethod("CARD");
    setError("");
  }

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

    setSaving(true);
    setError("");

    try {
      await api("/payments", {
        method: "POST",
        body: {
          appointmentId: appointment.id,
          amount: numericAmount,
          method,
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

  return (
    <Modal
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
        <div className="space-y-5" onFocus={handleOpen}>
          {error ? (
            <Alert onClose={() => setError("")}>
              {error}
            </Alert>
          ) : null}

          <Field label="Tutar">
            <TextInput
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(event) =>
                setAmount(event.target.value)
              }
              placeholder="0,00"
              disabled={saving}
            />
          </Field>

          <Field label="Ödeme yöntemi">
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

          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              disabled={saving}
              onClick={handleClose}
            >
              Vazgeç
            </Button>

            <Button
              disabled={saving}
              onClick={() => void save()}
            >
              {saving
                ? "Kaydediliyor..."
                : "Ödemeyi kaydet"}
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
