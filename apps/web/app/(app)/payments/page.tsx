"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert, Button, EmptyState, Field, Modal, PageHeader, Panel, Select, Spinner, TableWrap, Td, TextInput, Th } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, ApiError, withQuery } from "@/lib/api";
import { hasPermission } from "@/lib/auth";

type Payment = {
  id: string;
  appointmentId: string;
  amount: string | number;
  method: "CASH" | "CARD" | "TRANSFER";
  status: "COMPLETED" | "REFUNDED";
  paidAt: string;
  appointment: { id: string; customerId: string; staffId: string; serviceId: string; startAt: string; endAt: string; status: string };
};
type Customer = { id: string; firstName: string; lastName: string };
type Staff = { id: string; firstName: string; lastName: string };
type Service = { id: string; name: string };
type Method = Payment["method"];

const METHOD_LABELS: Record<Method, string> = { CASH: "Nakit", CARD: "Kart", TRANSFER: "Havale / EFT" };
const METHOD_ICONS: Record<Method, string> = { CASH: "₺", CARD: "▣", TRANSFER: "↗" };

function fullName(firstName: string, lastName: string) { return `${firstName} ${lastName}`.trim(); }
function money(value: string | number) { return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(Number(value)); }
function shortMoney(value: number) { return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(value); }
function dateTime(value: string) { return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function dayKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function startOfDay(date: Date) { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; }
function endOfDay(date: Date) { const d = new Date(date); d.setHours(23, 59, 59, 999); return d; }

function Icon({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "purple" | "green" | "red" | "orange" }) {
  const tones = { neutral: "bg-black/[0.045] text-[var(--muted)]", purple: "bg-[rgba(105,84,225,0.10)] text-[#6652dc]", green: "bg-[rgba(47,122,86,0.10)] text-[#2f7a56]", red: "bg-[rgba(143,61,61,0.09)] text-[#8f3d3d]", orange: "bg-[rgba(190,116,37,0.10)] text-[#b36b1f]" };
  return <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] text-[16px] font-semibold ${tones[tone]}`}>{children}</span>;
}

function Kpi({ label, value, detail, icon, tone, delta }: { label: string; value: string; detail: string; icon: string; tone: "purple" | "green" | "red" | "orange"; delta?: string }) {
  return <article className="surface rounded-[22px] border border-[var(--line)] p-5">
    <div className="flex items-start justify-between gap-4"><Icon tone={tone}>{icon}</Icon>{delta ? <span className="rounded-full bg-[rgba(47,122,86,0.09)] px-2.5 py-1 text-[11px] font-semibold text-[#2f7a56]">{delta}</span> : null}</div>
    <p className="mt-5 text-[12px] font-medium text-[var(--muted)]">{label}</p>
    <p className="mt-1 text-[27px] font-semibold tracking-[-0.04em] text-[var(--ink)]">{value}</p>
    <p className="mt-1 text-[12px] text-[var(--muted-soft)]">{detail}</p>
  </article>;
}

function MethodRow({ method, value, total }: { method: Method; value: number; total: number }) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;
  const tone = method === "CARD" ? "purple" : method === "CASH" ? "green" : "orange";
  return <div className="py-3.5">
    <div className="flex items-center gap-3"><Icon tone={tone}>{METHOD_ICONS[method]}</Icon><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><span className="text-[13px] font-medium text-[var(--ink)]">{METHOD_LABELS[method]}</span><span className="text-[13px] font-semibold text-[var(--ink)]">{money(value)}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/[0.05]"><div className="h-full rounded-full bg-[var(--ink)]/55" style={{ width: `${percent}%` }} /></div></div><span className="w-10 text-right text-[11px] text-[var(--muted)]">%{percent}</span></div>
  </div>;
}

export default function PaymentsPage() {
  const canRefund = hasPermission("payments", "refund");
  const { showToast } = useToast();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState<Method | "">("");
  const [status, setStatus] = useState<"" | "COMPLETED" | "REFUNDED">("");
  const [range, setRange] = useState<"today" | "week" | "month" | "all">("today");
  const [refundId, setRefundId] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [refundSaving, setRefundSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError("");
      try {
        const [p, c, s, sv] = await Promise.all([
          api<{ data: Payment[] }>(withQuery("/payments", { page: 1, limit: 100 })),
          api<{ data: Customer[] }>(withQuery("/customers", { page: 1, limit: 100 })),
          api<{ data: Staff[] }>(withQuery("/staff", { page: 1, limit: 100 })),
          api<{ data: Service[] }>(withQuery("/services", { page: 1, limit: 100 })),
        ]);
        if (!cancelled) { setPayments(p.data); setCustomers(c.data); setStaff(s.data); setServices(sv.data); }
      } catch (err) { if (!cancelled) setError(err instanceof ApiError ? err.message : "Ödemeler yüklenemedi."); }
      finally { if (!cancelled) setLoading(false); }
    }
    void load(); return () => { cancelled = true; };
  }, []);

  const customerMap = useMemo(() => new Map(customers.map(c => [c.id, fullName(c.firstName, c.lastName)])), [customers]);
  const staffMap = useMemo(() => new Map(staff.map(s => [s.id, fullName(s.firstName, s.lastName)])), [staff]);
  const serviceMap = useMemo(() => new Map(services.map(s => [s.id, s.name])), [services]);

  const filtered = useMemo(() => {
    const now = new Date();
    const from = range === "today" ? startOfDay(now) : range === "week" ? startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)) : range === "month" ? startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)) : null;
    const to = range === "all" ? null : endOfDay(now);
    const needle = search.trim().toLocaleLowerCase("tr-TR");
    return payments.filter(p => {
      const d = new Date(p.paidAt);
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (method && p.method !== method) return false;
      if (status && p.status !== status) return false;
      if (needle) {
        const hay = [customerMap.get(p.appointment.customerId), staffMap.get(p.appointment.staffId), serviceMap.get(p.appointment.serviceId), METHOD_LABELS[p.method]].join(" ").toLocaleLowerCase("tr-TR");
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [payments, range, method, status, search, customerMap, staffMap, serviceMap]);

  const stats = useMemo(() => {
    let completed = 0, refunded = 0;
    const methods: Record<Method, number> = { CASH: 0, CARD: 0, TRANSFER: 0 };
    filtered.forEach(p => { const amount = Number(p.amount); if (p.status === "REFUNDED") refunded += amount; else { completed += amount; methods[p.method] += amount; } });
    return { completed, refunded, net: completed - refunded, methods };
  }, [filtered]);

  const trend = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i));
      const key = dayKey(d);
      const value = payments.filter(p => p.status === "COMPLETED" && dayKey(new Date(p.paidAt)) === key).reduce((sum, p) => sum + Number(p.amount), 0);
      return { label: new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short" }).format(d), value };
    });
  }, [payments]);

  async function refresh() {
    const result = await api<{ data: Payment[] }>(withQuery("/payments", { page: 1, limit: 100 }));
    setPayments(result.data);
  }

  async function submitRefund() {
    if (!refundId || !canRefund) return;
    setRefundSaving(true); setError("");
    try { await api(`/payments/${refundId}/refund`, { method: "POST", body: { reason: refundReason.trim() || undefined } }); await refresh(); setRefundId(null); setRefundReason(""); showToast("Ödeme iade edildi."); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Ödeme iade edilemedi."); }
    finally { setRefundSaving(false); }
  }

  const hasFilters = Boolean(search.trim() || method || status || range !== "today");
  function clearFilters() { setSearch(""); setMethod(""); setStatus(""); setRange("today"); }

  const maxTrend = Math.max(...trend.map(x => x.value), 1);
  const latest = [...filtered].sort((a, b) => +new Date(b.paidAt) - +new Date(a.paidAt)).slice(0, 7);

  return <div className="mx-auto w-full max-w-[1320px] space-y-6 pb-10">
    <PageHeader title="Ödemeler" description="Tüm tahsilat ve ödeme hareketlerinizi yönetin." action={<Button>+ Yeni ödeme</Button>} />

    {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

    <div className="flex flex-wrap gap-2 rounded-[18px] border border-[var(--line)] bg-white/55 p-1.5">
      {[['today', 'Bugün'], ['week', 'Bu hafta'], ['month', 'Bu ay'], ['all', 'Tümü']].map(([value, label]) => <button key={value} type="button" onClick={() => setRange(value as typeof range)} className={`rounded-[12px] px-4 py-2 text-[13px] font-medium transition ${range === value ? "bg-[var(--ink)] text-white" : "text-[var(--muted)] hover:bg-black/[0.04]"}`}>{label}</button>)}
    </div>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi label="Net tahsilat" value={money(stats.net)} detail="Seçili dönem" icon="₺" tone="purple" delta="Bugün" />
      <Kpi label="Brüt tahsilat" value={money(stats.completed)} detail={`${filtered.filter(p => p.status === "COMPLETED").length} işlem`} icon="↓" tone="green" />
      <Kpi label="İadeler" value={money(stats.refunded)} detail={`${filtered.filter(p => p.status === "REFUNDED").length} işlem`} icon="↶" tone="red" />
      <Kpi label="Ortalama işlem" value={money(filtered.length ? stats.completed / Math.max(filtered.filter(p => p.status === "COMPLETED").length, 1) : 0)} detail="Tamamlanan işlemler" icon="↗" tone="orange" />
    </section>

    <section className="grid gap-4 lg:grid-cols-[1.05fr_1.45fr_.75fr]">
      <Panel><div className="border-b border-[var(--line)] px-6 py-5"><h2 className="text-[16px] font-semibold text-[var(--ink)]">Ödeme yöntemlerine göre dağılım</h2><p className="mt-1 text-[12px] text-[var(--muted)]">Seçili dönemdeki tahsilatlar</p></div><div className="p-6"><div className="mb-5 flex items-end gap-3"><span className="text-[32px] font-semibold tracking-[-0.04em]">{money(stats.completed)}</span><span className="pb-1 text-[12px] text-[var(--muted)]">toplam</span></div><MethodRow method="CARD" value={stats.methods.CARD} total={stats.completed} /><MethodRow method="CASH" value={stats.methods.CASH} total={stats.completed} /><MethodRow method="TRANSFER" value={stats.methods.TRANSFER} total={stats.completed} /></div></Panel>

      <Panel><div className="flex items-start justify-between border-b border-[var(--line)] px-6 py-5"><div><h2 className="text-[16px] font-semibold text-[var(--ink)]">Günlük tahsilat trendi</h2><p className="mt-1 text-[12px] text-[var(--muted)]">Son 7 gün</p></div><span className="rounded-full bg-black/[0.04] px-3 py-1.5 text-[11px] font-medium text-[var(--muted)]">7 Gün</span></div><div className="p-6"><div className="flex h-[175px] items-end gap-2 sm:gap-3">{trend.map((item, i) => <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center gap-2"><span className="text-[10px] font-medium text-[var(--muted)]">{item.value ? shortMoney(item.value) : "₺0"}</span><div className="flex h-[105px] w-full items-end rounded-[10px] bg-black/[0.025] p-1"><div className={`w-full rounded-[7px] ${i === trend.length - 1 ? "bg-[var(--ink)]" : "bg-[#9bbbd7]"}`} style={{ height: `${Math.max((item.value / maxTrend) * 100, item.value ? 7 : 2)}%` }} /></div><span className="text-[10px] text-[var(--muted-soft)]">{item.label}</span></div>)}</div></div></Panel>

      <Panel><div className="border-b border-[var(--line)] px-6 py-5"><h2 className="text-[16px] font-semibold text-[var(--ink)]">Günün özeti</h2><p className="mt-1 text-[12px] text-[var(--muted)]">Hızlı finans görünümü</p></div><div className="p-5">{[["Toplam işlem", String(filtered.length)], ["Tahsilat", money(stats.completed)], ["İade", money(stats.refunded)], ["Net tahsilat", money(stats.net)]].map(([label, value], i) => <div key={label} className={`flex items-center justify-between gap-3 py-3 ${i ? "border-t border-[var(--line)]" : ""}`}><span className="text-[12px] text-[var(--muted)]">{label}</span><span className={`text-[13px] font-semibold ${label === "Net tahsilat" ? "text-[#2f7a56]" : "text-[var(--ink)]"}`}>{value}</span></div>)}</div></Panel>
    </section>

    <Panel>
      <div className="flex flex-col gap-4 border-b border-[var(--line)] px-5 py-5 lg:flex-row lg:items-end">
        <Field label="Ara" ><TextInput value={search} onChange={e => setSearch(e.target.value)} placeholder="Müşteri, hizmet veya personel ara..." /></Field>
        <Field label="Ödeme yöntemi"><Select value={method} onChange={e => setMethod(e.target.value as Method | "")}><option value="">Tüm yöntemler</option><option value="CARD">Kart</option><option value="CASH">Nakit</option><option value="TRANSFER">Havale / EFT</option></Select></Field>
        <Field label="Durum"><Select value={status} onChange={e => setStatus(e.target.value as typeof status)}><option value="">Tüm durumlar</option><option value="COMPLETED">Tahsilat</option><option value="REFUNDED">İade</option></Select></Field>
        {hasFilters ? <button type="button" onClick={clearFilters} className="mb-0.5 h-10 shrink-0 rounded-[12px] px-3 text-[12px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)]">Filtreleri temizle</button> : null}
      </div>
      <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-5 py-4"><div><h2 className="text-[16px] font-semibold text-[var(--ink)]">Ödeme hareketleri</h2><p className="mt-1 text-[12px] text-[var(--muted)]">{filtered.length} kayıt gösteriliyor</p></div><span className="rounded-full bg-black/[0.04] px-3 py-1 text-[11px] text-[var(--muted)]">{range === "today" ? "Bugün" : range === "week" ? "Bu hafta" : range === "month" ? "Bu ay" : "Tüm kayıtlar"}</span></div>
      {loading ? <Spinner label="Ödemeler yükleniyor..." /> : filtered.length === 0 ? <EmptyState title="Ödeme bulunamadı" description="Seçtiğiniz filtrelere uyan ödeme kaydı bulunamadı." /> : <TableWrap><thead><tr><Th>Tarih / saat</Th><Th>Müşteri</Th><Th>Hizmet</Th><Th>Personel</Th><Th>Yöntem</Th><Th>Durum</Th><Th>Tutar</Th><Th>Aksiyon</Th></tr></thead><tbody>{latest.map(p => <tr key={p.id}><Td label="Tarih / saat"><span className="font-medium">{dateTime(p.paidAt)}</span></Td><Td label="Müşteri">{customerMap.get(p.appointment.customerId) ?? "—"}</Td><Td label="Hizmet">{serviceMap.get(p.appointment.serviceId) ?? "—"}</Td><Td label="Personel">{staffMap.get(p.appointment.staffId) ?? "—"}</Td><Td label="Yöntem"><span className="inline-flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-[8px] bg-black/[0.04] text-[11px] font-semibold text-[var(--muted)]">{METHOD_ICONS[p.method]}</span>{METHOD_LABELS[p.method]}</span></Td><Td label="Durum"><span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${p.status === "REFUNDED" ? "bg-[rgba(143,61,61,0.08)] text-[#8f3d3d]" : "bg-[rgba(47,122,86,0.09)] text-[#2f7a56]"}`}>{p.status === "REFUNDED" ? "İade" : "Tahsilat"}</span></Td><Td label="Tutar" className="font-semibold">{p.status === "REFUNDED" ? `-${money(p.amount)}` : money(p.amount)}</Td><Td label="Aksiyon" actions>{p.status === "COMPLETED" && canRefund ? <Button variant="danger" className="px-3 py-1.5" onClick={() => setRefundId(p.id)}>İade et</Button> : <span className="text-[12px] text-[var(--muted-soft)]">{p.status === "REFUNDED" ? "İade edildi" : "—"}</span>}</Td></tr>)}</tbody></TableWrap>}
    </Panel>

    <div className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
      <Panel><div className="border-b border-[var(--line)] px-6 py-5"><h2 className="text-[16px] font-semibold text-[var(--ink)]">Son hareketler</h2><p className="mt-1 text-[12px] text-[var(--muted)]">En son ödeme kayıtları</p></div><div className="divide-y divide-[var(--line)]">{latest.slice(0, 4).map(p => <div key={`recent-${p.id}`} className="flex items-center gap-3 px-6 py-4"><Icon tone={p.status === "REFUNDED" ? "red" : "green"}>{p.status === "REFUNDED" ? "↶" : "✓"}</Icon><div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium text-[var(--ink)]">{customerMap.get(p.appointment.customerId) ?? "Müşteri"}</p><p className="mt-0.5 truncate text-[11px] text-[var(--muted)]">{serviceMap.get(p.appointment.serviceId) ?? "Hizmet"} · {METHOD_LABELS[p.method]}</p></div><div className="text-right"><p className="text-[13px] font-semibold text-[var(--ink)]">{money(p.amount)}</p><p className="mt-0.5 text-[10px] text-[var(--muted-soft)]">{dateTime(p.paidAt)}</p></div></div>)}</div></Panel>
      <Panel><div className="border-b border-[var(--line)] px-6 py-5"><h2 className="text-[16px] font-semibold text-[var(--ink)]">Ödeme yöntemleri</h2><p className="mt-1 text-[12px] text-[var(--muted)]">Tahsilat kanallarınız</p></div><div className="p-4"><MethodRow method="CARD" value={stats.methods.CARD} total={stats.completed} /><MethodRow method="CASH" value={stats.methods.CASH} total={stats.completed} /><MethodRow method="TRANSFER" value={stats.methods.TRANSFER} total={stats.completed} /></div></Panel>
    </div>

    <Modal open={Boolean(refundId)} onClose={() => { if (!refundSaving) { setRefundId(null); setRefundReason(""); } }} title="Ödemeyi iade et" description="Bu ödeme müşteriye iade edilecek. İşlem geri alınamaz."><div className="space-y-5"><div className="rounded-[16px] bg-black/[0.035] p-4"><p className="text-[12px] text-[var(--muted)]">İade edilecek tutar</p><p className="mt-1 text-[25px] font-semibold tracking-[-0.03em]">{refundId ? money(payments.find(p => p.id === refundId)?.amount ?? 0) : "₺0,00"}</p></div><Field label="İade nedeni"><TextInput value={refundReason} onChange={e => setRefundReason(e.target.value)} placeholder="İsteğe bağlı" /></Field><div className="flex justify-end gap-2"><Button variant="secondary" disabled={refundSaving} onClick={() => { setRefundId(null); setRefundReason(""); }}>Vazgeç</Button><Button variant="danger" disabled={refundSaving} onClick={() => void submitRefund()}>{refundSaving ? "İade ediliyor..." : "İadeyi onayla"}</Button></div></div></Modal>
  </div>;
}
