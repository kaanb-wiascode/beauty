import { SetMetadata } from '@nestjs/common';

export const RESTRICT_TENANT_MUTATIONS_KEY = 'restrict_tenant_mutations';

/**
 * Marks a tenant API surface as read-only while the provider lifecycle state is RESTRICTED.
 * Safe HTTP methods remain available; mutation methods are rejected by TenantAuthGuard.
 */
export const RestrictTenantMutations = () =>
  SetMetadata(RESTRICT_TENANT_MUTATIONS_KEY, true);
