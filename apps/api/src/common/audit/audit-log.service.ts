import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';

export type AuditResult = 'SUCCESS' | 'FAILURE';

export interface AuditEventInput {
  tenantId?: string;
  companyId?: string;
  branchId?: string | null;
  actorUserId?: string;
  requestId?: string;
  action: string;
  resource: string;
  result: AuditResult;
  statusCode?: number;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(event: AuditEventInput): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        INSERT INTO "audit_events" (
          "tenant_id",
          "company_id",
          "branch_id",
          "actor_user_id",
          "request_id",
          "action",
          "resource",
          "result",
          "status_code",
          "metadata"
        ) VALUES (
          ${event.tenantId ?? null},
          ${event.companyId ?? null},
          ${event.branchId ?? null},
          ${event.actorUserId ?? null},
          ${event.requestId ?? null},
          ${event.action.slice(0, 120)},
          ${event.resource.slice(0, 500)},
          ${event.result},
          ${event.statusCode ?? null},
          ${event.metadata ? JSON.stringify(event.metadata) : null}::jsonb
        )
      `;
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'audit.persist.failed',
          action: event.action,
          resource: event.resource,
          requestId: event.requestId,
          error: error instanceof Error ? error.message : 'unknown',
        }),
      );
    }
  }
}
