import { calculateSaleTotals } from './sale-calculator';
import { generatePackageSessions } from './package-session-factory';
import { assertSessionTransition, canTransitionSession } from './session-policy';
import { createInstallmentSchedule, getInstallmentRuntimeStatus } from './installment-planner';

describe('core commerce domain', () => {
  describe('calculateSaleTotals', () => {
    it('calculates subtotal, discount and total', () => {
      expect(
        calculateSaleTotals(
          [
            { quantity: 2, unitPrice: 1250 },
            { quantity: 1, unitPrice: 500 },
          ],
          250,
        ),
      ).toEqual({
        subtotal: 3000,
        discountTotal: 250,
        total: 2750,
      });
    });

    it('rejects discounts larger than subtotal', () => {
      expect(() =>
        calculateSaleTotals([{ quantity: 1, unitPrice: 100 }], 101),
      ).toThrow('Discount cannot exceed subtotal.');
    });
  });

  describe('generatePackageSessions', () => {
    it('expands package service quantities into individual sessions', () => {
      expect(
        generatePackageSessions([
          { serviceId: 'laser', quantity: 3 },
          { serviceId: 'skin-care', quantity: 2 },
        ]),
      ).toEqual([
        { serviceId: 'laser', ordinal: 1 },
        { serviceId: 'laser', ordinal: 2 },
        { serviceId: 'laser', ordinal: 3 },
        { serviceId: 'skin-care', ordinal: 1 },
        { serviceId: 'skin-care', ordinal: 2 },
      ]);
    });

    it('rejects duplicate services in a package definition', () => {
      expect(() =>
        generatePackageSessions([
          { serviceId: 'laser', quantity: 1 },
          { serviceId: 'laser', quantity: 2 },
        ]),
      ).toThrow('A service can only appear once in a package definition.');
    });
  });

  describe('session lifecycle', () => {
    it('allows reserving and consuming a reserved session', () => {
      expect(canTransitionSession('AVAILABLE', 'RESERVED')).toBe(true);
      expect(canTransitionSession('RESERVED', 'CONSUMED')).toBe(true);
    });

    it('does not allow consumed sessions to return to the pool', () => {
      expect(() =>
        assertSessionTransition('CONSUMED', 'AVAILABLE'),
      ).toThrow('Invalid session transition: CONSUMED -> AVAILABLE');
    });
  });

  describe('installment planner', () => {
    it('splits money exactly and puts rounding remainder into the last installment', () => {
      const schedule = createInstallmentSchedule(1000, 3, new Date('2026-09-15T00:00:00.000Z'));
      expect(schedule.map((item) => item.amount)).toEqual([333.33, 333.33, 333.34]);
      expect(schedule.reduce((sum, item) => sum + item.amount, 0)).toBeCloseTo(1000, 2);
    });

    it('keeps end-of-month due dates valid', () => {
      const schedule = createInstallmentSchedule(200, 2, new Date('2026-01-31T00:00:00.000Z'));
      expect(schedule[1]?.dueAt.toISOString()).toBe('2026-02-28T00:00:00.000Z');
    });

    it('derives overdue and paid runtime statuses', () => {
      const now = new Date('2026-09-10T12:00:00.000Z');
      expect(getInstallmentRuntimeStatus(1000, 0, new Date('2026-09-01T00:00:00.000Z'), now)).toBe('OVERDUE');
      expect(getInstallmentRuntimeStatus(1000, 1000, new Date('2026-09-01T00:00:00.000Z'), now)).toBe('PAID');
    });
  });
});
