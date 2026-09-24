import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

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
       JOIN memberships m ON m.user_id=u.id
       WHERE u.id=$1::text
         AND m.tenant_id=$2::text
         AND m.company_id=$3::text
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

  async people(currentUserId: string) {
    await this.heartbeat(currentUserId);
    return this.prisma.$queryRawUnsafe(
      `SELECT
         u.id,
         u.first_name AS "firstName",
         u.last_name AS "lastName",
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
       JOIN users u ON u.id=m.user_id
       JOIN roles r ON r.id=m.role_id
       LEFT JOIN team_user_presence p
         ON p.user_id=u.id
        AND p.tenant_id=m.tenant_id
        AND p.company_id=m.company_id
       WHERE m.tenant_id=$1::text
         AND m.company_id=$2::text
         AND m.status='ACTIVE'
       ORDER BY
         CASE WHEN u.id=$3::text THEN 0 ELSE 1 END,
         CASE WHEN p.last_seen_at >= NOW() - INTERVAL '90 seconds' AND p.status <> 'OFFLINE' THEN 0 ELSE 1 END,
         u.first_name,
         u.last_name`,
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
               SELECT concat_ws(' ',u.first_name,u.last_name)
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
             'senderName', concat_ws(' ',su.first_name,su.last_name)
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
       JOIN memberships m ON m.user_id=u.id
       WHERE u.id=ANY($1::text[])
         AND m.tenant_id=$2::text
         AND m.company_id=$3::text
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
           concat_ws(' ',u.first_name,u.last_name) AS "senderName"
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
