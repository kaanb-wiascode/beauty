import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { randomUUID } from 'node:crypto';

import { TenantContext } from '../../common/tenant/tenant-context';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';

type SequenceRow = {
  id: string;
  tenantId: string;
  companyId: string;
  branchId: string | null;
  documentType: string;
  prefix: string;
  yearScoped: boolean;
  padding: number;
  currentYear: number | null;
  currentValue: bigint | number | string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class DocumentSequenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly audit: PlatformAuditService,
  ) {}

  async list() {
    const context = this.tenantContext.getContext();
    const rows = await this.prisma.$queryRaw<SequenceRow[]>`
      SELECT id,"tenantId","companyId","branchId","documentType",prefix,"yearScoped",padding,
             "currentYear","currentValue",active,"createdAt","updatedAt"
      FROM admin_document_sequences
      WHERE "tenantId"=${context.tenantId} AND "companyId"=${context.companyId}
      ORDER BY "documentType",COALESCE("branchId",'')
    `;
    return rows.map((row) => this.serializable(row));
  }

  async upsert(input: {
    documentType: string;
    prefix: string;
    branchId?: string | null;
    yearScoped?: boolean;
    padding?: number;
    active?: boolean;
  }) {
    const context = this.tenantContext.getContext();
    const actorUserId = await this.actorUserId();
    const documentType = this.normalize(input.documentType);
    const prefix = input.prefix.trim().toUpperCase();
    const padding = input.padding ?? 6;
    if (!documentType || !prefix) throw new BadRequestException('Document type and prefix are required');
    if (!Number.isInteger(padding) || padding < 1 || padding > 12) throw new BadRequestException('Padding must be between 1 and 12');

    if (input.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: input.branchId, companyId: context.companyId, company: { tenantId: context.tenantId } },
        select: { id: true },
      });
      if (!branch) throw new BadRequestException('Branch is outside the current company');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe<Array<{ locked: number }>>(
        `SELECT 1::int AS locked FROM (SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))) q`,
        `document-sequence:${context.companyId}`,
        `${input.branchId ?? '*'}:${documentType}`,
      );
      const previous = await tx.$queryRaw<SequenceRow[]>`
        SELECT id,"tenantId","companyId","branchId","documentType",prefix,"yearScoped",padding,
               "currentYear","currentValue",active,"createdAt","updatedAt"
        FROM admin_document_sequences
        WHERE "tenantId"=${context.tenantId} AND "companyId"=${context.companyId}
          AND "documentType"=${documentType}
          AND COALESCE("branchId",'')=COALESCE(${input.branchId ?? null},'')
        LIMIT 1 FOR UPDATE
      `;
      const id = previous[0]?.id ?? randomUUID();
      const rows = previous.length
        ? await tx.$queryRaw<SequenceRow[]>`
            UPDATE admin_document_sequences
            SET prefix=${prefix},"yearScoped"=${input.yearScoped ?? true},padding=${padding},active=${input.active ?? true},"updatedAt"=CURRENT_TIMESTAMP
            WHERE id=${id}
            RETURNING id,"tenantId","companyId","branchId","documentType",prefix,"yearScoped",padding,
                      "currentYear","currentValue",active,"createdAt","updatedAt"
          `
        : await tx.$queryRaw<SequenceRow[]>`
            INSERT INTO admin_document_sequences(
              id,"tenantId","companyId","branchId","documentType",prefix,"yearScoped",padding,active,"createdAt","updatedAt"
            ) VALUES(
              ${id},${context.tenantId},${context.companyId},${input.branchId ?? null},${documentType},${prefix},${input.yearScoped ?? true},${padding},${input.active ?? true},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
            )
            RETURNING id,"tenantId","companyId","branchId","documentType",prefix,"yearScoped",padding,
                      "currentYear","currentValue",active,"createdAt","updatedAt"
          `;
      const beforeState = previous[0] ? this.serializable(previous[0]) : null;
      const afterState = this.serializable(rows[0]);
      await this.audit.record({
        actorUserId,
        resource: 'document_sequences',
        action: previous.length ? 'update' : 'create',
        targetTenantId: context.tenantId,
        targetEntityType: 'document_sequence',
        targetEntityId: id,
        beforeState,
        afterState,
        metadata: { companyId: context.companyId, documentType, branchId: input.branchId ?? null },
      }, tx);
      return afterState;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async next(
    tx: Prisma.TransactionClient,
    input: { documentType: string; prefix: string; date: Date; branchId?: string | null; padding?: number },
  ) {
    const context = this.tenantContext.getContext();
    const documentType = this.normalize(input.documentType);
    const year = input.date.getUTCFullYear();
    await tx.$queryRawUnsafe<Array<{ locked: number }>>(
      `SELECT 1::int AS locked FROM (SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))) q`,
      `document-sequence:${context.companyId}`,
      `${input.branchId ?? '*'}:${documentType}`,
    );

    const rows = await tx.$queryRaw<SequenceRow[]>`
      SELECT id,"tenantId","companyId","branchId","documentType",prefix,"yearScoped",padding,
             "currentYear","currentValue",active,"createdAt","updatedAt"
      FROM admin_document_sequences
      WHERE "tenantId"=${context.tenantId} AND "companyId"=${context.companyId}
        AND "documentType"=${documentType}
        AND COALESCE("branchId",'')=COALESCE(${input.branchId ?? null},'')
      LIMIT 1 FOR UPDATE
    `;

    let sequence = rows[0];
    if (!sequence) {
      const id = randomUUID();
      const created = await tx.$queryRaw<SequenceRow[]>`
        INSERT INTO admin_document_sequences(
          id,"tenantId","companyId","branchId","documentType",prefix,"yearScoped",padding,"currentYear","currentValue",active,"createdAt","updatedAt"
        ) VALUES(
          ${id},${context.tenantId},${context.companyId},${input.branchId ?? null},${documentType},${input.prefix.toUpperCase()},TRUE,${input.padding ?? 6},${year},0,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
        )
        RETURNING id,"tenantId","companyId","branchId","documentType",prefix,"yearScoped",padding,
                  "currentYear","currentValue",active,"createdAt","updatedAt"
      `;
      sequence = created[0];
    }
    if (!sequence.active) throw new BadRequestException(`Document sequence ${documentType} is inactive`);

    const nextValue = sequence.yearScoped && sequence.currentYear !== year
      ? 1
      : Number(sequence.currentValue) + 1;
    await tx.$executeRaw`
      UPDATE admin_document_sequences
      SET "currentYear"=${sequence.yearScoped ? year : sequence.currentYear},
          "currentValue"=${nextValue},
          "updatedAt"=CURRENT_TIMESTAMP
      WHERE id=${sequence.id}
    `;
    const serial = String(nextValue).padStart(sequence.padding, '0');
    return sequence.yearScoped ? `${sequence.prefix}-${year}-${serial}` : `${sequence.prefix}-${serial}`;
  }

  private async actorUserId() {
    const context = this.tenantContext.getContext();
    const membership = await this.prisma.membership.findFirst({
      where: { id: context.membershipId, tenantId: context.tenantId, companyId: context.companyId, status: 'ACTIVE' },
      select: { userId: true },
    });
    if (!membership) throw new BadRequestException('Active membership is required');
    return membership.userId;
  }

  private serializable(row: SequenceRow) {
    return { ...row, currentValue: Number(row.currentValue) };
  }

  private normalize(value: string) {
    const normalized = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
    let start = 0;
    let end = normalized.length;
    while (start < end && normalized[start] === '-') start += 1;
    while (end > start && normalized[end - 1] === '-') end -= 1;
    return normalized.slice(start, end);
  }
}
