"use client";

import Link from "next/link";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Alert, Button, Spinner, Select } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import { userErrorMessage, userLabel } from "@/lib/user-language";

type Lead = {
  id: string;
  provider: string;
  campaignName?: string | null;
  firstName: string;
  lastName: string;
  phone?: string | null;
  email?: string | null;
  status: string;
  serviceInterest?: string | null;
  assignedUserId?: string | null;
  branchId?: string | null;
  crmLeadId?: string | null;
  customerId?: string | null;
  appointmentId?: string | null;
  saleId?: string | null;
  revenueAmount: string | number;
  receivedAt: string;
};

type Campaign = { id: string; name: string };
type StaffOption = {
  id: string;
  firstName: string;
  lastName: string;
  status?: string;
};
type ServiceOption = {
  id: string;
  name: string;
  durationMinutes: number;
  status?: string;
};
type Paginated<T> = { data: T[] };

type ConvertResponse = {
  crmLeadId: string;
  branchId?: string;
  ownerUserId?: string | null;
  routingRuleId?: string | null;
  idempotent: boolean;
};

type CustomerConvertResponse = {
  customerId: string;
  crmLeadId?: string | null;
  matchedExisting?: boolean;
  idempotent: boolean;
};

type AppointmentResponse = {
  id?: string;
  appointmentId?: string;
  customerId?: string;
  idempotent: boolean;
};

const fieldClass =
  "mt-2 h-11 w-full rounded-[12px] border border-[var(--line)] bg-white px-3 text-[11px] text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";

