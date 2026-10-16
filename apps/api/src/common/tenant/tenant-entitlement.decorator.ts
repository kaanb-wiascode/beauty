import { SetMetadata } from '@nestjs/common';

export const TENANT_ENTITLEMENT_KEY = 'tenant-entitlement-key';

export const RequireTenantEntitlement = (key: string) =>
  SetMetadata(TENANT_ENTITLEMENT_KEY, key);
