import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { RedisService } from '../../infrastructure/redis/redis.service';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';

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

const TTL_SECONDS = 60 * 60 * 24 * 7;

@Injectable()
export class AuthSessionRegistryService {
  constructor(
    private readonly redis: RedisService,
    private readonly audit: PlatformAuditService,
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

    await this.redis.set(`auth:session:${id}`, JSON.stringify(record), TTL_SECONDS);
    await this.redis.getClient().sAdd(`auth:user-sessions:${input.userId}:${input.tenantId}`, id);
    await this.redis.getClient().expire(`auth:user-sessions:${input.userId}:${input.tenantId}`, TTL_SECONDS);
    return this.publicRecord(record, TTL_SECONDS);
  }

  async rotate(oldRefreshId: string, newRefreshId: string) {
    const oldId = this.fingerprint(oldRefreshId);
    const raw = await this.redis.get(`auth:session:${oldId}`);
    if (!raw) return null;

    const current = this.parse(raw);
    if (!current) return null;

    const newId = this.fingerprint(newRefreshId);
    const next: SessionRecord = {
      ...current,
      id: newId,
      refreshId: newRefreshId,
      rotatedAt: new Date().toISOString(),
    };
    const indexKey = `auth:user-sessions:${current.userId}:${current.tenantId}`;

    await this.redis.set(`auth:session:${newId}`, JSON.stringify(next), TTL_SECONDS);
    await this.redis.delete(`auth:session:${oldId}`);
    await this.redis.getClient().sRem(indexKey, oldId);
    await this.redis.getClient().sAdd(indexKey, newId);
    await this.redis.getClient().expire(indexKey, TTL_SECONDS);
    return this.publicRecord(next, TTL_SECONDS);
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
