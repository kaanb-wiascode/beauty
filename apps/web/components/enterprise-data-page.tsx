"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Alert, Button, EmptyState, Field, PageHeader, Select, Spinner, TextArea, TextInput } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { userLabel } from "@/lib/user-language";

export type EnterpriseSection = {
  title: string;
  description?: string;
  path: string;
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
  type?: "text" | "number" | "date" | "datetime-local" | "textarea" | "select" | "boolean" | "json";
  required?: boolean;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  defaultValue?: string;
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
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .trim();
  return userLabel(spaced.replace(/\b\w/g, (char) => char.toUpperCase()));
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
    return userLabel(value);
  }
  return JSON.stringify(value);
}

function rowsFrom(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  for (const key of ["data", "items", "rows", "results", "entries", "employees", "branches", "scores", "policies", "tickets", "runs"]) {
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
      if (result.status === "fulfilled") next[sections[index].title] = result.value;
      else failures.push(result.reason instanceof ApiError ? result.reason.message : `${sections[index].title} yüklenemedi.`);
    });
    setData(next);
    if (failures.length) setError(failures.join(" "));
    setLoading(false);
  }, [sections]);

  useEffect(() => { void load(); }, [load]);

  async function run(action: EnterpriseAction) {
    setWorking(action.label);
    setError("");
    setNotice("");
    try {
      await api(action.path, { method: action.method ?? "POST", body: action.body });
      setNotice(action.success ?? `${action.label} tamamlandı.`);
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "İşlem tamamlanamadı.");
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
          setError(`${field.label} geçerli bir JSON değeri olmalıdır.`);
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
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "İşlem tamamlanamadı.");
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

    {forms.length ? <section className="grid gap-5 xl:grid-cols-2">
      {forms.map((form) => {
        const values = formValues[form.title] ?? {};
        return <div key={form.title} className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5">
          <h2 className="text-[14px] font-semibold text-[var(--ink)]">{form.title}</h2>
          {form.description ? <p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">{form.description}</p> : null}
          <div className="mt-4 grid gap-4">
            {form.fields.map((field) => <Field key={field.name} label={field.label} required={field.required}>
              {field.type === "select" || field.type === "boolean" ? <Select value={values[field.name] ?? ""} onChange={(event) => setFormValues((current) => ({...current,[form.title]:{...(current[form.title]??{}),[field.name]:event.target.value}}))}>
                {field.type === "boolean" ? <><option value="true">Evet</option><option value="false">Hayır</option></> : <><option value="">Seçin</option>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</>}
              </Select> : field.type === "textarea" || field.type === "json" ? <TextArea rows={field.type === "json" ? 5 : 3} placeholder={field.placeholder} value={values[field.name] ?? ""} onChange={(event) => setFormValues((current) => ({...current,[form.title]:{...(current[form.title]??{}),[field.name]:event.target.value}}))}/> : <TextInput type={field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "datetime-local" ? "datetime-local" : "text"} placeholder={field.placeholder} value={values[field.name] ?? ""} onChange={(event) => setFormValues((current) => ({...current,[form.title]:{...(current[form.title]??{}),[field.name]:event.target.value}}))}/>}
            </Field>)}
          </div>
          <Button className="mt-5" onClick={() => void submitForm(form)} disabled={Boolean(working)}>{working === form.title ? "İşleniyor..." : form.title}</Button>
        </div>;
      })}
    </section> : null}

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
          return <section key={section.title} className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)]">
            <div className="border-b border-[var(--line)] px-5 py-4">
              <h2 className="text-[14px] font-semibold text-[var(--ink)]">{section.title}</h2>
              {section.description ? <p className="mt-1 text-[11px] text-[var(--muted)]">{section.description}</p> : null}
            </div>
            {rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs">
              <thead><tr className="border-b border-[var(--line)] bg-[var(--surface-2)]/45 text-[10px] uppercase tracking-[.08em] text-[var(--muted-soft)]">
                {keys.map((key) => <th key={key} className="px-4 py-3">{humanize(key)}</th>)}
              </tr></thead>
              <tbody>{rows.slice(0,100).map((row,index) => <tr key={String(row.id ?? row.staffId ?? row.tenantId ?? index)} className="border-b border-[var(--line)] last:border-0">
                {keys.map((key) => <td key={key} className="max-w-[320px] truncate px-4 py-4 text-[var(--muted)]" title={display(row[key])}>{display(row[key])}</td>)}
              </tr>)}</tbody>
            </table></div> : <EmptyState title="Kayıt bulunamadı" description="Bu modülde henüz görüntülenecek kayıt bulunmuyor." />}
          </section>;
        })}
      </div>
    )}
  </div>;
}

function Metric({label,value}:{label:string;value:string|number}) {
  return <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4">
    <p className="text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--muted-soft)]">{label}</p>
    <p className="mt-2 text-[21px] font-semibold tracking-[-.03em] text-[var(--ink)]">{value}</p>
  </div>;
}
