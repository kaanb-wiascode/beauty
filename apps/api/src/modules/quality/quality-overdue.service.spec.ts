import { QualityOverdueService } from './quality-overdue.service';

describe('QualityOverdueService', () => {
  it('marks overdue findings and CAPAs with skip-locked processing', async () => {
    let call = 0;
    const client = {
      $queryRawUnsafe: jest.fn<Promise<any[]>, any[]>(async () =>
        call++ === 0 ? [{ id: 'f1' }] : [{ id: 'c1' }],
      ),
    };
    const prisma = { $transaction: jest.fn(async (fn: any) => fn(client)) };
    const tenant = {
      getContext: () => ({ tenantId: 't1', companyId: 'c1', branchId: 'b1' }),
    };
    const service = new QualityOverdueService(prisma as any, tenant as any);

    await expect(service.process('u1', 25)).resolves.toMatchObject({
      processedFindings: 1,
      processedCapas: 1,
    });

    const firstCall = client.$queryRawUnsafe.mock.calls.at(0);
    const secondCall = client.$queryRawUnsafe.mock.calls.at(1);
    expect(firstCall).toBeDefined();
    expect(secondCall).toBeDefined();
    expect(firstCall?.[0] as string).toContain('FOR UPDATE SKIP LOCKED');
    expect(secondCall?.[0] as string).toContain("'OVERDUE'");
  });
});
