import Link from "next/link";

const HR_ITEMS = [
  ["/hr", "İK Genel Bakış"],
  ["/hr/employees", "Personeller"],
  ["/hr/personnel-files", "Özlük Dosyaları"],
  ["/hr/attendance", "Puantaj"],
  ["/hr/leaves", "İzinler"],
  ["/hr/payroll", "Bordro"],
  ["/hr/payments", "Maaş Ödemeleri"],
  ["/hr/sgk", "SGK İşlemleri"],
] as const;

export function HrNav() {
  return (
    <div className="mb-4">
      <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9b99a7]">
        İnsan Kaynakları
      </p>
      <div className="space-y-1">
        {HR_ITEMS.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className="flex h-11 items-center gap-3 rounded-[14px] px-3 text-[13px] font-medium text-[#626276] transition-colors hover:bg-[#f8f7fb] hover:text-[#242332]"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[#777688]">
              {label === "İK Genel Bakış" ? "⌂" : label === "Personeller" ? "♙" : label === "Özlük Dosyaları" ? "▤" : label === "Puantaj" ? "◷" : label === "İzinler" ? "✓" : label === "Bordro" ? "₺" : label === "Maaş Ödemeleri" ? "▣" : "◈"}
            </span>
            <span className="truncate">{label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
