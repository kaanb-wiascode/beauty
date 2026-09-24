"use client";

import { Select, useEffect, useMemo, useState } from "react";

import { Alert, Button, Field, Spinner, TextInput } from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";
import { hasActiveBranch, hasPermission } from "@/lib/auth";

type RoomOption = { id: string; name: string; code: string };
type AssetOption = { id: string; name: string; assetCode: string };

type ResourceBlock = {
  id: string;
  roomId: string | null;
  assetId: string | null;
  roomName: string | null;
  assetName: string | null;
  blockedFrom: string;
  blockedTo: string;
  reason: string;
  status: "ACTIVE" | "CANCELLED";
  version: number;
  createdAt: string;
  cancelledAt: string | null;
};

function localInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function initialWindow() {
  const from = new Date();
  from.setMinutes(0, 0, 0);
  const to = new Date(from.getTime() + 60 * 60 * 1000);
  return { from: localInput(from), to: localInput(to) };
}

export function ResourceBlocksPanel({
  rooms,
  assets,
  onChanged,
}: {
  rooms: RoomOption[];
  assets: AssetOption[];
  onChanged?: () => Promise<void>;
}) {
  const canUpdate = hasPermission("appointments", "update");
  const [blocks, setBlocks] = useState<ResourceBlock[]>([]);
  const [resourceKind, setResourceKind] = useState<"ROOM" | "ASSET">("ROOM");
  const [resourceId, setResourceId] = useState("");
  const [window, setWindow] = useState(initialWindow);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const activeOptions = useMemo(
    () => (resourceKind === "ROOM" ? rooms : assets),
    [resourceKind, rooms, assets],
  );

  useEffect(() => {
    if (!activeOptions.some((item) => item.id === resourceId)) {
      setResourceId(activeOptions[0]?.id ?? "");
    }
  }, [activeOptions, resourceId]);

  async function loadBlocks() {
    if (!hasActiveBranch()) {
      setBlocks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const now = new Date();
      const horizon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      setBlocks(
        await api<ResourceBlock[]>(
          withQuery("/operations/resource-blocks", {
            from: now.toISOString(),
            to: horizon.toISOString(),
          }),
        ),
      );
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Kaynak blokları yüklenemedi.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBlocks();
  }, []);

  async function createBlock() {
    if (!canUpdate || !resourceId || !reason.trim()) return;
    const blockedFrom = new Date(window.from);
    const blockedTo = new Date(window.to);
    if (
      Number.isNaN(blockedFrom.getTime()) ||
      Number.isNaN(blockedTo.getTime()) ||
      blockedFrom >= blockedTo
    ) {
      setError("Blok başlangıç ve bitiş zamanı geçerli olmalıdır.");
      return;
    }

    setBusy("create");
    setError("");
    try {
      await api("/operations/resource-blocks", {
        method: "POST",
        body: {
          ...(resourceKind === "ROOM"
            ? { roomId: resourceId }
            : { assetId: resourceId }),
          blockedFrom: blockedFrom.toISOString(),
          blockedTo: blockedTo.toISOString(),
          reason: reason.trim(),
        },
      });
      setReason("");
      await loadBlocks();
      await onChanged?.();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Kaynak bloğu oluşturulamadı.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function cancelBlock(block: ResourceBlock) {
    if (!canUpdate || block.status !== "ACTIVE") return;
    setBusy(block.id);
    setError("");
    try {
      await api(`/operations/resource-blocks/${block.id}/cancel`, {
        method: "POST",
        body: { expectedVersion: block.version },
      });
      await loadBlocks();
      await onChanged?.();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Kaynak bloğu iptal edilemedi.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-soft)]">
          Resource Availability
        </p>
        <h2 className="mt-2 text-lg font-semibold text-[var(--ink)]">
          Planlı Kaynak Blokları
        </h2>
        <p className="mt-1 max-w-3xl text-xs text-[var(--muted)]">
          Temizlik, kalibrasyon, özel kullanım veya operasyonel kapanış gibi zaman aralıklarını oda ya da cihaz üzerinde bloke edin. Çakışan randevu rezervasyonları backend ve veritabanı seviyesinde engellenir.
        </p>
      </div>

      {error ? (
        <div className="mt-4">
          <Alert onClose={() => setError("")}>{error}</Alert>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="rounded-[18px] bg-[var(--surface-2)] p-4">
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={resourceKind === "ROOM" ? "primary" : "secondary"}
              onClick={() => setResourceKind("ROOM")}
            >
              Oda / Kabin
            </Button>
            <Button
              variant={resourceKind === "ASSET" ? "primary" : "secondary"}
              onClick={() => setResourceKind("ASSET")}
            >
              Cihaz / Ekipman
            </Button>
          </div>

          <div className="mt-4 space-y-4">
            <Field label="Kaynak">
              <Select
                className="min-h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm"
                value={resourceId}
                onChange={(event) => setResourceId(event.target.value)}
              >
                {activeOptions.length ? null : (
                  <option value="">Kaynak bulunamadı</option>
                )}
                {activeOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {"code" in item
                      ? `${item.name} (${item.code})`
                      : `${item.name} (${item.assetCode})`}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Başlangıç">
              <TextInput
                type="datetime-local"
                value={window.from}
                onChange={(event) =>
                  setWindow((current) => ({ ...current, from: event.target.value }))
                }
              />
            </Field>
            <Field label="Bitiş">
              <TextInput
                type="datetime-local"
                value={window.to}
                onChange={(event) =>
                  setWindow((current) => ({ ...current, to: event.target.value }))
                }
              />
            </Field>
            <Field label="Neden">
              <TextInput
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Örn. cihaz kalibrasyonu"
              />
            </Field>
            <Button
              disabled={
                !canUpdate || !resourceId || reason.trim().length < 3 || busy === "create"
              }
              onClick={() => void createBlock()}
            >
              {busy === "create" ? "Bloklanıyor..." : "Kaynağı Blokla"}
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-[18px] border border-[var(--line)]">
          <div className="border-b border-[var(--line)] bg-[var(--surface-2)] px-4 py-3">
            <p className="text-xs font-semibold text-[var(--ink)]">
              Önümüzdeki 30 Gün
            </p>
          </div>
          {loading ? (
            <div className="py-8">
              <Spinner label="Kaynak blokları yükleniyor..." />
            </div>
          ) : blocks.length ? (
            <div className="divide-y divide-[var(--line)]">
              {blocks.map((block) => (
                <div
                  key={block.id}
                  className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-[var(--ink)]">
                        {block.roomName ?? block.assetName ?? "Kaynak"}
                      </p>
                      <span className="rounded-full bg-[var(--surface-2)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                        {block.roomId ? "Oda" : "Ekipman"}
                      </span>
                      {block.status === "CANCELLED" ? (
                        <span className="text-[10px] font-semibold text-[var(--muted)]">
                          İptal edildi
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {new Date(block.blockedFrom).toLocaleString("tr-TR")} – {new Date(block.blockedTo).toLocaleString("tr-TR")}
                    </p>
                    <p className="mt-1 text-xs text-[var(--ink)]">{block.reason}</p>
                  </div>
                  {block.status === "ACTIVE" && canUpdate ? (
                    <Button
                      variant="secondary"
                      disabled={busy === block.id}
                      onClick={() => void cancelBlock(block)}
                    >
                      {busy === block.id ? "İptal ediliyor..." : "Bloğu Kaldır"}
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-10 text-center text-sm text-[var(--muted)]">
              Planlı kaynak bloğu bulunmuyor.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
