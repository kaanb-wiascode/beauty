import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { validateJournalLines } from './domain/journal-policy';

interface CreateAccountInput {
  code: string;
  name: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  parentId?: string;
}

interface CreateJournalEntryInput {
  entryDate: Date;
  description: string;
  referenceType?: string;
  referenceId?: string;
  lines: Array<{
    accountId: string;
    debit: number;
    credit: number;
    memo?: string;
  }>;
}

type AutomaticJournalLine = {
  accountId: string;
  debit: number;
  credit: number;
  memo?: string;
};

type CommerceAccountingContext = {
  tenantId: string;
  branchId: string;
  entryDate: Date;
  amount: number;
};

@Injectable()
export class AccountingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private context() {
    return {
      tenantId: this.tenantContext.getTenantId(),
      companyId: this.tenantContext.getCompanyId(),
      branchId: this.tenantContext.getBranchId(),
    };
  }

  private journalNumber(entryDate: Date): string {
    return `JE-${entryDate.toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private async ensureSystemAccount(
    tx: Prisma.TransactionClient,
    tenantId: string,
    companyId: string,
    code: string,
    name: string,
    type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE',
  ) {
    const existing = await tx.chartOfAccount.findFirst({
      where: { tenantId, companyId, code },
      select: { id: true, active: true },
    });

    if (existing) {
      if (!existing.active) {
        return tx.chartOfAccount.update({
          where: { id: existing.id },
          data: { active: true },
          select: { id: true },
        });
      }
      return existing;
    }

    return tx.chartOfAccount.create({
      data: { tenantId, companyId, code, name, type, active: true },
      select: { id: true },
    });
  }

  private async createAutomaticJournal(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      companyId: string;
      branchId: string;
      entryDate: Date;
      description: string;
      referenceType: string;
      referenceId: string;
      lines: AutomaticJournalLine[];
    },
  ) {
    const existing = await tx.journalEntry.findFirst({
      where: {
        companyId: input.companyId,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
      },
      select: { id: true },
    });
    if (existing) return existing;

    validateJournalLines(input.lines);

    return tx.journalEntry.create({
      data: {
        tenantId: input.tenantId,
        companyId: input.companyId,
        branchId: input.branchId,
        number: this.journalNumber(input.entryDate),
        entryDate: input.entryDate,
        description: input.description,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        status: 'POSTED',
        postedAt: new Date(),
        lines: {
          create: input.lines.map((line) => ({
            accountId: line.accountId,
            debit: line.debit,
            credit: line.credit,
            memo: line.memo?.trim() || null,
          })),
        },
      },
      select: { id: true },
    });
  }

  async recordSaleConfirmed(
    tx: Prisma.TransactionClient,
    saleId: string,
    input: CommerceAccountingContext,
  ) {
    const companyId = this.tenantContext.getCompanyId();
    const receivable = await this.ensureSystemAccount(
      tx,
      input.tenantId,
      companyId,
      '120',
      'Alıcılar',
      'ASSET',
    );
    const revenue = await this.ensureSystemAccount(
      tx,
      input.tenantId,
      companyId,
      '600',
      'Hizmet Gelirleri',
      'REVENUE',
    );

    return this.createAutomaticJournal(tx, {
      tenantId: input.tenantId,
      companyId,
      branchId: input.branchId,
      entryDate: input.entryDate,
      description: `Satış onayı ${saleId}`,
      referenceType: 'SALE',
      referenceId: saleId,
      lines: [
        { accountId: receivable.id, debit: input.amount, credit: 0, memo: 'Müşteri alacağı' },
        { accountId: revenue.id, debit: 0, credit: input.amount, memo: 'Hizmet satışı' },
      ],
    });
  }

  async recordSalePayment(
    tx: Prisma.TransactionClient,
    paymentId: string,
    method: 'CASH' | 'CARD' | 'TRANSFER',
    input: CommerceAccountingContext,
  ) {
    const companyId = this.tenantContext.getCompanyId();
    const receivable = await this.ensureSystemAccount(
      tx,
      input.tenantId,
      companyId,
      '120',
      'Alıcılar',
      'ASSET',
    );
    const paymentAccountDefinition = method === 'CASH'
      ? { code: '100', name: 'Kasa' }
      : method === 'CARD'
        ? { code: '108', name: 'POS Alacakları' }
        : { code: '102', name: 'Bankalar' };
    const paymentAccount = await this.ensureSystemAccount(
      tx,
      input.tenantId,
      companyId,
      paymentAccountDefinition.code,
      paymentAccountDefinition.name,
      'ASSET',
    );

    return this.createAutomaticJournal(tx, {
      tenantId: input.tenantId,
      companyId,
      branchId: input.branchId,
      entryDate: input.entryDate,
      description: `Satış tahsilatı ${paymentId}`,
      referenceType: 'SALE_PAYMENT',
      referenceId: paymentId,
      lines: [
        { accountId: paymentAccount.id, debit: input.amount, credit: 0, memo: 'Tahsilat' },
        { accountId: receivable.id, debit: 0, credit: input.amount, memo: 'Müşteri alacağı kapama' },
      ],
    });
  }

  async recordSalePaymentRefund(
    tx: Prisma.TransactionClient,
    paymentId: string,
    method: 'CASH' | 'CARD' | 'TRANSFER',
    input: CommerceAccountingContext,
  ) {
    const companyId = this.tenantContext.getCompanyId();
    const receivable = await this.ensureSystemAccount(
      tx,
      input.tenantId,
      companyId,
      '120',
      'Alıcılar',
      'ASSET',
    );
    const paymentAccountDefinition = method === 'CASH'
      ? { code: '100', name: 'Kasa' }
      : method === 'CARD'
        ? { code: '108', name: 'POS Alacakları' }
        : { code: '102', name: 'Bankalar' };
    const paymentAccount = await this.ensureSystemAccount(
      tx,
      input.tenantId,
      companyId,
      paymentAccountDefinition.code,
      paymentAccountDefinition.name,
      'ASSET',
    );

    return this.createAutomaticJournal(tx, {
      tenantId: input.tenantId,
      companyId,
      branchId: input.branchId,
      entryDate: input.entryDate,
      description: `Tahsilat iadesi ${paymentId}`,
      referenceType: 'SALE_PAYMENT_REFUND',
      referenceId: paymentId,
      lines: [
        { accountId: receivable.id, debit: input.amount, credit: 0, memo: 'Müşteri alacağını yeniden açma' },
        { accountId: paymentAccount.id, debit: 0, credit: input.amount, memo: 'Tahsilat iadesi' },
      ],
    });
  }

  async createAccount(input: CreateAccountInput) {
    const { tenantId, companyId } = this.context();
    const code = input.code.trim();
    const name = input.name.trim();

    if (!code || !name) {
      throw new BadRequestException('Account code and name are required.');
    }

    if (input.parentId) {
      const parent = await this.prisma.chartOfAccount.findFirst({
        where: { id: input.parentId, tenantId, companyId, active: true },
        select: { id: true },
      });
      if (!parent) throw new BadRequestException('Parent account is invalid.');
    }

    const duplicate = await this.prisma.chartOfAccount.findFirst({
      where: { companyId, code },
      select: { id: true },
    });
    if (duplicate) throw new BadRequestException('Account code already exists.');

    return this.prisma.chartOfAccount.create({
      data: {
        tenantId,
        companyId,
        code,
        name,
        type: input.type,
        parentId: input.parentId ?? null,
      },
    });
  }

  async listAccounts() {
    const { tenantId, companyId } = this.context();
    return this.prisma.chartOfAccount.findMany({
      where: { tenantId, companyId },
      orderBy: [{ code: 'asc' }],
      include: { parent: { select: { id: true, code: true, name: true } } },
    });
  }

  async createJournalEntry(input: CreateJournalEntryInput) {
    const { tenantId, companyId, branchId } = this.context();

    try {
      validateJournalLines(input.lines);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid journal entry.');
    }

    const accountIds = [...new Set(input.lines.map((line) => line.accountId))];
    const validAccounts = await this.prisma.chartOfAccount.findMany({
      where: { id: { in: accountIds }, tenantId, companyId, active: true },
      select: { id: true },
    });
    if (validAccounts.length !== accountIds.length) {
      throw new BadRequestException('One or more journal accounts are invalid or inactive.');
    }

    if (branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: branchId, companyId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!branch) throw new BadRequestException('Branch context is invalid.');
    }

    const number = this.journalNumber(input.entryDate);

    return this.prisma.journalEntry.create({
      data: {
        tenantId,
        companyId,
        branchId,
        number,
        entryDate: input.entryDate,
        description: input.description.trim(),
        referenceType: input.referenceType?.trim() || null,
        referenceId: input.referenceId?.trim() || null,
        lines: {
          create: input.lines.map((line) => ({
            accountId: line.accountId,
            debit: line.debit,
            credit: line.credit,
            memo: line.memo?.trim() || null,
          })),
        },
      },
      include: {
        lines: { include: { account: true } },
      },
    });
  }

  async listJournalEntries() {
    const { tenantId, companyId, branchId } = this.context();
    return this.prisma.journalEntry.findMany({
      where: {
        tenantId,
        companyId,
        ...(branchId ? { branchId } : {}),
      },
      orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
      include: { lines: { include: { account: true } }, branch: true },
    });
  }

  async getJournalEntry(id: string) {
    const { tenantId, companyId, branchId } = this.context();
    const entry = await this.prisma.journalEntry.findFirst({
      where: {
        id,
        tenantId,
        companyId,
        ...(branchId ? { branchId } : {}),
      },
      include: { lines: { include: { account: true } }, branch: true },
    });
    if (!entry) throw new NotFoundException('Journal entry not found.');
    return entry;
  }

  async postJournalEntry(id: string) {
    const { tenantId, companyId, branchId } = this.context();

    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.journalEntry.findFirst({
        where: {
          id,
          tenantId,
          companyId,
          ...(branchId ? { branchId } : {}),
        },
        include: { lines: true },
      });
      if (!entry) throw new NotFoundException('Journal entry not found.');
      if (entry.status !== 'DRAFT') {
        throw new BadRequestException('Only draft journal entries can be posted.');
      }

      try {
        validateJournalLines(entry.lines.map((line) => ({
          debit: Number(line.debit),
          credit: Number(line.credit),
        })));
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : 'Invalid journal entry.');
      }

      const posted = await tx.journalEntry.updateMany({
        where: { id: entry.id, status: 'DRAFT' },
        data: { status: 'POSTED', postedAt: new Date() },
      });
      if (posted.count !== 1) {
        throw new BadRequestException('Journal entry is no longer in a postable state.');
      }

      return tx.journalEntry.findUnique({
        where: { id: entry.id },
        include: { lines: { include: { account: true } }, branch: true },
      });
    });
  }
}
