import { BadRequestException } from '@nestjs/common';
import { AccountingService } from './accounting.service';

const tenantContext = {
  getTenantId: jest.fn(() => 'tenant-1'),
  getCompanyId: jest.fn(() => 'company-1'),
  getBranchId: jest.fn(() => 'branch-1'),
};

const documentSequences = { next: jest.fn() };

describe('AccountingService journal segregation of duties', () => {
  it('prevents the journal creator from approving the same journal', async () => {
    const prisma = {
      journalEntry: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'journal-1',
          tenantId: 'tenant-1',
          companyId: 'company-1',
          branchId: 'branch-1',
          status: 'SUBMITTED',
          createdBy: 'user-1',
          lines: [
            { debit: 100, credit: 0 },
            { debit: 0, credit: 100 },
          ],
        }),
        update: jest.fn(),
      },
    };
    const service = new AccountingService(
      prisma as never,
      tenantContext as never,
      documentSequences as never,
    );

    await expect(service.approveJournalEntry('journal-1', 'user-1')).rejects.toThrow(
      new BadRequestException('Yevmiye kaydını oluşturan kullanıcı aynı kaydı onaylayamaz.'),
    );
    expect(prisma.journalEntry.update).not.toHaveBeenCalled();
  });

  it('allows another user to approve a balanced submitted journal', async () => {
    const prisma = {
      journalEntry: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'journal-1',
          tenantId: 'tenant-1',
          companyId: 'company-1',
          branchId: 'branch-1',
          status: 'SUBMITTED',
          createdBy: 'user-1',
          lines: [
            { debit: 100, credit: 0 },
            { debit: 0, credit: 100 },
          ],
        }),
        update: jest.fn().mockResolvedValue({ id: 'journal-1', status: 'APPROVED' }),
      },
    };
    const service = new AccountingService(
      prisma as never,
      tenantContext as never,
      documentSequences as never,
    );

    await expect(service.approveJournalEntry('journal-1', 'user-2')).resolves.toMatchObject({
      status: 'APPROVED',
    });
    expect(prisma.journalEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'journal-1' },
        data: expect.objectContaining({ status: 'APPROVED', approvedBy: 'user-2' }),
      }),
    );
  });

  it('prevents the creator or approver from posting the journal', async () => {
    const tx = {
      journalEntry: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'journal-1',
          tenantId: 'tenant-1',
          companyId: 'company-1',
          branchId: 'branch-1',
          entryDate: new Date('2026-09-29T10:00:00Z'),
          status: 'APPROVED',
          createdBy: 'user-1',
          approvedBy: 'user-2',
          lines: [
            { debit: 100, credit: 0 },
            { debit: 0, credit: 100 },
          ],
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    const service = new AccountingService(
      prisma as never,
      tenantContext as never,
      documentSequences as never,
    );

    await expect(service.postJournalEntry('journal-1', 'user-2')).rejects.toThrow(
      new BadRequestException('Kaydı oluşturan veya onaylayan kullanıcı aynı kaydı muhasebeleştiremez.'),
    );
  });
});
