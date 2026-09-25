"use client";

import { useState } from "react";

import { Alert, Button } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

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

  async function findMatches() {
    setLoading(true);
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
      setMatches(result.matches);
      setMatchedVersion(result.entryVersion);
      setSearched(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Uygun slotlar bulunamadı.");
    } finally {
      setLoading(false);
    }
  }

  async function accept(match: WaitlistMatch) {
    if (!canUpdate) return;
    const key = `${match.staffId}:${match.startAt}`;
    setBusyKey(key);
    setError("");
    try {
      await api(`/operations/waitlist/${entryId}/accept-match`, {
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
      await onBooked();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Slot artık uygun değil. Yeniden eşleştirme yapın.",
      );
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="mt-3 rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-[var(--ink)]">Kapasite kurtarma</p>
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            Personel, oda, cihaz, bakım, blok ve prep/cleanup süreleri birlikte doğrulanır.
          </p>
        </div>
        <Button variant="secondary" disabled={loading || Boolean(busyKey)} onClick={() => void findMatches()}>
          {loading ? "Taranıyor..." : searched ? "Slotları Yenile" : "Uygun Slot Bul"}
        </Button>
      </div>

      {error ? (
        <div className="mt-3">
          <Alert onClose={() => setError("")}>{error}</Alert>
        </div>
      ) : null}

      {searched && matches.length === 0 && !error ? (
        <p className="mt-3 text-xs text-[var(--muted)]">
          Mevcut tercih ve kaynak koşullarını karşılayan boş slot bulunamadı.
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
                  Kaynak blok süresi: {new Date(match.blockedFrom).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}–{new Date(match.blockedTo).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                </p>
                {canUpdate ? (
                  <div className="mt-3 flex justify-end">
                    <Button disabled={Boolean(busyKey)} onClick={() => void accept(match)}>
                      {busyKey === key ? "Randevulaştırılıyor..." : "Bu Slotu Randevulaştır"}
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
