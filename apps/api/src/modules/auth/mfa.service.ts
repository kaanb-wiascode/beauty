import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';

import { PrismaService } from '@beauty-erp/database';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const CHALLENGE_TTL_SECONDS = 300;

type LoginResult = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; firstName: string; lastName: string };
  tenant: { id: string; name: string; slug: string };
  company: { id: string; name: string; slug: string };
  branch: { id: string; name: string; code: string } | null;
  membership: {
    id: string;
    role: string;
    roleScope: 'CENTRAL' | 'COMPANY' | 'BRANCH';
    status: string;
    permissions: string[];
    branchIds: string[];
  };
};

type StoredMfaRow = {
  userId: string;
  encryptedSecret: string;
  iv: string;
  authTag: string;
  enabledAt: Date | null;
};

@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly audit: PlatformAuditService,
  ) {}

  async status(userId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ enabledAt: Date | null }>>`
      SELECT "enabledAt" FROM "user_mfa_totp" WHERE "userId" = ${userId} LIMIT 1
    `;
    return { enrolled: Boolean(rows[0]?.enabledAt) };
  }

  async setup(userId: string, email: string) {
    const secret = this.encodeBase32(randomBytes(20));
    const encrypted = this.encrypt(secret);

    await this.prisma.$executeRaw`
      INSERT INTO "user_mfa_totp" ("userId", "encryptedSecret", iv, "authTag", "enabledAt", "createdAt", "updatedAt")
      VALUES (${userId}, ${encrypted.value}, ${encrypted.iv}, ${encrypted.authTag}, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT ("userId") DO UPDATE SET
        "encryptedSecret" = EXCLUDED."encryptedSecret",
        iv = EXCLUDED.iv,
        "authTag" = EXCLUDED."authTag",
        "enabledAt" = NULL,
        "updatedAt" = CURRENT_TIMESTAMP
    `;

    const issuer = 'VALOO';
    const label = encodeURIComponent(`${issuer}:${email}`);
    return {
      secret,
      otpauthUri: `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`,
    };
  }

  async confirm(userId: string, code: string, tenantId: string) {
    const row = await this.requireRow(userId);
    if (!this.verifyTotp(this.decrypt(row), code)) {
      throw new BadRequestException('Invalid verification code');
    }

    await this.prisma.$executeRaw`
      UPDATE "user_mfa_totp"
      SET "enabledAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "userId" = ${userId}
    `;
    await this.audit.record({
      actorUserId: userId,
      resource: 'security_mfa',
      action: 'enable',
      targetTenantId: tenantId,
      targetEntityType: 'user_mfa_totp',
      targetEntityId: userId,
      beforeState: { enabled: false },
      afterState: { enabled: true },
    });
    return { enrolled: true };
  }

  async beginLoginChallenge(result: LoginResult) {
    const state = await this.status(result.user.id);
    const challengeId = randomUUID();
    await this.redis.set(this.challengeKey(challengeId), JSON.stringify(result), CHALLENGE_TTL_SECONDS);
    return {
      mfaRequired: true as const,
      enrollmentRequired: !state.enrolled,
      challengeId,
      expiresInSeconds: CHALLENGE_TTL_SECONDS,
      user: result.user,
      tenant: result.tenant,
      company: result.company,
    };
  }

  async setupLoginChallenge(challengeId: string) {
    const result = await this.readChallenge(challengeId);
    const state = await this.status(result.user.id);
    if (state.enrolled) throw new BadRequestException('MFA is already enrolled');
    return this.setup(result.user.id, result.user.email);
  }

  async completeEnrollmentChallenge(challengeId: string, code: string) {
    const result = await this.consumeChallenge(challengeId);
    const state = await this.status(result.user.id);
    if (state.enrolled) throw new BadRequestException('MFA is already enrolled');
    await this.confirm(result.user.id, code, result.tenant.id);
    return result;
  }

  async verifyLoginChallenge(challengeId: string, code: string) {
    const result = await this.consumeChallenge(challengeId);
    const row = await this.requireRow(result.user.id);
    if (!row.enabledAt) throw new UnauthorizedException('MFA enrollment is incomplete');
    if (!this.verifyTotp(this.decrypt(row), code)) {
      throw new UnauthorizedException('Invalid MFA code');
    }

    await this.audit.record({
      actorUserId: result.user.id,
      resource: 'security_mfa',
      action: 'verify',
      targetTenantId: result.tenant.id,
      targetEntityType: 'auth_session',
      targetEntityId: result.membership.id,
      metadata: { companyId: result.company.id },
    });
    return result;
  }

  private challengeKey(id: string) {
    return `auth:mfa-challenge:${id}`;
  }

  private async readChallenge(challengeId: string) {
    const raw = await this.redis.get(this.challengeKey(challengeId));
    if (!raw) throw new UnauthorizedException('MFA challenge is invalid or expired');
    return JSON.parse(raw) as LoginResult;
  }

  private async consumeChallenge(challengeId: string) {
    const raw = await this.redis.getAndDelete(this.challengeKey(challengeId));
    if (!raw) throw new UnauthorizedException('MFA challenge is invalid or expired');
    return JSON.parse(raw) as LoginResult;
  }

  private async requireRow(userId: string): Promise<StoredMfaRow> {
    const rows = await this.prisma.$queryRaw<StoredMfaRow[]>`
      SELECT "userId", "encryptedSecret", iv, "authTag", "enabledAt"
      FROM "user_mfa_totp" WHERE "userId" = ${userId} LIMIT 1
    `;
    if (!rows[0]) throw new BadRequestException('MFA setup is missing');
    return rows[0];
  }

  private verifyTotp(secret: string, code: string) {
    const normalized = code.trim();
    if (!/^\d{6}$/.test(normalized)) return false;
    const counter = Math.floor(Date.now() / 1000 / 30);
    for (let offset = -1; offset <= 1; offset += 1) {
      if (this.totp(secret, counter + offset) === normalized) return true;
    }
    return false;
  }

  private totp(secret: string, counter: number) {
    const key = this.decodeBase32(secret);
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64BE(BigInt(counter));
    const digest = createHmac('sha1', key).update(buffer).digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const binary = ((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff);
    return String(binary % 1_000_000).padStart(6, '0');
  }

  private encrypt(secret: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const value = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return {
      value: value.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
    };
  }

  private decrypt(row: StoredMfaRow) {
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey(), Buffer.from(row.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(row.authTag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(row.encryptedSecret, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  private encryptionKey() {
    const source = this.config.get<string>('MFA_ENCRYPTION_KEY') || this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    return createHash('sha256').update(source).digest();
  }

  private encodeBase32(input: Buffer) {
    let bits = '';
    for (const byte of input) bits += byte.toString(2).padStart(8, '0');
    let output = '';
    for (let index = 0; index < bits.length; index += 5) {
      output += BASE32_ALPHABET[Number.parseInt(bits.slice(index, index + 5).padEnd(5, '0'), 2)];
    }
    return output;
  }

  private decodeBase32(input: string) {
    let bits = '';
    for (const char of input.replace(/=+$/g, '').toUpperCase()) {
      const index = BASE32_ALPHABET.indexOf(char);
      if (index < 0) throw new BadRequestException('Invalid MFA secret');
      bits += index.toString(2).padStart(5, '0');
    }
    const bytes: number[] = [];
    for (let index = 0; index + 8 <= bits.length; index += 8) {
      bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
    }
    return Buffer.from(bytes);
  }
}
