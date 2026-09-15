"use client";

import { useEffect, useMemo, useState } from "react";

import { Alert, Button, Field, Spinner, TextInput } from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";
import { hasActiveBranch, hasPermission } from "@/lib/auth";
import type { Paginated, Service } from "@/lib/types";
import { OperationsCapacityPanel } from "./capacity-panel";

type Room = {
  id: string;
  code: string;
  name: string;
  roomType: string;
  status: "AVAILABLE" | "RESERVED" | "IN_USE" | "CLEANING" | "OUT_OF_SERVICE";
  capacity: number;
  notes: string | null;
};

type Asset = {
  id: string;
  assetCode: string;
  name: string;
  assetType: string;
  brand: string | null;
  model: string | null;
  branchId: string | null;
  nextMaintenanceAt: string | null;
  maintenanceBlocked: boolean;
};

type ServiceRequirement = {
  serviceId: string;
  roomType: string | null;
  requiredAssetType: string | null;
  requiredAssetId: string | null;
  prepDurationMinutes: number;
  cleanupDurationMinutes: number;
};

const roomStatusLabel: Record<Room["status"], string> = {
  AVAILABLE: "Uygun",
  RESERVED: "Rezerve",
  IN_USE: "Kullanımda",
  CLEANING: "Temizlikte",
  OUT_OF_SERVICE: "Hizmet Dışı",
};

