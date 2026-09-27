"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, apiFormData, apiResponse, ApiError } from "@/lib/api";
import { Alert, Button, PageHeader, Spinner } from "@/components/ui";
import { Modal } from "@/components/modal";
import { SearchField } from "@/components/data-view";
import { ValooSelect } from "@/components/valoo-controls";
import { TeamMessageAttachment } from "@/components/team-message-attachment";
import { encodeValooRichCard, parseValooRichCard, TeamRichCard, type ValooRichCardPayload } from "@/components/team-rich-card";
import { getStoredUser } from "@/lib/auth";

type PresenceStatus =
  | "AVAILABLE"
  | "BUSY"
  | "IN_SESSION"
  | "ON_BREAK"
  | "IN_MEETING"
  | "DO_NOT_DISTURB"
  | "OFFLINE";

type Person = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  roleName: string;
  status: PresenceStatus;
  statusText: string | null;
  statusUntil: string | null;
  lastSeenAt: string | null;
  isOnline: boolean;
};

type Conversation = {
  id: string;
  type: "DIRECT" | "GROUP" | "CHANNEL";
  name: string | null;
  announcementOnly: boolean;
  displayName: string;
  memberCount: number;
  unreadCount: number;
  updatedAt: string;
  lastMessage: {
    body: string;
    createdAt: string;
    senderUserId: string;
    senderName: string;
  } | null;
};

type Reaction = { emoji: string; count: number; reactedByMe: boolean };
type Attachment = { id: string; originalName: string; mimeType: string; sizeBytes: number };
type Message = {
  id: string;
  body: string;
  senderUserId: string;
  senderName: string;
  replyToMessageId: string | null;
  editedAt: string | null;
  createdAt: string;
  reactions: Reaction[];
  readByCount: number;
  isPinned: boolean;
  attachments: Attachment[];
  acknowledgedByMe: boolean;
  acknowledgedCount: number;
};

type ConversationMember = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  roleName: string;
  isAdmin: boolean;
  joinedAt: string;
  lastReadAt: string | null;
};

type TypingUser = { id: string; firstName: string; lastName: string };
type PinnedMessage = { id: string; body: string; createdAt: string; senderUserId: string; senderName: string; pinnedAt: string };
type SearchResult = { id: string; body: string; createdAt: string; senderUserId: string; senderName: string };
type AnnouncementReader = { id: string; firstName: string; lastName: string; email: string; acknowledgedAt: string };
type MessageReader = { id: string; firstName: string; lastName: string; email: string; readAt: string };
type PendingMessage = { id: string; body: string; attachmentNames: string[] };
type ShareCustomer = { id: string; firstName: string; lastName: string; phone: string | null; email: string | null };
type ShareAppointment = { id: string; customerId: string; serviceId: string; startAt: string; status: string };
type SharePayment = { id: string; amount: string | number; method: string; paidAt: string; status: string; appointment: { customerId: string; serviceId: string } };
type ShareService = { id: string; name: string };
type PaginatedResult<T> = { data: T[] };
type AttachmentPreview = { url: string; mimeType: string; name: string };
type PreparedAttachment = {
  objectKey: string;
  uploadUrl: string;
  requiredHeaders: Record<string, string>;
  maxBytes: number;
  filename: string;
};
type AttachmentAccess =
  | { mode: "object"; url: string; mimeType: string; originalName: string; expiresAt: string }
  | { mode: "local"; mimeType: string; originalName: string };
type TeamRealtimeEvent = {
  type: string;
  payload?: {
    conversationId?: string;
    messageId?: string | null;
    senderUserId?: string;
    senderName?: string;
    body?: string;
    userId?: string;
    firstName?: string;
    lastName?: string;
    typing?: boolean;
  };
  at?: string;
};

const STATUS_LABELS: Record<PresenceStatus, string> = {
  AVAILABLE: "Müsait",
  BUSY: "Meşgul",
  IN_SESSION: "Seansta",
  ON_BREAK: "Molada",
  IN_MEETING: "Toplantıda",
  DO_NOT_DISTURB: "Rahatsız etmeyin",
  OFFLINE: "Çevrim dışı",
};

const STATUS_DOT: Record<PresenceStatus, string> = {
  AVAILABLE: "bg-emerald-500",
  BUSY: "bg-amber-500",
  IN_SESSION: "bg-rose-500",
  ON_BREAK: "bg-sky-500",
  IN_MEETING: "bg-violet-500",
  DO_NOT_DISTURB: "bg-slate-700",
  OFFLINE: "bg-slate-300",
};

function initials(firstName: string, lastName: string) {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase();
}

function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

function messagePreview(value: string) {
  const card = parseValooRichCard(value);
  if (!card) return value;
  const label = card.kind === "APPOINTMENT" ? "Randevu" : card.kind === "CUSTOMER" ? "Müşteri" : "Ödeme";
  return `${label}: ${card.title}`;
}

