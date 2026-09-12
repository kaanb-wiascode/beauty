import type { ReactNode } from "react";
import { CrmNav } from "@/components/crm-nav";

export default function CrmLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
      <CrmNav />
      <div className="mt-6">{children}</div>
    </div>
  );
}
