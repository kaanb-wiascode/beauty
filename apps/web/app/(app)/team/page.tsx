"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
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
type SearchResult = { id: string; body: string; createdAt: string; senderUserId: string; senderName: string };

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

function PersonAvatar({ person, size = "md" }: { person: Person; size?: "sm" | "md" }) {
  const box = size === "sm" ? "h-8 w-8 text-[10px]" : "h-10 w-10 text-[11px]";
  return (
    <div className="relative shrink-0">
      <div className={`${box} flex items-center justify-center rounded-[13px] bg-[#f1edff] font-semibold text-[#6f54c7]`}>
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
  const [composeType, setComposeType] = useState<"DIRECT" | "GROUP">("DIRECT");
  const [groupName, setGroupName] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
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
  const endRef = useRef<HTMLDivElement | null>(null);
  const typingTimerRef = useRef<number | null>(null);

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
      if (!activeId && conversationsResult[0]) setActiveId(conversationsResult[0].id);
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
    if (!activeId) {
      setMessages([]);
      return;
    }
    void loadMessages(activeId);
    void loadConversationMembers(activeId);
    void loadTyping(activeId);
    setReplyTo(null);
    setEditingMessage(null);
    setSearchText("");
    setSearchResults([]);
    setGroupEditing(false);
    setGroupNameDraft("");
  }, [activeId, loadMessages, loadConversationMembers, loadTyping]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadOverview(true);
      if (activeId) {
        void loadMessages(activeId, true);
        void loadTyping(activeId);
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [activeId, loadMessages, loadOverview, loadTyping]);

  async function changeStatus(next: PresenceStatus) {
    setStatus(next);
    try {
      await api("/team/presence", { method: "PATCH", body: { status: next } });
      await loadOverview(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Durum güncellenemedi.");
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!activeId || !messageText.trim() || sending) return;
    if (editingMessage) {
      await saveEditedMessage();
      return;
    }
    const body = messageText.trim();
    setSending(true);
    setMessageText("");
    try {
      await api(`/team/conversations/${activeId}/messages`, {
        method: "POST",
        body: { body, ...(replyTo ? { replyToMessageId: replyTo.id } : {}) },
      });
      setReplyTo(null);
      await Promise.all([loadMessages(activeId, true), loadOverview(true)]);
    } catch (err) {
      setMessageText(body);
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
    if (!activeId || active?.type !== "GROUP" || !groupNameDraft.trim()) return;
    try {
      await api(`/team/conversations/${activeId}`, { method: "PATCH", body: { name: groupNameDraft.trim() } });
      setGroupEditing(false);
      await loadOverview(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Grup adı güncellenemedi.");
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
    const required = composeType === "DIRECT" ? 1 : 2;
    if (selectedUsers.length < required) {
      setError(composeType === "DIRECT" ? "Bir ekip üyesi seçin." : "Grup için en az iki ekip üyesi seçin.");
      return;
    }
    if (composeType === "DIRECT" && selectedUsers.length > 1) {
      setError("Birebir konuşma için yalnızca bir kişi seçin.");
      return;
    }
    if (composeType === "GROUP" && !groupName.trim()) {
      setError("Grup adını yazın.");
      return;
    }

    try {
      const result = await api<{ id: string }>("/team/conversations", {
        method: "POST",
        body: {
          type: composeType,
          memberUserIds: selectedUsers,
          ...(composeType === "GROUP" ? { name: groupName.trim() } : {}),
        },
      });
      setComposeOpen(false);
      setSelectedUsers([]);
      setGroupName("");
      await loadOverview(true);
      setActiveId(result.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Konuşma oluşturulamadı.");
    }
  }

  const selectablePeople = people.filter((person) => person.id !== currentUser?.id);

  if (loading) {
    return <div className="flex min-h-[520px] items-center justify-center text-[13px] text-[var(--muted)]">Ekip iletişimi hazırlanıyor...</div>;
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 pb-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[.14em] text-[var(--muted)]">EKİP</p>
          <h1 className="text-[30px] font-semibold tracking-[-.04em] text-[var(--ink)]">Mesajlar ve Ekip Durumu</h1>
          <p className="mt-1 text-[13px] text-[var(--muted)]">Ekip içi konuşmalar, grup mesajları ve anlık müsaitlik tek ekranda.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={status}
            onChange={(event) => void changeStatus(event.target.value as PresenceStatus)}
            className="h-10 rounded-[12px] border border-[var(--line)] bg-white px-3 text-[12px] font-medium text-[var(--ink)] outline-none"
            aria-label="Ekip durumu"
          >
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setComposeOpen(true)}
            className="h-10 rounded-[12px] bg-[var(--ink)] px-4 text-[12px] font-semibold text-white transition hover:opacity-90"
          >
            Yeni konuşma
          </button>
        </div>
      </header>

      {error ? (
        <div className="flex items-center justify-between rounded-[14px] border border-rose-200 bg-rose-50 px-4 py-3 text-[12px] text-rose-700">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} className="font-semibold">Kapat</button>
        </div>
      ) : null}

      <section className="grid min-h-[680px] overflow-hidden rounded-[24px] border border-[var(--line)] bg-white shadow-[0_18px_60px_rgba(27,24,39,.05)] xl:grid-cols-[320px_minmax(0,1fr)_280px]">
        <aside className="border-b border-[var(--line)] xl:border-b-0 xl:border-r">
          <div className="border-b border-[var(--line)] px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-[var(--muted)]">Konuşmalar</p>
            <p className="mt-1 text-[11px] text-[var(--muted-soft)]">{conversations.length} aktif konuşma</p>
          </div>
          <div className="max-h-[610px] overflow-y-auto p-2">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => setActiveId(conversation.id)}
                className={`mb-1 flex w-full items-start gap-3 rounded-[16px] p-3 text-left transition ${activeId === conversation.id ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-2)]"}`}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-[#f1edff] text-[11px] font-semibold text-[#6f54c7]">
                  {conversation.type === "GROUP" ? "GR" : conversation.displayName.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[12px] font-semibold text-[var(--ink)]">{conversation.displayName}</p>
                    {conversation.unreadCount > 0 ? (
                      <span className="ml-auto min-w-5 rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-center text-[9px] font-semibold text-white">
                        {conversation.unreadCount}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 truncate text-[10px] text-[var(--muted)]">
                    {conversation.lastMessage ? `${conversation.lastMessage.senderName}: ${conversation.lastMessage.body}` : "Henüz mesaj yok"}
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
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
                <div>
                  <h2 className="text-[14px] font-semibold text-[var(--ink)]">{active.displayName}</h2>
                  <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                    {active.type === "GROUP" ? `${active.memberCount} üye · Grup konuşması` : "Birebir konuşma"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <input
                      value={searchText}
                      onChange={(event) => void searchMessages(event.target.value)}
                      placeholder="Mesaj ara..."
                      className="h-9 w-[180px] rounded-[11px] border border-[var(--line)] bg-white px-3 text-[10px] outline-none focus:border-[#9f89e8]"
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
                              <p className="text-[9px] font-semibold text-[#7657e8]">{result.senderName} · {timeLabel(result.createdAt)}</p>
                              <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-[var(--ink)]">{result.body}</p>
                            </button>
                          ))}
                          {!searching && !searchResults.length ? <p className="px-3 py-6 text-center text-[10px] text-[var(--muted)]">Eşleşen mesaj yok.</p> : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <span className="rounded-full bg-[#f4f2f8] px-3 py-1 text-[9px] font-semibold uppercase tracking-[.08em] text-[var(--muted)]">
                    {active.type === "GROUP" ? "Grup" : "Direkt"}
                  </span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto bg-[#fcfbfd] px-5 py-5">
                {messagesLoading ? (
                  <div className="py-12 text-center text-[12px] text-[var(--muted)]">Mesajlar yükleniyor...</div>
                ) : messages.length ? (
                  <div className="space-y-3">
                    {messages.map((message) => {
                      const mine = message.senderUserId === currentUser?.id;
                      return (
                        <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                          <div className={`group/message max-w-[76%] rounded-[18px] px-4 py-3 ${mine ? "bg-[var(--ink)] text-white" : "border border-[var(--line)] bg-white text-[var(--ink)]"}`}>
                            {!mine ? <p className="mb-1 text-[9px] font-semibold text-[#7458c8]">{message.senderName}</p> : null}
                            {message.replyToMessageId ? <p className={`mb-2 rounded-[9px] border-l-2 px-2 py-1 text-[9px] ${mine ? "border-white/40 bg-white/5 text-white/65" : "border-[#9c86e8] bg-[#faf8ff] text-[var(--muted)]"}`}>Bir mesaja yanıt</p> : null}
                            <p className="whitespace-pre-wrap break-words text-[12px] leading-5">{message.body}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-1">
                              {(message.reactions ?? []).map((reaction) => (
                                <button key={reaction.emoji} type="button" onClick={() => void toggleReaction(message.id, reaction.emoji)} className={`rounded-full px-2 py-0.5 text-[10px] ${reaction.reactedByMe ? "bg-[#efe9ff] text-[#694cc0]" : mine ? "bg-white/10 text-white/80" : "bg-[var(--surface-2)] text-[var(--muted)]"}`}>
                                  {reaction.emoji} {reaction.count}
                                </button>
                              ))}
                            </div>
                            <div className="mt-1.5 flex items-center justify-end gap-2">
                              {mine && message.readByCount > 0 ? <span className="text-[9px] text-white/55">Okundu · {message.readByCount}</span> : null}
                              {message.editedAt ? <span className={`text-[9px] ${mine ? "text-white/45" : "text-[var(--muted-soft)]"}`}>düzenlendi</span> : null}
                              <span className={`text-[9px] ${mine ? "text-white/60" : "text-[var(--muted-soft)]"}`}>{timeLabel(message.createdAt)}</span>
                            </div>
                            <div className={`mt-2 flex flex-wrap gap-1 border-t pt-2 ${mine ? "border-white/10" : "border-[var(--line)]"}`}>
                              <button type="button" onClick={() => setReplyTo(message)} className={`text-[9px] font-semibold ${mine ? "text-white/65" : "text-[var(--muted)]"}`}>Yanıtla</button>
                              {["👍","❤️","👏"].map((emoji) => <button key={emoji} type="button" onClick={() => void toggleReaction(message.id, emoji)} className="text-[11px]">{emoji}</button>)}
                              {mine ? <button type="button" onClick={() => startEditing(message)} className="ml-1 text-[9px] font-semibold text-white/65">Düzenle</button> : null}
                              {mine ? <button type="button" onClick={() => void removeMessage(message.id)} className="text-[9px] font-semibold text-rose-300">Sil</button> : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
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

              <form onSubmit={sendMessage} className="border-t border-[var(--line)] bg-white p-4">
                {typingUsers.length ? (
                  <p className="mb-2 px-1 text-[10px] font-medium text-[#7657e8]">
                    {typingUsers.map((user) => user.firstName).join(", ")} yazıyor...
                  </p>
                ) : null}
                {replyTo || editingMessage ? (
                  <div className="mb-2 flex items-start justify-between rounded-[12px] border border-[#e9e2ff] bg-[#faf8ff] px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-[9px] font-semibold uppercase tracking-[.08em] text-[#7657e8]">{editingMessage ? "Mesaj düzenleniyor" : `${replyTo?.senderName ?? ""} kişisine yanıt`}</p>
                      <p className="mt-1 truncate text-[10px] text-[var(--muted)]">{editingMessage?.body ?? replyTo?.body}</p>
                    </div>
                    <button type="button" onClick={() => { setReplyTo(null); setEditingMessage(null); setMessageText(""); }} className="ml-3 text-[11px] font-semibold text-[var(--muted)]">×</button>
                  </div>
                ) : null}
                <div className="relative flex items-end gap-3 rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)] p-2">
                  <textarea
                    value={messageText}
                    onChange={(event) => signalTyping(event.target.value)}
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
                            <div className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-[#f1edff] text-[8px] font-semibold text-[#6f54c7]">{initials(member.firstName, member.lastName)}</div>
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
                    type="submit"
                    disabled={sending || !messageText.trim()}
                    className="h-10 rounded-[12px] bg-[var(--accent)] px-4 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {sending ? "Gönderiliyor..." : "Gönder"}
                  </button>
                </div>
                <p className="mt-2 px-1 text-[9px] text-[var(--muted-soft)]">Enter gönderir · Shift + Enter yeni satır açar</p>
              </form>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-center">
              <div>
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[18px] bg-[#f1edff] text-[18px] font-semibold text-[#6f54c7]">E</div>
                <p className="mt-4 text-[15px] font-semibold text-[var(--ink)]">Ekip iletişimine hoş geldiniz</p>
                <p className="mx-auto mt-1 max-w-sm text-[11px] leading-5 text-[var(--muted)]">Bir ekip üyesiyle birebir konuşun veya bir grup oluşturarak departman iletişimini tek yerde yönetin.</p>
              </div>
            </div>
          )}
        </main>

        <aside className="border-t border-[var(--line)] xl:border-l xl:border-t-0">
          {active?.type === "GROUP" ? (
            <div className="border-b border-[var(--line)]">
              <div className="space-y-3 px-4 py-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-[var(--muted)]">Grup Yönetimi</p>
                    <p className="mt-1 text-[10px] text-[var(--muted-soft)]">{conversationMembers.length} kişi</p>
                  </div>
                  {currentConversationMember?.isAdmin ? (
                    <button type="button" onClick={() => setMemberPickerOpen((value) => !value)} className="rounded-[9px] bg-[#f1edff] px-2.5 py-1.5 text-[9px] font-semibold text-[#6f54c7]">+ Üye</button>
                  ) : null}
                </div>

                {currentConversationMember?.isAdmin ? (
                  <div className="flex gap-2">
                    <input
                      value={groupEditing ? groupNameDraft : active.displayName}
                      onFocus={() => { setGroupEditing(true); setGroupNameDraft(active.displayName); }}
                      onChange={(event) => { setGroupEditing(true); setGroupNameDraft(event.target.value); }}
                      className="h-9 min-w-0 flex-1 rounded-[10px] border border-[var(--line)] px-2.5 text-[10px] outline-none focus:border-[#9f89e8]"
                    />
                    {groupEditing ? <button type="button" onClick={() => void renameActiveGroup()} className="rounded-[10px] bg-[var(--ink)] px-3 text-[9px] font-semibold text-white">Kaydet</button> : null}
                  </div>
                ) : null}

                {memberPickerOpen ? (
                  <div className="rounded-[12px] border border-[var(--line)] bg-[#fcfbfd] p-2">
                    <p className="mb-1 px-1 text-[9px] font-semibold text-[var(--muted)]">Gruba eklenebilecek kişiler</p>
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
                    <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#f1edff] text-[9px] font-semibold text-[#6f54c7]">{initials(member.firstName, member.lastName)}</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[10px] font-semibold text-[var(--ink)]">{member.firstName} {member.lastName}</p>
                      <p className="truncate text-[9px] text-[var(--muted)]">{member.isAdmin ? "Grup yöneticisi" : member.roleName}</p>
                    </div>
                    {currentConversationMember?.isAdmin && !member.isAdmin && member.id !== currentUser?.id ? (
                      <button type="button" onClick={() => void removeMember(member.id)} className="rounded-[8px] px-2 py-1 text-[8px] font-semibold text-rose-600 hover:bg-rose-50">Çıkar</button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="border-b border-[var(--line)] px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-[var(--muted)]">Ekip Durumu</p>
            <p className="mt-1 text-[11px] text-[var(--muted-soft)]">{people.filter((person) => person.isOnline).length} kişi çevrim içi</p>
          </div>
          {me ? (
            <div className="border-b border-[var(--line)] bg-[#faf8ff] p-4">
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

      {composeOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm" onMouseDown={() => setComposeOpen(false)}>
          <form
            onSubmit={createConversation}
            onMouseDown={(event) => event.stopPropagation()}
            className="w-full max-w-[560px] overflow-hidden rounded-[24px] border border-white/50 bg-white shadow-[0_30px_100px_rgba(26,22,38,.25)]"
          >
            <div className="border-b border-[var(--line)] px-5 py-4">
              <h2 className="text-[16px] font-semibold tracking-[-.02em] text-[var(--ink)]">Yeni konuşma</h2>
              <p className="mt-1 text-[11px] text-[var(--muted)]">Birebir mesajlaşın veya ekip üyelerinden bir grup oluşturun.</p>
            </div>
            <div className="space-y-4 p-5">
              <div className="grid grid-cols-2 gap-2 rounded-[14px] bg-[var(--surface-2)] p-1">
                {(["DIRECT", "GROUP"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setComposeType(type);
                      setSelectedUsers([]);
                    }}
                    className={`rounded-[11px] px-3 py-2 text-[11px] font-semibold ${composeType === type ? "bg-white text-[var(--ink)] shadow-sm" : "text-[var(--muted)]"}`}
                  >
                    {type === "DIRECT" ? "Birebir" : "Grup"}
                  </button>
                ))}
              </div>

              {composeType === "GROUP" ? (
                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-semibold text-[var(--muted)]">Grup adı</span>
                  <input
                    value={groupName}
                    onChange={(event) => setGroupName(event.target.value)}
                    placeholder="Örn. Satış Ekibi"
                    className="h-11 w-full rounded-[12px] border border-[var(--line)] px-3 text-[12px] outline-none focus:border-[#9f89e8]"
                  />
                </label>
              ) : null}

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
                        className={`flex w-full items-center gap-3 rounded-[12px] p-2.5 text-left ${checked ? "bg-[#f4f0ff]" : "hover:bg-[var(--surface-2)]"}`}
                      >
                        <PersonAvatar person={person} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11px] font-semibold text-[var(--ink)]">{person.firstName} {person.lastName}</p>
                          <p className="mt-0.5 text-[9px] text-[var(--muted)]">{person.roleName}</p>
                        </div>
                        <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${checked ? "border-[#7458c8] bg-[#7458c8] text-white" : "border-[var(--line)] text-transparent"}`}>✓</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--line)] px-5 py-4">
              <button type="button" onClick={() => setComposeOpen(false)} className="h-10 rounded-[12px] border border-[var(--line)] px-4 text-[11px] font-semibold text-[var(--muted)]">Vazgeç</button>
              <button type="submit" className="h-10 rounded-[12px] bg-[var(--ink)] px-4 text-[11px] font-semibold text-white">Konuşmayı oluştur</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