function localDateTime(hoursAhead: number) {
  const date = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
  date.setSeconds(0, 0);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function stageLabel(lead: Lead) {
  if (lead.saleId) return "Satış";
  if (lead.appointmentId) return "Randevu";
  if (lead.customerId) return "Müşteri";
  if (lead.crmLeadId) return "CRM";
  return "Yeni Talep";
}

export default function MarketingLeadsPage() {
  const canManage = hasPermission("communications", "manage");
  const canCreateAppointment = hasPermission("appointments", "create");
  const canReadStaff = hasPermission("staff", "read");
  const canReadServices = hasPermission("services", "read");
  const canScheduleFromInbox =
    canCreateAppointment && canReadStaff && canReadServices;

  const [leads, setLeads] = useState<Lead[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [convertingId, setConvertingId] = useState("");
  const [customerConvertingId, setCustomerConvertingId] = useState("");
  const [appointmentSaving, setAppointmentSaving] = useState(false);
  const [appointmentLeadId, setAppointmentLeadId] = useState("");
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("");

  const [provider, setProvider] = useState("MANUAL");
  const [campaignId, setCampaignId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [serviceInterest, setServiceInterest] = useState("");
  const [externalLeadId, setExternalLeadId] = useState("");
  const [appointmentStaffId, setAppointmentStaffId] = useState("");
  const [appointmentServiceId, setAppointmentServiceId] = useState("");
  const [appointmentStartAt, setAppointmentStartAt] = useState(() =>
    localDateTime(24),
  );
  const [appointmentEndAt, setAppointmentEndAt] = useState(() =>
    localDateTime(25),
  );
  const [appointmentNotes, setAppointmentNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const referenceRequests: Promise<unknown>[] = [
        api<Lead[]>("/corporate-communications/leads?limit=200"),
        api<Campaign[]>("/corporate-communications/campaigns?limit=200"),
      ];

      if (canScheduleFromInbox) {
        referenceRequests.push(
          api<Paginated<StaffOption>>("/staff?page=1&limit=100"),
          api<Paginated<ServiceOption>>("/services?page=1&limit=100"),
        );
      }

      const results = await Promise.all(referenceRequests);
      setLeads(results[0] as Lead[]);
      setCampaigns(results[1] as Campaign[]);

      if (canScheduleFromInbox) {
        setStaff(
          (results[2] as Paginated<StaffOption>).data.filter(
            (item) => item.status === "ACTIVE",
          ),
        );
        setServices(
          (results[3] as Paginated<ServiceOption>).data.filter(
            (item) => item.status === "ACTIVE",
          ),
        );
      }
    } catch (e) {
      setError(
        e instanceof ApiError
          ? userErrorMessage(
              e.message,
              "Potansiyel müşteri verileri yüklenemedi.",
            )
          : "Potansiyel müşteri verileri yüklenemedi.",
      );
    } finally {
      setLoading(false);
    }
  }, [canScheduleFromInbox]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(
    () => ({
      total: leads.length,
      new: leads.filter(
        (lead) =>
          !lead.crmLeadId &&
          !lead.customerId &&
          !lead.appointmentId &&
          !lead.saleId,
      ).length,
      crm: leads.filter((lead) => Boolean(lead.crmLeadId)).length,
      appointments: leads.filter((lead) => Boolean(lead.appointmentId)).length,
      sales: leads.filter((lead) => Boolean(lead.saleId)).length,
    }),
    [leads],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("tr-TR");

    return leads.filter((lead) => {
      const matchesSearch =
        !needle ||
        (lead.firstName + " " + lead.lastName)
          .toLocaleLowerCase("tr-TR")
          .includes(needle) ||
        (lead.phone ?? "").includes(needle) ||
        (lead.email ?? "").toLocaleLowerCase("tr-TR").includes(needle) ||
        (lead.campaignName ?? "")
          .toLocaleLowerCase("tr-TR")
          .includes(needle) ||
        (lead.serviceInterest ?? "")
          .toLocaleLowerCase("tr-TR")
          .includes(needle);

      const matchesProvider =
        !providerFilter || lead.provider === providerFilter;
      const matchesStage =
        !stageFilter || stageLabel(lead) === stageFilter;

      return matchesSearch && matchesProvider && matchesStage;
    });
  }, [leads, search, providerFilter, stageFilter]);

  async function createLead(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      await api("/corporate-communications/leads", {
        method: "POST",
        body: {
          provider,
          campaignId: campaignId || undefined,
          externalLeadId: externalLeadId || undefined,
          firstName,
          lastName,
          phone: phone || undefined,
          email: email || undefined,
          serviceInterest: serviceInterest || undefined,
        },
      });

      setFirstName("");
      setLastName("");
      setPhone("");
      setEmail("");
      setServiceInterest("");
      setExternalLeadId("");
      setShowForm(false);
      await load();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? userErrorMessage(
              e.message,
              "Potansiyel müşteri kaydedilemedi.",
            )
          : "Potansiyel müşteri kaydedilemedi.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function convertToCrm(leadId: string) {
    setConvertingId(leadId);
    setError("");

    try {
      const result = await api<ConvertResponse>(
        "/corporate-communications/leads/" + leadId + "/convert-to-crm",
        { method: "POST" },
      );

      setLeads((current) =>
        current.map((lead) =>
          lead.id === leadId
            ? {
                ...lead,
                crmLeadId: result.crmLeadId,
                branchId: result.branchId ?? lead.branchId,
                assignedUserId: result.ownerUserId ?? lead.assignedUserId,
                status: "IN_CRM",
              }
            : lead,
        ),
      );
    } catch (e) {
      setError(
        e instanceof ApiError
          ? userErrorMessage(
              e.message,
              "Potansiyel müşteri CRM kaydına aktarılamadı.",
            )
          : "Potansiyel müşteri CRM kaydına aktarılamadı.",
      );
    } finally {
      setConvertingId("");
    }
  }

  async function convertToCustomer(leadId: string) {
    setCustomerConvertingId(leadId);
    setError("");

    try {
      const result = await api<CustomerConvertResponse>(
        "/corporate-communications/leads/" + leadId + "/convert-to-customer",
        { method: "POST" },
      );

      setLeads((current) =>
        current.map((lead) =>
          lead.id === leadId
            ? { ...lead, customerId: result.customerId }
            : lead,
        ),
      );
    } catch (e) {
      setError(
        e instanceof ApiError
          ? userErrorMessage(
              e.message,
              "Potansiyel müşteri, müşteri kaydına dönüştürülemedi.",
            )
          : "Potansiyel müşteri, müşteri kaydına dönüştürülemedi.",
      );
    } finally {
      setCustomerConvertingId("");
    }
  }

  function openAppointment(leadId: string) {
    setAppointmentLeadId(leadId);
    setAppointmentStaffId("");
    setAppointmentServiceId("");
    setAppointmentStartAt(localDateTime(24));
    setAppointmentEndAt(localDateTime(25));
    setAppointmentNotes("");
    setError("");
  }

  async function createAppointment(event: FormEvent) {
    event.preventDefault();
    if (!appointmentLeadId) return;

    setAppointmentSaving(true);
    setError("");

    try {
      const result = await api<AppointmentResponse>(
        "/corporate-communications/leads/" +
          appointmentLeadId +
          "/create-appointment",
        {
          method: "POST",
          body: {
            staffId: appointmentStaffId,
            serviceId: appointmentServiceId,
            startAt: new Date(appointmentStartAt).toISOString(),
            endAt: new Date(appointmentEndAt).toISOString(),
            notes: appointmentNotes || undefined,
          },
        },
      );

      const appointmentId = result.id ?? result.appointmentId;

      setLeads((current) =>
        current.map((lead) =>
          lead.id === appointmentLeadId
            ? {
                ...lead,
                appointmentId: appointmentId ?? lead.appointmentId,
                status: "APPOINTMENT",
              }
            : lead,
        ),
      );

      setAppointmentLeadId("");
    } catch (e) {
      setError(
        e instanceof ApiError
          ? userErrorMessage(e.message, "Randevu oluşturulamadı.")
          : "Randevu oluşturulamadı.",
      );
    } finally {
      setAppointmentSaving(false);
    }
  }

  if (loading && !leads.length) {
    return (
      <div className="py-20">
        <Spinner label="Pazarlama talepleri yükleniyor..." />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-12">
      <header className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[var(--accent)]">
              Talep Yönetimi
            </p>
            <h1 className="mt-2 text-[30px] font-semibold tracking-[-.04em] text-[var(--ink)]">
              Pazarlama Talepleri
            </h1>
            <p className="mt-2 max-w-4xl text-[12px] leading-5 text-[var(--muted)]">
              Reklam ve iletişim kaynaklarından gelen talepleri CRM'e,
              müşteriye, randevuya ve satışa kadar tek dönüşüm akışında yönetin.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/communications/routing">
              <Button variant="secondary">Talep Dağıtımı</Button>
            </Link>
            {canManage ? (
              <Button onClick={() => setShowForm((value) => !value)}>
                {showForm ? "Formu Kapat" : "Yeni Talep"}
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric
          label="Toplam Talep"
          value={stats.total}
          detail="Kayıtlı pazarlama talebi"
        />
        <Metric
          label="Yeni Talep"
          value={stats.new}
          detail="Henüz CRM'e aktarılmadı"
          attention={stats.new > 0}
        />
        <Metric
          label="CRM'e Aktarılan"
          value={stats.crm}
          detail="Satış sürecine alınan"
        />
        <Metric
          label="Randevu"
          value={stats.appointments}
          detail="Randevuya dönüştürülen"
        />
        <Metric
          label="Satış"
          value={stats.sales}
          detail="Satışa bağlanan talep"
        />
      </section>

      {showForm && canManage ? (
        <form
          onSubmit={(event) => void createLead(event)}
          className="grid gap-4 rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)] md:grid-cols-2 xl:grid-cols-3"
        >
          <Field label="Kaynak">
            <Select
              className={fieldClass}
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            >
              <option value="MANUAL">Elle Eklendi</option>
              <option value="META">Meta Reklamları</option>
              <option value="GOOGLE_ADS">Google Ads</option>
              <option value="TIKTOK">TikTok</option>
              <option value="WEBSITE">Web Sitesi</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="OTHER">Diğer</option>
            </Select>
          </Field>

          <Field label="Kampanya">
            <Select
              className={fieldClass}
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
            >
              <option value="">Kampanyasız</option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Kaynak Kayıt Numarası">
            <input
              className={fieldClass}
              value={externalLeadId}
              onChange={(e) => setExternalLeadId(e.target.value)}
              placeholder="İsteğe bağlı"
            />
          </Field>

          <Field label="Ad">
            <input
              required
              className={fieldClass}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </Field>

          <Field label="Soyad">
            <input
              required
              className={fieldClass}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </Field>

          <Field label="Telefon">
            <input
              className={fieldClass}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>

          <Field label="E-posta">
            <input
              type="email"
              className={fieldClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>

          <Field label="Hizmet İlgisi" wide>
            <input
              className={fieldClass}
              value={serviceInterest}
              onChange={(e) => setServiceInterest(e.target.value)}
              placeholder="Örn. Lazer epilasyon"
            />
          </Field>

          <div className="md:col-span-2 xl:col-span-3 flex justify-end">
            <Button disabled={saving} type="submit">
              {saving ? "Kaydediliyor..." : "Talebi Kaydet"}
            </Button>
          </div>
        </form>
      ) : null}

      {appointmentLeadId ? (
        <form
          onSubmit={(event) => void createAppointment(event)}
          className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]"
        >
          <div className="mb-5">
            <h2 className="text-[14px] font-semibold text-[var(--ink)]">
              Talebi Randevuya Dönüştür
            </h2>
            <p className="mt-1 text-[8px] text-[var(--muted)]">
              Hizmet ve personeli seçerek gerçek randevu kaydını oluşturun.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Hizmet">
              <Select
                required
                className={fieldClass}
                value={appointmentServiceId}
                onChange={(e) => setAppointmentServiceId(e.target.value)}
              >
                <option value="">Hizmet seçin</option>
                {services.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.durationMinutes} dk
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Personel">
              <Select
                required
                className={fieldClass}
                value={appointmentStaffId}
                onChange={(e) => setAppointmentStaffId(e.target.value)}
              >
                <option value="">Personel seçin</option>
                {staff.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.firstName} {item.lastName}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Başlangıç">
              <input
                required
                type="datetime-local"
                className={fieldClass}
                value={appointmentStartAt}
                onChange={(e) => setAppointmentStartAt(e.target.value)}
              />
            </Field>

            <Field label="Bitiş">
              <input
                required
                type="datetime-local"
                className={fieldClass}
                value={appointmentEndAt}
                onChange={(e) => setAppointmentEndAt(e.target.value)}
              />
            </Field>

            <Field label="Not" wide>
              <input
                className={fieldClass}
                value={appointmentNotes}
                onChange={(e) => setAppointmentNotes(e.target.value)}
                placeholder="Kampanya / görüşme notu"
              />
            </Field>
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setAppointmentLeadId("")}
            >
              Vazgeç
            </Button>
            <Button disabled={appointmentSaving} type="submit">
              {appointmentSaving ? "Oluşturuluyor..." : "Randevuyu Oluştur"}
            </Button>
          </div>
        </form>
      ) : null}

      <section className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-3 border-b border-[var(--line)] p-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-[13px] font-semibold text-[var(--ink)]">
              Talep Akışı
            </h2>
            <p className="mt-1 text-[8px] text-[var(--muted)]">
              {filtered.length} talep gösteriliyor
            </p>
          </div>

          <div className="flex flex-col gap-2 md:flex-row">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="İsim, telefon, kampanya veya hizmet ara…"
              className="h-10 min-w-[270px] rounded-[11px] border border-[var(--line)] bg-white px-3 text-[10px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
            />

            <Select
              value={providerFilter}
              onChange={(event) => setProviderFilter(event.target.value)}
              className="h-10 min-w-[140px] rounded-[11px] border border-[var(--line)] bg-white px-3 text-[10px]"
            >
              <option value="">Tüm Kaynaklar</option>
              {[
                "MANUAL",
                "META",
                "GOOGLE_ADS",
                "TIKTOK",
                "WEBSITE",
                "WHATSAPP",
                "OTHER",
              ].map((item) => (
                <option key={item} value={item}>
                  {userLabel(item)}
                </option>
              ))}
            </Select>

            <Select
              value={stageFilter}
              onChange={(event) => setStageFilter(event.target.value)}
              className="h-10 min-w-[135px] rounded-[11px] border border-[var(--line)] bg-white px-3 text-[10px]"
            >
              <option value="">Tüm Aşamalar</option>
              <option value="Yeni Talep">Yeni Talep</option>
              <option value="CRM">CRM</option>
              <option value="Müşteri">Müşteri</option>
              <option value="Randevu">Randevu</option>
              <option value="Satış">Satış</option>
            </Select>
          </div>
        </div>

        {filtered.length ? (
          <div className="divide-y divide-[var(--line)]">
            {filtered.map((lead) => (
              <article
                key={lead.id}
                className="grid gap-4 p-4 transition hover:bg-[var(--surface-2)]/35 xl:grid-cols-[minmax(230px,1.15fr)_minmax(180px,.75fr)_minmax(200px,.85fr)_minmax(290px,1.35fr)] xl:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[11px] font-semibold text-[var(--ink)]">
                      {lead.firstName} {lead.lastName}
                    </p>
                    <StageBadge value={stageLabel(lead)} />
                  </div>
                  <p className="mt-1 text-[8px] text-[var(--muted)]">
                    {lead.phone || lead.email || "İletişim bilgisi yok"}
                  </p>
                  <p className="mt-1 text-[8px] text-[var(--muted-soft)]">
                    Geliş: {formatDateTime(lead.receivedAt)}
                  </p>
                </div>

                <div>
                  <p className="text-[9px] font-medium text-[var(--ink)]">
                    {userLabel(lead.provider)}
                  </p>
                  <p className="mt-1 text-[8px] text-[var(--muted)]">
                    {lead.campaignName ?? "Kampanyasız"}
                  </p>
                </div>

                <div>
                  <span className="block text-[7px] text-[var(--muted)]">
                    İlgi
                  </span>
                  <strong className="mt-1 block text-[9px] font-medium text-[var(--ink)]">
                    {lead.serviceInterest ?? "Belirtilmedi"}
                  </strong>
                  <span className="mt-2 block text-[7px] text-[var(--muted)]">
                    Sistem durumu: {userLabel(lead.status)}
                  </span>
                </div>

                <LeadActions
                  lead={lead}
                  canManage={canManage}
                  canScheduleFromInbox={canScheduleFromInbox}
                  canCreateAppointment={canCreateAppointment}
                  convertingId={convertingId}
                  customerConvertingId={customerConvertingId}
                  onCrm={convertToCrm}
                  onCustomer={convertToCustomer}
                  onAppointment={openAppointment}
                />
              </article>
            ))}
          </div>
        ) : (
          <div className="p-10 text-center text-[9px] text-[var(--muted)]">
            Seçili filtrelerde pazarlama talebi bulunamadı.
          </div>
        )}
      </section>
    </div>
  );
}

function LeadActions({
  lead,
  canManage,
  canScheduleFromInbox,
  canCreateAppointment,
  convertingId,
  customerConvertingId,
  onCrm,
  onCustomer,
  onAppointment,
}: {
  lead: Lead;
  canManage: boolean;
  canScheduleFromInbox: boolean;
  canCreateAppointment: boolean;
  convertingId: string;
  customerConvertingId: string;
  onCrm: (id: string) => Promise<void>;
  onCustomer: (id: string) => Promise<void>;
  onAppointment: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 xl:justify-end">
      {!lead.crmLeadId && canManage ? (
        <Button
          variant="secondary"
          disabled={convertingId === lead.id}
          onClick={() => void onCrm(lead.id)}
        >
          {convertingId === lead.id ? "Aktarılıyor..." : "CRM'e Aktar"}
        </Button>
      ) : null}

      {lead.crmLeadId && !lead.customerId && canManage ? (
        <Button
          variant="secondary"
          disabled={customerConvertingId === lead.id}
          onClick={() => void onCustomer(lead.id)}
        >
          {customerConvertingId === lead.id
            ? "Dönüştürülüyor..."
            : "Müşteriye Dönüştür"}
        </Button>
      ) : null}

      {lead.customerId &&
      !lead.appointmentId &&
      canScheduleFromInbox ? (
        <Button onClick={() => onAppointment(lead.id)}>
          Randevu Oluştur
        </Button>
      ) : null}

      {lead.crmLeadId ? (
        <Link
          className="inline-flex h-9 items-center rounded-[10px] border border-[var(--line)] px-3 text-[9px] font-semibold text-[var(--accent)]"
          href="/crm/leads"
        >
          CRM
        </Link>
      ) : null}

      {lead.customerId ? (
        <Link
          className="inline-flex h-9 items-center rounded-[10px] border border-[var(--line)] px-3 text-[9px] font-semibold text-[var(--accent)]"
          href={"/customers/" + lead.customerId}
        >
          Müşteri
        </Link>
      ) : null}

      {lead.appointmentId ? (
        <Link
          className="inline-flex h-9 items-center rounded-[10px] border border-[var(--line)] px-3 text-[9px] font-semibold text-[var(--accent)]"
          href="/appointments"
        >
          Randevu
        </Link>
      ) : null}

      {lead.customerId &&
      !lead.appointmentId &&
      canCreateAppointment &&
      !canScheduleFromInbox ? (
        <span className="self-center text-[8px] leading-4 text-[var(--muted)]">
          Randevu için personel ve hizmet görüntüleme yetkisi gerekir.
        </span>
      ) : null}
    </div>
  );
}

function Field({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <label
      className={
        wide
          ? "text-[10px] font-semibold text-[var(--muted)] md:col-span-2"
          : "text-[10px] font-semibold text-[var(--muted)]"
      }
    >
      {label}
      {children}
    </label>
  );
}

function Metric({
  label,
  value,
  detail,
  attention,
}: {
  label: string;
  value: number;
  detail: string;
  attention?: boolean;
}) {
  return (
    <div
      className={
        attention
          ? "rounded-[18px] border border-[var(--warning)]/25 bg-[var(--warning-soft)] p-4"
          : "rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)]"
      }
    >
      <p className="text-[8px] font-semibold uppercase tracking-[.12em] text-[var(--muted)]">
        {label}
      </p>
      <strong className="mt-3 block text-[22px] font-semibold tracking-[-.04em] text-[var(--ink)]">
        {value}
      </strong>
      <p className="mt-2 text-[8px] text-[var(--muted)]">{detail}</p>
    </div>
  );
}

function StageBadge({ value }: { value: string }) {
  return (
    <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[7px] font-semibold text-[var(--accent)]">
      {value}
    </span>
  );
}
