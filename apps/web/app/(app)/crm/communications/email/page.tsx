"use client";

import Link from "next/link";
import { CrmResendEmailSettings } from "@/components/crm-resend-email-settings";
import { Button, PageHeader } from "@/components/ui";

export default function CrmEmailProviderSettingsPage() {
  return <div className="space-y-6">
    <PageHeader
      title="CRM E-posta Provider"
      description="Branch bazlı e-posta gönderim bağlantısını yönetin. Secret bilgiler yalnız şifreli vault içinde tutulur."
      action={<Link href="/crm/communications"><Button variant="secondary">İletişim Merkezine Dön</Button></Link>}
    />
    <CrmResendEmailSettings />
  </div>;
}
