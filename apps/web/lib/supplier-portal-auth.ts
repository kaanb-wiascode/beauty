export type SupplierPortalRole = "OWNER" | "ADMIN" | "MEMBER";

export type SupplierPortalSession = {
  accessToken: string;
  expiresAt: number;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
  supplierOrganization: {
    id: string;
    slug: string;
    displayName: string;
    verificationStatus: string;
  };
  membership: {
    id: string;
    role: SupplierPortalRole;
  };
};

const SESSION_KEY = "valoo_supplier_portal_session";

export function getSupplierPortalSession(): SupplierPortalSession | null {
  if (typeof window === "undefined") return null;

  const raw = window.sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  try {
    const session = JSON.parse(raw) as SupplierPortalSession;
    if (!session.accessToken || !session.expiresAt || session.expiresAt <= Date.now()) {
      clearSupplierPortalSession();
      return null;
    }
    return session;
  } catch {
    clearSupplierPortalSession();
    return null;
  }
}

export function persistSupplierPortalSession(input: {
  accessToken: string;
  expiresInSeconds: number;
  user: SupplierPortalSession["user"];
  supplierOrganization: SupplierPortalSession["supplierOrganization"];
  membership: SupplierPortalSession["membership"];
}) {
  if (typeof window === "undefined") return;

  const session: SupplierPortalSession = {
    accessToken: input.accessToken,
    expiresAt: Date.now() + Math.max(1, input.expiresInSeconds) * 1000,
    user: input.user,
    supplierOrganization: input.supplierOrganization,
    membership: input.membership,
  };

  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSupplierPortalSession() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(SESSION_KEY);
}
