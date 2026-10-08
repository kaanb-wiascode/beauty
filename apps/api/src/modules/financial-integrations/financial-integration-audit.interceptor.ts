import { randomUUID } from 'node:crypto';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '@beauty-erp/database';
import { Observable, catchError, from, map, mergeMap, throwError } from 'rxjs';
import type { JwtPayload } from '../../common/auth/jwt.strategy';
import { TenantContext } from '../../common/tenant/tenant-context';

export const FINANCIAL_AUDIT_KEY = 'financialIntegrationAuditAction';
export const AuditFinancialIntegrationAction = (action: string) => SetMetadata(FINANCIAL_AUDIT_KEY, action);

@Injectable()
export class FinancialIntegrationAuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const action = this.reflector.getAllAndOverride<string>(FINANCIAL_AUDIT_KEY, [context.getHandler(), context.getClass()]);
    if (!action) return next.handle();

    const request = context.switchToHttp().getRequest<{
      user?: JwtPayload;
      method?: string;
      route?: { path?: string };
      params?: Record<string, string>;
    }>();
    const user = request.user;
    const entityId = request.params?.id ?? request.params?.eventId ?? request.params?.settlementId ?? request.params?.bankTransactionId ?? request.params?.posTransactionId ?? null;

    return next.handle().pipe(
      mergeMap((value) => from(this.write(action, 'SUCCESS', user, entityId, request, null)).pipe(map(() => value))),
      catchError((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return from(this.write(action, 'FAILED', user, entityId, request, message)).pipe(
          mergeMap(() => throwError(() => error)),
        );
      }),
    );
  }

  private async write(
    action: string,
    outcome: 'SUCCESS' | 'FAILED',
    user: JwtPayload | undefined,
    entityId: string | null,
    request: { method?: string; route?: { path?: string } },
    errorMessage: string | null,
  ) {
    try {
      const ctx = this.tenant.getContext();
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO finance_integration_audit_logs
         (id,tenant_id,company_id,branch_id,actor_user_id,actor_role_id,action,resource,entity_id,outcome,route,method,error_message,metadata)
         VALUES ($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,'financial_integrations',$8::text,$9::text,$10::text,$11::text,$12::text,'{}'::jsonb)`,
        randomUUID(),
        ctx.tenantId,
        ctx.companyId,
        ctx.branchId,
        user?.sub ?? null,
        user?.roleId ?? null,
        action,
        entityId,
        outcome,
        request.route?.path ?? null,
        request.method ?? null,
        errorMessage?.slice(0, 1000) ?? null,
      );
    } catch {
      // Audit persistence must never alter the business operation result.
    }
  }
}
