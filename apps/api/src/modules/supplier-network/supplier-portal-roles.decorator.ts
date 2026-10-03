import { SetMetadata } from '@nestjs/common';

import type { SupplierPortalRole } from './supplier-portal-auth.service';

export const SUPPLIER_PORTAL_ROLES_KEY = 'supplierPortalRoles';

export const SupplierPortalRoles = (...roles: SupplierPortalRole[]) =>
  SetMetadata(SUPPLIER_PORTAL_ROLES_KEY, roles);
