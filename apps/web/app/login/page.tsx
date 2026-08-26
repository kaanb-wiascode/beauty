"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { getAccessToken, persistSession } from "@/lib/auth";
import type { LoginResponse } from "@/lib/types";
import { Alert, Button, Field, TextInput } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getAccessToken()) {
      router.replace("/dashboard");
    }
  }, [router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await api<LoginResponse>("/auth/login", {
        method: "POST",
        body: { email, password },
        auth: false,
      });

      persistSession({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        user: data.user,
        tenant: data.tenant,
      });

      router.replace("/dashboard");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Giriş yapılamadı. Lütfen tekrar deneyin.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-[420px]">
        <div className="mb-10 text-center sm:text-left">
          <div className="mx-auto mb-6 flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--ink)] text-[15px] font-semibold text-white sm:mx-0">
            B
          </div>
          <p className="text-[13px] font-medium tracking-[0.12em] text-[var(--accent)]">
            BEAUTY ERP
          </p>
          <h1 className="mt-3 text-[36px] font-semibold leading-[1.08] tracking-[-0.04em] text-[var(--ink)] sm:text-[44px]">
            Salonunuz, sakin bir düzende.
          </h1>
          <p className="mt-3 max-w-sm text-[15px] leading-7 text-[var(--muted)]">
            Randevu, müşteri ve hizmet yönetimine sade bir giriş.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="glass-elevated space-y-5 rounded-[28px] p-6 sm:p-7"
        >
          <Field label="E-posta">
            <TextInput
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="ornek@salon.com"
            />
          </Field>

          <Field label="Şifre">
            <TextInput
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
            />
          </Field>

          {error ? <Alert>{error}</Alert> : null}

          <Button type="submit" disabled={loading} className="h-12 w-full">
            {loading ? "Giriş yapılıyor..." : "Giriş yap"}
          </Button>
        </form>
      </div>
    </main>
  );
}
