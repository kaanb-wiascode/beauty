"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { ApiError } from "@/lib/api";
import { getPlatformCommandCenter } from "@/lib/platform-api";

export function PlatformAccessBoundary({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "allowed" | "denied" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    getPlatformCommandCenter()
      .then(() => {
        if (active) setState("allowed");
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 403) {
          setMessage("Bu oturumun platform control plane erişimi bulunmuyor.");
          setState("denied");
          return;
        }
        setMessage(
          error instanceof ApiError
            ? error.message
            : "Platform erişimi doğrulanamadı.",
        );
        setState("error");
      });

    return () => {
      active = false;
    };
  }, []);

  if (state === "loading") {
    return (
      <div className="grid min-h-screen place-items-center bg-[#070912] px-6 text-white">
        <div className="text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-white/15 border-t-violet-400" />
          <p className="mt-4 text-xs font-medium text-white/50">Platform yetkisi doğrulanıyor…</p>
        </div>
      </div>
    );
  }

  if (state !== "allowed") {
    return (
      <div className="grid min-h-screen place-items-center bg-[#070912] px-6 text-white">
        <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-white/[.04] p-7 shadow-2xl backdrop-blur-xl">
          <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-violet-300">
            Platform Control Plane
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">
            {state === "denied" ? "Erişim reddedildi" : "Erişim doğrulanamadı"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-white/50">{message}</p>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex rounded-xl border border-white/10 bg-white/[.06] px-4 py-2.5 text-xs font-semibold text-white/80 transition hover:bg-white/[.1]"
          >
            Tenant uygulamasına dön
          </Link>
        </div>
      </div>
    );
  }

  return children;
}
