import type { INestApplication } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';

import { AuthSessionRegistryService } from '../src/modules/auth/auth-session-registry.service';

type TestJwtClaims = {
  sub: string;
  tenantId: string;
  membershipId: string;
  roleId: string;
  companyId: string;
  branchId?: string | null;
  roleScope: 'CENTRAL' | 'COMPANY' | 'BRANCH';
};

/**
 * E2E roles/permission fixtures often create users directly in the DB.
 * Register a real Redis session before signing their scoped bearer JWT, so
 * the tests exercise production revocation checks instead of bypassing them.
 * This helper is kept in the test directory and is never used by the API.
 */
export async function signRegisteredTestJwt(
  app: INestApplication,
  jwt: JwtService,
  claims: TestJwtClaims,
): Promise<string> {
  const registry = app.get(AuthSessionRegistryService);
  const session = await registry.register({
    refreshId: randomUUID(),
    userId: claims.sub,
    tenantId: claims.tenantId,
    membershipId: claims.membershipId,
    companyId: claims.companyId,
    branchId: claims.branchId ?? null,
    roleScope: claims.roleScope,
  });
  return jwt.sign({ ...claims, sessionId: session.id });
}
