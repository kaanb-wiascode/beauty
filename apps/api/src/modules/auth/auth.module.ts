import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthController } from './auth.controller';
import { AuthPublicRateLimitGuard } from './auth-public-rate-limit.guard';
import { AuthService } from './auth.service';
import { AuthSessionRegistryService } from './auth-session-registry.service';
import { InvitationService } from './invitation.service';
import { SecurityPolicyService } from './security-policy.service';
import { JwtStrategy } from '../../common/auth/jwt.strategy';
import { PlatformAuditModule } from '../platform-audit/platform-audit.module';

@Module({
  imports: [
    PlatformAuditModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: 900,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthSessionRegistryService,
    InvitationService,
    SecurityPolicyService,
    AuthPublicRateLimitGuard,
    JwtStrategy,
  ],
})
export class AuthModule {}
