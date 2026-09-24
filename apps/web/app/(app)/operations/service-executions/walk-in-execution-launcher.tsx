"use client";

import { Select, useCallback, useEffect, useMemo, useState } from "react";

import { Button, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { Paginated, Staff } from "@/lib/types";

type CommercialItem = {
  saleItemId: string;
  serviceId: string;
  description: string;
  quantity: number;
  serviceName: string;
  durationMinutes: number;
};

type CommercialContext = {
  id: string;
  visitId: string;
  saleId: string;
  saleStatus: string;
  saleTotal: string;
  paidTotal: string;
  version: number;
  serviceItems: CommercialItem[];
};

type Room = { id: string; name: string; roomType: string; status: string };
type Asset = {
  id: string;
  name: string;
  assetType: string;
  maintenanceBlocked: boolean;
};
type Requirement = {
  roomType: string | null;
  requiredAssetType: string | null;
  requiredAssetId: string | null;
};

export function WalkInExecutionLauncher({
  visitId,
  canUpdate,
  onChanged,
  onError,
}: {
  visitId: string;
  canUpdate: boolean;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [context, setContext] = useState<CommercialContext | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [requirement, setRequirement] = useState<Requirement | null>(null);
  const [saleId, setSaleId] = useState("");
  const [saleItemId, setSaleItemId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [assetId, setAssetId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [commercial, staffResult, roomResult, assetResult] = await Promise.all([
        api<CommercialContext | null>(`/operations/walk-in-commercial/${visitId}`),
        api<Paginated<Staff>>(`/staff?page=1&limit=100&status=ACTIVE`),
        api<Room[]>(`/operations/resources/rooms`),
        api<Asset[]>(`/operations/resources/assets`),
      ]);
      setContext(commercial);
      setStaff(staffResult.data);
      setRooms(roomResult);
      setAssets(assetResult);
      setSaleItemId((current) =>
        commercial?.serviceItems.some((item) => item.saleItemId === current)
          ? current
          : commercial?.serviceItems[0]?.saleItemId ?? "",
      );
      setStaffId((current) =>
        staffResult.data.some((item) => item.id === current)
          ? current
          : staffResult.data[0]?.id ?? "",
      );
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Walk-in hizmet bağlamı yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [onError, visitId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedItem = context?.serviceItems.find((item) => item.saleItemId === saleItemId) ?? null;
  const selectedServiceId = selectedItem?.serviceId ?? null;

  useEffect(() => {
    if (!selectedServiceId) {
      setRequirement(null);
      return;
    }
    void api<Requirement>(`/operations/resources/services/${selectedServiceId}/requirements`)
      .then((value) => {
        setRequirement(value);
        setRoomId("");
        setAssetId(value.requiredAssetId ?? "");
      })
      .catch((err) => {
        onError(err instanceof ApiError ? err.message : "Hizmet kaynak gereksinimleri yüklenemedi.");
      });
  }, [selectedServiceId, onError]);

  const eligibleRooms = useMemo(
    () => rooms.filter((room) => room.status !== "OUT_OF_SERVICE" && (!requirement?.roomType || room.roomType === requirement.roomType)),
    [rooms, requirement],
  );
  const eligibleAssets = useMemo(
    () => assets.filter((asset) => !asset.maintenanceBlocked && (!requirement?.requiredAssetType || asset.assetType === requirement.requiredAssetType) && (!requirement?.requiredAssetId || asset.id === requirement.requiredAssetId)),
    [assets, requirement],
  );

  async function linkSale() {
    if (!canUpdate || !saleId.trim()) return;
    setBusy(true);
    onError("");
    try {
      await api(`/operations/walk-in-commercial/${visitId}`, {
        method: "PUT",
        body: { saleId: saleId.trim(), expectedVersion: context?.version ?? 0 },
      });
      setSaleId("");
      await load();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Walk-in satış bağlantısı kurulamadı.");
    } finally {
      setBusy(false);
    }
  }

  async function startWalkInExecution() {
    if (!canUpdate || !context || !selectedItem || !staffId) return;
    setBusy(true);
    onError("");
    try {
      await api(`/operations/service-executions/visits/${visitId}/start-walk-in`, {
        method: "POST",
        body: {
          commercialContextId: context.id,
          saleItemId: selectedItem.saleItemId,
          staffId,
          ...(roomId ? { roomId } : {}),
          ...(assetId ? { assetId } : {}),
        },
      });
      await onChanged();
      await load();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Walk-in hizmet icrası başlatılamadı.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <Spinner label="Walk-in hizmet bağlamı yükleniyor..." />;
  }

  if (!context) {
    return (
      <div className="rounded-[14px] border border-dashed border-[var(--line)] p-3">
        <p className="text-xs font-semibold text-[var(--ink)]">Walk-in ticari bağlam</p>
        <p className="mt-1 text-[11px] text-[var(--muted)]">
          Appointment oluşturmadan hizmet başlatmak için aynı müşteriye ait CONFIRMED hizmet satışını Visit&apos;e bağlayın.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            className="min-h-11 flex-1 rounded-[12px] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm"
            placeholder="Sale ID"
            value={saleId}
            onChange={(event) => setSaleId(event.target.value)}
          />
          <Button disabled={!canUpdate || busy || !saleId.trim()} onClick={() => void linkSale()}>
            {busy ? "Bağlanıyor..." : "Satışı Bağla"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[14px] border border-dashed border-[var(--line)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-[var(--ink)]">Walk-in hizmet başlat</p>
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            Satış {context.saleId.slice(0, 8)} · {context.saleStatus} · Tahsilat {context.paidTotal}/{context.saleTotal}
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <label>
          <span className="mb-1 block text-[11px] font-semibold text-[var(--muted)]">Hizmet</span>
          <Select className="min-h-11 w-full rounded-[12px] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm" value={saleItemId} onChange={(event) => setSaleItemId(event.target.value)}>
            {context.serviceItems.map((item) => (
              <option key={item.saleItemId} value={item.saleItemId}>
                {item.serviceName} · {item.durationMinutes} dk
              </option>
            ))}
          </Select>
        </label>
        <label>
          <span className="mb-1 block text-[11px] font-semibold text-[var(--muted)]">Personel</span>
          <Select className="min-h-11 w-full rounded-[12px] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm" value={staffId} onChange={(event) => setStaffId(event.target.value)}>
            {staff.map((item) => (
              <option key={item.id} value={item.id}>{item.firstName} {item.lastName}</option>
            ))}
          </Select>
        </label>
        {requirement?.roomType ? (
          <label>
            <span className="mb-1 block text-[11px] font-semibold text-[var(--muted)]">Oda · {requirement.roomType}</span>
            <Select className="min-h-11 w-full rounded-[12px] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm" value={roomId} onChange={(event) => setRoomId(event.target.value)}>
              <option value="">Oda seçin</option>
              {eligibleRooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
            </Select>
          </label>
        ) : null}
        {requirement?.requiredAssetId || requirement?.requiredAssetType ? (
          <label>
            <span className="mb-1 block text-[11px] font-semibold text-[var(--muted)]">Cihaz</span>
            <Select className="min-h-11 w-full rounded-[12px] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm" value={assetId} onChange={(event) => setAssetId(event.target.value)}>
              <option value="">Cihaz seçin</option>
              {eligibleAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
            </Select>
          </label>
        ) : null}
      </div>
      <div className="mt-3 flex justify-end">
        <Button
          disabled={
            !canUpdate || busy || !selectedItem || !staffId ||
            Boolean(requirement?.roomType && !roomId) ||
            Boolean((requirement?.requiredAssetId || requirement?.requiredAssetType) && !assetId)
          }
          onClick={() => void startWalkInExecution()}
        >
          {busy ? "Başlatılıyor..." : "Walk-in Hizmeti Başlat"}
        </Button>
      </div>
    </div>
  );
}
