import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export type RoleScopeValue = 'CENTRAL' | 'COMPANY' | 'BRANCH';

export interface JwtPayload {
  sub: string;
  tenantId: string;
  membershipId: string;
  roleId: string;
  companyId: string;
  branchId: string | null;
  roleScope: RoleScopeValue;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    if (
      !payload.sub ||
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

    return payload;
  }
}
