import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';

import { RedisService } from '../../infrastructure/redis/redis.service';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';
import { SecurityPolicyService } from './security-policy.service';

type SessionRecord = {
  id: string;
  userId: string;
  tenantId: string;
  membershipId: string;
  companyId: string | null;
  branchId: string | null;
  roleScope: string | null;
  refreshId: string;
  createdAt: string;
  rotatedAt: string;
};

type SessionPolicy = {
  sessionMaxAgeMinutes: number;
  idleTimeoutMinutes: number;
};

const DEFAULT_POLICY: SessionPolicy = {
  sessionMaxAgeMinutes: 60 * 24 * 7,
  idleTimeoutMinutes: 60 * 8,
};

@Injectable()
export class AuthSessionRegistryService {
  constructor(
    private readonly redis: RedisService,
    private readonly audit: PlatformAuditService,
    private readonly securityPolicy: SecurityPolicyService,
  ) {}

  async register(input: {
    refreshId: string;
    userId: string;
    tenantId: string;
    membershipId: string;
    companyId: string | null;
    branchId: string | null;
    roleScope: string | null;
  }) {
    const id = this.fingerprint(input.refreshId);
    const now = new Date().toISOString();
    const record: SessionRecord = {
      id,
      userId: input.userId,
      tenantId: input.tenantId,
      membershipId: input.membershipId,
      companyId: input.companyId,
      branchId: input.branchId,
      roleScope: input.roleScope,
      refreshId: input.refreshId,
      createdAt: now,
      rotatedAt: now,
    };
    const policy = await this.resolvePolicy(input.tenantId, input.companyId);
    const ttl = this.sessionTtlSeconds(record, policy, Date.now());

    await this.redis.set(`auth:session:${id}`, JSON.stringify(record), ttl);
    const indexKey = `auth:user-sessions:${input.userId}:${input.tenantId}`;
    await this.redis.getClient().sAdd(indexKey, id);
    await this.redis
      .getClient()
      .expire(indexKey, Math.max(ttl, policy.sessionMaxAgeMinutes * 60));
    return this.publicRecord(record, ttl);
  }

  async rotate(oldRefreshId: string, newRefreshId: string) {
    const oldId = this.fingerprint(oldRefreshId);
    const raw = await this.redis.get(`auth:session:${oldId}`);
    if (!raw) {
      await this.redis.delete(`auth:refresh:${newRefreshId}`);
      throw new UnauthorizedException('Session is expired or no longer registered');
    }

    const current = this.parse(raw);
    if (!current) {
      await this.redis.delete(`auth:refresh:${newRefreshId}`);
      throw new UnauthorizedException('Session registry is invalid');
    }

    const policy = await this.resolvePolicy(current.tenantId, current.companyId);
    const now = Date.now();
    this.assertActive(current, policy, now);

    const newId = this.fingerprint(newRefreshId);
    const next: SessionRecord = {
      ...current,
      id: newId,
      refreshId: newRefreshId,
      rotatedAt: new Date(now).toISOString(),
    };
    const ttl = this.sessionTtlSeconds(next, policy, now);
    const indexKey = `auth:user-sessions:${current.userId}:${current.tenantId}`;

    await this.redis.set(`auth:session:${newId}`, JSON.stringify(next), ttl);
    await this.redis.delete(`auth:session:${oldId}`);
    await this.redis.getClient().sRem(indexKey, oldId);
    await this.redis.getClient().sAdd(indexKey, newId);
    await this.redis
      .getClient()
      .expire(indexKey, Math.max(ttl, policy.sessionMaxAgeMinutes * 60));
    return this.publicRecord(next, ttl);
  }

  async list(userId: string, tenantId: string) {
    return this.listScoped(userId, tenantId, null);
  }

  async listForCompany(userId: string, tenantId: string, companyId: string) {
    return this.listScoped(userId, tenantId, companyId);
  }

  async revoke(id: string, userId: string, tenantId: string) {
    return this.revokeRecord({
      id,
      actorUserId: userId,
      targetUserId: userId,
      tenantId,
      companyId: null,
      action: 'revoke',
    });
  }

  async revokeForAdmin(input: {
    id: string;
    actorUserId: string;
    targetUserId: string;
    tenantId: string;
    companyId: string;
  }) {
    return this.revokeRecord({
      ...input,
      action: 'admin_revoke',
    });
  }

  async revokeAll(input: {
    actorUserId: string;
    targetUserId: string;
    tenantId: string;
    companyId?: string | null;
    action?: 'revoke_all' | 'admin_revoke_all';
  }) {
    const sessions = input.companyId
      ? await this.listForCompany(input.targetUserId, input.tenantId, input.companyId)
      : await this.list(input.targetUserId, input.tenantId);

    let revokedCount = 0;
    for (const session of sessions) {
      try {
        await this.revokeRecord({
          id: session.id,
          actorUserId: input.actorUserId,
          targetUserId: input.targetUserId,
          tenantId: input.tenantId,
          companyId: input.companyId ?? null,
          action: input.action ?? 'revoke_all',
          writeAudit: false,
        });
        revokedCount += 1;
      } catch (error) {
        if (!(error instanceof NotFoundException)) throw error;
      }
    }

    await this.audit.record({
      actorUserId: input.actorUserId,
      resource: 'security_sessions',
      action: input.action ?? 'revoke_all',
      targetTenantId: input.tenantId,
      targetEntityType: 'user_sessions',
      targetEntityId: input.targetUserId,
      beforeState: { activeSessionCount: sessions.length },
      afterState: { activeSessionCount: Math.max(0, sessions.length - revokedCount) },
      metadata: {
        targetUserId: input.targetUserId,
        companyId: input.companyId ?? null,
        revokedCount,
      },
    });

    return { revokedCount };
  }

