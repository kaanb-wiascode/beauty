import { API_BASE_URL, ApiError } from "./api";
import {
  clearSupplierPortalSession,
  getSupplierPortalSession,
} from "./supplier-portal-auth";
import { userErrorMessage } from "./user-language";

type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type SupplierPortalApiOptions = {
  method?: ApiMethod;
  body?: unknown;
  auth?: boolean;
};

function redirectToSupplierLogin() {
  if (typeof window === "undefined") return;
  if (window.location.pathname.startsWith("/supplier-portal/login")) return;
  window.location.assign("/supplier-portal/login");
}

function readMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const message = (payload as { message?: unknown }).message;
  if (typeof message === "string" && message.trim()) {
    return userErrorMessage(message, fallback);
  }
  if (Array.isArray(message) && message.length) {
    const safeMessages = message
      .map((item) => userErrorMessage(String(item), ""))
      .filter(Boolean);
    return safeMessages.length ? safeMessages.join(" ") : fallback;
  }
  return fallback;
}

export async function supplierPortalApi<T>(
  path: string,
  options: SupplierPortalApiOptions = {},
): Promise<T> {
  const { method = "GET", body, auth = true } = options;
  const headers: Record<string, string> = {};

  if (body !== undefined) headers["Content-Type"] = "application/json";

  if (auth) {
    const session = getSupplierPortalSession();
    if (!session) {
      redirectToSupplierLogin();
      throw new ApiError("Tedarikçi Portalı Oturumunuz Sona Erdi. Lütfen Tekrar Giriş Yapın.", 401);
    }
    headers.Authorization = `Bearer ${session.accessToken}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "include",
    });
  } catch {
    throw new ApiError(
      "Sunucuya Bağlanılamadı. Lütfen Birkaç Dakika Sonra Tekrar Deneyin.",
      0,
    );
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    if (response.status === 401 && auth) {
      clearSupplierPortalSession();
      redirectToSupplierLogin();
    }

    const fallback =
      response.status === 403
        ? "Bu İşlemi Yapmaya Yetkiniz Bulunmuyor."
        : response.status === 404
          ? "Aradığınız Kayıt Bulunamadı."
          : response.status >= 500
            ? "İşlem Şu Anda Tamamlanamıyor. Lütfen Birkaç Dakika Sonra Tekrar Deneyin."
            : "İşlem Tamamlanamadı. Lütfen Bilgileri Kontrol Edip Tekrar Deneyin.";

    throw new ApiError(readMessage(payload, fallback), response.status);
  }

  return payload as T;
}
