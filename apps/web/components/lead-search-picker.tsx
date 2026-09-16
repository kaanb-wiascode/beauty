"use client";

import { useEffect, useState } from "react";
import { Spinner, TextInput } from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";

export type LeadSearchResult = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  status: string;
  customerId?: string | null;
  opportunityId?: string | null;
};

export function LeadSearchPicker({
  selected,
  disabled,
  onSelect,
}: {
  selected?: LeadSearchResult | null;
  disabled?: boolean;
  onSelect: (lead: LeadSearchResult | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<LeadSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (selected && !query) setQuery(`${selected.firstName} ${selected.lastName}`.trim());
  }, [selected, query]);

  useEffect(() => {
    const value = query.trim();
    const selectedLabel = selected ? `${selected.firstName} ${selected.lastName}`.trim() : "";
    if (selected && value === selectedLabel) {
      setRows([]);
      return;
    }
    if (value.length < 2) {
      setRows([]);
      setError("");
      return;
    }

    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const result = await api<LeadSearchResult[]>(
          withQuery("/crm/leads", { search: value, limit: 20 }),
        );
        setRows(result);
      } catch (requestError) {
        setError(requestError instanceof ApiError ? requestError.message : "Lead aranamadı.");
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [query, selected]);

  return (
    <div className="relative space-y-2">
      <TextInput
        value={query}
        disabled={disabled}
        onChange={(event) => {
          setQuery(event.target.value);
          if (selected) onSelect(null);
        }}
        placeholder="Lead adı, telefon veya e-posta ile ara..."
        autoComplete="off"
      />
      {loading ? <div className="py-2"><Spinner label="Lead'ler aranıyor..." /></div> : null}
      {error ? <p className="text-[11px] text-[#9c513f]">{error}</p> : null}
      {rows.length ? (
        <div className="absolute z-30 max-h-72 w-full overflow-auto rounded-[14px] border border-[var(--line)] bg-white p-1 shadow-xl">
          {rows.map((row) => {
            const contact = row.phone || row.email || "İletişim bilgisi yok";
            return (
              <button
                key={row.id}
                type="button"
                className="block w-full rounded-[10px] px-3 py-2 text-left hover:bg-[#f4f9fc]"
                onClick={() => {
                  onSelect(row);
                  setQuery(`${row.firstName} ${row.lastName}`.trim());
                  setRows([]);
                }}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="text-[12px] font-semibold">{row.firstName} {row.lastName}</span>
                  <span className="text-[9px] font-semibold text-[var(--muted)]">{row.status}</span>
                </span>
                <span className="mt-0.5 block text-[10px] text-[var(--muted)]">{contact}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
