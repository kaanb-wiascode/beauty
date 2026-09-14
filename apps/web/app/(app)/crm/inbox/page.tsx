"use client";

import { useCallback, useEffect, useState } from "react";
import { CustomerSearchPicker } from "@/components/customer-search-picker";
import { LeadSearchPicker, type LeadSearchResult } from "@/components/lead-search-picker";
import { Alert, Button, Field, GlassCard, Modal, PageHeader, Select, Spinner, TextArea, TextInput } from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";
import { hasActiveBranch, hasPermission } from "@/lib/auth";

type Status = "OPEN" | "RESOLVED" | "DISMISSED" | "ALL";
type Customer = { id: string; firstName: string; lastName: string; phone: string | null; email: string | null };
type InboxItem = {
  id: string;
  providerKey: string;
  externalEventId: string;
  externalMessageId: string | null;
  channel: "EMAIL" | "SMS" | "WHATSAPP";
  sender: string;
  recipient: string;
  subject: string | null;
  body: string;
  status: "OPEN" | "RESOLVED" | "DISMISSED";
  customerId: string | null;
  leadId: string | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

type Action = { type: "customer" | "existing-lead" | "new-lead" | "dismiss"; item: InboxItem } | null;

export default function CrmInboundInboxPage() {
  const activeBranch = hasActiveBranch();
  const canManage = hasPermission("crm", "manage");
  const [status, setStatus] = useState<Status>("OPEN");
  const [rows, setRows] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [action, setAction] = useState<Action>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [lead, setLead] = useState<LeadSearchResult | null>(null);
  const [note, setNote] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const load = useCallback(async () => {
    if (!activeBranch) { setLoading(false); return; }
    setLoading(true);
    setError("");
    try {
      setRows(await api<InboxItem[]>(withQuery("/crm/unresolved-inbound", { status, limit: 100 })));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Inbound inbox yüklenemedi.");
    } finally { setLoading(false); }
  }, [activeBranch, status]);

  useEffect(() => { void load(); }, [load]);

  function open(next: NonNullable<Action>) {
    setAction(next);
    setCustomer(null);
    setLead(null);
    setNote("");
    setFirstName("");
    setLastName("");
    setError("");
  }

  function close() {
    if (!working) setAction(null);
  }

  async function submit() {
    if (!action || !canManage) return;
    setWorking(true);
    setError("");
    setSuccess("");
    try {
      if (action.type === "customer") {
        if (!customer) throw new Error("Bağlanacak müşteriyi seçin.");
        await api(`/crm/unresolved-inbound/${action.item.id}/resolve`, {
          method: "POST",
          body: { subjectType: "CUSTOMER", subjectId: customer.id, note: note.trim() || null },
        });
        setSuccess("Mesaj müşteriye bağlandı ve CRM iletişim geçmişine işlendi.");
      } else if (action.type === "existing-lead") {
        if (!lead) throw new Error("Bağlanacak Lead'i seçin.");
        await api(`/crm/unresolved-inbound/${action.item.id}/resolve`, {
          method: "POST",
          body: { subjectType: "LEAD", subjectId: lead.id, note: note.trim() || null },
        });
        setSuccess("Mesaj mevcut Lead'e bağlandı ve CRM iletişim geçmişine işlendi.");
      } else if (action.type === "new-lead") {
        if (!firstName.trim() || !lastName.trim()) throw new Error("Lead adı ve soyadı zorunludur.");
        await api(`/crm/unresolved-inbound/${action.item.id}/create-lead`, {
          method: "POST",
          body: { firstName: firstName.trim(), lastName: lastName.trim() },
        });
        setSuccess("Yeni Lead oluşturuldu ve inbound mesaj Lead geçmişine bağlandı.");
      } else {
        if (!note.trim()) throw new Error("Kapatma nedeni zorunludur.");
        await api(`/crm/unresolved-inbound/${action.item.id}/dismiss`, {
          method: "POST",
          body: { reason: note.trim() },
        });
        setSuccess("Inbound kayıt kapatıldı.");
      }
      setAction(null);
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : requestError instanceof Error ? requestError.message : "İşlem tamamlanamadı.");
    } finally { setWorking(false); }
  }

  const modalTitle = action?.type === "customer"
    ? "Mesajı Müşteriye Bağla"
    : action?.type === "existing-lead"
      ? "Mesajı Mevcut Lead'e Bağla"
      : action?.type === "new-lead"
        ? "Inbound Mesajdan Lead Oluştur"
        : "Inbound Kaydı Kapat";

  return <div className="space-y-6">
    <PageHeader title="Inbound Inbox" description="CRM kişisi otomatik eşleşmeyen WhatsApp, SMS ve e-posta mesajlarını güvenli şekilde inceleyin ve doğru kayda bağlayın." />
    {!activeBranch ? <Alert>Inbound inbox için aktif bir şube seçin.</Alert> : null}
    {activeBranch && !canManage ? <Alert>Inbox kayıtlarını görüntüleyebilirsiniz; çözümlemek için crm.manage yetkisi gerekir.</Alert> : null}
    {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
    {success ? <Alert tone="success" onClose={() => setSuccess("")}>{success}</Alert> : null}

    <GlassCard>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--accent)]">Unresolved Queue</p>
          <h2 className="mt-1 text-[18px] font-semibold">Eşleşmeyen Mesajlar</h2>
        </div>
        <Field label="Durum">
          <Select value={status} onChange={(event) => setStatus(event.target.value as Status)}>
            <option value="OPEN">Açık</option><option value="RESOLVED">Çözüldü</option><option value="DISMISSED">Kapatıldı</option><option value="ALL">Tümü</option>
          </Select>
        </Field>
      </div>
    </GlassCard>

    {loading ? <Spinner label="Inbound mesajlar yükleniyor..." /> : null}
    {!loading && activeBranch && !rows.length ? <Alert tone="success">Bu filtrede unresolved inbound mesaj yok.</Alert> : null}
    {!loading ? <section className="space-y-3">{rows.map((item) => <GlassCard key={item.id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[var(--line)] px-2 py-1 text-[9px] font-semibold">{item.channel}</span>
            <span className="text-[11px] font-semibold">{item.sender}</span>
            <span className="text-[10px] text-[var(--muted)]">{new Date(item.createdAt).toLocaleString("tr-TR")}</span>
          </div>
          {item.subject ? <p className="mt-3 text-[12px] font-semibold">{item.subject}</p> : null}
          <p className="mt-2 max-w-4xl whitespace-pre-wrap text-[12px] leading-5 text-[var(--muted)]">{item.body}</p>
          {item.resolutionNote ? <p className="mt-3 text-[10px] text-[var(--muted)]">Çözüm notu: {item.resolutionNote}</p> : null}
        </div>
        {item.status === "OPEN" && canManage ? <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => open({ type: "customer", item })}>Müşteriye Bağla</Button>
          <Button variant="secondary" onClick={() => open({ type: "existing-lead", item })}>Lead'e Bağla</Button>
          <Button variant="secondary" onClick={() => open({ type: "new-lead", item })}>Yeni Lead</Button>
          <Button variant="secondary" onClick={() => open({ type: "dismiss", item })}>Kapat</Button>
        </div> : <span className="text-[10px] font-semibold text-[var(--muted)]">{item.status}</span>}
      </div>
    </GlassCard>)}</section> : null}

    <Modal open={Boolean(action)} title={modalTitle} onClose={close}>
      <div className="space-y-4">
        {action?.type === "customer" ? <>
          <Field label="Müşteri"><CustomerSearchPicker selected={customer} disabled={working} onSelect={setCustomer} /></Field>
          <Field label="Çözüm notu"><TextArea rows={3} maxLength={1000} value={note} disabled={working} onChange={(event) => setNote(event.target.value)} /></Field>
        </> : null}
        {action?.type === "existing-lead" ? <>
          <Field label="Lead"><LeadSearchPicker selected={lead} disabled={working} onSelect={setLead} /></Field>
          <Field label="Çözüm notu"><TextArea rows={3} maxLength={1000} value={note} disabled={working} onChange={(event) => setNote(event.target.value)} /></Field>
        </> : null}
        {action?.type === "new-lead" ? <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ad"><TextInput value={firstName} disabled={working} onChange={(event) => setFirstName(event.target.value)} /></Field>
          <Field label="Soyad"><TextInput value={lastName} disabled={working} onChange={(event) => setLastName(event.target.value)} /></Field>
        </div> : null}
        {action?.type === "dismiss" ? <Field label="Kapatma nedeni"><TextArea rows={4} maxLength={1000} value={note} disabled={working} onChange={(event) => setNote(event.target.value)} /></Field> : null}
        <div className="flex justify-end gap-2"><Button variant="secondary" disabled={working} onClick={close}>Vazgeç</Button><Button disabled={working} onClick={() => void submit()}>{working ? "İşleniyor..." : "Onayla"}</Button></div>
      </div>
    </Modal>
  </div>;
}