export default function OperationsResourcesPage() {
  const canUpdate = hasPermission("appointments", "update");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [roomForm, setRoomForm] = useState({ code: "", name: "", roomType: "TREATMENT_ROOM", capacity: "1" });
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [requirement, setRequirement] = useState<ServiceRequirement | null>(null);

  async function load() {
    if (!hasActiveBranch()) {
      setLoading(false);
      setError("Kaynak yönetimi için önce çalışma kapsamından bir şube seçin.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [roomResult, assetResult, serviceResult] = await Promise.all([
        api<Room[]>("/operations/resources/rooms"),
        api<Asset[]>("/operations/resources/assets"),
        api<Paginated<Service>>(withQuery("/services", { page: 1, limit: 200 })),
      ]);
      setRooms(roomResult);
      setAssets(assetResult);
      setServices(serviceResult.data.filter((service) => service.status === "ACTIVE"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Operasyon kaynakları yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const assetTypes = useMemo(
    () => [...new Set(assets.map((asset) => asset.assetType))].sort(),
    [assets],
  );

  async function createRoom() {
    if (!canUpdate || !roomForm.code.trim() || !roomForm.name.trim()) return;
    setSaving(true);
    setError("");
    try {
      await api("/operations/resources/rooms", {
        method: "POST",
        body: {
          code: roomForm.code,
          name: roomForm.name,
          roomType: roomForm.roomType,
          capacity: Number(roomForm.capacity),
        },
      });
      setRoomForm({ code: "", name: "", roomType: "TREATMENT_ROOM", capacity: "1" });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Oda oluşturulamadı.");
    } finally {
      setSaving(false);
    }
  }

  async function selectService(serviceId: string) {
    setSelectedServiceId(serviceId);
    if (!serviceId) {
      setRequirement(null);
      return;
    }
    try {
      setRequirement(await api<ServiceRequirement>(`/operations/resources/services/${serviceId}/requirements`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Hizmet gereksinimleri yüklenemedi.");
    }
  }

  async function saveRequirement() {
    if (!canUpdate || !selectedServiceId || !requirement) return;
    setSaving(true);
    setError("");
    try {
      const saved = await api<ServiceRequirement>(
        `/operations/resources/services/${selectedServiceId}/requirements`,
        {
          method: "PUT",
          body: {
            roomType: requirement.roomType || null,
            requiredAssetType: requirement.requiredAssetId ? null : requirement.requiredAssetType || null,
            requiredAssetId: requirement.requiredAssetId || null,
            prepDurationMinutes: requirement.prepDurationMinutes,
            cleanupDurationMinutes: requirement.cleanupDurationMinutes,
          },
        },
      );
      setRequirement(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Hizmet kaynak gereksinimleri kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="mx-auto max-w-[1420px] py-10"><Spinner label="Operasyon kaynakları hazırlanıyor..." /></div>;

  return (
    <div className="mx-auto max-w-[1420px] space-y-5 pb-10">
      <header className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-soft)]">Resource Engine</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">Oda, Kabin ve Ekipman Kaynakları</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">Oda/kabin kapasitesini yönetin; cihaz ve ekipmanlar Inventory kaynağından okunur, burada kopyalanmaz.</p>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <OperationsCapacityPanel />

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="overflow-hidden rounded-[24px] border border-[var(--line)] bg-[var(--surface)] shadow-sm">
          <div className="border-b border-[var(--line)] px-6 py-4">
            <h2 className="text-sm font-semibold text-[var(--ink)]">Oda ve Kabinler</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">{rooms.length} fiziksel hizmet alanı</p>
          </div>
          {rooms.length ? (
            <div className="divide-y divide-[var(--line)]">
              {rooms.map((room) => (
                <div key={room.id} className="grid gap-3 px-6 py-4 sm:grid-cols-[minmax(0,1fr)_150px_90px] sm:items-center">
                  <div><p className="text-sm font-semibold text-[var(--ink)]">{room.name}</p><p className="mt-1 text-xs text-[var(--muted)]">{room.code} · {room.roomType} · kapasite {room.capacity}</p></div>
                  <span className="w-fit rounded-full bg-[var(--surface-2)] px-3 py-1 text-xs font-semibold text-[var(--ink)]">{roomStatusLabel[room.status]}</span>
                  <span className="text-xs text-[var(--muted)]">{room.status === "AVAILABLE" ? "Planlanabilir" : "Bloklu"}</span>
                </div>
              ))}
            </div>
          ) : <div className="px-6 py-10 text-center text-sm text-[var(--muted)]">Henüz oda veya kabin tanımlanmadı.</div>}
        </div>

        <div className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-[var(--ink)]">Yeni Oda / Kabin</h2>
          <div className="mt-4 space-y-4">
            <Field label="Kod"><TextInput value={roomForm.code} onChange={(event) => setRoomForm((current) => ({ ...current, code: event.target.value }))} placeholder="LAZER-01" /></Field>
            <Field label="Ad"><TextInput value={roomForm.name} onChange={(event) => setRoomForm((current) => ({ ...current, name: event.target.value }))} placeholder="Lazer Odası 1" /></Field>
            <Field label="Oda tipi"><TextInput value={roomForm.roomType} onChange={(event) => setRoomForm((current) => ({ ...current, roomType: event.target.value }))} /></Field>
            <Field label="Kapasite"><TextInput type="number" min="1" max="50" value={roomForm.capacity} onChange={(event) => setRoomForm((current) => ({ ...current, capacity: event.target.value }))} /></Field>
            <Button disabled={!canUpdate || saving} onClick={() => void createRoom()}>{saving ? "Kaydediliyor..." : "Oda Oluştur"}</Button>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[24px] border border-[var(--line)] bg-[var(--surface)] shadow-sm">
        <div className="border-b border-[var(--line)] px-6 py-4"><h2 className="text-sm font-semibold text-[var(--ink)]">Inventory Ekipman Uygunluğu</h2><p className="mt-1 text-xs text-[var(--muted)]">{assets.length} aktif cihaz/ekipman · bakım blokları operasyon tarafından okunur</p></div>
        {assets.length ? <div className="divide-y divide-[var(--line)]">{assets.map((asset) => <div key={asset.id} className="grid gap-3 px-6 py-4 md:grid-cols-[minmax(0,1fr)_180px_160px] md:items-center"><div><p className="text-sm font-semibold text-[var(--ink)]">{asset.name}</p><p className="mt-1 text-xs text-[var(--muted)]">{asset.assetCode} · {asset.brand ?? "Marka yok"} {asset.model ?? ""}</p></div><span className="text-xs text-[var(--muted)]">{asset.assetType}</span><span className={asset.maintenanceBlocked ? "text-xs font-semibold text-[#8f3d3d]" : "text-xs font-semibold text-[#2d6a49]"}>{asset.maintenanceBlocked ? "Bakım nedeniyle bloklu" : "Planlanabilir"}</span></div>)}</div> : <div className="px-6 py-10 text-center text-sm text-[var(--muted)]">Aktif ekipman bulunmuyor.</div>}
      </section>

      <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-[var(--ink)]">Hizmet Kaynak Gereksinimleri</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">Hizmetin oda tipi, cihaz ve hazırlık/temizlik tamponlarını tanımlayın.</p>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <Field label="Hizmet"><select className="min-h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm" value={selectedServiceId} onChange={(event) => void selectService(event.target.value)}><option value="">Hizmet seçin</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></Field>
          {requirement ? <><Field label="Oda tipi"><TextInput value={requirement.roomType ?? ""} onChange={(event) => setRequirement((current) => current ? { ...current, roomType: event.target.value } : current)} placeholder="TREATMENT_ROOM" /></Field><Field label="Ekipman tipi"><select className="min-h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm" value={requirement.requiredAssetType ?? ""} disabled={Boolean(requirement.requiredAssetId)} onChange={(event) => setRequirement((current) => current ? { ...current, requiredAssetType: event.target.value || null } : current)}><option value="">Tip gerekmiyor</option>{assetTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></Field><Field label="Belirli cihaz"><select className="min-h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm" value={requirement.requiredAssetId ?? ""} onChange={(event) => setRequirement((current) => current ? { ...current, requiredAssetId: event.target.value || null, requiredAssetType: event.target.value ? null : current.requiredAssetType } : current)}><option value="">Belirli cihaz gerekmiyor</option>{assets.filter((asset) => !asset.maintenanceBlocked).map((asset) => <option key={asset.id} value={asset.id}>{asset.name} ({asset.assetCode})</option>)}</select></Field><Field label="Hazırlık (dk)"><TextInput type="number" min="0" max="240" value={requirement.prepDurationMinutes} onChange={(event) => setRequirement((current) => current ? { ...current, prepDurationMinutes: Number(event.target.value) } : current)} /></Field><Field label="Temizlik (dk)"><TextInput type="number" min="0" max="240" value={requirement.cleanupDurationMinutes} onChange={(event) => setRequirement((current) => current ? { ...current, cleanupDurationMinutes: Number(event.target.value) } : current)} /></Field></> : null}
        </div>
        {requirement ? <div className="mt-5"><Button disabled={!canUpdate || saving} onClick={() => void saveRequirement()}>{saving ? "Kaydediliyor..." : "Gereksinimleri Kaydet"}</Button></div> : null}
      </section>
    </div>
  );
}
