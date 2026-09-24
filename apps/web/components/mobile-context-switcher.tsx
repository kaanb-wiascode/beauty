"use client";

import { useEffect, useState } from "react";

import { api, ApiError } from "@/lib/api";
import { userErrorMessage } from "@/lib/user-language";
import { persistSession } from "@/lib/auth";
import { ValooSelect } from "@/components/valoo-controls";

type BranchOption = {
  id: string;
  name: string;
  code: string;
};

type ContextOptions = {
  membershipId: string;
  roleScope: "CENTRAL" | "COMPANY" | "BRANCH";
  activeBranchId: string | null;
  canViewAllBranches: boolean;
  branches: BranchOption[];
};

type SwitchContextResponse = {
  accessToken: string;
};

export function MobileContextSwitcher() {
  const [options, setOptions] = useState<ContextOptions | null>(null);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadOptions() {
      try {
        const result = await api<ContextOptions>("/auth/context/options");
        if (active) setOptions(result);
      } catch {
        if (active) setError("Çalışma kapsamı yüklenemedi.");
      }
    }

    void loadOptions();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !switching) setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, switching]);

  const activeBranchName = options?.activeBranchId
    ? options.branches.find((branch) => branch.id === options.activeBranchId)?.name ?? "Şube"
    : "Tüm Şubeler";

  async function switchBranch(value: string) {
    if (!options || switching) return;

    const branchId = value === "__all__" ? null : value;
    if (branchId === options.activeBranchId) return;

    setSwitching(true);
    setError("");

    try {
      const result = await api<SwitchContextResponse>("/auth/context/switch", {
        method: "POST",
        body: {
          membershipId: options.membershipId,
          branchId,
        },
      });

      persistSession({
        accessToken: result.accessToken,
      });

      window.location.reload();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? userErrorMessage(requestError.message, "Çalışma kapsamı değiştirilemedi.")
          : "Çalışma kapsamı değiştirilemedi.",
      );
      setSwitching(false);
    }
  }

  if (!options) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="fixed bottom-[91px] right-3 z-[69] inline-flex max-w-[70vw] items-center gap-2 rounded-full border border-white/80 bg-white/92 px-3 py-2 text-[11px] font-semibold text-[var(--ink)] shadow-[0_10px_30px_rgba(15,23,42,0.12)] backdrop-blur-2xl lg:hidden"
      >
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[var(--accent)]" />
        <span className="truncate">{activeBranchName}</span>
        <span aria-hidden="true" className="text-[11px] text-[var(--muted)]">▾</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[90] lg:hidden">
          <button
            type="button"
            aria-label="Çalışma kapsamını kapat"
            className="absolute inset-0 bg-slate-950/30 backdrop-blur-[2px]"
            onClick={() => {
              if (!switching) setOpen(false);
            }}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-context-title"
            className="absolute inset-x-3 bottom-[84px] rounded-[24px] border border-white/80 bg-white/95 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)] backdrop-blur-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Çalışma kapsamı</p>
                <h2 id="mobile-context-title" className="mt-1 text-[18px] font-semibold text-[var(--ink)]">Şube seçimi</h2>
                <p className="mt-1 text-[12px] text-[var(--muted)]">Aktif kapsam: {activeBranchName}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={switching}
                aria-label="Kapat"
                className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[var(--surface-2)] text-[18px] text-[var(--muted)] disabled:opacity-50"
              >
                ×
              </button>
            </div>

            <label className="mt-5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              Aktif şube
            </label>
            <ValooSelect
              className="mt-2"
              value={options.activeBranchId ?? "__all__"}
              onChange={(value) => void switchBranch(value)}
              disabled={switching}
              loading={switching}
              searchable={options.branches.length > 7}
              placeholder="Şube seçin"
              searchPlaceholder="Şube ara…"
              ariaLabel="Aktif şube"
              options={[
                ...(options.canViewAllBranches
                  ? [{ value: "__all__", label: "Tüm şubeler" }]
                  : []),
                ...options.branches.map((branch) => ({
                  value: branch.id,
                  label: branch.name,
                  description: branch.code || undefined,
                  keywords: branch.code,
                })),
              ]}
            />

            {switching ? <p className="mt-3 text-[12px] text-[var(--muted)]">Çalışma kapsamı değiştiriliyor…</p> : null}
            {error ? <p className="mt-3 text-[12px] font-medium text-[var(--danger)]">{error}</p> : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
