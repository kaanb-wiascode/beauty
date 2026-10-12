import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { AuthSessionRegistryService } from '../../modules/auth/auth-session-registry.service';

export type RoleScopeValue = 'CENTRAL' | 'COMPANY' | 'BRANCH';

export interface JwtPayload {
  sub: string;
  // Required for inbound JWTs by validate(); optional on legacy internal
  // reporting contexts that are never accepted as HTTP bearer credentials.
  sessionId?: string;
  tenantId: string;
  membershipId: string;
  roleId: string;
  companyId: string;
  branchId: string | null;
  roleScope: RoleScopeValue;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly sessionRegistry: AuthSessionRegistryService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    if (
      !payload.sub ||
      !payload.sessionId ||
      !payload.tenantId ||
      !payload.membershipId ||
      !payload.roleId ||
      !payload.companyId ||
      !payload.roleScope
    ) {
      throw new UnauthorizedException('Invalid token payload');
    }

    if (
      payload.branchId !== null &&
      typeof payload.branchId !== 'string'
    ) {
      throw new UnauthorizedException('Invalid branch context');
    }

    if (
      payload.roleScope !== 'CENTRAL' &&
      payload.roleScope !== 'COMPANY' &&
      payload.roleScope !== 'BRANCH'
    ) {
      throw new UnauthorizedException('Invalid role scope');
    }

    if (payload.roleScope === 'BRANCH' && !payload.branchId) {
      throw new UnauthorizedException('Branch context is required');
    }

    await this.sessionRegistry.assertActiveAccessSession({
      sessionId: payload.sessionId,
      userId: payload.sub,
      tenantId: payload.tenantId,
      membershipId: payload.membershipId,
      companyId: payload.companyId,
      branchId: payload.branchId,
      roleScope: payload.roleScope,
    });

    return payload;
  }
}
