import type { ReactNode } from "react";

import { PlatformAccessBoundary } from "@/components/platform/platform-access-boundary";
import { PlatformShell } from "@/components/platform/platform-shell";

export default function PlatformLayout({ children }: { children: ReactNode }) {
  return (
    <PlatformAccessBoundary>
      <PlatformShell>{children}</PlatformShell>
    </PlatformAccessBoundary>
  );
}
