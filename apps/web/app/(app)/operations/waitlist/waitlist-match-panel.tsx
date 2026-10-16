"use client";

import { useEffect, useRef, useState } from "react";

import { Alert, Button } from "@/components/ui";
import { CardInfo } from "@/components/card-info";
import { api, ApiError } from "@/lib/api";
import { getCardHelp } from "@/lib/card-help";

type WaitlistMatch = {
  staffId: string;
  staffName: string;
  startAt: string;
  endAt: string;
  blockedFrom: string;
  blockedTo: string;
  roomId: string | null;
  roomName: string | null;
  assetId: string | null;
  assetName: string | null;
};

export function WaitlistMatchPanel({
  entryId,
  entryVersion,
  canUpdate,
  onBooked,
}: {
  entryId: string;
  entryVersion: number;
  canUpdate: boolean;
  onBooked: () => Promise<void>;
}) {
  const [matches, setMatches] = useState<WaitlistMatch[]>([]);
  const [matchedVersion, setMatchedVersion] = useState(entryVersion);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const requestGeneration = useRef(0);
  const bookingInFlight = useRef(false);
  const [bookedAppointmentId, setBookedAppointmentId] = useState<string | null>(null);

  useEffect(() => {
    requestGeneration.current += 1;
    setMatches([]);
    setBookedAppointmentId(null);
    setMatchedVersion(entryVersion);
    setSearched(false);
    setLoading(false);
    setError("");
  }, [entryId, entryVersion]);

  async function findMatches() {
    const generation = ++requestGeneration.current;
    setLoading(true);
    setMatches([]);
    setSearched(false);
    setError("");
    try {
      const result = await api<{
        entryId: string;
        entryVersion: number;
        matches: WaitlistMatch[];
      }>(`/operations/waitlist/${entryId}/matches`, {
        method: "POST",
        body: { limit: 10 },
      });
      if (generation !== requestGeneration.current || result.entryId !== entryId) return;
      setMatches(result.matches);
      setMatchedVersion(result.entryVersion);
      setSearched(true);
    } catch (err) {
      if (generation === requestGeneration.current) {
        setError(err instanceof ApiError ? err.message : "Uygun saat bulunamadı.");
      }
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }

  async function accept(match: WaitlistMatch) {
    if (!canUpdate || bookingInFlight.current || loading || matches.length === 0 || bookedAppointmentId) return;
    bookingInFlight.current = true;
    const key = `${match.staffId}:${match.startAt}`;
    setBusyKey(key);
    setError("");
    try {
      const result = await api<{ appointment: { id: string } }>(`/operations/waitlist/${entryId}/accept-match`, {
        method: "POST",
        body: {
          expectedVersion: matchedVersion,
          staffId: match.staffId,
          startAt: match.startAt,
          endAt: match.endAt,
          roomId: match.roomId,
          assetId: match.assetId,
        },
      });
      setMatches([]);
      setBookedAppointmentId(result.appointment.id);
      try {
        await onBooked();
      } catch {
        setError("Randevu oluşturuldu ancak liste yenilenemedi. Sayfayı yenileyerek kontrol edin.");
      }
    } catch (err) {
      // A failed booking invalidates the returned slots; the operator must rescan.
      setMatches([]);
      setSearched(false);
      setError(
        err instanceof ApiError
          ? `${err.message} Uygun saatleri yeniden arayın.`
          : "Seçilen saat artık uygun değil. Yeniden eşleştirme yapın.",
      );
    } finally {
      bookingInFlight.current = false;
      setBusyKey(null);
    }
  }

  return (
    <div className="mt-3 rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-start gap-2"><p className="text-xs font-semibold text-[var(--ink)]">Uygun Randevu Saati Bulma</p><CardInfo help={getCardHelp("Uygun Randevu Saati Bulma")} /></div>
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            Personel, oda, cihaz, bakım, kullanılamama kayıtları ile hazırlık ve temizlik süreleri birlikte değerlendirilir.
          </p>
        </div>
        <Button variant="secondary" disabled={loading || Boolean(busyKey) || Boolean(bookedAppointmentId)} onClick={() => void findMatches()}>
          {loading ? "Taranıyor..." : searched ? "Uygun Saatleri Yenile" : "Uygun Saat Bul"}
        </Button>
      </div>

      {bookedAppointmentId ? (
        <p role="status" className="mt-3 text-xs font-medium text-[var(--ink)]">
          Randevu oluşturuldu. Kayıt numarası: {bookedAppointmentId}
        </p>
      ) : null}

      {error ? (
        <div className="mt-3">
          <Alert onClose={() => setError("")}>{error}</Alert>
        </div>
      ) : null}

      {searched && matches.length === 0 && !error ? (
        <p className="mt-3 text-xs text-[var(--muted)]">
          Mevcut tercih ve kaynak koşullarını karşılayan uygun saat bulunamadı.
        </p>
      ) : null}

      {matches.length ? (
        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          {matches.map((match) => {
            const key = `${match.staffId}:${match.startAt}`;
            return (
              <div key={key} className="rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-3">
                <p className="text-xs font-semibold text-[var(--ink)]">
                  {new Date(match.startAt).toLocaleString("tr-TR")} · {match.staffName}
                </p>
                <p className="mt-1 text-[11px] text-[var(--muted)]">
                  {match.roomName ? `Oda: ${match.roomName}` : "Oda gerekmiyor"}
                  {match.assetName ? ` · Cihaz: ${match.assetName}` : " · Cihaz gerekmiyor"}
                </p>
                <p className="mt-1 text-[11px] text-[var(--muted-soft)]">
                  Kaynağın ayrıldığı süre: {new Date(match.blockedFrom).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}–{new Date(match.blockedTo).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                </p>
                {canUpdate ? (
                  <div className="mt-3 flex justify-end">
                    <Button disabled={Boolean(busyKey) || loading || Boolean(bookedAppointmentId)} onClick={() => void accept(match)}>
                      {busyKey === key ? "Randevulaştırılıyor..." : "Bu Saati Randevuya Dönüştür"}
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