function PersonAvatar({ person, size = "md" }: { person: Person; size?: "sm" | "md" }) {
  const box = size === "sm" ? "h-8 w-8 text-[10px]" : "h-10 w-10 text-[11px]";
  return (
    <div className="relative shrink-0">
      <div className={`${box} flex items-center justify-center rounded-[13px] bg-[var(--accent-soft)] font-semibold text-[var(--accent)]`}>
        {initials(person.firstName, person.lastName)}
      </div>
      <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${person.isOnline ? STATUS_DOT[person.status] : "bg-slate-300"}`} />
    </div>
  );
}

export default function TeamPage() {
  const currentUser = getStoredUser();
  const [people, setPeople] = useState<Person[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [status, setStatus] = useState<PresenceStatus>("AVAILABLE");
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeType, setComposeType] = useState<"DIRECT" | "GROUP" | "CHANNEL">("DIRECT");
  const [groupName, setGroupName] = useState("");
  const [announcementOnly, setAnnouncementOnly] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [pendingMessage, setPendingMessage] = useState<PendingMessage | null>(null);
  const [pinnedMessages, setPinnedMessages] = useState<PinnedMessage[]>([]);
  const [conversationMembers, setConversationMembers] = useState<ConversationMember[]>([]);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [groupEditing, setGroupEditing] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [preview, setPreview] = useState<AttachmentPreview | null>(null);
  const [readerList, setReaderList] = useState<AnnouncementReader[]>([]);
  const [readerModalTitle, setReaderModalTitle] = useState("");
  const [messageReaders, setMessageReaders] = useState<MessageReader[]>([]);
  const [messageInfo, setMessageInfo] = useState<Message | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [forwarding, setForwarding] = useState(false);
  const [attachmentTab, setAttachmentTab] = useState<"MEDIA" | "FILES" | "LINKS">("MEDIA");
  const [shareOpen, setShareOpen] = useState(false);
  const [shareTab, setShareTab] = useState<"APPOINTMENT" | "CUSTOMER" | "PAYMENT">("APPOINTMENT");
  const [shareLoading, setShareLoading] = useState(false);
  const [shareCustomers, setShareCustomers] = useState<ShareCustomer[]>([]);
  const [shareAppointments, setShareAppointments] = useState<ShareAppointment[]>([]);
  const [sharePayments, setSharePayments] = useState<SharePayment[]>([]);
  const [shareServices, setShareServices] = useState<ShareService[]>([]);
  const [externalShareCard, setExternalShareCard] = useState<ValooRichCardPayload | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const activeIdRef = useRef<string | null>(null);

  const active = useMemo(
    () => conversations.find((conversation) => conversation.id === activeId) ?? null,
    [conversations, activeId],
  );

  const me = useMemo(
    () => people.find((person) => person.id === currentUser?.id) ?? null,
    [people, currentUser?.id],
  );

  const currentConversationMember = useMemo(
    () => conversationMembers.find((member) => member.id === currentUser?.id) ?? null,
    [conversationMembers, currentUser?.id],
  );

  const canPost = !active?.announcementOnly || Boolean(currentConversationMember?.isAdmin);

  const mentionQuery = useMemo(() => {
    const match = messageText.match(/(?:^|\s)@([^\s@]*)$/);
    return match?.[1]?.toLocaleLowerCase("tr-TR") ?? null;
  }, [messageText]);

  const mentionSuggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    return conversationMembers
      .filter((member) => member.id !== currentUser?.id)
      .filter((member) => {
        const full = `${member.firstName} ${member.lastName}`.toLocaleLowerCase("tr-TR");
        return !mentionQuery || full.includes(mentionQuery);
      })
      .slice(0, 6);
  }, [conversationMembers, currentUser?.id, mentionQuery]);

  const loadOverview = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [peopleResult, conversationsResult] = await Promise.all([
        api<Person[]>("/team/people"),
        api<Conversation[]>("/team/conversations"),
      ]);
      setPeople(peopleResult);
      setConversations(conversationsResult);
      setError("");
      if (!activeId && conversationsResult[0]) {
        const requestedId = typeof window !== "undefined" ? window.localStorage.getItem("valoo-team-active-conversation") : null;
        const requestedConversation = requestedId ? conversationsResult.find((conversation) => conversation.id === requestedId) : null;
        setActiveId(requestedConversation?.id ?? conversationsResult[0].id);
        if (requestedConversation && typeof window !== "undefined") window.localStorage.removeItem("valoo-team-active-conversation");
      }
      const current = peopleResult.find((person) => person.id === currentUser?.id);
      if (current) setStatus(current.status);
    } catch (err) {
      if (!silent) setError(err instanceof ApiError ? err.message : "Ekip iletişimi yüklenemedi.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [activeId, currentUser?.id]);

  const loadConversationMembers = useCallback(async (conversationId: string) => {
    try {
      const result = await api<ConversationMember[]>(`/team/conversations/${conversationId}/members`);
      setConversationMembers(result);
    } catch {
      setConversationMembers([]);
    }
  }, []);

  const loadPinnedMessages = useCallback(async (conversationId: string) => {
    try {
      const result = await api<PinnedMessage[]>(`/team/conversations/${conversationId}/pins`);
      setPinnedMessages(result);
    } catch {
      setPinnedMessages([]);
    }
  }, []);

  const loadTyping = useCallback(async (conversationId: string) => {
    try {
      const result = await api<TypingUser[]>(`/team/conversations/${conversationId}/typing`);
      setTypingUsers(result);
    } catch {
      setTypingUsers([]);
    }
  }, []);

  const loadMessages = useCallback(async (conversationId: string, silent = false) => {
    if (!silent) setMessagesLoading(true);
    try {
      const result = await api<Message[]>(`/team/conversations/${conversationId}/messages?limit=150`);
      setMessages(result);
      await api(`/team/conversations/${conversationId}/read`, { method: "POST" });
      setConversations((current) =>
        current.map((item) => item.id === conversationId ? { ...item, unreadCount: 0 } : item),
      );
      window.setTimeout(() => endRef.current?.scrollIntoView({ behavior: silent ? "auto" : "smooth" }), 20);
    } catch (err) {
      if (!silent) setError(err instanceof ApiError ? err.message : "Mesajlar yüklenemedi.");
    } finally {
      if (!silent) setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    const stored = window.localStorage.getItem("valoo-team-pending-rich-card");
    if (!stored) return;
    const card = parseValooRichCard(stored);
    if (!card) {
      window.localStorage.removeItem("valoo-team-pending-rich-card");
      return;
    }
    setExternalShareCard(card);
  }, []);

  useEffect(() => {
    if (typeof Notification === "undefined") {
      setNotificationPermission("unsupported");
      return;
    }
    setNotificationPermission(Notification.permission);
  }, []);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    previewUrlRef.current = preview?.url ?? null;
  }, [preview]);

  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      if (previewUrlRef.current?.startsWith("blob:")) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    void loadMessages(activeId);
    void loadConversationMembers(activeId);
    void loadTyping(activeId);
    void loadPinnedMessages(activeId);
    setReplyTo(null);
    setEditingMessage(null);
    setSearchText("");
    setSearchResults([]);
    setGroupEditing(false);
    setGroupNameDraft("");
  }, [activeId, loadMessages, loadConversationMembers, loadTyping, loadPinnedMessages]);

  useEffect(() => {
    function handleBrowserEvent(raw: Event) {
      const custom = raw as CustomEvent<TeamRealtimeEvent>;
      const event = custom.detail;
      if (!event || event.type === "heartbeat") return;

      const conversationId = event.payload?.conversationId;
      const currentConversationId = activeIdRef.current;

      if (event.type === "typing.updated" && conversationId === currentConversationId) {
        const userId = event.payload?.userId;
        if (!userId || userId === currentUser?.id) return;
        setTypingUsers((current) => {
          const filtered = current.filter((user) => user.id !== userId);
          if (!event.payload?.typing) return filtered;
          return [
            ...filtered,
            {
              id: userId,
              firstName: event.payload?.firstName ?? "",
              lastName: event.payload?.lastName ?? "",
            },
          ];
        });
        return;
      }

      if (event.type === "presence.updated") {
        void loadOverview(true);
        return;
      }

      if (
        event.type === "conversation.created" ||
        event.type === "conversation.updated" ||
        event.type === "conversation.removed"
      ) {
        void loadOverview(true);
        if (conversationId === currentConversationId && currentConversationId) {
          void loadConversationMembers(currentConversationId);
        }
        return;
      }

      if (
        event.type === "message.created" ||
        event.type === "message.updated" ||
        event.type === "message.deleted" ||
        event.type === "reaction.updated" ||
        event.type === "attachment.added" ||
        event.type === "pin.updated" ||
        event.type === "announcement.acknowledged"
      ) {
        void loadOverview(true);
        if (conversationId === currentConversationId && currentConversationId) {
          void loadMessages(currentConversationId, true);
          if (event.type === "pin.updated") void loadPinnedMessages(currentConversationId);
        }

        if (
          event.type === "message.created" &&
          event.payload?.senderUserId &&
          event.payload.senderUserId !== currentUser?.id &&
          typeof Notification !== "undefined" &&
          Notification.permission === "granted"
        ) {
          new Notification(event.payload.senderName ?? "Yeni ekip mesajı", {
            body: event.payload.body ?? "Yeni bir mesajınız var.",
          });
        }
        return;
      }

      if (
        event.type === "mention.created" &&
        event.payload?.senderUserId !== currentUser?.id &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
        new Notification("Bir ekip üyesi sizi etiketledi", {
          body: `${event.payload?.senderName ?? "Ekip üyesi"}: ${event.payload?.body ?? ""}`,
        });
      }
    }

    window.addEventListener("valoo:team-realtime", handleBrowserEvent);
    return () => window.removeEventListener("valoo:team-realtime", handleBrowserEvent);
  }, [
    currentUser?.id,
    loadConversationMembers,
    loadMessages,
    loadOverview,
    loadPinnedMessages,
  ]);

  async function enableNotifications() {
    if (typeof Notification === "undefined") return;
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  }

  async function changeStatus(next: PresenceStatus) {
    setStatus(next);
    try {
      await api("/team/presence", { method: "PATCH", body: { status: next } });
      await loadOverview(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Durum güncellenemedi.");
    }
  }

  function fileKey(file: File) {
    return `${file.name}:${file.size}:${file.lastModified}`;
  }

  async function uploadMessageAttachment(messageId: string, file: File) {
    try {
      const prepared = await api<PreparedAttachment>(`/team/messages/${messageId}/attachments/prepare`, {
        method: "POST",
        body: {
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          byteSize: file.size,
        },
      });

      const uploadStatus = await new Promise<number>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("PUT", prepared.uploadUrl);
        Object.entries(prepared.requiredHeaders).forEach(([key, value]) => request.setRequestHeader(key, value));
        request.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          setUploadProgress((current) => ({ ...current, [fileKey(file)]: Math.round((event.loaded / event.total) * 100) }));
        };
        request.onload = () => resolve(request.status);
        request.onerror = () => reject(new ApiError("Dosya güvenli saklama alanına yüklenemedi.", request.status || 0));
        request.send(file);
      });
      if (uploadStatus < 200 || uploadStatus >= 300) {
        throw new ApiError("Dosya güvenli saklama alanına yüklenemedi.", uploadStatus);
      }
      setUploadProgress((current) => ({ ...current, [fileKey(file)]: 100 }));

      await api(`/team/messages/${messageId}/attachments/complete`, {
        method: "POST",
        body: { objectKey: prepared.objectKey, filename: file.name },
      });
      return;
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 503) throw err;
    }

    const formData = new FormData();
    formData.append("file", file);
    await apiFormData(`/team/messages/${messageId}/attachments`, formData);
  }

  function appendSelectedFiles(files: File[]) {
    if (!files.length) return;
    const allowed = new Set([
      "image/jpeg", "image/png", "image/webp",
      "audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4",
      "video/mp4", "video/webm", "video/quicktime",
      "application/pdf", "text/plain", "text/csv",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ]);
    const accepted = files.filter((file) => allowed.has(file.type) && file.size > 0 && file.size <= 50 * 1024 * 1024);
    if (accepted.length !== files.length) {
      setError("Bazı dosyalar desteklenmiyor veya 50 MB sınırını aşıyor.");
    }
    setSelectedFiles((current) => [...current, ...accepted].slice(0, 10));
  }

  function attachmentPlaceholder(files: File[]) {
    if (files.length > 1) return `${files.length} ek`;
    const file = files[0];
    if (!file) return "Mesaj";
    if (file.type.startsWith("image/")) return "Fotoğraf";
    if (file.type.startsWith("video/")) return "Video";
    if (file.type.startsWith("audio/")) return "Sesli mesaj";
    return file.name || "Dosya";
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!activeId || !canPost || (!messageText.trim() && !selectedFiles.length) || sending) return;
    if (editingMessage) {
      await saveEditedMessage();
      return;
    }
    const body = messageText.trim() || attachmentPlaceholder(selectedFiles);
    const filesToSend = [...selectedFiles];
    setUploadProgress(Object.fromEntries(filesToSend.map((file) => [fileKey(file), 0])));
    setPendingMessage({ id: `pending-${Date.now()}`, body, attachmentNames: filesToSend.map((file) => file.name) });
    setSending(true);
    setMessageText("");
    try {
      const created = await api<{ id: string }>(`/team/conversations/${activeId}/messages`, {
        method: "POST",
        body: { body, ...(replyTo ? { replyToMessageId: replyTo.id } : {}) },
      });
      for (const file of filesToSend) {
        await uploadMessageAttachment(created.id, file);
      }
      setReplyTo(null);
      setSelectedFiles([]);
      setUploadProgress({});
      setPendingMessage(null);
      await Promise.all([loadMessages(activeId, true), loadOverview(true)]);
    } catch (err) {
      setMessageText(messageText || (filesToSend.length ? "" : body));
      setSelectedFiles(filesToSend);
      setPendingMessage(null);
      setError(err instanceof ApiError ? err.message : "Mesaj gönderilemedi.");
    } finally {
      setSending(false);
    }
  }

  function signalTyping(value: string) {
    setMessageText(value);
    if (!activeId) return;
    void api(`/team/conversations/${activeId}/typing`, { method: "POST", body: { typing: true } }).catch(() => undefined);
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => {
      void api(`/team/conversations/${activeId}/typing`, { method: "POST", body: { typing: false } }).catch(() => undefined);
    }, 1800);
  }

  async function startVoiceRecording() {
    if (!canPost || recording) return;
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Bu tarayıcı ses kaydını desteklemiyor.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredTypes = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"];
      const mimeType = preferredTypes.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recordedChunksRef.current = [];
      setRecordingSeconds(0);
      setRecording(true);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const recorderType = recorder.mimeType || "audio/webm";
        const type = recorderType.startsWith("audio/mp4")
          ? "audio/mp4"
          : recorderType.startsWith("audio/ogg")
            ? "audio/ogg"
            : recorderType.startsWith("audio/mpeg")
              ? "audio/mpeg"
              : "audio/webm";
        const extension = type === "audio/mp4" ? "m4a" : type === "audio/ogg" ? "ogg" : type === "audio/mpeg" ? "mp3" : "webm";
        const blob = new Blob(recordedChunksRef.current, { type });
        if (blob.size > 0) {
          appendSelectedFiles([new File([blob], `sesli-mesaj-${Date.now()}.${extension}`, { type })]);
        }
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        recordedChunksRef.current = [];
        if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
        setRecording(false);
      };

      recorder.start(250);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((seconds) => {
          const next = seconds + 1;
          if (next >= 120) {
            const activeRecorder = mediaRecorderRef.current;
            if (activeRecorder && activeRecorder.state !== "inactive") activeRecorder.stop();
          }
          return next;
        });
      }, 1000);
    } catch {
      setError("Mikrofona erişilemedi. Tarayıcı mikrofon iznini kontrol edin.");
    }
  }

  function stopVoiceRecording() {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }

  async function togglePin(messageId: string) {
    try {
      await api(`/team/messages/${messageId}/pin`, { method: "POST" });
      if (activeId) await Promise.all([loadMessages(activeId, true), loadPinnedMessages(activeId)]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Mesaj sabitlenemedi.");
    }
  }

  async function openAttachment(attachment: Attachment) {
    try {
      const access = await api<AttachmentAccess>(`/team/attachments/${attachment.id}/access`);
      if (access.mode === "object") {
        if (attachment.mimeType.startsWith("image/") || attachment.mimeType.startsWith("audio/") || attachment.mimeType.startsWith("video/") || attachment.mimeType === "application/pdf") {
          setPreview((current) => {
            if (current?.url.startsWith("blob:")) URL.revokeObjectURL(current.url);
            return { url: access.url, mimeType: attachment.mimeType, name: attachment.originalName };
          });
          return;
        }
        window.open(access.url, "_blank", "noopener,noreferrer");
        return;
      }

      const response = await apiResponse(`/team/attachments/${attachment.id}`);
      if (!response.ok) throw new ApiError("Dosya açılamadı.", response.status);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      if (attachment.mimeType.startsWith("image/") || attachment.mimeType.startsWith("audio/") || attachment.mimeType.startsWith("video/") || attachment.mimeType === "application/pdf") {
        setPreview((current) => {
          if (current?.url.startsWith("blob:")) URL.revokeObjectURL(current.url);
          return { url, mimeType: attachment.mimeType, name: attachment.originalName };
        });
        return;
      }

      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Dosya açılamadı.");
    }
  }

  async function sendExternalRichCard(destinationConversationId: string) {
    if (!externalShareCard || sending) return;
    setSending(true);
    try {
      await api(`/team/conversations/${destinationConversationId}/messages`, {
        method: "POST",
        body: { body: encodeValooRichCard(externalShareCard) },
      });
      window.localStorage.removeItem("valoo-team-pending-rich-card");
      setExternalShareCard(null);
      setActiveId(destinationConversationId);
      await Promise.all([loadOverview(true), loadMessages(destinationConversationId, true)]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "VALOO kaydı paylaşılamadı.");
    } finally {
      setSending(false);
    }
  }

  async function openValooShare() {
    setShareOpen(true);
    if (shareCustomers.length || shareAppointments.length || sharePayments.length) return;
    setShareLoading(true);
    try {
      const [customersResult, appointmentsResult, paymentsResult, servicesResult] = await Promise.all([
        api<PaginatedResult<ShareCustomer>>("/customers?page=1&limit=50"),
        api<PaginatedResult<ShareAppointment>>("/appointments?page=1&limit=50"),
        api<PaginatedResult<SharePayment>>("/payments?page=1&limit=50"),
        api<PaginatedResult<ShareService>>("/services?page=1&limit=100"),
      ]);
      setShareCustomers(customersResult.data);
      setShareAppointments(appointmentsResult.data);
      setSharePayments(paymentsResult.data);
      setShareServices(servicesResult.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "VALOO kayıtları yüklenemedi.");
    } finally {
      setShareLoading(false);
    }
  }

  async function sendRichCard(payload: ValooRichCardPayload) {
    if (!activeId || !canPost || sending) return;
    setSending(true);
    try {
      await api(`/team/conversations/${activeId}/messages`, {
        method: "POST",
        body: { body: encodeValooRichCard(payload) },
      });
      setShareOpen(false);
      await Promise.all([loadMessages(activeId, true), loadOverview(true)]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "VALOO kaydı paylaşılamadı.");
    } finally {
      setSending(false);
    }
  }

  async function forwardMessageTo(destinationConversationId: string) {
    if (!forwardingMessage || forwarding) return;
    setForwarding(true);
    try {
      await api(`/team/messages/${forwardingMessage.id}/forward`, {
        method: "POST",
        body: { destinationConversationId },
      });
      setForwardingMessage(null);
      await loadOverview(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Mesaj iletilemedi.");
    } finally {
      setForwarding(false);
    }
  }

  async function showMessageInfo(message: Message) {
    setMessageInfo(message);
    try {
      const readers = await api<MessageReader[]>(`/team/messages/${message.id}/readers`);
      setMessageReaders(readers);
    } catch (err) {
      setMessageReaders([]);
      setError(err instanceof ApiError ? err.message : "Mesaj bilgisi yüklenemedi.");
    }
  }

  async function showAnnouncementReaders(message: Message) {
    try {
      const readers = await api<AnnouncementReader[]>(`/team/messages/${message.id}/acknowledgements`);
      setReaderList(readers);
      setReaderModalTitle(message.body.slice(0, 80) || "Duyuru");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Okuyanlar listesi yüklenemedi.");
    }
  }

  async function acknowledgeAnnouncement(messageId: string) {
    try {
      await api(`/team/messages/${messageId}/acknowledge`, { method: "POST" });
      if (activeId) await loadMessages(activeId, true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Duyuru onaylanamadı.");
    }
  }

  async function toggleReaction(messageId: string, emoji: string) {
    try {
      await api(`/team/messages/${messageId}/reactions`, { method: "POST", body: { emoji } });
      if (activeId) await loadMessages(activeId, true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Tepki güncellenemedi.");
    }
  }

  async function removeMessage(messageId: string) {
    try {
      await api(`/team/messages/${messageId}`, { method: "DELETE" });
      if (activeId) await Promise.all([loadMessages(activeId, true), loadOverview(true)]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Mesaj silinemedi.");
    }
  }

  async function saveEditedMessage() {
    if (!editingMessage || !messageText.trim()) return;
    try {
      await api(`/team/messages/${editingMessage.id}`, { method: "PATCH", body: { body: messageText.trim() } });
      setEditingMessage(null);
      setMessageText("");
      if (activeId) await loadMessages(activeId, true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Mesaj düzenlenemedi.");
    }
  }

  function startEditing(message: Message) {
    setEditingMessage(message);
    setReplyTo(null);
    setMessageText(message.body);
  }

  async function searchMessages(value: string) {
    setSearchText(value);
    if (!activeId || !value.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const result = await api<SearchResult[]>(`/team/conversations/${activeId}/search?q=${encodeURIComponent(value.trim())}`);
      setSearchResults(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Mesaj araması yapılamadı.");
    } finally {
      setSearching(false);
    }
  }

  async function renameActiveGroup() {
    if (!activeId || active?.type === "DIRECT" || !groupNameDraft.trim()) return;
    try {
      await api(`/team/conversations/${activeId}`, { method: "PATCH", body: { name: groupNameDraft.trim() } });
      setGroupEditing(false);
      await loadOverview(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : active?.type === "CHANNEL" ? "Kanal adı güncellenemedi." : "Grup adı güncellenemedi.");
    }
  }

  async function addMember(userId: string) {
    if (!activeId) return;
    try {
      await api(`/team/conversations/${activeId}/members`, { method: "POST", body: { userId } });
      await Promise.all([loadConversationMembers(activeId), loadOverview(true)]);
      setMemberPickerOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Üye eklenemedi.");
    }
  }

  async function setConversationAdmin(userId: string, isAdmin: boolean) {
    if (!activeId) return;
    try {
      await api(`/team/conversations/${activeId}/admin`, {
        method: "PATCH",
        body: { userId, isAdmin },
      });
      await loadConversationMembers(activeId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Yönetici yetkisi güncellenemedi.");
    }
  }

  async function removeMember(userId: string) {
    if (!activeId) return;
    try {
      await api(`/team/conversations/${activeId}/members/${userId}`, { method: "DELETE" });
      await Promise.all([loadConversationMembers(activeId), loadOverview(true)]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Üye çıkarılamadı.");
    }
  }

  function insertMention(member: ConversationMember) {
    const display = `@${member.firstName}`;
    setMessageText((current) => current.replace(/(?:^|\s)@([^\s@]*)$/, (match) => {
      const prefix = match.startsWith(" ") ? " " : "";
      return `${prefix}${display} `;
    }));
  }

  function toggleUser(userId: string) {
    setSelectedUsers((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    );
  }

  async function createConversation(event: FormEvent) {
    event.preventDefault();
    const required = composeType === "DIRECT" ? 1 : composeType === "GROUP" ? 2 : 0;
    if (selectedUsers.length < required) {
      setError(composeType === "DIRECT" ? "Bir ekip üyesi seçin." : "Grup için en az iki ekip üyesi seçin.");
      return;
    }
    if (composeType === "DIRECT" && selectedUsers.length > 1) {
      setError("Birebir konuşma için yalnızca bir kişi seçin.");
      return;
    }
    if ((composeType === "GROUP" || composeType === "CHANNEL") && !groupName.trim()) {
      setError(composeType === "CHANNEL" ? "Kanal adını yazın." : "Grup adını yazın.");
      return;
    }

    try {
      const result = await api<{ id: string }>("/team/conversations", {
        method: "POST",
        body: {
          type: composeType,
          memberUserIds: selectedUsers,
          ...(composeType !== "DIRECT" ? { name: groupName.trim() } : {}),
          ...(composeType === "CHANNEL" ? { announcementOnly } : {}),
        },
      });
      setComposeOpen(false);
      setSelectedUsers([]);
      setGroupName("");
      setAnnouncementOnly(false);
      await loadOverview(true);
      setActiveId(result.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Konuşma oluşturulamadı.");
    }
  }

  const selectablePeople = people.filter((person) => person.id !== currentUser?.id);

  if (loading) {
    return <Spinner label="Ekip iletişimi hazırlanıyor..." />;
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 pb-8">
      <PageHeader
        title="Mesajlar ve Ekip Durumu"
        description="Ekip içi konuşmalar, kanallar, duyurular ve anlık müsaitlik bilgilerini tek ekrandan yönetin."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {notificationPermission === "default" ? (
              <Button variant="secondary" size="sm" onClick={() => void enableNotifications()}>
                Bildirimleri Aç
              </Button>
            ) : null}
            <div className="min-w-[170px]">
              <ValooSelect
                value={status}
                onChange={(value) => void changeStatus(value as PresenceStatus)}
                ariaLabel="Ekip durumu"
                searchable={false}
                options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
              />
            </div>
            <Button size="sm" onClick={() => setComposeOpen(true)}>
              Yeni konuşma
            </Button>
          </div>
        }
      />

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid min-h-[680px] overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)] shadow-[0_10px_30px_rgba(17,70,104,.045)] xl:grid-cols-[320px_minmax(0,1fr)_300px]">
        <aside className="border-b border-[var(--line)] xl:border-b-0 xl:border-r">
          <div className="border-b border-[var(--line)] bg-[var(--surface-2)]/35 px-4 py-4">
            <p className="text-[13px] font-semibold text-[var(--ink)]">Konuşmalar</p>
            <p className="mt-1 text-[11px] text-[var(--muted)]">{conversations.length} aktif konuşma</p>
          </div>
          <div className="max-h-[610px] overflow-y-auto p-2">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => setActiveId(conversation.id)}
                className={`mb-1 flex w-full items-start gap-3 rounded-[14px] border p-3 text-left transition ${activeId === conversation.id ? "border-[rgba(22,116,189,.16)] bg-[var(--accent-soft)] shadow-[0_3px_12px_rgba(17,70,104,.05)]" : "border-transparent hover:border-[var(--line)] hover:bg-[var(--surface-2)]"}`}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-[var(--accent-soft)] text-[11px] font-semibold text-[var(--accent)]">
                  {conversation.type === "CHANNEL" ? (conversation.announcementOnly ? "DU" : "#") : conversation.type === "GROUP" ? "GR" : conversation.displayName.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[12px] font-semibold text-[var(--ink)]">{conversation.displayName}</p>
                    {conversation.unreadCount > 0 ? (
                      <span className="ml-auto min-w-5 rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-center text-[9px] font-semibold text-white shadow-[0_3px_8px_rgba(22,116,189,.16)]">
                        {conversation.unreadCount}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 truncate text-[10px] text-[var(--muted)]">
                    {conversation.lastMessage ? `${conversation.lastMessage.senderName}: ${messagePreview(conversation.lastMessage.body)}` : "Henüz mesaj yok"}
                  </p>
                </div>
              </button>
            ))}
            {!conversations.length ? (
              <div className="px-4 py-12 text-center text-[12px] text-[var(--muted)]">Henüz konuşma yok. Yeni bir konuşma başlatın.</div>
            ) : null}
          </div>
        </aside>

        <main className="flex min-h-[620px] min-w-0 flex-col">
          {active ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] bg-white/90 px-5 py-4 backdrop-blur-xl">
                <div>
                  <h2 className="text-[14px] font-semibold text-[var(--ink)]">{active.displayName}</h2>
                  <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                    {active.type === "CHANNEL" ? `${active.memberCount} üye · ${active.announcementOnly ? "Duyuru kanalı" : "Kanal"}` : active.type === "GROUP" ? `${active.memberCount} üye · Grup konuşması` : "Birebir konuşma"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <SearchField
                      value={searchText}
                      onChange={(event) => void searchMessages(event.target.value)}
                      placeholder="Mesaj ara..."
                      aria-label="Mesaj ara"
                      className="w-[220px]"
                    />
                    {searchText ? (
                      <div className="absolute right-0 top-11 z-20 w-[320px] overflow-hidden rounded-[16px] border border-[var(--line)] bg-white shadow-[0_18px_60px_rgba(27,24,39,.14)]">
                        <div className="border-b border-[var(--line)] px-3 py-2 text-[9px] font-semibold uppercase tracking-[.08em] text-[var(--muted)]">
                          {searching ? "Aranıyor..." : `${searchResults.length} sonuç`}
                        </div>
                        <div className="max-h-[280px] overflow-y-auto p-2">
                          {searchResults.map((result) => (
                            <button
                              key={result.id}
                              type="button"
                              onClick={() => setSearchText("")}
                              className="w-full rounded-[11px] px-3 py-2 text-left hover:bg-[var(--surface-2)]"
                            >
                              <p className="text-[9px] font-semibold text-[var(--accent)]">{result.senderName} · {timeLabel(result.createdAt)}</p>
                              <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-[var(--ink)]">{messagePreview(result.body)}</p>
                            </button>
                          ))}
                          {!searching && !searchResults.length ? <p className="px-3 py-6 text-center text-[10px] text-[var(--muted)]">Eşleşen mesaj yok.</p> : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <span className="rounded-full border border-[rgba(22,116,189,.12)] bg-[var(--accent-soft)] px-3 py-1.5 text-[10px] font-semibold text-[var(--accent)]">
                    {active.type === "CHANNEL" ? (active.announcementOnly ? "Duyuru" : "Kanal") : active.type === "GROUP" ? "Grup" : "Direkt"}
                  </span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto bg-[linear-gradient(180deg,var(--surface-2)_0%,#fff_100%)] px-5 py-5">
                {messagesLoading ? (
                  <div className="py-12 text-center text-[12px] text-[var(--muted)]">Mesajlar yükleniyor...</div>
                ) : messages.length ? (
                  <div className="space-y-3">
                    {messages.map((message) => {
                      const mine = message.senderUserId === currentUser?.id;
                      return (
                        <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                          <div className={`group/message max-w-[76%] rounded-[18px] px-4 py-3 shadow-[0_3px_12px_rgba(17,70,104,.04)] ${mine ? "bg-[linear-gradient(135deg,var(--brand-gradient-start),var(--accent),var(--brand-gradient-end))] text-white" : "border border-[var(--line)] bg-white text-[var(--ink)]"}`}>
                            {!mine ? <p className="mb-1 text-[9px] font-semibold text-[var(--accent)]">{message.senderName}</p> : null}
                            {message.replyToMessageId ? <p className={`mb-2 rounded-[9px] border-l-2 px-2 py-1 text-[9px] ${mine ? "border-white/40 bg-white/5 text-white/65" : "border-[var(--accent)] bg-[var(--accent-soft)]/45 text-[var(--muted)]"}`}>Bir mesaja yanıt</p> : null}
                            {parseValooRichCard(message.body) ? (
                              <TeamRichCard payload={parseValooRichCard(message.body)!} mine={mine} />
                            ) : !(message.attachments?.length && ["Fotoğraf", "Video", "Sesli mesaj"].includes(message.body)) ? (
                              <p className="whitespace-pre-wrap break-words text-[12px] leading-5">{message.body}</p>
                            ) : null}
                            {message.attachments?.length ? (
                              <div className="mt-2 grid gap-1.5">
                                {message.attachments.map((attachment) => (
                                  <TeamMessageAttachment
                                    key={attachment.id}
                                    attachment={attachment}
                                    mine={mine}
                                    onOpen={(item) => void openAttachment(item)}
                                  />
                                ))}
                              </div>
                            ) : null}
                            <div className="mt-2 flex flex-wrap items-center gap-1">
                              {(message.reactions ?? []).map((reaction) => (
                                <button key={reaction.emoji} type="button" onClick={() => void toggleReaction(message.id, reaction.emoji)} className={`rounded-full px-2 py-0.5 text-[10px] ${reaction.reactedByMe ? "bg-[var(--accent-soft)] text-[var(--accent)]" : mine ? "bg-white/10 text-white/80" : "bg-[var(--surface-2)] text-[var(--muted)]"}`}>
                                  {reaction.emoji} {reaction.count}
                                </button>
                              ))}
                            </div>
                            {active?.announcementOnly ? (
                              <div className="mt-2 flex items-center justify-between gap-2 rounded-[10px] border border-amber-200/70 bg-amber-50/70 px-2.5 py-2">
                                {currentConversationMember?.isAdmin ? (
                                  <button type="button" onClick={() => void showAnnouncementReaders(message)} className="text-[9px] font-semibold text-amber-800 underline-offset-2 hover:underline">
                                    {message.acknowledgedCount} kişi okudu
                                  </button>
                                ) : (
                                  <span className="text-[9px] font-medium text-amber-800">{message.acknowledgedCount} kişi okudu</span>
                                )}
                                {!mine ? (
                                  <button
                                    type="button"
                                    onClick={() => void acknowledgeAnnouncement(message.id)}
                                    className={`rounded-[8px] px-2.5 py-1 text-[9px] font-semibold ${message.acknowledgedByMe ? "bg-emerald-100 text-emerald-700" : "bg-amber-200 text-amber-900"}`}
                                  >
                                    {message.acknowledgedByMe ? "Okudum" : "Okudum olarak işaretle"}
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                            <div className="mt-1.5 flex items-center justify-end gap-2">
                              {mine ? <span className="text-[9px] text-white/55">{message.readByCount > 0 ? `Okundu · ${message.readByCount}` : "Gönderildi"}</span> : null}
                              {message.editedAt ? <span className={`text-[9px] ${mine ? "text-white/45" : "text-[var(--muted-soft)]"}`}>düzenlendi</span> : null}
                              <span className={`text-[9px] ${mine ? "text-white/60" : "text-[var(--muted-soft)]"}`}>{timeLabel(message.createdAt)}</span>
                            </div>
                            <div className={`mt-2 flex flex-wrap gap-1 border-t pt-2 ${mine ? "border-white/10" : "border-[var(--line)]"}`}>
                              <button type="button" onClick={() => setReplyTo(message)} className={`text-[9px] font-semibold ${mine ? "text-white/65" : "text-[var(--muted)]"}`}>Yanıtla</button>
                              <button type="button" onClick={() => void showMessageInfo(message)} className={`text-[9px] font-semibold ${mine ? "text-white/65" : "text-[var(--muted)]"}`}>Bilgi</button>
                              <button type="button" onClick={() => setForwardingMessage(message)} className={`text-[9px] font-semibold ${mine ? "text-white/65" : "text-[var(--muted)]"}`}>İlet</button>
                              <button type="button" onClick={() => void togglePin(message.id)} className={`text-[9px] font-semibold ${mine ? "text-white/65" : "text-[var(--muted)]"}`}>{message.isPinned ? "Sabiti kaldır" : "Sabitle"}</button>
                              {["👍","❤️","👏"].map((emoji) => <button key={emoji} type="button" onClick={() => void toggleReaction(message.id, emoji)} className="text-[11px]">{emoji}</button>)}
                              {mine ? <button type="button" onClick={() => startEditing(message)} className="ml-1 text-[9px] font-semibold text-white/65">Düzenle</button> : null}
                              {mine ? <button type="button" onClick={() => void removeMessage(message.id)} className="text-[9px] font-semibold text-rose-300">Sil</button> : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {pendingMessage ? (
                      <div className="flex justify-end">
                        <div className="max-w-[76%] rounded-[18px] bg-[linear-gradient(135deg,var(--brand-gradient-start),var(--accent),var(--brand-gradient-end))] px-4 py-3 text-white opacity-80 shadow-[0_3px_12px_rgba(17,70,104,.04)]">
                          <p className="whitespace-pre-wrap break-words text-[12px] leading-5">{pendingMessage.body}</p>
                          {pendingMessage.attachmentNames.length ? (
                            <div className="mt-2 space-y-1">
                              {pendingMessage.attachmentNames.map((name) => <p key={name} className="truncate rounded-[9px] bg-white/10 px-2 py-1 text-[8px] text-white/70">{name}</p>)}
                            </div>
                          ) : null}
                          <div className="mt-2 flex items-center justify-end gap-2 text-[9px] text-white/60">
                            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-white/70" />
                            Gönderiliyor…
                          </div>
                        </div>
                      </div>
                    ) : null}
                    <div ref={endRef} />
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-center">
                    <div>
                      <p className="text-[14px] font-semibold text-[var(--ink)]">Konuşmayı başlatın</p>
                      <p className="mt-1 text-[11px] text-[var(--muted)]">İlk mesajı göndererek ekip iletişimini başlatabilirsiniz.</p>
                    </div>
                  </div>
                )}
              </div>

              <form
                onSubmit={sendMessage}
                onDragOver={(event) => {
                  if (!canPost) return;
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  if (!canPost) return;
                  event.preventDefault();
                  appendSelectedFiles(Array.from(event.dataTransfer.files));
                }}
                className="border-t border-[var(--line)] bg-white/95 p-4 backdrop-blur-xl"
              >
                {!canPost ? (
                  <div className="mb-3 rounded-[12px] border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-medium text-amber-800">
                    Bu duyuru kanalında yalnızca yöneticiler mesaj paylaşabilir.
                  </div>
                ) : null}
                {typingUsers.length ? (
                  <p className="mb-2 px-1 text-[10px] font-medium text-[var(--accent)]">
                    {typingUsers.map((user) => user.firstName).join(", ")} yazıyor...
                  </p>
                ) : null}
                {replyTo || editingMessage ? (
                  <div className="mb-2 flex items-start justify-between rounded-[12px] border border-[rgba(22,116,189,.14)] bg-[var(--accent-soft)]/45 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-[9px] font-semibold uppercase tracking-[.08em] text-[var(--accent)]">{editingMessage ? "Mesaj düzenleniyor" : `${replyTo?.senderName ?? ""} kişisine yanıt`}</p>
                      <p className="mt-1 truncate text-[10px] text-[var(--muted)]">{editingMessage?.body ?? replyTo?.body}</p>
                    </div>
                    <button type="button" onClick={() => { setReplyTo(null); setEditingMessage(null); setMessageText(""); }} className="ml-3 text-[11px] font-semibold text-[var(--muted)]">×</button>
                  </div>
                ) : null}
                <div className="relative flex items-end gap-2 rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)]/70 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,.75)] focus-within:border-[rgba(22,116,189,.22)] focus-within:bg-white focus-within:ring-4 focus-within:ring-[var(--accent-soft)]">
                  <textarea
                    value={messageText}
                    disabled={!canPost}
                    onChange={(event) => signalTyping(event.target.value)}
                    onPaste={(event) => {
                      const files = Array.from(event.clipboardData.files);
                      if (files.length) {
                        event.preventDefault();
                        appendSelectedFiles(files);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    placeholder={editingMessage ? "Mesajı düzenleyin..." : replyTo ? "Yanıtınızı yazın..." : "Mesajınızı yazın..."}
                    className="min-h-[44px] max-h-32 flex-1 resize-none bg-transparent px-2 py-2 text-[12px] text-[var(--ink)] outline-none placeholder:text-[var(--muted-soft)]"
                  />
                  {mentionSuggestions.length ? (
                    <div className="absolute bottom-[58px] left-4 z-20 w-[260px] overflow-hidden rounded-[14px] border border-[var(--line)] bg-white shadow-[0_16px_50px_rgba(27,24,39,.15)]">
                      <p className="border-b border-[var(--line)] px-3 py-2 text-[9px] font-semibold uppercase tracking-[.08em] text-[var(--muted)]">Ekip üyesi etiketle</p>
                      <div className="p-1.5">
                        {mentionSuggestions.map((member) => (
                          <button key={member.id} type="button" onClick={() => insertMention(member)} className="flex w-full items-center gap-2 rounded-[10px] px-2 py-2 text-left hover:bg-[var(--surface-2)]">
                            <div className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-[var(--accent-soft)] text-[8px] font-semibold text-[var(--accent)]">{initials(member.firstName, member.lastName)}</div>
                            <div className="min-w-0">
                              <p className="truncate text-[10px] font-semibold text-[var(--ink)]">{member.firstName} {member.lastName}</p>
                              <p className="truncate text-[8px] text-[var(--muted)]">{member.roleName}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    disabled={!canPost}
                    onClick={() => void (recording ? stopVoiceRecording() : startVoiceRecording())}
                    className={`h-10 rounded-[12px] border px-3 text-[10px] font-semibold transition ${recording ? "border-[rgba(196,81,103,.18)] bg-[var(--danger-soft)] text-[var(--danger)]" : "border-[var(--line)] bg-white text-[var(--muted)] hover:border-[var(--line-strong)] hover:text-[var(--accent)]"} disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {recording ? `Kaydı bitir · ${recordingSeconds}s` : "Ses kaydet"}
                  </button>
                  <button
                    type="button"
                    disabled={!canPost}
                    onClick={() => void openValooShare()}
                    className="flex h-10 items-center rounded-[12px] border border-[var(--line)] bg-white px-3 text-[10px] font-semibold text-[var(--accent)] transition hover:border-[var(--line-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    VALOO
                  </button>
                  <label className={`flex h-10 items-center rounded-[12px] border border-[var(--line)] bg-white px-3 text-[10px] font-semibold text-[var(--muted)] transition ${canPost ? "cursor-pointer hover:border-[var(--line-strong)] hover:text-[var(--accent)]" : "cursor-not-allowed opacity-50"}`}>
                    {selectedFiles.length ? `${selectedFiles.length} ek hazır` : "＋ Ekle"}
                    <input
                      type="file"
                      multiple
                      disabled={!canPost}
                      accept="image/jpeg,image/png,image/webp,audio/webm,audio/ogg,audio/mpeg,audio/mp4,video/mp4,video/webm,video/quicktime,application/pdf,text/plain,text/csv,.docx,.xlsx"
                      className="hidden"
                      onChange={(event) => {
                        appendSelectedFiles(Array.from(event.target.files ?? []));
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={!canPost || sending || (!messageText.trim() && !selectedFiles.length)}
                    className="h-10 rounded-[12px] border border-[var(--accent)] bg-[linear-gradient(135deg,var(--brand-gradient-start),var(--accent),var(--brand-gradient-end))] px-4 text-[11px] font-semibold text-white shadow-[0_7px_18px_rgba(22,116,189,.17)] transition hover:shadow-[0_9px_24px_rgba(22,116,189,.22)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {sending ? "Gönderiliyor..." : "Gönder"}
                  </button>
                </div>
                {selectedFiles.length ? (
                  <div className="mt-2 grid gap-1.5 rounded-[12px] bg-[var(--accent-soft)]/35 p-2">
                    {selectedFiles.map((file, index) => (
                      <div key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between gap-3 rounded-[9px] bg-white/70 px-3 py-2 text-[9px] text-[var(--muted)]">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{file.name} · {Math.max(1, Math.round(file.size / 1024))} KB</span>
                          {sending ? (
                            <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[var(--line)]">
                              <span className="block h-full rounded-full bg-[var(--accent)] transition-[width]" style={{ width: `${uploadProgress[fileKey(file)] ?? 0}%` }} />
                            </span>
                          ) : null}
                        </span>
                        <span className="shrink-0 text-[8px] font-semibold text-[var(--muted)]">{sending ? `${uploadProgress[fileKey(file)] ?? 0}%` : ""}</span>
                        <button type="button" disabled={sending} onClick={() => setSelectedFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="shrink-0 font-semibold text-rose-600 disabled:opacity-40">Kaldır</button>
                      </div>
                    ))}
                  </div>
                ) : null}
                <p className="mt-2 px-1 text-[9px] text-[var(--muted-soft)]">Enter gönderir · Shift + Enter yeni satır · Sürükle-bırak / yapıştır desteklenir · En fazla 10 ek, dosya başına 50 MB</p>
              </form>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-center">
              <div>
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[18px] bg-[var(--accent-soft)] text-[18px] font-semibold text-[var(--accent)]">E</div>
                <p className="mt-4 text-[15px] font-semibold text-[var(--ink)]">Ekip iletişimine hoş geldiniz</p>
                <p className="mx-auto mt-1 max-w-sm text-[11px] leading-5 text-[var(--muted)]">Bir ekip üyesiyle birebir konuşun veya bir grup oluşturarak departman iletişimini tek yerde yönetin.</p>
              </div>
            </div>
          )}
        </main>

        <aside className="border-t border-[var(--line)] xl:border-l xl:border-t-0">
          {active && pinnedMessages.length ? (
            <div className="border-b border-[var(--line)]">
              <div className="px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-[var(--muted)]">Sabitlenen Mesajlar</p>
                <p className="mt-1 text-[10px] text-[var(--muted-soft)]">{pinnedMessages.length} mesaj</p>
              </div>
              <div className="max-h-[180px] overflow-y-auto px-2 pb-3">
                {pinnedMessages.map((pinned) => (
                  <div key={pinned.id} className="rounded-[12px] border border-transparent px-2.5 py-2.5 transition hover:border-[var(--line)] hover:bg-[var(--surface-2)]">
                    <p className="text-[8px] font-semibold text-[var(--accent)]">{pinned.senderName}</p>
                    <p className="mt-1 line-clamp-2 text-[9px] leading-4 text-[var(--ink)]">{messagePreview(pinned.body)}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {active?.type === "GROUP" || active?.type === "CHANNEL" ? (
            <div className="border-b border-[var(--line)]">
              <div className="space-y-3 px-4 py-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-[var(--muted)]">{active.type === "CHANNEL" ? "Kanal Yönetimi" : "Grup Yönetimi"}</p>
                    <p className="mt-1 text-[10px] text-[var(--muted-soft)]">{conversationMembers.length} kişi</p>
                  </div>
                  {currentConversationMember?.isAdmin ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setMemberPickerOpen((value) => !value)}>+ Üye</Button>
                  ) : null}
                </div>

                {currentConversationMember?.isAdmin ? (
                  <div className="flex gap-2">
                    <input
                      value={groupEditing ? groupNameDraft : active.displayName}
                      onFocus={() => { setGroupEditing(true); setGroupNameDraft(active.displayName); }}
                      onChange={(event) => { setGroupEditing(true); setGroupNameDraft(event.target.value); }}
                      className="control h-10 min-w-0 flex-1 text-[11px]"
                    />
                    {groupEditing ? <Button type="button" size="sm" onClick={() => void renameActiveGroup()}>Kaydet</Button> : null}
                  </div>
                ) : null}

                {memberPickerOpen ? (
                  <div className="rounded-[12px] border border-[var(--line)] bg-[var(--surface-2)]/55 p-2">
                    <p className="mb-1 px-1 text-[9px] font-semibold text-[var(--muted)]">{active.type === "CHANNEL" ? "Kanala eklenebilecek kişiler" : "Gruba eklenebilecek kişiler"}</p>
                    <div className="max-h-[150px] overflow-y-auto">
                      {selectablePeople.filter((person) => !conversationMembers.some((member) => member.id === person.id)).map((person) => (
                        <button key={person.id} type="button" onClick={() => void addMember(person.id)} className="flex w-full items-center gap-2 rounded-[9px] px-2 py-2 text-left hover:bg-white">
                          <PersonAvatar person={person} size="sm" />
                          <span className="truncate text-[9px] font-semibold text-[var(--ink)]">{person.firstName} {person.lastName}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="max-h-[240px] overflow-y-auto px-2 pb-3">
                {conversationMembers.map((member) => (
                  <div key={member.id} className="flex items-center gap-3 rounded-[12px] px-2 py-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[var(--accent-soft)] text-[9px] font-semibold text-[var(--accent)]">{initials(member.firstName, member.lastName)}</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[10px] font-semibold text-[var(--ink)]">{member.firstName} {member.lastName}</p>
                      <p className="truncate text-[9px] text-[var(--muted)]">{member.isAdmin ? (active.type === "CHANNEL" ? "Kanal yöneticisi" : "Grup yöneticisi") : member.roleName}</p>
                    </div>
                    {currentConversationMember?.isAdmin && member.id !== currentUser?.id ? (
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => void setConversationAdmin(member.id, !member.isAdmin)} className="rounded-[8px] px-2 py-1 text-[8px] font-semibold text-[var(--accent)] transition hover:bg-[var(--accent-soft)]">
                          {member.isAdmin ? "Yöneticiliği kaldır" : "Yönetici yap"}
                        </button>
                        {!member.isAdmin ? <button type="button" onClick={() => void removeMember(member.id)} className="rounded-[8px] px-2 py-1 text-[8px] font-semibold text-rose-600 hover:bg-rose-50">Çıkar</button> : null}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {active ? (
            <div className="border-b border-[var(--line)]">
              <div className="px-4 pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-[var(--muted)]">Konuşma Arşivi</p>
                <div className="mt-3 grid grid-cols-3 gap-1 rounded-[10px] bg-[var(--surface-2)] p-1">
                  <button type="button" onClick={() => setAttachmentTab("MEDIA")} className={`rounded-[8px] px-2 py-1.5 text-[9px] font-semibold ${attachmentTab === "MEDIA" ? "bg-white text-[var(--accent)] shadow-sm" : "text-[var(--muted)]"}`}>Medya</button>
                  <button type="button" onClick={() => setAttachmentTab("FILES")} className={`rounded-[8px] px-2 py-1.5 text-[9px] font-semibold ${attachmentTab === "FILES" ? "bg-white text-[var(--accent)] shadow-sm" : "text-[var(--muted)]"}`}>Dosyalar</button>
                  <button type="button" onClick={() => setAttachmentTab("LINKS")} className={`rounded-[8px] px-2 py-1.5 text-[9px] font-semibold ${attachmentTab === "LINKS" ? "bg-white text-[var(--accent)] shadow-sm" : "text-[var(--muted)]"}`}>Bağlantılar</button>
                </div>
              </div>
              <div className="max-h-[240px] overflow-y-auto p-3">
                {attachmentTab === "MEDIA" ? (
                  <div className="grid grid-cols-3 gap-1.5">
                    {messages.flatMap((message) => message.attachments).filter((attachment) => attachment.mimeType.startsWith("image/") || attachment.mimeType.startsWith("video/")).slice(-12).reverse().map((attachment) => (
                      <button key={attachment.id} type="button" onClick={() => void openAttachment(attachment)} className="flex aspect-square items-center justify-center overflow-hidden rounded-[10px] border border-[var(--line)] bg-[var(--surface-2)] px-2 text-center text-[8px] font-semibold text-[var(--muted)]">
                        {attachment.mimeType.startsWith("image/") ? "Fotoğraf" : "Video"}
                      </button>
                    ))}
                    {!messages.some((message) => message.attachments.some((attachment) => attachment.mimeType.startsWith("image/") || attachment.mimeType.startsWith("video/"))) ? (
                      <p className="col-span-3 py-6 text-center text-[9px] text-[var(--muted)]">Henüz medya yok.</p>
                    ) : null}
                  </div>
                ) : attachmentTab === "FILES" ? (
                  <div className="space-y-1.5">
                    {messages.flatMap((message) => message.attachments).filter((attachment) => !attachment.mimeType.startsWith("image/") && !attachment.mimeType.startsWith("video/") && !attachment.mimeType.startsWith("audio/")).slice(-12).reverse().map((attachment) => (
                      <button key={attachment.id} type="button" onClick={() => void openAttachment(attachment)} className="flex w-full items-center gap-2 rounded-[10px] border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-2 text-left">
                        <span className="rounded-[7px] bg-white px-1.5 py-1 text-[8px] font-bold text-[var(--accent)]">{attachment.mimeType === "application/pdf" ? "PDF" : "DOC"}</span>
                        <span className="min-w-0 flex-1 truncate text-[9px] font-semibold text-[var(--ink)]">{attachment.originalName}</span>
                      </button>
                    ))}
                    {!messages.some((message) => message.attachments.some((attachment) => !attachment.mimeType.startsWith("image/") && !attachment.mimeType.startsWith("video/") && !attachment.mimeType.startsWith("audio/"))) ? (
                      <p className="py-6 text-center text-[9px] text-[var(--muted)]">Henüz dosya yok.</p>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {messages.flatMap((message) => {
                      const urls = message.body.match(/https?:\/\/[^\s]+/g) ?? [];
                      return urls.map((url) => ({ url, messageId: message.id, senderName: message.senderName }));
                    }).slice(-20).reverse().map((item, index) => (
                      <a key={`${item.messageId}-${index}-${item.url}`} href={item.url} target="_blank" rel="noreferrer" className="block rounded-[10px] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 hover:border-[var(--line-strong)]">
                        <p className="truncate text-[9px] font-semibold text-[var(--accent)]">{item.url}</p>
                        <p className="mt-1 text-[8px] text-[var(--muted)]">{item.senderName}</p>
                      </a>
                    ))}
                    {!messages.some((message) => /https?:\/\/[^\s]+/.test(message.body)) ? (
                      <p className="py-6 text-center text-[9px] text-[var(--muted)]">Henüz bağlantı yok.</p>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <div className="border-b border-[var(--line)] px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-[var(--muted)]">Ekip Durumu</p>
            <p className="mt-1 text-[11px] text-[var(--muted-soft)]">{people.filter((person) => person.isOnline).length} kişi çevrim içi</p>
          </div>
          {me ? (
            <div className="border-b border-[var(--line)] bg-[var(--accent-soft)]/45 p-4">
              <div className="flex items-center gap-3">
                <PersonAvatar person={me} />
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-semibold text-[var(--ink)]">Ben · {me.firstName}</p>
                  <p className="mt-0.5 text-[10px] text-[var(--muted)]">{STATUS_LABELS[status]}</p>
                </div>
              </div>
            </div>
          ) : null}
          <div className="max-h-[520px] overflow-y-auto p-2">
            {selectablePeople.map((person) => (
              <button
                key={person.id}
                type="button"
                onClick={async () => {
                  const result = await api<{ id: string }>("/team/conversations", {
                    method: "POST",
                    body: { type: "DIRECT", memberUserIds: [person.id] },
                  });
                  await loadOverview(true);
                  setActiveId(result.id);
                }}
                className="flex w-full items-center gap-3 rounded-[14px] p-3 text-left transition hover:bg-[var(--surface-2)]"
              >
                <PersonAvatar person={person} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-semibold text-[var(--ink)]">{person.firstName} {person.lastName}</p>
                  <p className="mt-0.5 truncate text-[9px] text-[var(--muted)]">
                    {person.isOnline ? STATUS_LABELS[person.status] : "Çevrim dışı"} · {person.roleName}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </aside>
      </section>

      <Modal
        open={Boolean(preview)}
        onClose={() => {
          if (preview?.url.startsWith("blob:")) URL.revokeObjectURL(preview.url);
          setPreview(null);
        }}
        title={preview?.name ?? "Dosya önizleme"}
        description="Dosya güvenli ekip alanından görüntüleniyor."
        size="lg"
      >
        {preview ? (
          <div className="flex min-h-[220px] items-center justify-center rounded-[18px] border border-[var(--line)] bg-[var(--surface-2)]/45 p-4">
            {preview.mimeType.startsWith("image/") ? (
              <div
                role="img"
                aria-label={preview.name}
                className="h-[65vh] w-full rounded-[14px] bg-contain bg-center bg-no-repeat"
                style={{ backgroundImage: `url("${preview.url}")` }}
              />
            ) : null}
            {preview.mimeType.startsWith("video/") ? <video src={preview.url} controls autoPlay playsInline className="max-h-[65vh] w-full rounded-[14px] bg-black" /> : null}
            {preview.mimeType.startsWith("audio/") ? <audio src={preview.url} controls autoPlay className="w-full max-w-[520px]" /> : null}
            {preview.mimeType === "application/pdf" ? <iframe src={preview.url} title={preview.name} className="h-[65vh] w-full rounded-[14px] bg-white" /> : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(externalShareCard)}
        onClose={() => {
          if (sending) return;
          window.localStorage.removeItem("valoo-team-pending-rich-card");
          setExternalShareCard(null);
        }}
        title="Sohbette paylaş"
        description={externalShareCard ? `${externalShareCard.title} kaydını göndereceğiniz konuşmayı seçin.` : ""}
        size="sm"
      >
        <div className="max-h-[440px] overflow-y-auto">
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              disabled={sending}
              onClick={() => void sendExternalRichCard(conversation.id)}
              className="flex w-full items-center gap-3 rounded-[12px] px-3 py-3 text-left transition hover:bg-[var(--surface-2)] disabled:opacity-50"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-[var(--accent-soft)] text-[9px] font-semibold text-[var(--accent)]">
                {conversation.displayName.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[10px] font-semibold text-[var(--ink)]">{conversation.displayName}</p>
                <p className="mt-0.5 text-[8px] text-[var(--muted)]">{conversation.type === "DIRECT" ? "Birebir" : conversation.type === "GROUP" ? "Grup" : "Kanal"}</p>
              </div>
            </button>
          ))}
          {!conversations.length ? <p className="py-8 text-center text-[10px] text-[var(--muted)]">Paylaşım için önce bir konuşma oluşturun.</p> : null}
        </div>
      </Modal>

      <Modal
        open={shareOpen}
        onClose={() => !sending && setShareOpen(false)}
        title="VALOO’dan paylaş"
        description="Bir kaydı konuşmaya etkileşimli kart olarak gönderin."
        size="lg"
      >
        <div className="grid grid-cols-3 gap-1 rounded-[12px] bg-[var(--surface-2)] p-1">
          {(["APPOINTMENT", "CUSTOMER", "PAYMENT"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setShareTab(tab)}
              className={`rounded-[9px] px-3 py-2 text-[10px] font-semibold ${shareTab === tab ? "bg-white text-[var(--accent)] shadow-sm" : "text-[var(--muted)]"}`}
            >
              {tab === "APPOINTMENT" ? "Randevular" : tab === "CUSTOMER" ? "Müşteriler" : "Ödemeler"}
            </button>
          ))}
        </div>

        <div className="mt-3 max-h-[480px] overflow-y-auto">
          {shareLoading ? (
            <p className="py-10 text-center text-[11px] text-[var(--muted)]">Kayıtlar yükleniyor…</p>
          ) : shareTab === "APPOINTMENT" ? (
            <div className="space-y-2">
              {shareAppointments.map((appointment) => {
                const customer = shareCustomers.find((item) => item.id === appointment.customerId);
                const service = shareServices.find((item) => item.id === appointment.serviceId);
                const title = customer ? `${customer.firstName} ${customer.lastName}` : "Randevu";
                const date = new Date(appointment.startAt).toLocaleString("tr-TR");
                return (
                  <button
                    key={appointment.id}
                    type="button"
                    disabled={sending}
                    onClick={() => void sendRichCard({
                      kind: "APPOINTMENT",
                      id: appointment.id,
                      title,
                      subtitle: service?.name ?? "Randevu",
                      meta: [date, appointment.status],
                      href: `/appointments?appointmentId=${appointment.id}`,
                    })}
                    className="w-full rounded-[14px] border border-[var(--line)] bg-white p-3 text-left transition hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)] disabled:opacity-50"
                  >
                    <p className="text-[11px] font-semibold text-[var(--ink)]">{title}</p>
                    <p className="mt-1 text-[9px] text-[var(--muted)]">{service?.name ?? "Hizmet"} · {date}</p>
                  </button>
                );
              })}
            </div>
          ) : shareTab === "CUSTOMER" ? (
            <div className="space-y-2">
              {shareCustomers.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  disabled={sending}
                  onClick={() => void sendRichCard({
                    kind: "CUSTOMER",
                    id: customer.id,
                    title: `${customer.firstName} ${customer.lastName}`,
                    subtitle: customer.phone ?? customer.email ?? "İletişim bilgisi yok",
                    meta: customer.email && customer.phone ? [customer.email] : [],
                    href: `/customers/${customer.id}`,
                  })}
                  className="w-full rounded-[14px] border border-[var(--line)] bg-white p-3 text-left transition hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)] disabled:opacity-50"
                >
                  <p className="text-[11px] font-semibold text-[var(--ink)]">{customer.firstName} {customer.lastName}</p>
                  <p className="mt-1 text-[9px] text-[var(--muted)]">{customer.phone ?? customer.email ?? "İletişim bilgisi yok"}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {sharePayments.map((payment) => {
                const customer = shareCustomers.find((item) => item.id === payment.appointment.customerId);
                const service = shareServices.find((item) => item.id === payment.appointment.serviceId);
                const title = `₺${Number(payment.amount).toLocaleString("tr-TR")}`;
                return (
                  <button
                    key={payment.id}
                    type="button"
                    disabled={sending}
                    onClick={() => void sendRichCard({
                      kind: "PAYMENT",
                      id: payment.id,
                      title,
                      subtitle: customer ? `${customer.firstName} ${customer.lastName}` : "Ödeme",
                      meta: [service?.name ?? "Hizmet", new Date(payment.paidAt).toLocaleString("tr-TR"), payment.method, payment.status],
                      href: "/payments",
                    })}
                    className="w-full rounded-[14px] border border-[var(--line)] bg-white p-3 text-left transition hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)] disabled:opacity-50"
                  >
                    <p className="text-[11px] font-semibold text-[var(--ink)]">{title}</p>
                    <p className="mt-1 text-[9px] text-[var(--muted)]">{customer ? `${customer.firstName} ${customer.lastName}` : "Müşteri"} · {service?.name ?? "Hizmet"}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={Boolean(forwardingMessage)}
        onClose={() => { if (!forwarding) setForwardingMessage(null); }}
        title="Mesajı ilet"
        description="Mesajı ve eklerini başka bir konuşmaya gönderin."
        size="sm"
      >
        <div className="max-h-[420px] overflow-y-auto">
          {conversations.filter((conversation) => conversation.id !== activeId).map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              disabled={forwarding}
              onClick={() => void forwardMessageTo(conversation.id)}
              className="flex w-full items-center gap-3 rounded-[12px] px-3 py-3 text-left transition hover:bg-[var(--surface-2)] disabled:opacity-50"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-[var(--accent-soft)] text-[9px] font-semibold text-[var(--accent)]">
                {conversation.displayName.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[10px] font-semibold text-[var(--ink)]">{conversation.displayName}</p>
                <p className="mt-0.5 text-[8px] text-[var(--muted)]">{conversation.type === "DIRECT" ? "Birebir" : conversation.type === "GROUP" ? "Grup" : "Kanal"}</p>
              </div>
            </button>
          ))}
          {conversations.filter((conversation) => conversation.id !== activeId).length === 0 ? (
            <p className="py-8 text-center text-[10px] text-[var(--muted)]">İletilebilecek başka konuşma yok.</p>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={Boolean(messageInfo)}
        onClose={() => { setMessageInfo(null); setMessageReaders([]); }}
        title="Mesaj bilgisi"
        description={messageInfo ? `${messageInfo.senderName} · ${new Date(messageInfo.createdAt).toLocaleString("tr-TR")}` : ""}
        size="sm"
      >
        {messageInfo ? (
          <div>
            <div className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)]/55 p-4">
              <p className="whitespace-pre-wrap text-[11px] leading-5 text-[var(--ink)]">{messageInfo.body}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-[9px] text-[var(--muted)]">
                <span>Gönderildi · {new Date(messageInfo.createdAt).toLocaleString("tr-TR")}</span>
                {messageInfo.editedAt ? <span>Düzenlendi · {new Date(messageInfo.editedAt).toLocaleString("tr-TR")}</span> : null}
              </div>
            </div>
            <div className="mt-4">
              <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--muted)]">Okuyanlar · {messageReaders.length}</p>
              <div className="mt-2 max-h-[300px] overflow-y-auto">
                {messageReaders.length ? messageReaders.map((reader) => (
                  <div key={reader.id} className="flex items-center gap-3 rounded-[11px] px-2 py-2.5 hover:bg-[var(--surface-2)]">
                    <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[var(--accent-soft)] text-[9px] font-semibold text-[var(--accent)]">{initials(reader.firstName, reader.lastName)}</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[10px] font-semibold text-[var(--ink)]">{reader.firstName} {reader.lastName}</p>
                      <p className="truncate text-[8px] text-[var(--muted)]">{reader.email}</p>
                    </div>
                    <span className="text-[8px] text-[var(--muted-soft)]">{new Date(reader.readAt).toLocaleString("tr-TR")}</span>
                  </div>
                )) : <p className="py-6 text-center text-[10px] text-[var(--muted)]">Henüz okundu bilgisi yok.</p>}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(readerList.length || readerModalTitle)}
        onClose={() => { setReaderList([]); setReaderModalTitle(""); }}
        title="Duyuruyu okuyanlar"
        description={readerModalTitle || "Duyuru onay detayları"}
        size="sm"
      >
        <div className="max-h-[420px] overflow-y-auto">
          {readerList.length ? readerList.map((reader) => (
            <div key={reader.id} className="flex items-center gap-3 rounded-[12px] border border-transparent px-2 py-2.5 transition hover:border-[var(--line)] hover:bg-[var(--surface-2)]">
              <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[var(--accent-soft)] text-[9px] font-semibold text-[var(--accent)]">{initials(reader.firstName, reader.lastName)}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-semibold text-[var(--ink)]">{reader.firstName} {reader.lastName}</p>
                <p className="truncate text-[10px] text-[var(--muted)]">{reader.email}</p>
              </div>
              <span className="text-[9px] text-[var(--muted-soft)]">{timeLabel(reader.acknowledgedAt)}</span>
            </div>
          )) : <p className="px-3 py-8 text-center text-[12px] text-[var(--muted)]">Henüz kimse “Okudum” demedi.</p>}
        </div>
        <div className="mt-5 flex justify-end border-t border-[var(--line)] pt-4">
          <Button variant="secondary" onClick={() => { setReaderList([]); setReaderModalTitle(""); }}>Kapat</Button>
        </div>
      </Modal>

      <Modal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        title="Yeni konuşma"
        description="Birebir mesajlaşın, bir grup oluşturun veya ekip kanalı açın."
      >
        <form onSubmit={createConversation}>
          <div className="space-y-5">
              <div className="grid grid-cols-3 gap-2 rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)]/60 p-1.5">
                {(["DIRECT", "GROUP", "CHANNEL"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setComposeType(type);
                      setSelectedUsers([]);
                    }}
                    className={`min-h-10 rounded-[11px] px-3 text-[12px] font-semibold transition ${composeType === type ? "bg-white text-[var(--accent)] shadow-[0_2px_8px_rgba(17,70,104,.08)] ring-1 ring-[rgba(22,116,189,.12)]" : "text-[var(--muted)] hover:bg-white/70 hover:text-[var(--ink)]"}`}
                  >
                    {type === "DIRECT" ? "Birebir" : type === "GROUP" ? "Grup" : "Kanal"}
                  </button>
                ))}
              </div>

              {composeType !== "DIRECT" ? (
                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-semibold text-[var(--muted)]">{composeType === "CHANNEL" ? "Kanal adı" : "Grup adı"}</span>
                  <input
                    value={groupName}
                    onChange={(event) => setGroupName(event.target.value)}
                    placeholder={composeType === "CHANNEL" ? "Örn. Operasyon" : "Örn. Satış Ekibi"}
                    className="control h-11 w-full text-[13px]"
                  />
                </label>
              ) : null}

              {composeType === "CHANNEL" ? (
                <label className="flex items-start gap-3 rounded-[14px] border border-[rgba(22,116,189,.14)] bg-[var(--accent-soft)]/45 p-4">
                  <input
                    type="checkbox"
                    checked={announcementOnly}
                    onChange={(event) => setAnnouncementOnly(event.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-[10px] font-semibold text-[var(--ink)]">Duyuru kanalı</span>
                    <span className="mt-0.5 block text-[9px] leading-4 text-[var(--muted)]">Yalnız kanal yöneticileri mesaj paylaşabilir. Tüm aktif şirket kullanıcıları otomatik eklenir.</span>
                  </span>
                </label>
              ) : null}

              {composeType !== "CHANNEL" ? (
              <div>
                <p className="mb-2 text-[10px] font-semibold text-[var(--muted)]">Ekip üyeleri</p>
                <div className="max-h-[300px] space-y-1 overflow-y-auto rounded-[14px] border border-[var(--line)] p-2">
                  {selectablePeople.map((person) => {
                    const checked = selectedUsers.includes(person.id);
                    return (
                      <button
                        key={person.id}
                        type="button"
                        onClick={() => {
                          if (composeType === "DIRECT") setSelectedUsers([person.id]);
                          else toggleUser(person.id);
                        }}
                        className={`flex w-full items-center gap-3 rounded-[12px] border p-2.5 text-left transition ${checked ? "border-[rgba(22,116,189,.15)] bg-[var(--accent-soft)]" : "border-transparent hover:border-[var(--line)] hover:bg-[var(--surface-2)]"}`}
                      >
                        <PersonAvatar person={person} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11px] font-semibold text-[var(--ink)]">{person.firstName} {person.lastName}</p>
                          <p className="mt-0.5 text-[9px] text-[var(--muted)]">{person.roleName}</p>
                        </div>
                        <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${checked ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--line)] text-transparent"}`}>✓</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              ) : null}
          </div>
          <div className="mt-6 flex justify-end gap-2 border-t border-[var(--line)] pt-5">
            <Button type="button" variant="secondary" onClick={() => setComposeOpen(false)}>Vazgeç</Button>
            <Button type="submit">Konuşmayı oluştur</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
