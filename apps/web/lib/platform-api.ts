import { api, withQuery } from "./api";

export type PlatformCommandCenter = {
  summary: {
    tenants: number;
    companies: number;
    activeCompanies: number;
    branches: number;
    activeBranches: number;
    activeMemberships: number;
  };
  recentTenants: Array<{
    id: string;
    name: string;
    slug: string;
    createdAt: string;
    activeMemberships: number;
    activeBranches: number;
  }>;
};

export type PlatformCustomerSummary = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  companyCount: number;
  activeCompanyCount: number;
  branchCount: number;
  activeBranchCount: number;
  activeMembershipCount: number;
  activeOwnerCount: number;
};

export type PlatformCustomerList = {
  items: PlatformCustomerSummary[];
  total: number;
  limit: number;
  offset: number;
};

export type PlatformCustomer360 = {
  tenant: {
    id: string;
    name: string;
    slug: string;
    createdAt: string;
    updatedAt: string;
  };
  summary: {
    companies: number;
    activeCompanies: number;
    branches: number;
    activeBranches: number;
    activeMemberships: number;
    activeOwners: number;
  };
  companies: Array<{
    id: string;
    name: string;
    slug: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    branchCount: number;
    activeBranchCount: number;
  }>;
  memberships: Array<{
    role: string;
    status: string;
    count: number;
  }>;
};

export function getPlatformCommandCenter() {
  return api<PlatformCommandCenter>("/platform/command-center");
}

export function listPlatformCustomers(params: {
  search?: string;
  limit?: number;
  offset?: number;
} = {}) {
  return api<PlatformCustomerList>(
    withQuery("/platform/customers", params),
  );
}

export function getPlatformCustomer360(tenantId: string) {
  return api<PlatformCustomer360>(`/platform/customers/${tenantId}`);
}
