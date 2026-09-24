import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { RedisService } from '../../infrastructure/redis/redis.service';

type CreateConversationInput = {
  type: 'DIRECT' | 'GROUP';
  name?: string;
  memberUserIds: string[];
};

type SendMessageInput = {
  body: string;
  replyToMessageId?: string | null;
};

type PresenceInput = {
  status:
    | 'AVAILABLE'
    | 'BUSY'
    | 'IN_SESSION'
    | 'ON_BREAK'
    | 'IN_MEETING'
    | 'DO_NOT_DISTURB'
    | 'OFFLINE';
  statusText?: string | null;
  statusUntil?: Date | null;
};

@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly redis: RedisService,
  ) {}

  private tenantId() {
    return this.tenantContext.getTenantId();
  }

  private companyId() {
    return this.tenantContext.getCompanyId();
  }

  private async requireActiveUser(userId: string) {
    const rows = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT u.id
       FROM users u
       JOIN memberships m ON m."userId"=u.id
       WHERE u.id=$1::text
         AND m."tenantId"=$2::text
         AND m."companyId"=$3::text
         AND m.status='ACTIVE'
       LIMIT 1`,
      userId,
      this.tenantId(),
      this.companyId(),
    );
    if (!rows.length) throw new ForbiddenException('Bu ekip üyesine erişiminiz yok.');
  }

  private async requireConversationMember(userId: string, conversationId: string) {
    const rows = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT c.id
       FROM team_conversations c
       JOIN team_conversation_members cm ON cm.conversation_id=c.id
       WHERE c.id=$1::text
         AND cm.user_id=$2::text
         AND c.tenant_id=$3::text
         AND c.company_id=$4::text
       LIMIT 1`,
      conversationId,
      userId,
      this.tenantId(),
      this.companyId(),
    );
    if (!rows.length) throw new NotFoundException('Konuşma bulunamadı.');
  }

  private async requireGroupAdmin(userId: string, conversationId: string) {
    const rows = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT c.id
       FROM team_conversations c
       JOIN team_conversation_members cm ON cm.conversation_id=c.id
       WHERE c.id=$1::text
         AND cm.user_id=$2::text
         AND cm.is_admin=TRUE
         AND c.type='GROUP'
         AND c.tenant_id=$3::text
         AND c.company_id=$4::text
       LIMIT 1`,
      conversationId,
      userId,
      this.tenantId(),
      this.companyId(),
    );
    if (!rows.length) throw new ForbiddenException('Bu grup için yönetici yetkiniz yok.');
  }

  async unreadSummary(currentUserId: string) {
    const rows = await this.prisma.$queryRawUnsafe<{ unreadCount: number }[]>(
      `SELECT COALESCE(SUM(unread_count),0)::int AS "unreadCount"
       FROM (
         SELECT COUNT(m.id)::int AS unread_count
         FROM team_conversation_members cm
         JOIN team_conversations c ON c.id=cm.conversation_id
         JOIN team_messages m ON m.conversation_id=c.id
         WHERE cm.user_id=$1::text
           AND c.tenant_id=$2::text
           AND c.company_id=$3::text
           AND m.deleted_at IS NULL
           AND m.sender_user_id<>$1::text
           AND (cm.last_read_at IS NULL OR m.created_at>cm.last_read_at)
         GROUP BY c.id
       ) unread`,
      currentUserId,
      this.tenantId(),
      this.companyId(),
    );
    return { unreadCount: rows[0]?.unreadCount ?? 0 };
  }

  async people(currentUserId: string) {
    await this.heartbeat(currentUserId);
    return this.prisma.$queryRawUnsafe(
      `SELECT
         u.id,
         u."firstName" AS "firstName",
         u."lastName" AS "lastName",
         u.email,
         r.name AS "roleName",
         COALESCE(p.status,'OFFLINE') AS status,
         p.status_text AS "statusText",
         p.status_until AS "statusUntil",
         p.last_seen_at AS "lastSeenAt",
         CASE
           WHEN p.status='OFFLINE' THEN FALSE
           WHEN p.last_seen_at >= NOW() - INTERVAL '90 seconds' THEN TRUE
           ELSE FALSE
         END AS "isOnline"
       FROM memberships m
       JOIN users u ON u.id=m."userId"
       JOIN roles r ON r.id=m."roleId"
       LEFT JOIN team_user_presence p
         ON p.user_id=u.id
        AND p.tenant_id=m."tenantId"
        AND p.company_id=m."companyId"
       WHERE m."tenantId"=$1::text
         AND m."companyId"=$2::text
         AND m.status='ACTIVE'
       ORDER BY
         CASE WHEN u.id=$3::text THEN 0 ELSE 1 END,
         CASE WHEN p.last_seen_at >= NOW() - INTERVAL '90 seconds' AND p.status <> 'OFFLINE' THEN 0 ELSE 1 END,
         u."firstName",
         u."lastName"`,
      this.tenantId(),
      this.companyId(),
      currentUserId,
    );
  }

  async conversations(currentUserId: string) {
    await this.heartbeat(currentUserId);
    return this.prisma.$queryRawUnsafe(
      `SELECT
         c.id,
         c.type,
         c.name,
         c.created_at AS "createdAt",
         c.updated_at AS "updatedAt",
         COALESCE(
           CASE
             WHEN c.type='DIRECT' THEN (
               SELECT concat_ws(' ',u."firstName",u."lastName")
               FROM team_conversation_members other_cm
               JOIN users u ON u.id=other_cm.user_id
               WHERE other_cm.conversation_id=c.id
                 AND other_cm.user_id<>$1::text
               LIMIT 1
             )
             ELSE c.name
           END,
           'Konuşma'
         ) AS "displayName",
         (
           SELECT json_build_object(
             'body', m.body,
             'createdAt', m.created_at,
             'senderUserId', m.sender_user_id,
             'senderName', concat_ws(' ',su."firstName",su."lastName")
           )
           FROM team_messages m
           JOIN users su ON su.id=m.sender_user_id
           WHERE m.conversation_id=c.id
             AND m.deleted_at IS NULL
           ORDER BY m.created_at DESC
           LIMIT 1
         ) AS "lastMessage",
         (
           SELECT COUNT(*)::int
           FROM team_messages m
           WHERE m.conversation_id=c.id
             AND m.deleted_at IS NULL
             AND m.sender_user_id<>$1::text
             AND (cm.last_read_at IS NULL OR m.created_at>cm.last_read_at)
         ) AS "unreadCount",
         (
           SELECT COUNT(*)::int
           FROM team_conversation_members all_cm
           WHERE all_cm.conversation_id=c.id
         ) AS "memberCount"
       FROM team_conversations c
       JOIN team_conversation_members cm
         ON cm.conversation_id=c.id
        AND cm.user_id=$1::text
       WHERE c.tenant_id=$2::text
         AND c.company_id=$3::text
       ORDER BY COALESCE((
         SELECT MAX(m.created_at)
         FROM team_messages m
         WHERE m.conversation_id=c.id
       ),c.updated_at) DESC`,
      currentUserId,
      this.tenantId(),
      this.companyId(),
    );
  }

  async createConversation(currentUserId: string, input: CreateConversationInput) {
    await this.requireActiveUser(currentUserId);

    const memberIds = [...new Set([currentUserId, ...input.memberUserIds])];
    if (input.type === 'DIRECT' && memberIds.length !== 2) {
      throw new BadRequestException('Birebir konuşma iki kullanıcıdan oluşmalıdır.');
    }
    if (input.type === 'GROUP' && memberIds.length < 3) {
      throw new BadRequestException('Grup konuşması en az üç kullanıcıdan oluşmalıdır.');
    }
    if (input.type === 'GROUP' && !input.name?.trim()) {
      throw new BadRequestException('Grup adı gereklidir.');
    }

    const validRows = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT DISTINCT u.id
       FROM users u
       JOIN memberships m ON m."userId"=u.id
       WHERE u.id=ANY($1::text[])
         AND m."tenantId"=$2::text
         AND m."companyId"=$3::text
         AND m.status='ACTIVE'`,
      memberIds,
      this.tenantId(),
      this.companyId(),
    );
    if (validRows.length !== memberIds.length) {
      throw new BadRequestException('Konuşmaya yalnızca aktif ekip üyeleri eklenebilir.');
    }

    if (input.type === 'DIRECT') {
      const existing = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT c.id
         FROM team_conversations c
         WHERE c.tenant_id=$1::text
           AND c.company_id=$2::text
           AND c.type='DIRECT'
           AND (
             SELECT array_agg(cm.user_id ORDER BY cm.user_id)
             FROM team_conversation_members cm
             WHERE cm.conversation_id=c.id
           ) = (
             SELECT array_agg(x ORDER BY x)
             FROM unnest($3::text[]) x
           )
         LIMIT 1`,
        this.tenantId(),
        this.companyId(),
        memberIds,
      );
      if (existing.length) return { id: existing[0].id, existing: true };
    }

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO team_conversations(
           tenant_id,company_id,type,name,created_by_user_id
         ) VALUES($1::text,$2::text,$3,$4,$5::text)
         RETURNING id`,
        this.tenantId(),
        this.companyId(),
        input.type,
        input.type === 'GROUP' ? input.name?.trim() : null,
        currentUserId,
      );
      const conversationId = rows[0]?.id;
      if (!conversationId) throw new BadRequestException('Konuşma oluşturulamadı.');

      for (const userId of memberIds) {
        await tx.$executeRawUnsafe(
          `INSERT INTO team_conversation_members(
             conversation_id,user_id,is_admin
           ) VALUES($1::text,$2::text,$3)`,
          conversationId,
          userId,
          userId === currentUserId,
        );
      }
      return { id: conversationId, existing: false };
    });
  }

  async messages(currentUserId: string, conversationId: string, rawLimit: number) {
    await this.requireConversationMember(currentUserId, conversationId);
    const limit = Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(200, Math.trunc(rawLimit)))
      : 100;

    return this.prisma.$queryRawUnsafe(
      `SELECT *
       FROM (
         SELECT
           m.id,
           m.body,
           m.reply_to_message_id AS "replyToMessageId",
           m.edited_at AS "editedAt",
           m.created_at AS "createdAt",
           m.sender_user_id AS "senderUserId",
           concat_ws(' ',u."firstName",u."lastName") AS "senderName",
           COALESCE((
             SELECT json_agg(json_build_object(
               'emoji', grouped.emoji,
               'count', grouped.reaction_count,
               'reactedByMe', grouped.reacted_by_me
             ) ORDER BY grouped.emoji)
             FROM (
               SELECT
                 r.emoji,
                 COUNT(*)::int AS reaction_count,
                 BOOL_OR(r.user_id=$5::text) AS reacted_by_me
               FROM team_message_reactions r
               WHERE r.message_id=m.id
               GROUP BY r.emoji
             ) grouped
           ), '[]'::json) AS reactions,
           (
             SELECT COUNT(*)::int
             FROM team_conversation_members receipts
             WHERE receipts.conversation_id=m.conversation_id
               AND receipts.user_id<>m.sender_user_id
               AND receipts.last_read_at IS NOT NULL
               AND receipts.last_read_at>=m.created_at
           ) AS "readByCount"
         FROM team_messages m
         JOIN users u ON u.id=m.sender_user_id
         WHERE m.conversation_id=$1::text
           AND m.tenant_id=$2::text
           AND m.company_id=$3::text
           AND m.deleted_at IS NULL
         ORDER BY m.created_at DESC
         LIMIT $4
       ) recent
       ORDER BY "createdAt" ASC`,
      conversationId,
      this.tenantId(),
      this.companyId(),
      limit,
      currentUserId,
    );
  }

  async sendMessage(
    currentUserId: string,
    conversationId: string,
    input: SendMessageInput,
  ) {
    await this.requireConversationMember(currentUserId, conversationId);

    if (input.replyToMessageId) {
      const replyRows = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM team_messages
         WHERE id=$1::text
           AND conversation_id=$2::text
           AND deleted_at IS NULL
         LIMIT 1`,
        input.replyToMessageId,
        conversationId,
      );
      if (!replyRows.length) throw new BadRequestException('Yanıtlanan mesaj bulunamadı.');
    }

    const rows = await this.prisma.$queryRawUnsafe(
      `INSERT INTO team_messages(
         tenant_id,company_id,conversation_id,sender_user_id,body,reply_to_message_id
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5,$6::text)
       RETURNING
         id,
         body,
         reply_to_message_id AS "replyToMessageId",
         created_at AS "createdAt",
         sender_user_id AS "senderUserId"`,
      this.tenantId(),
      this.companyId(),
      conversationId,
      currentUserId,
      input.body.trim(),
      input.replyToMessageId ?? null,
    );

    await this.prisma.$executeRawUnsafe(
      `UPDATE team_conversations
       SET updated_at=NOW()
       WHERE id=$1::text
         AND tenant_id=$2::text
         AND company_id=$3::text`,
      conversationId,
      this.tenantId(),
      this.companyId(),
    );

    return rows[0];
  }

  async markRead(currentUserId: string, conversationId: string) {
    await this.requireConversationMember(currentUserId, conversationId);
    await this.prisma.$executeRawUnsafe(
      `UPDATE team_conversation_members
       SET last_read_at=NOW()
       WHERE conversation_id=$1::text
         AND user_id=$2::text`,
      conversationId,
      currentUserId,
    );
    return { ok: true };
  }

  async editMessage(currentUserId: string, messageId: string, body: string) {
    const rows = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
      `UPDATE team_messages m
       SET body=$1, edited_at=NOW()
       FROM team_conversations c, team_conversation_members cm
       WHERE m.id=$2::text
         AND m.sender_user_id=$3::text
         AND m.deleted_at IS NULL
         AND c.id=m.conversation_id
         AND c.tenant_id=$4::text
         AND c.company_id=$5::text
         AND cm.conversation_id=c.id
         AND cm.user_id=$3::text
       RETURNING m.id`,
      body.trim(),
      messageId,
      currentUserId,
      this.tenantId(),
      this.companyId(),
    );
    if (!rows.length) throw new NotFoundException('Düzenlenebilir mesaj bulunamadı.');
    return { ok: true };
  }

  async deleteMessage(currentUserId: string, messageId: string) {
    const rows = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
      `UPDATE team_messages m
       SET deleted_at=NOW()
       FROM team_conversations c, team_conversation_members cm
       WHERE m.id=$1::text
         AND m.sender_user_id=$2::text
         AND m.deleted_at IS NULL
         AND c.id=m.conversation_id
         AND c.tenant_id=$3::text
         AND c.company_id=$4::text
         AND cm.conversation_id=c.id
         AND cm.user_id=$2::text
       RETURNING m.id`,
      messageId,
      currentUserId,
      this.tenantId(),
      this.companyId(),
    );
    if (!rows.length) throw new NotFoundException('Silinebilir mesaj bulunamadı.');
    return { ok: true };
  }

  async toggleReaction(currentUserId: string, messageId: string, emoji: string) {
    const rows = await this.prisma.$queryRawUnsafe<{ conversationId: string }[]>(
      `SELECT m.conversation_id AS "conversationId"
       FROM team_messages m
       JOIN team_conversations c ON c.id=m.conversation_id
       JOIN team_conversation_members cm ON cm.conversation_id=c.id
       WHERE m.id=$1::text
         AND m.deleted_at IS NULL
         AND cm.user_id=$2::text
         AND c.tenant_id=$3::text
         AND c.company_id=$4::text
       LIMIT 1`,
      messageId,
      currentUserId,
      this.tenantId(),
      this.companyId(),
    );
    if (!rows.length) throw new NotFoundException('Mesaj bulunamadı.');

    const existing = await this.prisma.$queryRawUnsafe<{ emoji: string }[]>(
      `SELECT emoji FROM team_message_reactions
       WHERE message_id=$1::text AND user_id=$2::text AND emoji=$3
       LIMIT 1`,
      messageId,
      currentUserId,
      emoji,
    );
    if (existing.length) {
      await this.prisma.$executeRawUnsafe(
        `DELETE FROM team_message_reactions
         WHERE message_id=$1::text AND user_id=$2::text AND emoji=$3`,
        messageId,
        currentUserId,
        emoji,
      );
      return { active: false };
    }

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO team_message_reactions(message_id,user_id,emoji)
       VALUES($1::text,$2::text,$3)`,
      messageId,
      currentUserId,
      emoji,
    );
    return { active: true };
  }

  async renameGroup(currentUserId: string, conversationId: string, name: string) {
    await this.requireGroupAdmin(currentUserId, conversationId);
    const rows = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
      `UPDATE team_conversations
       SET name=$1, updated_at=NOW()
       WHERE id=$2::text
         AND type='GROUP'
         AND tenant_id=$3::text
         AND company_id=$4::text
       RETURNING id`,
      name.trim(),
      conversationId,
      this.tenantId(),
      this.companyId(),
    );
    if (!rows.length) throw new NotFoundException('Grup bulunamadı.');
    return { ok: true };
  }

  async searchMessages(currentUserId: string, conversationId: string, query: string) {
    await this.requireConversationMember(currentUserId, conversationId);
    const normalized = query.trim();
    if (!normalized) return [];

    return this.prisma.$queryRawUnsafe(
      `SELECT
         m.id,
         m.body,
         m.created_at AS "createdAt",
         m.sender_user_id AS "senderUserId",
         concat_ws(' ',u."firstName",u."lastName") AS "senderName"
       FROM team_messages m
       JOIN users u ON u.id=m.sender_user_id
       WHERE m.conversation_id=$1::text
         AND m.tenant_id=$2::text
         AND m.company_id=$3::text
         AND m.deleted_at IS NULL
         AND m.body ILIKE '%' || $4 || '%'
       ORDER BY m.created_at DESC
       LIMIT 50`,
      conversationId,
      this.tenantId(),
      this.companyId(),
      normalized,
    );
  }

  async conversationMembers(currentUserId: string, conversationId: string) {
    await this.requireConversationMember(currentUserId, conversationId);
    return this.prisma.$queryRawUnsafe(
      `SELECT
         u.id,
         u."firstName" AS "firstName",
         u."lastName" AS "lastName",
         u.email,
         cm.is_admin AS "isAdmin",
         cm.joined_at AS "joinedAt",
         cm.last_read_at AS "lastReadAt",
         r.name AS "roleName"
       FROM team_conversation_members cm
       JOIN users u ON u.id=cm.user_id
       JOIN memberships membership
         ON membership."userId"=u.id
        AND membership."tenantId"=$2::text
        AND membership."companyId"=$3::text
       JOIN roles r ON r.id=membership."roleId"
       WHERE cm.conversation_id=$1::text
       ORDER BY cm.is_admin DESC,u."firstName",u."lastName"`,
      conversationId,
      this.tenantId(),
      this.companyId(),
    );
  }

  async addGroupMember(currentUserId: string, conversationId: string, userId: string) {
    await this.requireGroupAdmin(currentUserId, conversationId);
    await this.requireActiveUser(userId);
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO team_conversation_members(conversation_id,user_id,is_admin)
       VALUES($1::text,$2::text,FALSE)
       ON CONFLICT(conversation_id,user_id) DO NOTHING`,
      conversationId,
      userId,
    );
    return { ok: true };
  }

  async removeGroupMember(currentUserId: string, conversationId: string, userId: string) {
    await this.requireGroupAdmin(currentUserId, conversationId);
    if (userId === currentUserId) {
      throw new BadRequestException('Grup yöneticisi kendisini bu ekrandan çıkaramaz.');
    }
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM team_conversation_members
       WHERE conversation_id=$1::text AND user_id=$2::text`,
      conversationId,
      userId,
    );
    return { ok: true };
  }

  async setTyping(currentUserId: string, conversationId: string, typing: boolean) {
    await this.requireConversationMember(currentUserId, conversationId);
    const key = `team:typing:${this.tenantId()}:${this.companyId()}:${conversationId}:${currentUserId}`;
    if (typing) {
      await this.redis.set(key, String(Date.now()), 8);
    } else {
      await this.redis.delete(key);
    }
    return { ok: true };
  }

  async typingUsers(currentUserId: string, conversationId: string) {
    await this.requireConversationMember(currentUserId, conversationId);
    const members = await this.prisma.$queryRawUnsafe<{ id: string; firstName: string; lastName: string }[]>(
      `SELECT u.id,u."firstName" AS "firstName",u."lastName" AS "lastName"
       FROM team_conversation_members cm
       JOIN users u ON u.id=cm.user_id
       WHERE cm.conversation_id=$1::text
         AND cm.user_id<>$2::text`,
      conversationId,
      currentUserId,
    );
    const active: typeof members = [];
    for (const member of members) {
      const key = `team:typing:${this.tenantId()}:${this.companyId()}:${conversationId}:${member.id}`;
      if (await this.redis.get(key)) active.push(member);
    }
    return active;
  }

  async updatePresence(currentUserId: string, input: PresenceInput) {
    await this.requireActiveUser(currentUserId);
    const rows = await this.prisma.$queryRawUnsafe(
      `INSERT INTO team_user_presence(
         tenant_id,company_id,user_id,status,status_text,status_until,last_seen_at
       ) VALUES($1::text,$2::text,$3::text,$4,$5,$6::timestamptz,NOW())
       ON CONFLICT(tenant_id,company_id,user_id)
       DO UPDATE SET
         status=EXCLUDED.status,
         status_text=EXCLUDED.status_text,
         status_until=EXCLUDED.status_until,
         last_seen_at=NOW(),
         updated_at=NOW()
       RETURNING
         status,
         status_text AS "statusText",
         status_until AS "statusUntil",
         last_seen_at AS "lastSeenAt"`,
      this.tenantId(),
      this.companyId(),
      currentUserId,
      input.status,
      input.statusText ?? null,
      input.statusUntil ?? null,
    );
    return rows[0];
  }

  async heartbeat(currentUserId: string) {
    await this.requireActiveUser(currentUserId);
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO team_user_presence(
         tenant_id,company_id,user_id,status,last_seen_at
       ) VALUES($1::text,$2::text,$3::text,'AVAILABLE',NOW())
       ON CONFLICT(tenant_id,company_id,user_id)
       DO UPDATE SET
         last_seen_at=NOW(),
         updated_at=NOW(),
         status=CASE
           WHEN team_user_presence.status_until IS NOT NULL
            AND team_user_presence.status_until <= NOW()
           THEN 'AVAILABLE'
           ELSE team_user_presence.status
         END,
         status_text=CASE
           WHEN team_user_presence.status_until IS NOT NULL
            AND team_user_presence.status_until <= NOW()
           THEN NULL
           ELSE team_user_presence.status_text
         END,
         status_until=CASE
           WHEN team_user_presence.status_until IS NOT NULL
            AND team_user_presence.status_until <= NOW()
           THEN NULL
           ELSE team_user_presence.status_until
         END`,
      this.tenantId(),
      this.companyId(),
      currentUserId,
    );
    return { ok: true };
  }
}
