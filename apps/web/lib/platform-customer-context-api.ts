import { api } from "./api";

export type PlatformCustomerContext = {
  account: {
    tenantId: string;
    legalName: string | null;
    accountOwnerUserId: string | null;
    accountOwnerEmail: string | null;
    customerSuccessOwnerUserId: string | null;
    customerSuccessOwnerEmail: string | null;
    goLiveAt: string | null;
    renewalAt: string | null;
    updatedAt: string;
  } | null;
  notes: Array<{
    id: string;
    authorUserId: string;
    authorEmail: string | null;
    body: string;
    createdAt: string;
  }>;
};

export function getPlatformCustomerContext(tenantId: string) {
  return api<PlatformCustomerContext>(`/platform/customers/${tenantId}/context`);
}

export function updatePlatformCustomerContext(
  tenantId: string,
  input: {
    legalName?: string | null;
    accountOwnerUserId?: string | null;
    customerSuccessOwnerUserId?: string | null;
    goLiveAt?: string | null;
    renewalAt?: string | null;
  },
) {
  return api<PlatformCustomerContext["account"]>(`/platform/customers/${tenantId}/context`, {
    method: "POST",
    body: input,
  });
}

export function addPlatformCustomerNote(tenantId: string, body: string) {
  return api<PlatformCustomerContext["notes"][number]>(`/platform/customers/${tenantId}/notes`, {
    method: "POST",
    body: { body },
  });
}
