import { calculateSaleTotals } from './sale-calculator';
import { generatePackageSessions } from './package-session-factory';
import { assertSessionTransition, canTransitionSession } from './session-policy';

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
});
