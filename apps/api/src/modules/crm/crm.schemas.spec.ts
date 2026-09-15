import { transitionOpportunitySchema, updateLeadSchema } from './crm.schemas';

describe('CRM structured lost transition schemas', () => {
  it('rejects LOST through generic lead update', () => {
    const result = updateLeadSchema.safeParse({ version: 1, status: 'LOST' });
    expect(result.success).toBe(false);
  });

  it('rejects legacy lostReason through generic lead update', () => {
    const result = updateLeadSchema.safeParse({ version: 1, status: 'CONTACTED', lostReason: 'price' });
    expect(result.success).toBe(false);
  });

  it('rejects LOST through generic opportunity transition', () => {
    const result = transitionOpportunitySchema.safeParse({ version: 1, stage: 'LOST' });
    expect(result.success).toBe(false);
  });

  it('rejects legacy lostReason through generic opportunity transition', () => {
    const result = transitionOpportunitySchema.safeParse({ version: 1, stage: 'PROPOSAL', lostReason: 'price' });
    expect(result.success).toBe(false);
  });

  it('keeps valid non-lost transitions available', () => {
    expect(updateLeadSchema.safeParse({ version: 1, status: 'CONTACTED' }).success).toBe(true);
    expect(transitionOpportunitySchema.safeParse({ version: 1, stage: 'PROPOSAL', probability: 50 }).success).toBe(true);
  });
});
