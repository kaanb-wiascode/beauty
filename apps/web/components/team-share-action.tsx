"use client";

import { useRouter } from "next/navigation";
import { encodeValooRichCard, type ValooRichCardPayload } from "./team-rich-card";

export function TeamShareAction({
  payload,
  label = "Sohbette Paylaş",
  className = "",
}: {
  payload: ValooRichCardPayload;
  label?: string;
  className?: string;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        window.localStorage.setItem("valoo-team-pending-rich-card", encodeValooRichCard(payload));
        router.push("/team");
      }}
      className={className || "inline-flex h-9 items-center justify-center rounded-[11px] border border-[var(--line)] bg-white px-3 text-[10px] font-semibold text-[var(--accent)] transition hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]"}
    >
      {label}
    </button>
  );
}
