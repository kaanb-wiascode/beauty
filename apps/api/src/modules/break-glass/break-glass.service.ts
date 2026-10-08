import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaService } from '@beauty-erp/database';
import * as argon2 from 'argon2';
import {
  createDecipheriv,
  createHash,
  createHmac,
  randomUUID,
} from 'node:crypto';

import { TenantContext } from '../../common/tenant/tenant-context';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';

const REAUTH_TTL_SECONDS = 300;
const MAX_BREAK_GLASS_MINUTES = 60;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

type ReauthProof = {
  userId: string;
  membershipId: string;
  tenantId: string;
  companyId: string;
};

type MfaRow = {
  encryptedSecret: string;
  iv: string;
  authTag: string;
  enabledAt: Date | null;
};

@Injectable()
export class BreakGlassService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly audit: PlatformAuditService,
  ) {}

  async reauthenticate(password: string, mfaCode: string) {
    const context = this.tenantContext.getContext();
    const actor = await this.requireEligibleActor();
    const user = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: { id: true, passwordHash: true },
    });
    if (!user || !(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Re-authentication failed');
    }

    const rows = await this.prisma.$queryRaw<MfaRow[]>`
      SELECT "encryptedSecret", iv, "authTag", "enabledAt"
      FROM "user_mfa_totp"
      WHERE "userId" = ${actor.userId}
      LIMIT 1
    `;
    const mfa = rows[0];
    if (!mfa?.enabledAt) {
      throw new UnauthorizedException('Break-glass access requires enrolled MFA');
    }
    if (!this.verifyTotp(this.decryptMfa(mfa), mfaCode)) {
      throw new UnauthorizedException('Invalid MFA code');
    }

    const proofId = randomUUID();
    const proof: ReauthProof = {
      userId: actor.userId,
      membershipId: context.membershipId,
      tenantId: context.tenantId,
      companyId: context.companyId,
    };
    await this.redis.set(this.proofKey(proofId), JSON.stringify(proof), REAUTH_TTL_SECONDS);

    await this.audit.record({
      actorUserId: actor.userId,
      resource: 'break_glass',
      action: 'reauthenticate',
      targetTenantId: context.tenantId,
      targetEntityType: 'membership',
      targetEntityId: context.membershipId,
      metadata: {
        companyId: context.companyId,
        proofTtlSeconds: REAUTH_TTL_SECONDS,
      },
    });

    return { proofId, expiresInSeconds: REAUTH_TTL_SECONDS };
  }

  async list() {
    const context = this.tenantContext.getContext();
    return this.prisma.$queryRaw`
      SELECT e.id,
             e."membershipId",
             e."permissionId",
             e."branchId",
             e."temporaryGrantId",
             e.reason,
             e."startsAt",
             e."endsAt",
             e."activatedByUserId",
             e."revokedAt",
             e."revokedByUserId",
             e."createdAt",
             p.resource AS "permissionResource",
             p.action AS "permissionAction",
             u.email AS "actorEmail",
             b.name AS "branchName"
      FROM break_glass_access_events e
      JOIN permissions p ON p.id = e."permissionId"
      JOIN users u ON u.id = e."activatedByUserId"
      LEFT JOIN branches b ON b.id = e."branchId"
      WHERE e."tenantId" = ${context.tenantId}
        AND e."companyId" = ${context.companyId}
      ORDER BY e."createdAt" DESC
      LIMIT 250
    `;
  }

  async activate(input: {
    proofId: string;
    permissionId: string;
    branchId?: string | null;
    durationMinutes: number;
    reason: string;
  }) {
    const context = this.tenantContext.getContext();
    const actor = await this.requireEligibleActor();
    const rawProof = await this.redis.getAndDelete(this.proofKey(input.proofId));
    if (!rawProof) throw new UnauthorizedException('Re-authentication proof is invalid or expired');
    const proof = JSON.parse(rawProof) as ReauthProof;
    if (
      proof.userId !== actor.userId ||
      proof.membershipId !== context.membershipId ||
      proof.tenantId !== context.tenantId ||
      proof.companyId !== context.companyId
    ) {
      throw new UnauthorizedException('Re-authentication proof does not match active context');
    }

    const durationMinutes = Math.trunc(input.durationMinutes);
    if (durationMinutes < 5 || durationMinutes > MAX_BREAK_GLASS_MINUTES) {
      throw new BadRequestException('Break-glass duration must be between 5 and 60 minutes');
    }
    const reason = input.reason.trim();
    if (reason.length < 10) {
      throw new BadRequestException('A detailed break-glass reason is required');
    }

    const permission = await this.prisma.permission.findUnique({
      where: { id: input.permissionId },
      select: { id: true, resource: true, action: true },
    });
    if (!permission) throw new NotFoundException('Permission not found');

    let branchId = input.branchId ?? null;
    if (actor.roleScope !== 'CENTRAL') {
      if (!context.branchId) {
        throw new BadRequestException('Non-central break-glass access requires an active branch context');
      }
      if (branchId && branchId !== context.branchId) {
        throw new BadRequestException('Break-glass branch must match active branch context');
      }
      branchId = context.branchId;
    }
    if (branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: {
          id: branchId,
          companyId: context.companyId,
          status: 'ACTIVE',
          company: { tenantId: context.tenantId },
        },
        select: { id: true },
      });
      if (!branch) throw new BadRequestException('Break-glass branch is invalid or inactive');
    }

    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
    const temporaryGrantId = randomUUID();
    const eventId = randomUUID();

    return this.prisma.$transaction(
      async (tx) => {
        const overlap = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id
          FROM temporary_permission_grants
          WHERE "tenantId" = ${context.tenantId}
            AND "companyId" = ${context.companyId}
            AND "membershipId" = ${context.membershipId}
            AND "permissionId" = ${permission.id}
            AND "branchId" IS NOT DISTINCT FROM ${branchId}
            AND "revokedAt" IS NULL
            AND "startsAt" < ${endsAt}
            AND "endsAt" > ${startsAt}
          LIMIT 1
          FOR UPDATE
        `;
        if (overlap.length) {
          throw new BadRequestException('An active or overlapping access grant already exists');
        }

        await tx.$executeRaw`
          INSERT INTO temporary_permission_grants (
            id, "tenantId", "companyId", "membershipId", "permissionId", "branchId",
            "startsAt", "endsAt", reason, "grantedByUserId", "createdAt", "updatedAt"
          ) VALUES (
            ${temporaryGrantId}, ${context.tenantId}, ${context.companyId}, ${context.membershipId},
            ${permission.id}, ${branchId}, ${startsAt}, ${endsAt},
            ${`BREAK_GLASS: ${reason}`}, ${actor.userId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )
        `;
        await tx.$executeRaw`
          INSERT INTO break_glass_access_events (
            id, "tenantId", "companyId", "membershipId", "permissionId", "branchId",
            "temporaryGrantId", reason, "startsAt", "endsAt", "activatedByUserId", "createdAt"
          ) VALUES (
            ${eventId}, ${context.tenantId}, ${context.companyId}, ${context.membershipId},
            ${permission.id}, ${branchId}, ${temporaryGrantId}, ${reason}, ${startsAt}, ${endsAt},
            ${actor.userId}, CURRENT_TIMESTAMP
          )
        `;

        await this.audit.record(
          {
            actorUserId: actor.userId,
            resource: 'break_glass',
            action: 'activate',
            targetTenantId: context.tenantId,
            targetEntityType: 'break_glass_access_event',
            targetEntityId: eventId,
            beforeState: null,
            afterState: {
              permission: `${permission.resource}.${permission.action}`,
              branchId,
              startsAt,
              endsAt,
              durationMinutes,
              reason,
            },
            metadata: {
              companyId: context.companyId,
              membershipId: context.membershipId,
              temporaryGrantId,
              reauthenticated: true,
            },
          },
          tx,
        );

        return {
          id: eventId,
          temporaryGrantId,
          permission: `${permission.resource}.${permission.action}`,
          branchId,
          startsAt,
          endsAt,
          reason,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async revoke(id: string) {
    const context = this.tenantContext.getContext();
    const actor = await this.requireEligibleActor();
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<Array<{
          id: string;
          temporaryGrantId: string;
          revokedAt: Date | null;
        }>>`
          SELECT id, "temporaryGrantId", "revokedAt"
          FROM break_glass_access_events
          WHERE id = ${id}
            AND "tenantId" = ${context.tenantId}
            AND "companyId" = ${context.companyId}
          FOR UPDATE
        `;
        const event = rows[0];
        if (!event) throw new NotFoundException('Break-glass event not found');
        if (event.revokedAt) return { id, revoked: true, revokedAt: event.revokedAt };

        await tx.$executeRaw`
          UPDATE temporary_permission_grants
          SET "revokedAt" = CURRENT_TIMESTAMP,
              "revokedByUserId" = ${actor.userId},
              "updatedAt" = CURRENT_TIMESTAMP
          WHERE id = ${event.temporaryGrantId}
            AND "tenantId" = ${context.tenantId}
            AND "companyId" = ${context.companyId}
            AND "revokedAt" IS NULL
        `;
        const updated = await tx.$queryRaw<Array<{ revokedAt: Date }>>`
          UPDATE break_glass_access_events
          SET "revokedAt" = CURRENT_TIMESTAMP,
              "revokedByUserId" = ${actor.userId}
          WHERE id = ${id}
          RETURNING "revokedAt"
        `;

        await this.audit.record(
          {
            actorUserId: actor.userId,
            resource: 'break_glass',
            action: 'revoke',
            targetTenantId: context.tenantId,
            targetEntityType: 'break_glass_access_event',
            targetEntityId: id,
            beforeState: { revokedAt: null },
            afterState: { revokedAt: updated[0]?.revokedAt ?? null },
            metadata: {
              companyId: context.companyId,
              membershipId: context.membershipId,
              temporaryGrantId: event.temporaryGrantId,
            },
          },
          tx,
        );

        return { id, revoked: true, revokedAt: updated[0]?.revokedAt ?? null };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async requireEligibleActor() {
    const context = this.tenantContext.getContext();
    const membership = await this.prisma.membership.findFirst({
      where: {
        id: context.membershipId,
        tenantId: context.tenantId,
        companyId: context.companyId,
        status: 'ACTIVE',
      },
      include: { role: true },
    });
    if (!membership) throw new UnauthorizedException('Active administrator membership is required');
    if (membership.role.scope !== 'CENTRAL') {
      throw new UnauthorizedException('Break-glass activation requires a CENTRAL administrator');
    }
    return { userId: membership.userId, roleScope: membership.role.scope };
  }

  private proofKey(id: string) {
    return `admin:break-glass:reauth:${id}`;
  }

  private decryptMfa(row: MfaRow) {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey(),
      Buffer.from(row.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(row.authTag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(row.encryptedSecret, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  private encryptionKey() {
    const source =
      this.config.get<string>('MFA_ENCRYPTION_KEY') ||
      this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    return createHash('sha256').update(source).digest();
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
    const binary =
      ((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff);
    return String(binary % 1_000_000).padStart(6, '0');
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
