"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { CardInfo } from "@/components/card-info";
import { Alert, Button, EmptyState, Field, Modal, PageHeader, Select, Spinner, TextArea, TextInput } from "@/components/ui";
import { ValooSelect } from "@/components/valoo-controls";
import { api, ApiError } from "@/lib/api";
import { getCardHelp } from "@/lib/card-help";
import { userErrorMessage, userFieldLabel, userLabel, userText } from "@/lib/user-language";

export type EnterpriseSection = {
  title: string;
  description?: string;
  path: string;
  dataKey?: string;
  emptyActionFormTitle?: string;
};

export type EnterpriseAction = {
  label: string;
  path: string;
  method?: "POST" | "PATCH" | "PUT";
  body?: Record<string, unknown>;
  success?: string;
};

export type EnterpriseFormField = {
  name: string;
  label: string;
  type?: "text" | "number" | "date" | "datetime-local" | "textarea" | "select" | "boolean" | "json" | "remote-select" | "hidden";
  required?: boolean;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  defaultValue?: string;
  optionsPath?: string;
  optionValueKey?: string;
  optionLabelKeys?: string[];
  createFormTitle?: string;
};

export type EnterpriseMutationForm = {
  title: string;
  description?: string;
  path: string;
  method?: "POST" | "PATCH" | "PUT";
  success?: string;
  fields: EnterpriseFormField[];
};

function humanize(key: string) {
  return userFieldLabel(key);
}

function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Evet" : "Hayır";
  if (typeof value === "number") return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(value);
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleString("tr-TR");
    }
    if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value)) return "Sistem kaydı";
    return userText(value);
  }
  if (Array.isArray(value)) return value.length ? `${value.length} kayıt` : "—";
  if (typeof value === "object") return "Ayrıntılar mevcut";
  return String(value);
}

function rowsFrom(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  for (const key of ["data", "items", "rows", "results", "entries", "employees", "departments", "teams", "positions", "branches", "scores", "policies", "tickets", "runs"]) {
    const nested = record[key];
    if (Array.isArray(nested)) return nested.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
  }
  return [record];
}

function visibleKeys(rows: Array<Record<string, unknown>>) {
  const score = new Map<string, number>();
  for (const row of rows.slice(0, 10)) {
    for (const [key, value] of Object.entries(row)) {
      if (value === undefined || value === null || typeof value === "object") continue;
      if (
        key === "id" ||
        /Id$/.test(key) ||
        /^(tenant|company|branch|source|target|reference|external).*Id$/i.test(key) ||
        /^(createdBy|updatedBy|actorId|membershipId|journalEntryLineId)$/i.test(key)
      ) continue;
      score.set(key, (score.get(key) ?? 0) + 1);
    }
  }
  const preferred = ["name","title","status","type","branchName","firstName","lastName","staffName","amount","currency","dueDate","plannedFor","score","priority","createdAt"];
  return [...score.keys()].sort((a,b) => {
    const ai=preferred.indexOf(a), bi=preferred.indexOf(b);
    if(ai>=0||bi>=0) return (ai<0?999:ai)-(bi<0?999:bi);
    return (score.get(b)??0)-(score.get(a)??0);
  }).slice(0,8);
}

