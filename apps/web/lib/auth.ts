import type { AuthTenant, AuthUser, LoginResponse } from "./types";

const ACCESS_TOKEN_KEY = "beauty_erp_access_token";
const USER_KEY = "beauty_erp_user";
const TENANT_KEY = "beauty_erp_tenant";
const MEMBERSHIP_KEY = "beauty_erp_membership";

function canUseStorage() {
  return typeof window !== "undefined";
}

type AccessTokenPayload = {
  branchId?: string | null;
};

function decodeAccessTokenPayload(token: string): AccessTokenPayload | null {
  if (typeof window === "undefined") return null;

  const [, encodedPayload] = token.split(".");
  if (!encodedPayload) return null;

  try {
    const normalized = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    return JSON.parse(window.atob(padded)) as AccessTokenPayload;
  } catch {
    return null;
  }
}

export function getAccessToken(): string | null {
  if (!canUseStorage()) return null;
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getActiveBranchId(): string | null {
  const token = getAccessToken();
  if (!token) return null;

  const payload = decodeAccessTokenPayload(token);
  return typeof payload?.branchId === "string" && payload.branchId
    ? payload.branchId
    : null;
}

export function hasActiveBranch(): boolean {
  return Boolean(getActiveBranchId());
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

export function getStoredMembership(): LoginResponse["membership"] | null {
  if (!canUseStorage()) return null;

  const raw = window.localStorage.getItem(MEMBERSHIP_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as LoginResponse["membership"];
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
  user?: AuthUser;
  tenant?: AuthTenant;
  membership?: LoginResponse["membership"];
}) {
  if (!canUseStorage()) return;

  window.localStorage.setItem(ACCESS_TOKEN_KEY, input.accessToken);

  if (input.user) {
    window.localStorage.setItem(USER_KEY, JSON.stringify(input.user));
  }

  if (input.tenant) {
    window.localStorage.setItem(TENANT_KEY, JSON.stringify(input.tenant));
  }

  if (input.membership) {
    const currentMembership = getStoredMembership();
    const nextMembership = {
      ...currentMembership,
      ...input.membership,
      permissions:
        Array.isArray(input.membership.permissions) && input.membership.permissions.length
          ? input.membership.permissions
          : currentMembership?.permissions ?? [],
    };
    window.localStorage.setItem(
      MEMBERSHIP_KEY,
      JSON.stringify(nextMembership),
    );
  }
}

export function clearSession() {
  if (!canUseStorage()) return;

  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  window.localStorage.removeItem(TENANT_KEY);
  window.localStorage.removeItem(MEMBERSHIP_KEY);
}

export function hasPermission(
  resource: string,
  action: string,
): boolean {
  const membership = getStoredMembership();
  if (!membership) return false;

  const permissions = Array.isArray(membership.permissions)
    ? membership.permissions
    : [];

  if (permissions.includes(`${resource}.${action}`)) return true;

  // Owner is a full-access role. This client-side fallback repairs legacy
  // sessions whose context-switch response did not include permissions.
  // Backend permission guards remain the authorization authority.
  if (membership.role?.toLowerCase() === "owner") return true;

  return false;
}
