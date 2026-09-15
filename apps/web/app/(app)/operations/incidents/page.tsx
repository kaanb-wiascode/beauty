"use client";

import { useEffect, useState } from "react";

import { Alert, Button, Field, Spinner, TextInput } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasActiveBranch, hasPermission } from "@/lib/auth";

type Room = { id: string; name: string; code: string; status: string };
type Asset = { id: string; name: string; assetCode: string; assetType: string };
type Incident = {
  id: string;
  type: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "RESOLVED";
  title: string;
  description: string | null;
  roomId: string | null;
  roomName: string | null;
  assetId: string | null;
  assetName: string | null;
  resourceBlockId: string | null;
  qualityCaseId: string | null;
  openedAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
  version: number;
};
type AffectedAppointment = {
  id: string;
  customerName: string;
  serviceName: string;
  startAt: string;
  endAt: string;
  status: string;
};

function localInput(date: Date) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

const severityLabel = {
  LOW: "Düşük",
  MEDIUM: "Orta",
  HIGH: "Yüksek",
  CRITICAL: "Kritik",
} as const;

export default function OperationsIncidentsPage() {
  const canUpdate = hasPermission("appointments", "update");
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [affected, setAffected] = useState<Record<string, AffectedAppointment[]>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    type: "OTHER",
    severity: "MEDIUM",
    title: "",
    description: "",
    resourceKind: "NONE",
    resourceId: "",
    outageTo: localInput(new Date(Date.now() + 2 * 60 * 60 * 1000)),
  });

  async function load() {
    if (!hasActiveBranch()) {
      setError("Incident yönetimi için önce aktif bir şube seçin.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [incidentResult, roomResult, assetResult] = await Promise.all([
        api<Incident[]>("/operations/incidents"),
        api<Room[]>("/operations/resources/rooms"),
        api<Asset[]>("/operations/resources/assets"),
      ]);
      setIncidents(incidentResult);
      setRooms(roomResult);
      setAssets(assetResult);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Operasyon incident kayıtları yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createIncident() {
    if (!canUpdate || !form.title.trim()) return;
    setBusy("create");
    setError("");
    try {
      const resourceSelected = form.resourceKind !== "NONE" && form.resourceId;
      await api("/operations/incidents", {
        method: "POST",
        body: {
          type: form.type,
          severity: form.severity,
          title: form.title.trim(),
          description: form.description.trim() || null,
          roomId: form.resourceKind === "ROOM" ? form.resourceId : null,
          assetId: form.resourceKind === "ASSET" ? form.resourceId : null,
          outageFrom: new Date().toISOString(),
          outageTo: resourceSelected ? new Date(form.outageTo).toISOString() : null,
        },
      });
      setForm((current) => ({ ...current, title: "", description: "", resourceKind: "NONE", resourceId: "" }));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Incident oluşturulamadı.");
    } finally {
      setBusy("");
    }
  }

  async function loadAffected(incident: Incident) {
    setBusy(`affected:${incident.id}`);
    setError("");
    try {
      const rows = await api<AffectedAppointment[]>(
        `/operations/incidents/${incident.id}/affected-appointments`,
      );
      setAffected((current) => ({ ...current, [incident.id]: rows }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Etkilenen randevular yüklenemedi.");
    } finally {
      setBusy("");
    }
  }

  async function resolve(incident: Incident) {
    if (!canUpdate) return;
    const note = window.prompt("Çözüm notu")?.trim();
    if (!note) return;
    setBusy(`resolve:${incident.id}`);
    setError("");
    try {
      await api(`/operations/incidents/${incident.id}/resolve`, {
        method: "POST",
        body: { expectedVersion: incident.version, resolutionNote: note },
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Incident çözülemedi.");
    } finally {
      setBusy("");
    }
  }

  if (loading) return <div className="mx-auto max-w-[1420px] py-10"><Spinner label="Incident görünümü hazırlanıyor..." /></div>;

  const resourceOptions = form.resourceKind === "ROOM" ? rooms : form.resourceKind === "ASSET" ? assets : [];

  return (
    <div className="mx-auto max-w-[1420px] space-y-5 pb-10">
      <header className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-soft)]">Branch Exceptions</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">Operasyon Incident & Kesinti Yönetimi</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">Oda/cihaz kesintileri incident ile birlikte kapasiteyi bloklar. Kalite ve güvenlik vakalarının detay sahibi Quality alanıdır; Operations yalnız gerekli referansı taşır.</p>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-[var(--ink)]">Yeni Incident</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <Field label="Başlık"><TextInput value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></Field>
          <Field label="Tip"><select className="min-h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm" value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}><option value="DEVICE_FAILURE">Cihaz Arızası</option><option value="ROOM_UNAVAILABLE">Oda Kullanılamıyor</option><option value="POWER">Elektrik</option><option value="NETWORK">Ağ</option><option value="STAFFING">Personel</option><option value="OTHER">Diğer</option></select></Field>
          <Field label="Önem"><select className="min-h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm" value={form.severity} onChange={(event) => setForm((current) => ({ ...current, severity: event.target.value }))}><option value="LOW">Düşük</option><option value="MEDIUM">Orta</option><option value="HIGH">Yüksek</option><option value="CRITICAL">Kritik</option></select></Field>
          <Field label="Kaynak"><select className="min-h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm" value={form.resourceKind} onChange={(event) => setForm((current) => ({ ...current, resourceKind: event.target.value, resourceId: "" }))}><option value="NONE">Kaynak yok</option><option value="ROOM">Oda / Kabin</option><option value="ASSET">Cihaz / Ekipman</option></select></Field>
          {form.resourceKind !== "NONE" ? <Field label="Etkilenen kaynak"><select className="min-h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm" value={form.resourceId} onChange={(event) => setForm((current) => ({ ...current, resourceId: event.target.value }))}><option value="">Seçin</option>{resourceOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field> : null}
          {form.resourceKind !== "NONE" ? <Field label="Tahmini kesinti bitişi"><TextInput type="datetime-local" value={form.outageTo} onChange={(event) => setForm((current) => ({ ...current, outageTo: event.target.value }))} /></Field> : null}
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end"><Field label="Açıklama"><TextInput value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></Field><Button disabled={!canUpdate || busy === "create"} onClick={() => void createIncident()}>{busy === "create" ? "Kaydediliyor..." : "Incident Aç"}</Button></div>
      </section>

      <section className="overflow-hidden rounded-[24px] border border-[var(--line)] bg-[var(--surface)] shadow-sm">
        <div className="border-b border-[var(--line)] px-6 py-4"><h2 className="text-sm font-semibold text-[var(--ink)]">Incident Kayıtları</h2></div>
        {incidents.length ? <div className="divide-y divide-[var(--line)]">{incidents.map((incident) => (
          <div key={incident.id} className="px-6 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-[var(--ink)]">{incident.title}</p><span className="rounded-full bg-[var(--surface-2)] px-2 py-1 text-[11px] font-semibold text-[var(--ink)]">{severityLabel[incident.severity]}</span><span className="text-xs text-[var(--muted)]">{incident.status === "OPEN" ? "Açık" : "Çözüldü"}</span></div><p className="mt-1 text-xs text-[var(--muted)]">{incident.roomName ?? incident.assetName ?? "Genel şube incident'i"} · {new Date(incident.openedAt).toLocaleString("tr-TR")}</p></div>
              <div className="flex flex-wrap gap-2">{incident.resourceBlockId ? <Button variant="secondary" disabled={busy === `affected:${incident.id}`} onClick={() => void loadAffected(incident)}>Etkilenen Randevular</Button> : null}{incident.status === "OPEN" && canUpdate ? <Button disabled={busy === `resolve:${incident.id}`} onClick={() => void resolve(incident)}>Çözüldü Olarak İşaretle</Button> : null}</div>
            </div>
            {affected[incident.id] ? <div className="mt-3 rounded-[14px] bg-[var(--surface-2)] p-3"><p className="text-xs font-semibold text-[var(--ink)]">Etkilenen {affected[incident.id].length} randevu</p>{affected[incident.id].map((appointment) => <p key={appointment.id} className="mt-2 text-xs text-[var(--muted)]">{appointment.customerName} · {appointment.serviceName} · {new Date(appointment.startAt).toLocaleString("tr-TR")}</p>)}</div> : null}
          </div>
        ))}</div> : <div className="px-6 py-10 text-center text-sm text-[var(--muted)]">Incident kaydı yok.</div>}
      </section>
    </div>
  );
}
