"use client";

import { useEffect, useState } from "react";
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
    return (
      <div className={`rounded-[14px] px-3 py-3 ${mine ? "bg-white/10" : "bg-[var(--surface-2)]"}`}>
        <div className="mb-2 flex items-center gap-2">
          <span className={`flex h-8 w-8 items-center justify-center rounded-full text-[13px] ${mine ? "bg-white/15 text-white" : "bg-[var(--accent-soft)] text-[var(--accent)]"}`}>▶</span>
          <div className="min-w-0">
            <p className="text-[9px] font-semibold">Sesli mesaj</p>
            <p className={`mt-0.5 truncate text-[8px] ${mine ? "text-white/55" : "text-[var(--muted)]"}`}>{Math.max(1, Math.round(attachment.sizeBytes / 1024))} KB</p>
          </div>
        </div>
        {url && !failed ? <audio src={url} controls preload="metadata" className="h-9 w-full min-w-[220px]" /> : <p className="py-2 text-[9px] opacity-70">{failed ? "Ses kaydı yüklenemedi" : "Ses kaydı hazırlanıyor…"}</p>}
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
