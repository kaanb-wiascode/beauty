import { NotFoundException } from '@nestjs/common';
import { ProcurementRfqCommercialTermsService } from './procurement-rfq-commercial-terms.service';

function tenant(branchId: string | null = 'branch-a') {
  return {
    getTenantId: jest.fn().mockReturnValue('tenant-a'),
    getCompanyId: jest.fn().mockReturnValue('company-a'),
    getBranchId: jest.fn().mockReturnValue(branchId),
  } as never;
}

describe('ProcurementRfqCommercialTermsService', () => {
  it('requires tenant company and active branch scope before exposing quote terms', async () => {
    const query = jest.fn().mockResolvedValueOnce([]);
    const service = new ProcurementRfqCommercialTermsService(
      { $queryRawUnsafe: query } as never,
      tenant(),
    );

    await expect(service.list('rfq-x')).rejects.toBeInstanceOf(NotFoundException);

    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('r.tenant_id=$2::text');
    expect(sql).toContain('r.company_id=$3::text');
    expect(sql).toContain('w.branch_id=$4::text');
    expect(query.mock.calls[0].slice(1)).toEqual(['rfq-x', 'tenant-a', 'company-a', 'branch-a']);
  });

  it('returns only commercial decision fields after RFQ scope succeeds', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ id: 'rfq-1' }])
      .mockResolvedValueOnce([]);
    const service = new ProcurementRfqCommercialTermsService(
      { $queryRawUnsafe: query } as never,
      tenant(),
    );

    await service.list('rfq-1');

    const sql = String(query.mock.calls[1][0]);
    expect(sql).toContain('sq.payment_terms_days AS "paymentTermsDays"');
    expect(sql).toContain('sq.warranty_months AS "warrantyMonths"');
    expect(sql).toContain('sq.installation_included AS "installationIncluded"');
    expect(sql).toContain('sq.training_included AS "trainingIncluded"');
    expect(sql).toContain('sq.service_sla_days AS "serviceSlaDays"');
    expect(sql).toContain('sq.financing_available AS "financingAvailable"');
    expect(query.mock.calls[1][1]).toBe('rfq-1');
  });
});
