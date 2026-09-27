"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CardInfo } from "@/components/card-info";
import { Alert, EmptyState, PageHeader, Select, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { getCardHelp } from "@/lib/card-help";
import { userErrorMessage } from "@/lib/user-language";

type InteractionType = "CALL" | "WHATSAPP" | "SMS" | "EMAIL" | "IN_PERSON" | "VIDEO_CALL" | "OTHER";
type InteractionDirection = "INBOUND" | "OUTBOUND";
type InteractionStatus = "PLANNED" | "COMPLETED" | "CANCELLED";

type Interaction = {
  id: string;
  customerId: string | null;
  leadId: string | null;
  opportunityId: string | null;
  ownerUserId: string;
  ownerFirstName: string | null;
  ownerLastName: string | null;
  subjectLabel: string;
  type: InteractionType;
  direction: InteractionDirection;
  status: InteractionStatus;
  result: string | null;
  notes: string | null;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  nextAction: string | null;
  nextActionAt: string | null;
};

const typeLabels: Record<InteractionType, string> = {
  CALL: "Telefon",
  WHATSAPP: "WhatsApp",
  SMS: "SMS",
  EMAIL: "E-posta",
  IN_PERSON: "Yüz yüze",
  VIDEO_CALL: "Görüntülü görüşme",
  OTHER: "Diğer",
};

const directionLabels: Record<InteractionDirection, string> = {
  INBOUND: "Gelen",
  OUTBOUND: "Giden",
};

const statusLabels: Record<InteractionStatus, string> = {
  PLANNED: "Planlandı",
  COMPLETED: "Tamamlandı",
  CANCELLED: "İptal edildi",
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDuration(seconds: number | null) {
  if (seconds == null) return "—";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes ? `${minutes} dk ${remainder} sn` : `${remainder} sn`;
}

export default function CrmInteractionsPage() {
  const [rows, setRows] = useState<Interaction[]>([]);
  const [type, setType] = useState<InteractionType | "ALL">("ALL");
  const [direction, setDirection] = useState<InteractionDirection | "ALL">("ALL");
  const [status, setStatus] = useState<InteractionStatus | "ALL">("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ limit: "200" });
      if (type !== "ALL") query.set("type", type);
      if (direction !== "ALL") query.set("direction", direction);
      if (status !== "ALL") query.set("status", status);
      setRows(await api<Interaction[]>(`/crm/interactions?${query}`));
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? userErrorMessage(requestError.message, "Görüşme kayıtları yüklenemedi.")
          : "Görüşme kayıtları yüklenemedi.",
      );
    } finally {
      setLoading(false);
    }
  }, [direction, status, type]);

  useEffect(() => {
    void load();
  }, [load]);

  const completed = rows.filter((row) => row.status === "COMPLETED").length;
  const planned = rows.filter((row) => row.status === "PLANNED").length;
  const nextActions = rows.filter((row) => row.nextActionAt && new Date(row.nextActionAt) >= new Date()).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Görüşmeler"
        description="Müşterilerle yapılan telefon, WhatsApp, e-posta, yüz yüze ve diğer temasları tek merkezden izleyin."
      />

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          ["Tamamlanan görüşme", completed, "Seçili görünümde tamamlanan müşteri temaslarının sayısı."],
          ["Planlanan görüşme", planned, "Henüz gerçekleşmemiş planlı müşteri görüşmelerinin sayısı."],
          ["Sonraki aksiyon", nextActions, "İleri tarihli takip veya aksiyon bilgisi bulunan görüşmelerin sayısı."],
        ].map(([label, value, detail]) => (
          <article key={String(label)} className="rounded-[18px] border border-[var(--line)] bg-white px-4 py-3 shadow-[var(--shadow-soft)]">
            <div className="flex items-start justify-between gap-3">
              <span className="text-[10px] text-[var(--muted)]">{label}</span>
              <CardInfo help={getCardHelp(String(label), String(detail))} />
            </div>
            <strong className="mt-2 block text-[20px]">{value}</strong>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-3 border-b border-[var(--line)] p-4 sm:flex-row">
          <Select value={type} onChange={(event) => setType(event.target.value as InteractionType | "ALL")} className="sm:max-w-[220px]" aria-label="Görüşme türüne göre filtrele">
            <option value="ALL">Tüm görüşme türleri</option>
            {Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
          <Select value={direction} onChange={(event) => setDirection(event.target.value as InteractionDirection | "ALL")} className="sm:max-w-[180px]" aria-label="Görüşme yönüne göre filtrele">
            <option value="ALL">Gelen ve giden</option>
            <option value="INBOUND">Gelen</option>
            <option value="OUTBOUND">Giden</option>
          </Select>
          <Select value={status} onChange={(event) => setStatus(event.target.value as InteractionStatus | "ALL")} className="sm:max-w-[190px]" aria-label="Görüşme durumuna göre filtrele">
            <option value="ALL">Tüm durumlar</option>
            <option value="PLANNED">Planlandı</option>
            <option value="COMPLETED">Tamamlandı</option>
            <option value="CANCELLED">İptal edildi</option>
          </Select>
        </div>

        {loading ? (
          <Spinner label="Görüşmeler yükleniyor..." />
        ) : rows.length ? (
          <div className="divide-y divide-[var(--line)]">
            {rows.map((row) => {
              const href = row.opportunityId
                ? `/crm/opportunities/${row.opportunityId}`
                : row.leadId
                  ? `/crm/leads/${row.leadId}`
                  : row.customerId
                    ? `/customers/${row.customerId}`
                    : "/crm";
              const ownerName = [row.ownerFirstName, row.ownerLastName].filter(Boolean).join(" ") || "Sorumlu kullanıcı";
              return (
                <Link key={row.id} href={href} className="grid gap-3 px-5 py-4 transition-colors hover:bg-[#f8fcfd] lg:grid-cols-[minmax(220px,1.2fr)_140px_120px_150px_minmax(180px,1fr)] lg:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold">{row.subjectLabel}</p>
                    <p className="mt-1 truncate text-[10px] text-[var(--muted)]">{ownerName}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium">{typeLabels[row.type]}</p>
                    <p className="mt-1 text-[9px] text-[var(--muted)]">{directionLabels[row.direction]}</p>
                  </div>
                  <span className="w-fit rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--accent)]">{statusLabels[row.status]}</span>
                  <div>
                    <p className="text-[10px] text-[var(--muted)]">{formatDateTime(row.startedAt)}</p>
                    <p className="mt-1 text-[9px] text-[var(--muted-soft)]">Süre: {formatDuration(row.durationSeconds)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[11px]">{row.result || row.notes || "Görüşme sonucu girilmemiş"}</p>
                    {row.nextAction ? <p className="mt-1 truncate text-[9px] text-[var(--muted)]">Sonraki: {row.nextAction}</p> : null}
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="Görüşme kaydı bulunmuyor"
            description="Müşteri, potansiyel müşteri veya satış fırsatı üzerinden oluşturulan görüşmeler burada listelenecek."
          />
        )}
      </section>
    </div>
  );
}
