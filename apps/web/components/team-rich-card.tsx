"use client";

import Link from "next/link";

export type ValooRichCardPayload = {
  kind: "APPOINTMENT" | "CUSTOMER" | "PAYMENT";
  id: string;
  title: string;
  subtitle?: string;
  meta?: string[];
  href: string;
};

export const VALOO_CARD_PREFIX = "[[VALOO_CARD]]";

export function encodeValooRichCard(payload: ValooRichCardPayload) {
  return `${VALOO_CARD_PREFIX}${JSON.stringify(payload)}`;
}

export function parseValooRichCard(value: string): ValooRichCardPayload | null {
  if (!value.startsWith(VALOO_CARD_PREFIX)) return null;
  try {
    const parsed = JSON.parse(value.slice(VALOO_CARD_PREFIX.length)) as Partial<ValooRichCardPayload>;
    if (!parsed || !parsed.kind || !parsed.id || !parsed.title || !parsed.href) return null;
    if (!["APPOINTMENT", "CUSTOMER", "PAYMENT"].includes(parsed.kind)) return null;
    return parsed as ValooRichCardPayload;
  } catch {
    return null;
  }
}

const KIND_LABELS: Record<ValooRichCardPayload["kind"], string> = {
  APPOINTMENT: "Randevu",
  CUSTOMER: "Müşteri",
  PAYMENT: "Ödeme",
};

export function TeamRichCard({ payload, mine }: { payload: ValooRichCardPayload; mine: boolean }) {
  return (
    <Link
      href={payload.href}
      className={`mt-1 block min-w-[260px] overflow-hidden rounded-[15px] border text-left transition hover:-translate-y-0.5 hover:shadow-md ${mine ? "border-white/20 bg-white/10 text-white" : "border-[var(--line)] bg-white text-[var(--ink)]"}`}
    >
      <div className={`flex items-center justify-between border-b px-3 py-2 ${mine ? "border-white/10" : "border-[var(--line)] bg-[var(--surface-2)]/70"}`}>
        <span className={`text-[9px] font-bold uppercase tracking-[.1em] ${mine ? "text-white/70" : "text-[var(--accent)]"}`}>VALOO · {KIND_LABELS[payload.kind]}</span>
        <span className={`text-[10px] ${mine ? "text-white/60" : "text-[var(--muted)]"}`}>↗</span>
      </div>
      <div className="px-3 py-3">
        <p className="text-[11px] font-semibold">{payload.title}</p>
        {payload.subtitle ? <p className={`mt-1 text-[9px] ${mine ? "text-white/65" : "text-[var(--muted)]"}`}>{payload.subtitle}</p> : null}
        {payload.meta?.length ? (
          <div className="mt-2 space-y-1">
            {payload.meta.map((item) => <p key={item} className={`text-[8px] ${mine ? "text-white/55" : "text-[var(--muted-soft)]"}`}>{item}</p>)}
          </div>
        ) : null}
        <div className={`mt-3 text-[9px] font-semibold ${mine ? "text-white" : "text-[var(--accent)]"}`}>Kaydı aç →</div>
      </div>
    </Link>
  );
}
