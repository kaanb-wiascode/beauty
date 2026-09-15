import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma, PrismaService } from '@beauty-erp/database';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
const STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'PENDING_CUSTOMER',
  'RESOLVED',
  'CLOSED',
] as const;
const SOURCES = ['PLATFORM', 'TENANT', 'INTERNAL'] as const;

type Priority = (typeof PRIORITIES)[number];
type TicketStatus = (typeof STATUSES)[number];
type TicketSource = (typeof SOURCES)[number];

type TicketRow = {
  id: string;
  tenantId: string;
  subject: string;
  description: string | null;
  priority: Priority;
  status: TicketStatus;
  source: TicketSource;
  requesterEmail: string | null;
  assignedPlatformUserId: string | null;
  slaPolicyId: string;
  responseDueAt: Date;
  resolutionDueAt: Date;
  firstResponseAt: Date | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  createdByPlatformUserId: string;
  responseBreached?: boolean;
  resolutionBreached?: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type PolicyRow = {
  id: string;
  name: string;
  priority: Priority;
  clockMode: 'CALENDAR';
  initialResponseMinutes: number;
  resolutionMinutes: number;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class PlatformSupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PlatformAuditService,
  ) {}

  async listTickets(
    input: {
      tenantId?: string;
      status?: string;
      priority?: string;
      limit?: number;
    } = {},
  ) {
    const status = this.optionalEnum(input.status, STATUSES, 'status');
    const priority = this.optionalEnum(input.priority, PRIORITIES, 'priority');
    const tenantId = input.tenantId?.trim() || null;
    const limit = input.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw new BadRequestException('limit must be an integer between 1 and 200.');
    }
    return this.prisma.$queryRaw<TicketRow[]>`
      SELECT
        id, tenant_id AS "tenantId", subject, description, priority, status, source,
        requester_email AS "requesterEmail",
        assigned_platform_user_id AS "assignedPlatformUserId",
        sla_policy_id AS "slaPolicyId",
        response_due_at AS "responseDueAt",
        resolution_due_at AS "resolutionDueAt",
        first_response_at AS "firstResponseAt",
        resolved_at AS "resolvedAt", closed_at AS "closedAt",
        created_by_platform_user_id AS "createdByPlatformUserId",
        (first_response_at IS NULL AND response_due_at < CURRENT_TIMESTAMP AND status NOT IN ('RESOLVED','CLOSED')) AS "responseBreached",
        (resolved_at IS NULL AND resolution_due_at < CURRENT_TIMESTAMP AND status <> 'CLOSED') AS "resolutionBreached",
        created_at AS "createdAt", updated_at AS "updatedAt"
      FROM platform_support_tickets
      WHERE (${tenantId}::text IS NULL OR tenant_id = ${tenantId})
        AND (${status}::text IS NULL OR status = ${status})
        AND (${priority}::text IS NULL OR priority = ${priority})
      ORDER BY
        CASE priority
          WHEN 'URGENT' THEN 4
          WHEN 'HIGH' THEN 3
          WHEN 'MEDIUM' THEN 2
          ELSE 1
        END DESC,
        resolution_due_at ASC,
        created_at ASC
      LIMIT ${limit}
    `;
  }

  async createTicket(
    actorUserId: string,
    input: {
      tenantId?: string;
      subject?: string;
      description?: string | null;
      priority?: string;
      source?: string;
      requesterEmail?: string | null;
      assignedPlatformUserId?: string | null;
    },
    correlationId?: string | null,
  ) {
    const tenantId = input.tenantId?.trim();
    const subject = input.subject?.trim();
    if (!tenantId) throw new BadRequestException('tenantId is required.');
    if (!subject || subject.length > 300) {
      throw new BadRequestException(
        'subject must contain between 1 and 300 characters.',
      );
    }
    const priority = this.requiredEnum(
      input.priority ?? 'MEDIUM',
      PRIORITIES,
      'priority',
    );
    const source = this.requiredEnum(
      input.source ?? 'PLATFORM',
      SOURCES,
      'source',
    );
    const description = this.cleanText(input.description, 10000);
    const requesterEmail =
      this.cleanText(input.requesterEmail, 320)?.toLowerCase() ?? null;
    const assignee = input.assignedPlatformUserId?.trim() || null;

    return this.prisma.$transaction(async (tx) => {
      const tenants = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM tenants WHERE id = ${tenantId} LIMIT 1
      `;
      if (!tenants[0]) throw new NotFoundException('Tenant not found.');
      if (assignee) await this.assertActivePlatformAdmin(assignee, tx);
      const policy = await this.activePolicy(priority, tx);

      const rows = await tx.$queryRaw<TicketRow[]>`
        INSERT INTO platform_support_tickets (
          tenant_id, subject, description, priority, source, requester_email,
          assigned_platform_user_id, sla_policy_id, response_due_at,
          resolution_due_at, created_by_platform_user_id
        ) VALUES (
          ${tenantId}, ${subject}, ${description}, ${priority}, ${source},
          ${requesterEmail}, ${assignee}, ${policy.id},
          CURRENT_TIMESTAMP + (${policy.initialResponseMinutes} * INTERVAL '1 minute'),
          CURRENT_TIMESTAMP + (${policy.resolutionMinutes} * INTERVAL '1 minute'),
          ${actorUserId}
        )
        RETURNING
          id, tenant_id AS "tenantId", subject, description, priority, status, source,
          requester_email AS "requesterEmail",
          assigned_platform_user_id AS "assignedPlatformUserId",
          sla_policy_id AS "slaPolicyId", response_due_at AS "responseDueAt",
          resolution_due_at AS "resolutionDueAt", first_response_at AS "firstResponseAt",
          resolved_at AS "resolvedAt", closed_at AS "closedAt",
          created_by_platform_user_id AS "createdByPlatformUserId",
          created_at AS "createdAt", updated_at AS "updatedAt"
      `;
      const ticket = rows[0];
      await this.addEventTx(
        tx,
        ticket.id,
        actorUserId,
        'CREATED',
        null,
        'OPEN',
        null,
      );
      await this.audit.record(
        {
          actorUserId,
          resource: 'support',
          action: 'ticket.create',
          targetTenantId: tenantId,
          targetEntityType: 'platform_support_ticket',
          targetEntityId: ticket.id,
          afterState: ticket,
          correlationId: correlationId ?? null,
        },
        tx,
      );
      return ticket;
    });
  }

  async getTicket(ticketId: string) {
    const tickets = await this.prisma.$queryRaw<TicketRow[]>`
      SELECT
        id, tenant_id AS "tenantId", subject, description, priority, status, source,
        requester_email AS "requesterEmail",
        assigned_platform_user_id AS "assignedPlatformUserId",
        sla_policy_id AS "slaPolicyId", response_due_at AS "responseDueAt",
        resolution_due_at AS "resolutionDueAt", first_response_at AS "firstResponseAt",
        resolved_at AS "resolvedAt", closed_at AS "closedAt",
        created_by_platform_user_id AS "createdByPlatformUserId",
        (first_response_at IS NULL AND response_due_at < CURRENT_TIMESTAMP AND status NOT IN ('RESOLVED','CLOSED')) AS "responseBreached",
        (resolved_at IS NULL AND resolution_due_at < CURRENT_TIMESTAMP AND status <> 'CLOSED') AS "resolutionBreached",
        created_at AS "createdAt", updated_at AS "updatedAt"
      FROM platform_support_tickets
      WHERE id = ${ticketId}
      LIMIT 1
    `;
    const ticket = tickets[0];
    if (!ticket) throw new NotFoundException('Support ticket not found.');
    const events = await this.prisma.$queryRaw`
      SELECT
        id, event_type AS "eventType", from_status AS "fromStatus",
        to_status AS "toStatus", note,
        created_by_platform_user_id AS "createdByPlatformUserId",
        created_at AS "createdAt"
      FROM platform_support_ticket_events
      WHERE ticket_id = ${ticketId}
      ORDER BY created_at DESC, id DESC
      LIMIT 200
    `;
    return { ticket, events };
  }

  async updateTicket(
    ticketId: string,
    actorUserId: string,
    input: {
      status?: string;
      priority?: string;
      assignedPlatformUserId?: string | null;
      note?: string | null;
    },
    reason: string,
    correlationId?: string | null,
  ) {
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      throw new BadRequestException('Support ticket changes require a reason.');
    }
    const nextStatus =
      input.status === undefined
        ? undefined
        : this.requiredEnum(input.status, STATUSES, 'status');
    const nextPriority =
      input.priority === undefined
        ? undefined
        : this.requiredEnum(input.priority, PRIORITIES, 'priority');
    const note = this.cleanText(input.note, 5000);

    return this.prisma.$transaction(async (tx) => {
      const beforeRows = await tx.$queryRaw<TicketRow[]>`
        SELECT
          id, tenant_id AS "tenantId", subject, description, priority, status, source,
          requester_email AS "requesterEmail",
          assigned_platform_user_id AS "assignedPlatformUserId",
          sla_policy_id AS "slaPolicyId", response_due_at AS "responseDueAt",
          resolution_due_at AS "resolutionDueAt", first_response_at AS "firstResponseAt",
          resolved_at AS "resolvedAt", closed_at AS "closedAt",
          created_by_platform_user_id AS "createdByPlatformUserId",
          created_at AS "createdAt", updated_at AS "updatedAt"
        FROM platform_support_tickets
        WHERE id = ${ticketId}
        FOR UPDATE
      `;
      const before = beforeRows[0];
      if (!before) throw new NotFoundException('Support ticket not found.');

      if (nextStatus && nextStatus !== before.status) {
        this.assertTransition(before.status, nextStatus);
      }
      const assignee =
        input.assignedPlatformUserId === undefined
          ? before.assignedPlatformUserId
          : input.assignedPlatformUserId?.trim() || null;
      if (assignee) await this.assertActivePlatformAdmin(assignee, tx);
      const priority = nextPriority ?? before.priority;
      const status = nextStatus ?? before.status;
      const policy =
        nextPriority && nextPriority !== before.priority
          ? await this.activePolicy(nextPriority, tx)
          : null;

      await tx.$executeRaw`
        UPDATE platform_support_tickets
        SET priority = ${priority},
            status = ${status},
            assigned_platform_user_id = ${assignee},
            sla_policy_id = CASE
              WHEN ${policy?.id ?? null}::text IS NULL THEN sla_policy_id
              ELSE ${policy?.id ?? null}
            END,
            response_due_at = CASE
              WHEN ${policy?.id ?? null}::text IS NULL THEN response_due_at
              ELSE created_at + (${policy?.initialResponseMinutes ?? 0} * INTERVAL '1 minute')
            END,
            resolution_due_at = CASE
              WHEN ${policy?.id ?? null}::text IS NULL THEN resolution_due_at
              ELSE created_at + (${policy?.resolutionMinutes ?? 0} * INTERVAL '1 minute')
            END,
            resolved_at = CASE
              WHEN ${status} = 'RESOLVED' THEN COALESCE(resolved_at, CURRENT_TIMESTAMP)
              WHEN ${status} IN ('OPEN','IN_PROGRESS','PENDING_CUSTOMER') THEN NULL
              ELSE resolved_at
            END,
            closed_at = CASE
              WHEN ${status} = 'CLOSED' THEN COALESCE(closed_at, CURRENT_TIMESTAMP)
              ELSE closed_at
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${ticketId}
      `;

      if (status !== before.status || note) {
        await this.addEventTx(
          tx,
          ticketId,
          actorUserId,
          status !== before.status ? 'STATUS_CHANGED' : 'NOTE_ADDED',
          before.status,
          status,
          note,
        );
      }
      const afterRows = await this.selectTicketTx(tx, ticketId);
      const after = afterRows[0];
      await this.audit.record(
        {
          actorUserId,
          resource: 'support',
          action: 'ticket.update',
          targetTenantId: before.tenantId,
          targetEntityType: 'platform_support_ticket',
          targetEntityId: ticketId,
          reason: normalizedReason,
          beforeState: before,
          afterState: after,
          correlationId: correlationId ?? null,
        },
        tx,
      );
      return after;
    });
  }

  async respond(
    ticketId: string,
    actorUserId: string,
    note: string,
    correlationId?: string | null,
  ) {
    const normalized = note.trim();
    if (!normalized || normalized.length > 5000) {
      throw new BadRequestException(
        'Response note must contain between 1 and 5000 characters.',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          tenantId: string;
          status: TicketStatus;
          firstResponseAt: Date | null;
        }>
      >`
        SELECT
          id, tenant_id AS "tenantId", status,
          first_response_at AS "firstResponseAt"
        FROM platform_support_tickets
        WHERE id = ${ticketId}
        FOR UPDATE
      `;
      const ticket = rows[0];
      if (!ticket) throw new NotFoundException('Support ticket not found.');
      if (ticket.status === 'CLOSED') {
        throw new ConflictException('Closed tickets cannot receive a response.');
      }
      const nextStatus: TicketStatus =
        ticket.status === 'OPEN' ? 'IN_PROGRESS' : ticket.status;
      await tx.$executeRaw`
        UPDATE platform_support_tickets
        SET first_response_at = COALESCE(first_response_at, CURRENT_TIMESTAMP),
            status = ${nextStatus},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${ticketId}
      `;
      await this.addEventTx(
        tx,
        ticketId,
        actorUserId,
        'RESPONSE',
        ticket.status,
        nextStatus,
        normalized,
      );
      const afterRows = await this.selectTicketTx(tx, ticketId);
      const after = afterRows[0];
      await this.audit.record(
        {
          actorUserId,
          resource: 'support',
          action: 'ticket.respond',
          targetTenantId: ticket.tenantId,
          targetEntityType: 'platform_support_ticket',
          targetEntityId: ticketId,
          afterState: {
            firstResponseRecorded: ticket.firstResponseAt == null,
            ticket: after,
          },
          correlationId: correlationId ?? null,
        },
        tx,
      );
      return after;
    });
  }

  async summary() {
    const rows = await this.prisma.$queryRaw<
      Array<{
        openCount: bigint;
        responseBreachedCount: bigint;
        resolutionBreachedCount: bigint;
        urgentOpenCount: bigint;
      }>
    >`
      SELECT
        COUNT(*) FILTER (WHERE status NOT IN ('RESOLVED','CLOSED'))::bigint AS "openCount",
        COUNT(*) FILTER (
          WHERE first_response_at IS NULL
            AND response_due_at < CURRENT_TIMESTAMP
            AND status NOT IN ('RESOLVED','CLOSED')
        )::bigint AS "responseBreachedCount",
        COUNT(*) FILTER (
          WHERE resolved_at IS NULL
            AND resolution_due_at < CURRENT_TIMESTAMP
            AND status <> 'CLOSED'
        )::bigint AS "resolutionBreachedCount",
        COUNT(*) FILTER (
          WHERE priority = 'URGENT' AND status NOT IN ('RESOLVED','CLOSED')
        )::bigint AS "urgentOpenCount"
      FROM platform_support_tickets
    `;
    const row = rows[0];
    return {
      openCount: Number(row?.openCount ?? 0n),
      responseBreachedCount: Number(row?.responseBreachedCount ?? 0n),
      resolutionBreachedCount: Number(row?.resolutionBreachedCount ?? 0n),
      urgentOpenCount: Number(row?.urgentOpenCount ?? 0n),
    };
  }

  async listPolicies() {
    return this.prisma.$queryRaw<PolicyRow[]>`
      SELECT
        id, name, priority, clock_mode AS "clockMode",
        initial_response_minutes AS "initialResponseMinutes",
        resolution_minutes AS "resolutionMinutes", status,
        created_at AS "createdAt", updated_at AS "updatedAt"
      FROM platform_support_sla_policies
      ORDER BY
        CASE priority
          WHEN 'URGENT' THEN 4
          WHEN 'HIGH' THEN 3
          WHEN 'MEDIUM' THEN 2
          ELSE 1
        END DESC,
        created_at DESC
    `;
  }

  async replacePolicy(
    actorUserId: string,
    input: {
      priority?: string;
      name?: string;
      initialResponseMinutes?: number;
      resolutionMinutes?: number;
    },
    reason: string,
    correlationId?: string | null,
  ) {
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      throw new BadRequestException('SLA policy changes require a reason.');
    }
    const priority = this.requiredEnum(
      input.priority ?? '',
      PRIORITIES,
      'priority',
    );
    const name = input.name?.trim();
    const responseMinutes = input.initialResponseMinutes;
    const resolutionMinutes = input.resolutionMinutes;
    if (!name || name.length > 200) {
      throw new BadRequestException(
        'SLA policy name is required and must not exceed 200 characters.',
      );
    }
    if (
      !Number.isInteger(responseMinutes) ||
      !Number.isInteger(resolutionMinutes) ||
      (responseMinutes ?? 0) <= 0 ||
      (resolutionMinutes ?? 0) < (responseMinutes ?? 0)
    ) {
      throw new BadRequestException(
        'SLA minutes must be positive and resolution must be at least the response target.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const before = await this.activePolicy(priority, tx);
      await tx.$executeRaw`
        UPDATE platform_support_sla_policies
        SET status = 'INACTIVE',
            updated_by_platform_user_id = ${actorUserId},
            updated_at = CURRENT_TIMESTAMP
        WHERE priority = ${priority} AND status = 'ACTIVE'
      `;
      const rows = await tx.$queryRaw<PolicyRow[]>`
        INSERT INTO platform_support_sla_policies (
          name, priority, initial_response_minutes, resolution_minutes,
          created_by_platform_user_id, updated_by_platform_user_id
        ) VALUES (
          ${name}, ${priority}, ${responseMinutes}, ${resolutionMinutes},
          ${actorUserId}, ${actorUserId}
        )
        RETURNING
          id, name, priority, clock_mode AS "clockMode",
          initial_response_minutes AS "initialResponseMinutes",
          resolution_minutes AS "resolutionMinutes", status,
          created_at AS "createdAt", updated_at AS "updatedAt"
      `;
      const after = rows[0];
      await this.audit.record(
        {
          actorUserId,
          resource: 'sla',
          action: 'policy.replace',
          targetEntityType: 'platform_support_sla_policy',
          targetEntityId: after.id,
          reason: normalizedReason,
          beforeState: before,
          afterState: after,
          correlationId: correlationId ?? null,
        },
        tx,
      );
      return after;
    });
  }

  private async selectTicketTx(
    tx: Prisma.TransactionClient,
    ticketId: string,
  ) {
    return tx.$queryRaw<TicketRow[]>`
      SELECT
        id, tenant_id AS "tenantId", subject, description, priority, status, source,
        requester_email AS "requesterEmail",
        assigned_platform_user_id AS "assignedPlatformUserId",
        sla_policy_id AS "slaPolicyId", response_due_at AS "responseDueAt",
        resolution_due_at AS "resolutionDueAt", first_response_at AS "firstResponseAt",
        resolved_at AS "resolvedAt", closed_at AS "closedAt",
        created_by_platform_user_id AS "createdByPlatformUserId",
        (first_response_at IS NULL AND response_due_at < CURRENT_TIMESTAMP AND status NOT IN ('RESOLVED','CLOSED')) AS "responseBreached",
        (resolved_at IS NULL AND resolution_due_at < CURRENT_TIMESTAMP AND status <> 'CLOSED') AS "resolutionBreached",
        created_at AS "createdAt", updated_at AS "updatedAt"
      FROM platform_support_tickets
      WHERE id = ${ticketId}
      LIMIT 1
    `;
  }

  private async activePolicy(
    priority: Priority,
    tx: Prisma.TransactionClient,
  ): Promise<PolicyRow> {
    const rows = await tx.$queryRaw<PolicyRow[]>`
      SELECT
        id, name, priority, clock_mode AS "clockMode",
        initial_response_minutes AS "initialResponseMinutes",
        resolution_minutes AS "resolutionMinutes", status,
        created_at AS "createdAt", updated_at AS "updatedAt"
      FROM platform_support_sla_policies
      WHERE priority = ${priority} AND status = 'ACTIVE'
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const policy = rows[0];
    if (!policy) {
      throw new ConflictException(`No active SLA policy exists for ${priority}.`);
    }
    return policy;
  }

  private async assertActivePlatformAdmin(
    userId: string,
    tx: Prisma.TransactionClient,
  ) {
    const rows = await tx.$queryRaw<Array<{ userId: string }>>`
      SELECT user_id AS "userId"
      FROM platform_admin_users
      WHERE user_id = ${userId} AND status = 'ACTIVE'
      LIMIT 1
    `;
    if (!rows[0]) {
      throw new BadRequestException(
        'Support assignee must be an active platform administrator.',
      );
    }
  }

  private async addEventTx(
    tx: Prisma.TransactionClient,
    ticketId: string,
    actorUserId: string,
    eventType: string,
    fromStatus: TicketStatus | null,
    toStatus: TicketStatus | null,
    note: string | null,
  ) {
    await tx.$executeRaw`
      INSERT INTO platform_support_ticket_events (
        ticket_id, event_type, from_status, to_status, note,
        created_by_platform_user_id
      ) VALUES (
        ${ticketId}, ${eventType}, ${fromStatus}, ${toStatus}, ${note},
        ${actorUserId}
      )
    `;
  }

  private assertTransition(from: TicketStatus, to: TicketStatus) {
    const allowed: Record<TicketStatus, TicketStatus[]> = {
      OPEN: ['IN_PROGRESS', 'PENDING_CUSTOMER', 'RESOLVED'],
      IN_PROGRESS: ['PENDING_CUSTOMER', 'RESOLVED'],
      PENDING_CUSTOMER: ['IN_PROGRESS', 'RESOLVED'],
      RESOLVED: ['IN_PROGRESS', 'CLOSED'],
      CLOSED: [],
    };
    if (!allowed[from].includes(to)) {
      throw new ConflictException(
        `Invalid support ticket transition: ${from} -> ${to}.`,
      );
    }
  }

  private optionalEnum<const T extends readonly string[]>(
    value: string | undefined,
    allowed: T,
    field: string,
  ): T[number] | null {
    if (value == null || value.trim() === '') return null;
    return this.requiredEnum(value, allowed, field);
  }

  private requiredEnum<const T extends readonly string[]>(
    value: string,
    allowed: T,
    field: string,
  ): T[number] {
    const normalized = value.trim().toUpperCase();
    if (!allowed.includes(normalized as T[number])) {
      throw new BadRequestException(`Invalid ${field}.`);
    }
    return normalized as T[number];
  }

  private cleanText(
    value: string | null | undefined,
    maxLength: number,
  ) {
    if (value == null) return null;
    const normalized = value.trim();
    if (!normalized) return null;
    if (normalized.length > maxLength) {
      throw new BadRequestException(
        `Value must not exceed ${maxLength} characters.`,
      );
    }
    return normalized;
  }
}