export function EnterpriseDataPage({
  eyebrow,
  title,
  description,
  sections,
  actions = [],
  forms = [],
}: {
  eyebrow: string;
  title: string;
  description: string;
  sections: EnterpriseSection[];
  actions?: EnterpriseAction[];
  forms?: EnterpriseMutationForm[];
}) {
  const [data, setData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activeForm, setActiveForm] = useState<EnterpriseMutationForm | null>(null);
  const [remoteOptions, setRemoteOptions] = useState<Record<string, Array<{ value: string; label: string }>>>({});
  const [formValues, setFormValues] = useState<Record<string, Record<string, string>>>(() =>
    Object.fromEntries(forms.map((form) => [form.title, Object.fromEntries(form.fields.map((field) => [field.name, field.defaultValue ?? ""]))])),
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const settled = await Promise.allSettled(sections.map((section) => api<unknown>(section.path)));
    const next: Record<string, unknown> = {};
    const failures: string[] = [];
    settled.forEach((result, index) => {
      const section = sections[index];
      if (result.status === "fulfilled") {
        if (section.dataKey && result.value && typeof result.value === "object" && !Array.isArray(result.value)) {
          next[section.title] = (result.value as Record<string, unknown>)[section.dataKey] ?? [];
        } else {
          next[section.title] = result.value;
        }
      } else failures.push(result.reason instanceof ApiError ? userErrorMessage(result.reason.message, `${section.title} yüklenemedi.`) : `${section.title} yüklenemedi.`);
    });
    setData(next);
    if (failures.length) setError(failures.join(" "));
    setLoading(false);
  }, [sections]);

  useEffect(() => { void load(); }, [load]);

  function resolvedOptionsPath(form: EnterpriseMutationForm, field: EnterpriseFormField) {
    if (!field.optionsPath) return "";
    let path = field.optionsPath;
    const values = formValues[form.title] ?? {};
    for (const token of path.matchAll(/\{([^}]+)\}/g)) {
      const key = token[1];
      const value = values[key];
      if (!value) return "";
      path = path.replaceAll(`{${key}}`, encodeURIComponent(value));
    }
    return path;
  }

  function remoteOptionsKey(form: EnterpriseMutationForm, field: EnterpriseFormField) {
    const path = resolvedOptionsPath(form, field);
    return path ? `${form.title}::${field.name}::${path}` : "";
  }

  useEffect(() => {
    const requests = forms.flatMap((form) =>
      form.fields
        .filter((field) => field.type === "remote-select" && field.optionsPath)
        .map((field) => ({ form, field, path: resolvedOptionsPath(form, field) }))
        .filter((item) => Boolean(item.path)),
    );
    const unique = [...new Map(requests.map((item) => [`${item.form.title}::${item.field.name}::${item.path}`, item])).values()];
    if (!unique.length) return;
    let active = true;
    void Promise.all(unique.map(async ({ form, field, path }) => {
      const key = `${form.title}::${field.name}::${path}`;
      try {
        const response = await api<unknown>(path);
        const rows = rowsFrom(response);
        const valueKey = field.optionValueKey ?? "id";
        const labelKeys = field.optionLabelKeys?.length ? field.optionLabelKeys : ["name", "title"];
        const options = rows
          .map((row) => {
            const value = row[valueKey];
            if (typeof value !== "string" || !value) return null;
            const label = labelKeys
              .map((labelKey) => row[labelKey])
              .filter((item) => typeof item === "string" && item.trim())
              .join(" · ")
              .trim();
            return { value, label: label || "Kayıt" };
          })
          .filter((option): option is { value: string; label: string } => Boolean(option));
        return [key, options] as const;
      } catch {
        return [key, []] as const;
      }
    })).then((entries) => {
      if (active) setRemoteOptions((current) => ({ ...current, ...Object.fromEntries(entries) }));
    });
    return () => { active = false; };
  }, [forms, formValues]);


  async function run(action: EnterpriseAction) {
    setWorking(action.label);
    setError("");
    setNotice("");
    try {
      await api(action.path, { method: action.method ?? "POST", body: action.body });
      setNotice(action.success ?? `${userText(action.label)} tamamlandı.`);
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? userErrorMessage(requestError.message) : "İşlem tamamlanamadı.");
    } finally {
      setWorking("");
    }
  }

  async function submitForm(form: EnterpriseMutationForm) {
    const values = formValues[form.title] ?? {};
    for (const field of form.fields) {
      if (field.required && !String(values[field.name] ?? "").trim()) {
        setError(`${field.label} zorunludur.`);
        return;
      }
    }
    let path = form.path;
    const consumed = new Set<string>();
    for (const field of form.fields) {
      const token = `{${field.name}}`;
      if (path.includes(token)) {
        path = path.replaceAll(token, encodeURIComponent(String(values[field.name] ?? "")));
        consumed.add(field.name);
      }
    }
    const body: Record<string, unknown> = {};
    for (const field of form.fields) {
      if (consumed.has(field.name)) continue;
      const raw = values[field.name];
      if (raw === "" || raw === undefined) continue;
      if (field.type === "json") {
        try {
          body[field.name] = JSON.parse(raw);
        } catch {
          setError(`${field.label} alanındaki liste veya yapı biçimi geçerli değil. Lütfen örneğe uygun girin.`);
          return;
        }
      } else {
        body[field.name] = field.type === "number" ? Number(raw) : field.type === "boolean" ? raw === "true" : raw;
      }
    }
    setWorking(form.title);
    setError("");
    setNotice("");
    try {
      await api(path, { method: form.method ?? "POST", body });
      setNotice(form.success ?? `${form.title} tamamlandı.`);
      setActiveForm(null);
      setFormValues((current) => ({
        ...current,
        [form.title]: Object.fromEntries(form.fields.map((field) => [field.name, field.defaultValue ?? ""])),
      }));
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? userErrorMessage(requestError.message) : "İşlem tamamlanamadı.");
    } finally {
      setWorking("");
    }
  }

  const totalRecords = useMemo(() => sections.reduce((sum, section) => sum + rowsFrom(data[section.title]).length, 0), [data, sections]);

  return <div className="mx-auto max-w-[1500px] space-y-6 pb-12">
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[.14em] text-[var(--muted-soft)]">{eyebrow}</p>
      <PageHeader title={title} description={description} action={<Button variant="secondary" onClick={() => void load()} disabled={loading}>{loading ? "Yükleniyor..." : "Yenile"}</Button>} />
    </div>

    {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
    {notice ? <Alert tone="success" onClose={() => setNotice("")}>{notice}</Alert> : null}

    {actions.length ? <section className="flex flex-wrap gap-2 rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4">
      {actions.map((action) => <Button key={action.label} variant="secondary" disabled={Boolean(working)} onClick={() => void run(action)}>{working === action.label ? "İşleniyor..." : action.label}</Button>)}
    </section> : null}

    {forms.length ? <section className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-[14px] font-semibold text-[var(--ink)]">Hızlı İşlemler</h2>
          <p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">Yeni kayıt ve güncelleme işlemlerini sayfadan ayrılmadan başlatın.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {forms.map((form, index) => <Button key={form.title} variant={index === 0 ? "primary" : "secondary"} size="sm" onClick={() => setActiveForm(form)}>
            {index === 0 ? "+ " : ""}{userText(form.title)}
          </Button>)}
        </div>
      </div>
    </section> : null}

    <Modal
      open={Boolean(activeForm)}
      onClose={() => {
        if (!working) setActiveForm(null);
      }}
      title={activeForm ? userText(activeForm.title) : ""}
      description={activeForm?.description ? userText(activeForm.description) : undefined}
    >
      {activeForm ? (() => {
        const form = activeForm;
        const values = formValues[form.title] ?? {};
        return <div>
          <div className="grid gap-4">
            {form.fields.map((field) => field.type === "hidden" ? null : <Field key={field.name} label={field.label} required={field.required}>
              {field.type === "remote-select" ? <ValooSelect
                value={values[field.name] ?? ""}
                onChange={(value) => setFormValues((current) => ({...current,[form.title]:{...(current[form.title]??{}),[field.name]:value}}))}
                options={remoteOptions[remoteOptionsKey(form, field)] ?? []}
                placeholder="Seçin"
                searchPlaceholder={field.label + " ara…"}
                emptyLabel="Kayıt bulunamadı."
                createAction={field.createFormTitle ? {
                  label: "+ Yeni ekle",
                  onClick: () => {
                    const target = forms.find((item) => item.title === field.createFormTitle);
                    if (target) setActiveForm(target);
                  },
                } : undefined}
              /> : field.type === "select" || field.type === "boolean" ? <Select value={values[field.name] ?? ""} onChange={(event) => setFormValues((current) => ({...current,[form.title]:{...(current[form.title]??{}),[field.name]:event.target.value}}))}>
                {field.type === "boolean" ? <><option value="true">Evet</option><option value="false">Hayır</option></> : <><option value="">Seçin</option>{(field.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</>}
              </Select> : field.type === "textarea" || field.type === "json" ? <TextArea rows={field.type === "json" ? 5 : 3} placeholder={field.placeholder} value={values[field.name] ?? ""} onChange={(event) => setFormValues((current) => ({...current,[form.title]:{...(current[form.title]??{}),[field.name]:event.target.value}}))}/> : <TextInput type={field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "datetime-local" ? "datetime-local" : "text"} placeholder={field.placeholder} value={values[field.name] ?? ""} onChange={(event) => setFormValues((current) => ({...current,[form.title]:{...(current[form.title]??{}),[field.name]:event.target.value}}))}/>}
            </Field>)}
          </div>
          <div className="mt-6 flex justify-end gap-2 border-t border-[var(--line)] pt-4">
            <Button variant="secondary" onClick={() => setActiveForm(null)} disabled={Boolean(working)}>Vazgeç</Button>
            <Button onClick={() => void submitForm(form)} disabled={Boolean(working)}>{working === form.title ? "Kaydediliyor..." : "Kaydet"}</Button>
          </div>
        </div>;
      })() : null}
    </Modal>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Bağlı Modül" value={sections.length} />
      <Metric label="Görüntülenen Kayıt" value={totalRecords} />
      <Metric label="Aktif Veri Kaynağı" value={Object.keys(data).length} />
      <Metric label="Durum" value={error ? "Kısmi" : "Hazır"} />
    </section>

    {loading && !Object.keys(data).length ? <Spinner label={`${title} hazırlanıyor...`} /> : (
      <div className="grid gap-5">
        {sections.map((section) => {
          const rows = rowsFrom(data[section.title]);
          const keys = visibleKeys(rows);
          return <section key={userText(section.title)} className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)]">
            <div className="border-b border-[var(--line)] px-5 py-4">
              <div className="flex items-start gap-2"><h2 className="min-w-0 text-[14px] font-semibold text-[var(--ink)]">{userText(section.title)}</h2><CardInfo help={getCardHelp(userText(section.title), section.description)} className="ml-auto" /></div>
              {section.description ? <p className="mt-1 text-[11px] text-[var(--muted)]">{userText(section.description)}</p> : null}
            </div>
            {rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs">
              <thead><tr className="border-b border-[var(--line)] bg-[var(--surface-2)]/45 text-[10px] uppercase tracking-[.08em] text-[var(--muted-soft)]">
                {keys.map((key) => <th key={key} className="px-4 py-3">{humanize(key)}</th>)}
              </tr></thead>
              <tbody>{rows.slice(0,100).map((row,index) => <tr key={String(row.id ?? row.staffId ?? row.tenantId ?? index)} className="border-b border-[var(--line)] last:border-0">
                {keys.map((key) => <td key={key} className="max-w-[320px] truncate px-4 py-4 text-[var(--muted)]" title={display(row[key])}>{display(row[key])}</td>)}
              </tr>)}</tbody>
            </table></div> : <div className="p-5 sm:p-7">
              <EmptyState title="Kayıt bulunamadı" description="Bu modülde henüz görüntülenecek kayıt bulunmuyor." />
              {section.emptyActionFormTitle ? <div className="mt-4 flex justify-center">
                <Button onClick={() => {
                  const target = forms.find((item) => item.title === section.emptyActionFormTitle);
                  if (target) setActiveForm(target);
                }}>+ Yeni kayıt ekle</Button>
              </div> : null}
            </div>}
          </section>;
        })}
      </div>
    )}
  </div>;
}

function Metric({label,value}:{label:string;value:string|number}) {
  return <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4">
    <div className="flex items-start gap-2"><p className="min-w-0 text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--muted-soft)]">{userText(label)}</p><CardInfo help={getCardHelp(userText(label))} className="ml-auto" /></div>
    <p className="mt-2 text-[21px] font-semibold tracking-[-.03em] text-[var(--ink)]">{value}</p>
  </div>;
}
