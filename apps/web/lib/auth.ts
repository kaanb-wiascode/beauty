import type { AuthTenant, AuthUser } from "./types";

const ACCESS_TOKEN_KEY = "beauty_erp_access_token";
const REFRESH_TOKEN_KEY = "beauty_erp_refresh_token";
const USER_KEY = "beauty_erp_user";
const TENANT_KEY = "beauty_erp_tenant";

function canUseStorage() {
  return typeof window !== "undefined";
}

export function getAccessToken(): string | null {
  if (!canUseStorage()) return null;
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (!canUseStorage()) return null;
  return window.localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  if (!canUseStorage()) return null;

  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function getStoredTenant(): AuthTenant | null {
  if (!canUseStorage()) return null;

  const raw = window.localStorage.getItem(TENANT_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as AuthTenant;
  } catch {
    return null;
  }
}

export function persistSession(input: {
  accessToken: string;
  refreshToken?: string;
  user?: AuthUser;
  tenant?: AuthTenant;
}) {
  if (!canUseStorage()) return;

  window.localStorage.setItem(ACCESS_TOKEN_KEY, input.accessToken);

  if (input.refreshToken) {
    window.localStorage.setItem(REFRESH_TOKEN_KEY, input.refreshToken);
  }

  if (input.user) {
    window.localStorage.setItem(USER_KEY, JSON.stringify(input.user));
  }

  if (input.tenant) {
    window.localStorage.setItem(TENANT_KEY, JSON.stringify(input.tenant));
  }
}

export function clearSession() {
  if (!canUseStorage()) return;

  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  window.localStorage.removeItem(TENANT_KEY);
}
