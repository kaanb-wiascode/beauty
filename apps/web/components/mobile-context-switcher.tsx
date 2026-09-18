"use client";

import { useEffect, useState } from "react";

import { api, ApiError } from "@/lib/api";
import { persistSession } from "@/lib/auth";

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
  refreshToken: string;
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
        if (active) setError("Çalışma Kapsamı Yüklenemedi.");
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
        refreshToken: result.refreshToken,
      });

      window.location.reload();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Çalışma Kapsamı Değiştirilemedi.",
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
        <span aria-hidden="true" className="text-[9px] text-[var(--muted)]">▾</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[90] lg:hidden">
          <button
            type="button"
            aria-label="Çalışma Kapsamını Kapat"
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
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-soft)]">Çalışma Kapsamı</p>
                <h2 id="mobile-context-title" className="mt-1 text-[18px] font-semibold text-[var(--ink)]">Şube Seçimi</h2>
                <p className="mt-1 text-[11px] text-[var(--muted)]">Aktif kapsam: {activeBranchName}</p>
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

            <label htmlFor="mobile-branch-context" className="mt-5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-soft)]">
              Aktif Şube
            </label>
            <select
              id="mobile-branch-context"
              value={options.activeBranchId ?? "__all__"}
              onChange={(event) => void switchBranch(event.target.value)}
              disabled={switching}
              className="mt-2 h-12 w-full rounded-[14px] border border-[var(--line)] bg-white px-3 text-[13px] font-medium text-[var(--ink)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] disabled:cursor-wait disabled:opacity-60"
            >
              {options.canViewAllBranches ? <option value="__all__">Tüm Şubeler</option> : null}
              {options.branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name} {branch.code ? `· ${branch.code}` : ""}
                </option>
              ))}
            </select>

            {switching ? <p className="mt-3 text-[11px] text-[var(--muted)]">Çalışma Kapsamı Değiştiriliyor…</p> : null}
            {error ? <p className="mt-3 text-[11px] font-medium text-red-600">{error}</p> : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