  async unregister(refreshId: string) {
    const id = this.fingerprint(refreshId);
    const raw = await this.redis.get(`auth:session:${id}`);
    const record = raw ? this.parse(raw) : null;
    await this.redis.delete(`auth:session:${id}`);
    if (record) {
      await this.redis.getClient().sRem(
        `auth:user-sessions:${record.userId}:${record.tenantId}`,
        id,
      );
    }
  }

  private async listScoped(userId: string, tenantId: string, companyId: string | null) {
    const indexKey = `auth:user-sessions:${userId}:${tenantId}`;
    const ids = await this.redis.getClient().sMembers(indexKey);
    const result = [];

    for (const id of ids) {
      const key = `auth:session:${id}`;
      const raw = await this.redis.get(key);
      if (!raw) {
        await this.redis.getClient().sRem(indexKey, id);
        continue;
      }
      const record = this.parse(raw);
      if (!record || record.userId !== userId || record.tenantId !== tenantId) {
        await this.redis.getClient().sRem(indexKey, id);
        continue;
      }
      if (companyId && record.companyId !== companyId) continue;
      const ttl = await this.redis.getClient().ttl(key);
      result.push(this.publicRecord(record, ttl >= 0 ? ttl : null));
    }

    return result.sort((a, b) => b.rotatedAt.localeCompare(a.rotatedAt));
  }

  private async revokeRecord(input: {
    id: string;
    actorUserId: string;
    targetUserId: string;
    tenantId: string;
    companyId: string | null;
    action: string;
    writeAudit?: boolean;
  }) {
    const key = `auth:session:${input.id}`;
    const raw = await this.redis.get(key);
    const record = raw ? this.parse(raw) : null;
    if (
      !record ||
      record.userId !== input.targetUserId ||
      record.tenantId !== input.tenantId ||
      (input.companyId && record.companyId !== input.companyId)
    ) {
      throw new NotFoundException('Session not found');
    }

    await this.redis.delete(`auth:refresh:${record.refreshId}`);
    await this.redis.delete(key);
    await this.redis.getClient().sRem(
      `auth:user-sessions:${input.targetUserId}:${input.tenantId}`,
      input.id,
    );

    if (input.writeAudit !== false) {
      await this.audit.record({
        actorUserId: input.actorUserId,
        resource: 'security_sessions',
        action: input.action,
        targetTenantId: input.tenantId,
        targetEntityType: 'auth_session',
        targetEntityId: input.id,
        beforeState: {
          active: true,
          membershipId: record.membershipId,
          userId: record.userId,
        },
        afterState: { active: false },
        metadata: {
          companyId: record.companyId,
          branchId: record.branchId,
          targetUserId: record.userId,
        },
      });
    }

    return { id: input.id, revoked: true };
  }

  private async resolvePolicy(
    tenantId: string,
    companyId: string | null,
  ): Promise<SessionPolicy> {
    if (!companyId) return DEFAULT_POLICY;
    const policy = await this.securityPolicy.get(tenantId, companyId);
    return {
      sessionMaxAgeMinutes: Number(policy.sessionMaxAgeMinutes),
      idleTimeoutMinutes: Number(policy.idleTimeoutMinutes),
    };
  }

  private assertActive(record: SessionRecord, policy: SessionPolicy, now: number) {
    const createdAt = Date.parse(record.createdAt);
    const rotatedAt = Date.parse(record.rotatedAt);
    const maxAgeMs = policy.sessionMaxAgeMinutes * 60_000;
    const idleMs = policy.idleTimeoutMinutes * 60_000;

    if (
      !Number.isFinite(createdAt) ||
      !Number.isFinite(rotatedAt) ||
      now - createdAt >= maxAgeMs ||
      now - rotatedAt >= idleMs
    ) {
      throw new UnauthorizedException('Session lifetime policy has expired');
    }
  }

  private sessionTtlSeconds(record: SessionRecord, policy: SessionPolicy, now: number) {
    const createdAt = Date.parse(record.createdAt);
    const remainingMaxAgeMs = Math.max(
      1_000,
      createdAt + policy.sessionMaxAgeMinutes * 60_000 - now,
    );
    const idleMs = Math.max(1_000, policy.idleTimeoutMinutes * 60_000);
    return Math.max(1, Math.floor(Math.min(remainingMaxAgeMs, idleMs) / 1_000));
  }

  private publicRecord(record: SessionRecord, expiresInSeconds: number | null) {
    return {
      id: record.id,
      membershipId: record.membershipId,
      companyId: record.companyId,
      branchId: record.branchId,
      roleScope: record.roleScope,
      createdAt: record.createdAt,
      rotatedAt: record.rotatedAt,
      expiresInSeconds,
    };
  }

  private parse(raw: string): SessionRecord | null {
    try {
      const record = JSON.parse(raw) as SessionRecord;
      return record?.id && record?.userId && record?.tenantId && record?.refreshId
        ? record
        : null;
    } catch {
      return null;
    }
  }

  private fingerprint(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
}
