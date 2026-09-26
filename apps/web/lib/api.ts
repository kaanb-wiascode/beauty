import {
  clearSession,
  getAccessToken,
  persistSession,
} from "./auth";
import { userErrorMessage } from "./user-language";

/**
 * Browser requests use the same-origin `/backend` rewrite in next.config.ts,
 * which proxies to http://localhost:3000. Override with NEXT_PUBLIC_API_URL
 * if the API is reachable cross-origin.
 */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "/backend";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type ApiOptions = {
  method?: ApiMethod;
  body?: unknown;
  auth?: boolean;
  signal?: AbortSignal;
};

function readErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") {
    return userErrorMessage(undefined, fallback);
  }

  const record = payload as { message?: unknown };

  if (typeof record.message === "string" && record.message.trim()) {
    return userErrorMessage(record.message, fallback);
  }

  if (Array.isArray(record.message) && record.message.length > 0) {
    const safeMessages = record.message
      .map((message) => userErrorMessage(String(message), ""))
      .filter(Boolean);
    return safeMessages.length ? safeMessages.join(" ") : fallback;
  }

  return userErrorMessage(undefined, fallback);
}

function redirectToLogin() {
  if (typeof window === "undefined") return;
  if (window.location.pathname.startsWith("/login")) return;
  window.location.replace(new URL("/login", window.location.origin).toString());
}

let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) return null;

      const payload = (await response.json()) as {
        accessToken?: string;
      };

      if (!payload.accessToken) return null;

      persistSession({
        accessToken: payload.accessToken,
      });

      return payload.accessToken;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export async function apiResponse(
  path: string,
  options: Pick<ApiOptions, "method" | "auth" | "signal"> = {},
): Promise<Response> {
  const { method = "GET", auth = true, signal } = options;
  let accessToken = auth ? getAccessToken() : null;

  if (auth && !accessToken && !path.startsWith("/auth/")) {
    accessToken = await refreshAccessToken();
    if (!accessToken) {
      clearSession();
      redirectToLogin();
      throw new ApiError(
        "Oturumunuz Sona Erdi. Lütfen Tekrar Giriş Yapın.",
        401,
      );
    }
  }

  const request = async (token: string | null) => {
    const headers: Record<string, string> = {};
    if (auth && token) headers.Authorization = `Bearer ${token}`;

    try {
      return await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers,
        credentials: "include",
        signal,
      });
    } catch {
      throw new ApiError(
        "Sunucuya Bağlanılamadı. Lütfen Birkaç Dakika Sonra Tekrar Deneyin.",
        0,
      );
    }
  };

  let response = await request(accessToken);

  if (response.status === 401 && auth && !path.startsWith("/auth/")) {
    const refreshedToken = await refreshAccessToken();
    if (refreshedToken) {
      response = await request(refreshedToken);
    } else {
      clearSession();
      redirectToLogin();
    }
  }

  if (response.status === 401 && auth) {
    clearSession();
    redirectToLogin();
  }

  return response;
}

export async function api<T>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const { method = "GET", body, auth = true } = options;
  const headers: Record<string, string> = {};

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  let accessToken = auth ? getAccessToken() : null;
  if (auth && !accessToken && !path.startsWith("/auth/")) {
    accessToken = await refreshAccessToken();

    if (!accessToken) {
      clearSession();
      redirectToLogin();
      throw new ApiError(
        "Oturumunuz Sona Erdi. Lütfen Tekrar Giriş Yapın.",
        401,
      );
    }
  }

  if (auth && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
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

  if (response.status === 401 && auth && !path.startsWith("/auth/")) {
    const refreshedToken = await refreshAccessToken();

    if (refreshedToken) {
      const retryHeaders = {
        ...headers,
        Authorization: `Bearer ${refreshedToken}`,
      };

      try {
        response = await fetch(`${API_BASE_URL}${path}`, {
          method,
          headers: retryHeaders,
          body: body === undefined ? undefined : JSON.stringify(body),
          credentials: "include",
        });
      } catch {
        throw new ApiError(
          "Sunucuya Bağlanılamadı. Lütfen Birkaç Dakika Sonra Tekrar Deneyin.",
          0,
        );
      }
    } else {
      clearSession();
      redirectToLogin();
    }
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
      clearSession();
      redirectToLogin();
    }

    const fallback =
      response.status === 403
        ? "Bu İşlemi Yapmaya Yetkiniz Bulunmuyor."
        : response.status === 404
          ? "Aradığınız Kayıt Bulunamadı."
          : response.status >= 500
            ? "İşlem Şu Anda Tamamlanamıyor. Lütfen Birkaç Dakika Sonra Tekrar Deneyin."
            : "İşlem Tamamlanamadı. Lütfen Bilgileri Kontrol Edip Tekrar Deneyin.";

    throw new ApiError(readErrorMessage(payload, fallback), response.status);
  }

  return payload as T;
}

export function withQuery(
  path: string,
  params: Record<string, string | number | boolean | undefined>,
) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `${path}?${query}` : path;
}


export async function apiFormData<T>(
  path: string,
  formData: FormData,
  options: Pick<ApiOptions, "method" | "auth"> = {},
): Promise<T> {
  const { method = "POST", auth = true } = options;
  let accessToken = auth ? getAccessToken() : null;

  if (auth && !accessToken && !path.startsWith("/auth/")) {
    accessToken = await refreshAccessToken();
    if (!accessToken) {
      clearSession();
      redirectToLogin();
      throw new ApiError("Oturumunuz Sona Erdi. Lütfen Tekrar Giriş Yapın.", 401);
    }
  }

  const request = async (token: string | null) => {
    const headers: Record<string, string> = {};
    if (auth && token) headers.Authorization = `Bearer ${token}`;
    try {
      return await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers,
        body: formData,
        credentials: "include",
      });
    } catch {
      throw new ApiError(
        "Sunucuya Bağlanılamadı. Lütfen Birkaç Dakika Sonra Tekrar Deneyin.",
        0,
      );
    }
  };

  let response = await request(accessToken);

  if (response.status === 401 && auth && !path.startsWith("/auth/")) {
    const refreshedToken = await refreshAccessToken();
    if (refreshedToken) response = await request(refreshedToken);
    else {
      clearSession();
      redirectToLogin();
    }
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
    const fallback =
      response.status === 403
        ? "Bu İşlemi Yapmaya Yetkiniz Bulunmuyor."
        : response.status === 404
          ? "Aradığınız Kayıt Bulunamadı."
          : response.status >= 500
            ? "İşlem Şu Anda Tamamlanamıyor. Lütfen Birkaç Dakika Sonra Tekrar Deneyin."
            : "İşlem Tamamlanamadı. Lütfen Bilgileri Kontrol Edip Tekrar Deneyin.";
    throw new ApiError(readErrorMessage(payload, fallback), response.status);
  }

  return payload as T;
}
