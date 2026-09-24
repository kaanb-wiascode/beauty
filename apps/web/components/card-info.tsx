import type { CardHelpContent } from "@/lib/card-help";
import { cx } from "@/lib/format";

export function CardInfo({
  help,
  className,
}: {
  help: CardHelpContent;
  className?: string;
}) {
  return (
    <details className={cx("group/card-info relative z-30 w-fit", className)}>
      <summary
        aria-label={`${help.title} hakkında bilgi`}
        title={`${help.title} hakkında bilgi`}
        className="flex h-5 w-5 cursor-pointer list-none items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[11px] font-semibold not-italic text-[var(--muted)] shadow-[0_1px_3px_rgba(17,70,104,.06)] transition hover:border-[var(--line-strong)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-soft)] [&::-webkit-details-marker]:hidden"
      >
        i
      </summary>

      <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-[min(330px,calc(100vw-2rem))] rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-4 text-left shadow-[0_18px_50px_rgba(17,70,104,.16)]">
        <p className="text-[13px] font-semibold tracking-[-0.01em] text-[var(--ink)]">
          {help.title}
        </p>

        <p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">
          {help.description}
        </p>

        {help.calculation ? (
          <div className="mt-3 border-t border-[var(--line)] pt-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--muted-soft)]">
              Nasıl hesaplanır?
            </p>
            <p className="mt-1 text-[11px] leading-5 text-[var(--ink)]">
              {help.calculation}
            </p>
          </div>
        ) : null}

        {help.interpretation ? (
          <div className="mt-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--muted-soft)]">
              Nasıl yorumlanır?
            </p>
            <p className="mt-1 text-[11px] leading-5 text-[var(--ink)]">
              {help.interpretation}
            </p>
          </div>
        ) : null}

        {help.source || help.updateFrequency ? (
          <div className="mt-3 border-t border-[var(--line)] pt-3 text-[10px] leading-4 text-[var(--muted-soft)]">
            {help.source ? <p>Veri kaynağı: {help.source}</p> : null}
            {help.updateFrequency ? <p>Güncelleme: {help.updateFrequency}</p> : null}
          </div>
        ) : null}
      </div>
    </details>
  );
}
