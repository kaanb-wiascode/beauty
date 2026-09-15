import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class FinancialObligationRulesService {
  constructor(private readonly prisma: PrismaService, private readonly tenant: TenantContext) {}

  private ctx() {
    return {
      tenantId: this.tenant.getTenantId(),
      companyId: this.tenant.getCompanyId(),
      branchId: this.tenant.getBranchId(),
    };
  }

  async create(input: any, actorId: string) {
    const ctx = this.ctx();
    if (Boolean(input.sourceType) !== Boolean(input.sourceId)) {
      throw new BadRequestException('sourceType and sourceId must be provided together.');
    }
    const id = randomUUID();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO financial_obligation_rules(
        id,tenant_id,company_id,branch_id,name,obligation_type,counterparty,amount,currency,frequency,
        interval_count,day_of_month,start_date,end_date,priority,cost_center_id,category_id,description,
        source_type,source_id,created_by
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8::numeric,$9,$10::"FinancialRecurrenceFrequency",$11,$12,$13::date,$14::date,
               $15::"FinancialObligationPriority",$16,$17,$18,$19,$20,$21)`,
      id,
      ctx.tenantId,
      ctx.companyId,
      ctx.branchId ?? input.branchId ?? null,
      input.name,
      input.obligationType,
      input.counterparty ?? null,
      input.amount,
      (input.currency ?? 'TRY').toUpperCase(),
      input.frequency,
      input.intervalCount ?? 1,
      input.dayOfMonth ?? null,
      input.startDate,
      input.endDate ?? null,
      input.priority ?? 'NORMAL',
      input.costCenterId ?? null,
      input.categoryId ?? null,
      input.description ?? null,
      input.sourceType ?? null,
      input.sourceId ?? null,
      actorId,
    );
    return this.get(id);
  }

  async list(limit = 100) {
    const ctx = this.ctx();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,branch_id AS "branchId",name,obligation_type AS "obligationType",counterparty,amount,currency,
              frequency,interval_count AS "intervalCount",day_of_month AS "dayOfMonth",start_date AS "startDate",
              end_date AS "endDate",priority,cost_center_id AS "costCenterId",category_id AS "categoryId",
              description,is_active AS "isActive"
       FROM financial_obligation_rules
       WHERE tenant_id=$1 AND company_id=$2 AND ($3::text IS NULL OR branch_id=$3)
       ORDER BY created_at DESC LIMIT $4`,
      ctx.tenantId,
      ctx.companyId,
      ctx.branchId,
      Math.min(Math.max(limit, 1), 500),
    );
  }

  async generate(id: string, from: Date, to: Date, actorId: string) {
    if (to < from) throw new BadRequestException('Generation end date must be on or after start date.');
    const ctx = this.ctx();
    const rule = await this.get(id);
    if (!rule.isActive) throw new BadRequestException('Financial obligation rule is inactive.');

    const start = this.maxDate(this.dateOnly(from), this.dateOnly(rule.startDate));
    const end = this.minDate(this.dateOnly(to), rule.endDate ? this.dateOnly(rule.endDate) : this.dateOnly(to));
    if (end < start) return { generated: 0, skipped: 0, occurrences: 0 };

    const dates = this.occurrences(rule, start, end);
    let generated = 0;
    let skipped = 0;
    for (const dueDate of dates) {
      const periodKey = dueDate.toISOString().slice(0, 10);
      const count = await this.prisma.$executeRawUnsafe(
        `INSERT INTO financial_obligations(
          id,tenant_id,company_id,branch_id,rule_id,period_key,obligation_type,title,counterparty,amount,currency,
          due_date,status,priority,cost_center_id,category_id,description,created_by
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::numeric,$11,$12::date,'SCHEDULED'::"FinancialObligationStatus",
                 $13::"FinancialObligationPriority",$14,$15,$16,$17)
        ON CONFLICT (rule_id,period_key) WHERE rule_id IS NOT NULL AND period_key IS NOT NULL DO NOTHING`,
        randomUUID(), ctx.tenantId, ctx.companyId, rule.branchId, rule.id, periodKey,
        rule.obligationType, rule.name, rule.counterparty, Number(rule.amount), rule.currency, dueDate,
        rule.priority, rule.costCenterId, rule.categoryId, rule.description, actorId,
      );
      if (count > 0) generated += 1;
      else skipped += 1;
    }
    return { generated, skipped, occurrences: dates.length };
  }

  private async get(id: string) {
    const ctx = this.ctx();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,branch_id AS "branchId",name,obligation_type AS "obligationType",counterparty,amount,currency,
              frequency,interval_count AS "intervalCount",day_of_month AS "dayOfMonth",start_date AS "startDate",
              end_date AS "endDate",priority,cost_center_id AS "costCenterId",category_id AS "categoryId",
              description,is_active AS "isActive"
       FROM financial_obligation_rules
       WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND ($4::text IS NULL OR branch_id=$4) LIMIT 1`,
      id, ctx.tenantId, ctx.companyId, ctx.branchId,
    );
    if (!rows.length) throw new NotFoundException('Financial obligation rule not found.');
    return rows[0];
  }

  private occurrences(rule: any, from: Date, to: Date) {
    const result: Date[] = [];
    const interval = Math.max(Number(rule.intervalCount ?? 1), 1);
    const original = this.dateOnly(rule.startDate);
    if (rule.frequency === 'WEEKLY') {
      let cursor = original;
      while (cursor <= to) {
        if (cursor >= from) result.push(new Date(cursor));
        cursor = new Date(cursor.getTime() + interval * 7 * 86400000);
      }
      return result;
    }

    const monthStep = rule.frequency === 'MONTHLY' ? interval : rule.frequency === 'QUARTERLY' ? interval * 3 : interval * 12;
    const day = Number(rule.dayOfMonth ?? original.getUTCDate());
    let cursor = this.monthDate(original.getUTCFullYear(), original.getUTCMonth(), day);
    while (cursor < original) cursor = this.addMonths(cursor, monthStep, day);
    while (cursor <= to) {
      if (cursor >= from) result.push(new Date(cursor));
      cursor = this.addMonths(cursor, monthStep, day);
    }
    return result;
  }

  private addMonths(date: Date, months: number, day: number) {
    const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
    return this.monthDate(first.getUTCFullYear(), first.getUTCMonth(), day);
  }

  private monthDate(year: number, month: number, day: number) {
    const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, month, Math.min(day, last)));
  }

  private dateOnly(value: Date | string) {
    const date = new Date(value);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  private maxDate(a: Date, b: Date) { return a > b ? a : b; }
  private minDate(a: Date, b: Date) { return a < b ? a : b; }
}
