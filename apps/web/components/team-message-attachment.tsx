"use client";

import { useEffect, useRef, useState } from "react";
import { api, apiResponse, ApiError } from "@/lib/api";

type Attachment = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
};

type AttachmentAccess =
  | { mode: "object"; url: string; mimeType: string; originalName: string; expiresAt: string }
  | { mode: "local"; mimeType: string; originalName: string };

function VoiceMessagePlayer({ url, mine, sizeBytes }: { url: string; mine: boolean; sizeBytes: number }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [rate, setRate] = useState(1);

  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const bars = [30,46,65,38,72,54,82,42,60,76,48,68,36,58,80,44,66,52,74,40,62,84,50,70];

  function formatTime(value: number) {
    if (!Number.isFinite(value) || value < 0) return "0:00";
    const minutes = Math.floor(value / 60);
    const seconds = Math.floor(value % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  }

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }

  function cycleRate() {
    const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }

  return (
    <div className={`rounded-[14px] px-3 py-3 ${mine ? "bg-white/10" : "bg-[var(--surface-2)]"}`}>
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrentTime(0); }}
      />
      <div className="flex items-center gap-3">
        <button type="button" onClick={togglePlayback} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold ${mine ? "bg-white/15 text-white" : "bg-[var(--accent-soft)] text-[var(--accent)]"}`} aria-label={playing ? "Duraklat" : "Oynat"}>
          {playing ? "Ⅱ" : "▶"}
        </button>
        <button
          type="button"
          onClick={(event) => {
            const audio = audioRef.current;
            if (!audio || !duration) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
            audio.currentTime = ratio * duration;
            setCurrentTime(audio.currentTime);
          }}
          className="flex min-w-[180px] flex-1 items-end gap-[2px] py-1"
          aria-label="Sesli mesaj ilerleme çubuğu"
        >
          {bars.map((height, index) => {
            const filled = index / bars.length <= progress;
            return <span key={index} className={`w-[3px] rounded-full ${filled ? (mine ? "bg-white" : "bg-[var(--accent)]") : (mine ? "bg-white/30" : "bg-[var(--line-strong)]")}`} style={{ height: `${Math.max(8, Math.round(height * 0.28))}px` }} />;
          })}
        </button>
        <button type="button" onClick={cycleRate} className={`rounded-full px-2 py-1 text-[9px] font-bold ${mine ? "bg-white/10 text-white/80" : "bg-white text-[var(--muted)]"}`}>{rate}×</button>
      </div>
      <div className={`mt-1.5 flex items-center justify-between text-[8px] ${mine ? "text-white/55" : "text-[var(--muted)]"}`}>
        <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
        <span>{Math.max(1, Math.round(sizeBytes / 1024))} KB</span>
      </div>
    </div>
  );
}

export function TeamMessageAttachment({
  attachment,
  mine,
  onOpen,
}: {
  attachment: Attachment;
  mine: boolean;
  onOpen: (attachment: Attachment) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let blobUrl: string | null = null;

    async function load() {
      if (!attachment.mimeType.startsWith("image/") && !attachment.mimeType.startsWith("audio/") && !attachment.mimeType.startsWith("video/")) return;
      try {
        const access = await api<AttachmentAccess>(`/team/attachments/${attachment.id}/access`);
        if (!active) return;
        if (access.mode === "object") {
          setUrl(access.url);
          return;
        }
        const response = await apiResponse(`/team/attachments/${attachment.id}`);
        if (!response.ok) throw new ApiError("Medya yüklenemedi.", response.status);
        const blob = await response.blob();
        blobUrl = URL.createObjectURL(blob);
        if (active) setUrl(blobUrl);
      } catch {
        if (active) setFailed(true);
      }
    }

    void load();
    return () => {
      active = false;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [attachment.id, attachment.mimeType]);

  if (attachment.mimeType.startsWith("image/")) {
    return (
      <button type="button" onClick={() => onOpen(attachment)} className="block w-full overflow-hidden rounded-[14px] bg-black/5 text-left">
        {url && !failed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={attachment.originalName} className="max-h-[360px] w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-40 items-center justify-center text-[10px] text-[var(--muted)]">{failed ? "Görsel yüklenemedi" : "Görsel yükleniyor…"}</div>
        )}
      </button>
    );
  }

  if (attachment.mimeType.startsWith("video/")) {
    return url && !failed ? (
      <video src={url} controls preload="metadata" playsInline className="max-h-[360px] w-full rounded-[14px] bg-black" />
    ) : (
      <button type="button" onClick={() => onOpen(attachment)} className="flex h-32 w-full items-center justify-center rounded-[14px] bg-black/5 text-[10px] text-[var(--muted)]">
        {failed ? "Video yüklenemedi" : "Video yükleniyor…"}
      </button>
    );
  }

  if (attachment.mimeType.startsWith("audio/")) {
    return url && !failed ? (
      <VoiceMessagePlayer url={url} mine={mine} sizeBytes={attachment.sizeBytes} />
    ) : (
      <div className={`rounded-[14px] px-3 py-4 text-[9px] ${mine ? "bg-white/10 text-white/70" : "bg-[var(--surface-2)] text-[var(--muted)]"}`}>
        {failed ? "Ses kaydı yüklenemedi" : "Ses kaydı hazırlanıyor…"}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(attachment)}
      className={`flex w-full items-center gap-2 rounded-[12px] border px-3 py-2.5 text-left ${mine ? "border-white/15 bg-white/5" : "border-[var(--line)] bg-[var(--surface-2)]"}`}
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-black/5 text-[9px] font-bold">{attachment.mimeType === "application/pdf" ? "PDF" : "DOC"}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[9px] font-semibold">{attachment.originalName}</span>
        <span className={`mt-0.5 block text-[8px] ${mine ? "text-white/50" : "text-[var(--muted)]"}`}>{Math.max(1, Math.round(attachment.sizeBytes / 1024))} KB</span>
      </span>
    </button>
  );
}


export function TeamMediaThumbnail({
  attachment,
  onOpen,
}: {
  attachment: Attachment;
  onOpen: (attachment: Attachment) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let blobUrl: string | null = null;

    async function load() {
      try {
        const access = await api<AttachmentAccess>(`/team/attachments/${attachment.id}/access`);
        if (!active) return;
        if (access.mode === "object") {
          setUrl(access.url);
          return;
        }
        const response = await apiResponse(`/team/attachments/${attachment.id}`);
        if (!response.ok) throw new ApiError("Medya yüklenemedi.", response.status);
        const blob = await response.blob();
        blobUrl = URL.createObjectURL(blob);
        if (active) setUrl(blobUrl);
      } catch {
        if (active) setFailed(true);
      }
    }

    void load();
    return () => {
      active = false;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [attachment.id]);

  return (
    <button
      type="button"
      onClick={() => onOpen(attachment)}
      className="group relative aspect-square overflow-hidden rounded-[10px] border border-[var(--line)] bg-[var(--surface-2)]"
      title={attachment.originalName}
    >
      {url && !failed ? (
        attachment.mimeType.startsWith("image/") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={attachment.originalName} className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.03]" loading="lazy" />
        ) : (
          <video src={url} muted preload="metadata" playsInline className="h-full w-full object-cover" />
        )
      ) : (
        <span className="flex h-full items-center justify-center px-2 text-center text-[8px] text-[var(--muted)]">{failed ? "Medya yok" : "Yükleniyor…"}</span>
      )}
      {attachment.mimeType.startsWith("video/") ? (
        <span className="absolute inset-0 flex items-center justify-center bg-black/10">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-[12px] text-white">▶</span>
        </span>
      ) : null}
    </button>
  );
}
