"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { userErrorMessage } from "@/lib/user-language";

type DiscoveredAccounts = {
  accounts: Array<{ id: string; name: string }>;
};

function connectionIdFromState(state: string) {
  try {
    const [body] = state.split(".");
    if (!body) return "";
    const normalized = body.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded)) as { connectionId?: unknown };
    return typeof payload.connectionId === "string" ? payload.connectionId : "";
  } catch {
    return "";
  }
}

export default function ProviderOAuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    const state = searchParams.get("state") ?? "";
    const code = searchParams.get("code") ?? searchParams.get("auth_code") ?? "";
    const providerError =
      searchParams.get("error_description") ??
      searchParams.get("error") ??
      "";
    const connectionId = connectionIdFromState(state);

    if (providerError) {
      setError("Platform yetkilendirmesi tamamlanmadı. Lütfen yeniden deneyin.");
      return;
    }

    if (!state || !code || !connectionId) {
      setError("Platformdan dönen yetkilendirme bilgileri eksik veya geçersiz.");
      return;
    }

    void (async () => {
      try {
        await api(
          `/corporate-communications/provider-connections/${connectionId}/oauth/complete`,
          {
            method: "POST",
            body: { code, state },
          },
        );

        let accountCount = 0;
        try {
          const discovered = await api<DiscoveredAccounts>(
            `/corporate-communications/provider-connections/${connectionId}/accounts`,
          );
          accountCount = discovered.accounts.length;

          if (discovered.accounts.length === 1) {
            await api(
              `/corporate-communications/provider-connections/${connectionId}/accounts/select`,
              {
                method: "POST",
                body: { externalAccountId: discovered.accounts[0]!.id },
              },
            );

            try {
              await api(
                `/corporate-communications/provider-connections/${connectionId}/oauth/verify`,
                { method: "POST" },
              );
            } catch {
              // Yetkilendirme tamamlandı; doğrulama daha sonra entegrasyon ekranından tekrar denenebilir.
            }
          }
        } catch {
          // Yetkilendirme tamamlandı; hesap keşfi sağlayıcı ek yapılandırması gerektiriyorsa ekran üzerinden sürdürülebilir.
        }

        const params = new URLSearchParams({
          oauth: "success",
          connectionId,
          accounts: String(accountCount),
        });
        router.replace(`/communications/integrations?${params.toString()}`);
      } catch (cause) {
        setError(
          cause instanceof ApiError
            ? userErrorMessage(
                cause.message,
                "Platform bağlantısı tamamlanamadı.",
              )
            : "Platform bağlantısı tamamlanamadı.",
        );
      }
    })();
  }, [router, searchParams]);

  return (
    <div className="mx-auto max-w-xl py-20">
      {error ? (
        <Alert>{error}</Alert>
      ) : (
        <div className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-8">
          <Spinner label="Platform bağlantısı tamamlanıyor..." />
          <p className="mt-4 text-center text-[11px] leading-5 text-[var(--muted)]">
            Yetkilendirme yanıtı doğrulanıyor ve erişim bilgileri güvenli kasaya kaydediliyor.
          </p>
        </div>
      )}
    </div>
  );
}
