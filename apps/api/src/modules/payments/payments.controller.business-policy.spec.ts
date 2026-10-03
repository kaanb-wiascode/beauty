import { BadRequestException } from '@nestjs/common';
import { PaymentsController } from './payments.controller';

describe('PaymentsController business policy enforcement', () => {
  it('blocks refund before mutation when published business policy denies the amount', async () => {
    const payments = {
      findOne: jest.fn().mockResolvedValue({ id: 'pay-a', amount: 15000 }),
      refund: jest.fn(),
    } as any;
    const policies = {
      evaluate: jest.fn().mockResolvedValue({
        matched: true,
        allowed: false,
        reason: 'MAX_AMOUNT_EXCEEDED',
      }),
    } as any;
    const controller = new PaymentsController(payments, policies);

    await expect(controller.refund('11111111-1111-4111-8111-111111111111', { reason: 'test' }))
      .rejects.toBeInstanceOf(BadRequestException);

    expect(policies.evaluate).toHaveBeenCalledWith({
      policyKey: 'payments.refund',
      facts: { amount: 15000 },
    });
    expect(payments.refund).not.toHaveBeenCalled();
  });

  it('preserves refund behavior when no business policy is published', async () => {
    const payments = {
      findOne: jest.fn().mockResolvedValue({ id: 'pay-a', amount: 15000 }),
      refund: jest.fn().mockResolvedValue({ id: 'pay-a', status: 'REFUNDED' }),
    } as any;
    const policies = {
      evaluate: jest.fn().mockResolvedValue({
        matched: false,
        allowed: true,
        reason: 'NO_POLICY',
      }),
    } as any;
    const controller = new PaymentsController(payments, policies);

    await expect(controller.refund('11111111-1111-4111-8111-111111111111', { reason: 'test' }))
      .resolves.toEqual({ id: 'pay-a', status: 'REFUNDED' });
    expect(payments.refund).toHaveBeenCalledTimes(1);
  });
});
