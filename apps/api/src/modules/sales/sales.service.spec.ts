import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { AccountingService } from '../accounting/accounting.service';
import { CommerceFinanceSyncService } from '../finance/commerce-finance-sync.service';
import { InstallmentsService } from '../installments/installments.service';
import { SalesService } from './sales.service';

describe('SalesService payment idempotency', () => {
  const key = '33333333-3333-4333-8333-333333333333';

  async function setup(existingOverrides: Record<string, unknown> = {}) {
    const existing = {
      id: 'payment-1',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      saleId: 'sale-1',
      idempotencyKey: key,
      amount: 25,
      method: 'CARD',
      reference: 'bank-1',
      note: 'Test payment',
      status: 'COMPLETED',
      ...existingOverrides,
    };
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([
        { id: 'sale-1', total: 100, status: 'CONFIRMED' },
      ]),
      salePayment: {
        findFirst: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
      sale: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'sale-1',
          total: 100,
          status: 'CONFIRMED',
        }),
      },
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ paid: 25 }]),
    };
    const tenant = new TenantContext();
    tenant.setContext({
      tenantId: 'tenant-1',
      companyId: 'company-1',
      branchId: 'branch-1',
      membershipId: 'member-1',
      roleScope: 'BRANCH',
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantContext, useValue: tenant },
        { provide: InstallmentsService, useValue: { allocatePayment: jest.fn() } },
        { provide: AccountingService, useValue: { recordSalePayment: jest.fn() } },
        { provide: CommerceFinanceSyncService, useValue: { syncSalePayment: jest.fn() } },
      ],
    }).compile();
    return { service: moduleRef.get(SalesService), tx, prisma };
  }

  const request = {
    amount: 25,
    method: 'CARD' as const,
    reference: 'bank-1',
    note: 'Test payment',
    idempotencyKey: key,
  };

  it('returns the existing payment without a second insert for an identical retry', async () => {
    const { service, tx } = await setup();
    const response = await service.addPayment('sale-1', request);
    expect(response.payment.id).toBe('payment-1');
    expect(tx.salePayment.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        saleId: 'sale-1',
        idempotencyKey: key,
      },
    });
    expect(tx.salePayment.create).not.toHaveBeenCalled();
    expect(response.summary.balance).toBe(75);
  });

  it('rejects a reused key with changed payment details', async () => {
    const { service, tx } = await setup();
    await expect(
      service.addPayment('sale-1', { ...request, amount: 30 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.salePayment.create).not.toHaveBeenCalled();
  });

  it.each([
    ['reference', { reference: 'different-bank-reference' }],
    ['note', { note: 'Different payment details' }],
    ['method', { method: 'CASH' as const }],
  ])('rejects a reused key with changed %s', async (_field, override) => {
    const { service, tx } = await setup();
    await expect(
      service.addPayment('sale-1', { ...request, ...override }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.salePayment.create).not.toHaveBeenCalled();
  });

  it('rejects a reused key after the original payment has been refunded', async () => {
    const { service, tx } = await setup({ status: 'REFUNDED' });
    await expect(service.addPayment('sale-1', request)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.salePayment.create).not.toHaveBeenCalled();
  });
});
