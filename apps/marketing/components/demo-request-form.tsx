"use client";

import { FormEvent, useState } from "react";

type Basics = {
  firstName: string;
  lastName: string;
  companyName: string;
  email: string;
  phone: string;
};

type SubmitState = "idle" | "submitting" | "success";

export function DemoRequestForm() {
  const [step, setStep] = useState<1 | 2>(1);
  const [basics, setBasics] = useState<Basics | null>(null);
  const [status, setStatus] = useState<SubmitState>("idle");
  const [error, setError] = useState("");

  function continueToDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBasics({
      firstName: String(data.get("firstName") || "").trim(),
      lastName: String(data.get("lastName") || "").trim(),
      companyName: String(data.get("companyName") || "").trim(),
      email: String(data.get("email") || "").trim(),
      phone: String(data.get("phone") || "").trim(),
    });
    setError("");
    setStep(2);
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!basics) {
      setStep(1);
      return;
    }

    const data = new FormData(event.currentTarget);
    const params = new URLSearchParams(window.location.search);
    const payload: Record<string, unknown> = {
      ...basics,
      role: String(data.get("role") || "").trim(),
      businessType: String(data.get("businessType") || "").trim(),
      branchCount: Number(data.get("branchCount") || 1),
      employeeCount: data.get("employeeCount") ? Number(data.get("employeeCount")) : undefined,
      currentTools: String(data.get("currentTools") || "").trim(),
      goal: String(data.get("goal") || "").trim(),
      privacyNoticeAccepted: data.get("privacyNoticeAccepted") === "on",
      commercialConsent: data.get("commercialConsent") === "on",
      website: String(data.get("website") || ""),
      pageUrl: window.location.href,
      utmSource: params.get("utm_source") || undefined,
      utmMedium: params.get("utm_medium") || undefined,
      utmCampaign: params.get("utm_campaign") || undefined,
      utmContent: params.get("utm_content") || undefined,
      utmTerm: params.get("utm_term") || undefined,
    };
    if (document.referrer) payload.referrer = document.referrer;

    setStatus("submitting");
    setError("");

    try {
      const base = (process.env.NEXT_PUBLIC_API_URL || "/backend").replace(/\/$/, "");
      const response = await fetch(`${base}/marketing-site/demo-requests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null) as { message?: string | string[] } | null;
        const message = Array.isArray(body?.message)
          ? body.message[0]
          : body?.message;
        throw new Error(message || "Demo talebi gönderilemedi.");
      }

      setStatus("success");
    } catch (cause) {
      setStatus("idle");
      setError(cause instanceof Error ? cause.message : "Demo talebi gönderilemedi.");
    }
  }

  if (status === "success") {
    return (
      <div className="demo-success" role="status">
        <span className="demo-success-mark" aria-hidden="true">✓</span>
        <p className="eyebrow">Talebiniz alındı</p>
        <h2>Tamam.<br /><span>Sıra bizde.</span></h2>
        <p>VALOO ekibi verdiğiniz bilgilerle işletmenize uygun demo akışını hazırlayacak.</p>
        <a href="/">VALOO’ya dönün <span aria-hidden="true">→</span></a>
      </div>
    );
  }

  return (
    <div className="demo-form-shell">
      <div className="demo-progress" aria-label={"Adım " + step + " / 2"}>
        <span className={step >= 1 ? "active" : ""} />
        <span className={step >= 2 ? "active" : ""} />
        <small>{step} / 2</small>
      </div>

      {step === 1 ? (
        <form className="demo-form" onSubmit={continueToDetails}>
          <div className="demo-form-heading">
            <p className="eyebrow">Önce tanışalım.</p>
            <h2>Sizi kim arayacak,<br />onu bilelim.</h2>
          </div>
          <div className="form-grid two">
            <label>Adınız<input name="firstName" autoComplete="given-name" required maxLength={100} /></label>
            <label>Soyadınız<input name="lastName" autoComplete="family-name" required maxLength={100} /></label>
          </div>
          <label>Şirket / marka adı<input name="companyName" autoComplete="organization" required maxLength={180} /></label>
          <div className="form-grid two">
            <label>E-posta<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
            <label>Telefon<input name="phone" type="tel" autoComplete="tel" required minLength={7} maxLength={40} /></label>
          </div>
          <button className="demo-next" type="submit">Devam edin <span aria-hidden="true">→</span></button>
          <p className="demo-form-note">Bir sonraki adım kısa. Gerçekten.</p>
        </form>
      ) : (
        <form className="demo-form" onSubmit={submitRequest}>
          <div className="demo-form-heading">
            <p className="eyebrow">Şimdi işletmeniz.</p>
            <h2>VALOO size<br />nerede yetişsin?</h2>
          </div>

          <div className="form-grid two">
            <label>Göreviniz<input name="role" autoComplete="organization-title" maxLength={120} placeholder="Örn. Genel Müdür" /></label>
            <label>İşletme türü<input name="businessType" maxLength={120} placeholder="Örn. Hizmet, sağlık, perakende" /></label>
          </div>
          <div className="form-grid two">
            <label>Şube sayısı<input name="branchCount" type="number" min={1} max={5000} defaultValue={1} required /></label>
            <label>Çalışan sayısı<input name="employeeCount" type="number" min={1} max={100000} /></label>
          </div>
          <label>Şu anda hangi araçları kullanıyorsunuz?<input name="currentTools" maxLength={500} placeholder="Excel, CRM, muhasebe, farklı uygulamalar…" /></label>
          <label>En çok neyi değiştirmek istiyorsunuz?<textarea name="goal" maxLength={1500} rows={4} placeholder="Bize asıl problemi anlatın." /></label>

          <input className="form-honeypot" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />

          <label className="consent-row">
            <input name="privacyNoticeAccepted" type="checkbox" required />
            <span>Demo talebimin değerlendirilmesi için kişisel verilerimin işlenmesine ilişkin aydınlatma metnini okudum.</span>
          </label>
          <label className="consent-row">
            <input name="commercialConsent" type="checkbox" />
            <span>VALOO ürün ve duyuruları hakkında ticari ileti almak istiyorum. İsteğe bağlıdır.</span>
          </label>

          {error ? <p className="form-error" role="alert">{error}</p> : null}

          <div className="demo-form-actions">
            <button className="demo-back" type="button" onClick={() => setStep(1)}>← Geri</button>
            <button className="demo-next" type="submit" disabled={status === "submitting"}>
              {status === "submitting" ? "Gönderiliyor…" : "Demo talebini gönder"}
              {status !== "submitting" ? <span aria-hidden="true">→</span> : null}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
