import { NotFoundException } from '@nestjs/common';
import { SupplierQuoteDefaultsService } from './supplier-quote-defaults.service';

describe('SupplierQuoteDefaultsService', () => {
  const principal = {
    supplierOrganizationId: 'supplier-org-a',
    supplierMembershipId: 'supplier-member-a',
    userId: 'user-a',
    role: 'OWNER',
  } as never;

  it('rejects RFQs outside the supplier organization invitation scope', async () => {
    const query = jest.fn().mockResolvedValueOnce([]);
    const service = new SupplierQuoteDefaultsService({ $queryRawUnsafe: query } as never);

    await expect(service.get(principal, 'rfq-x')).rejects.toBeInstanceOf(NotFoundException);
    expect(String(query.mock.calls[0][0])).toContain('rs.supplier_organization_id=$2::text');
    expect(query.mock.calls[0].slice(1)).toEqual(['rfq-x', 'supplier-org-a']);
  });

  it('projects only active and currently valid catalog offers for invited RFQ items', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'invite-a' }])
      .mockResolvedValueOnce([
        {
          rfqItemId: 'rfq-item-a',
          catalogVariantId: 'variant-a',
          supplierOfferId: 'offer-a',
          currency: 'TRY',
          unitPrice: 125,
          availableQuantity: 40,
          leadTimeDays: 3,
          minimumOrderQuantity: 2,
          orderMultiple: 2,
          validFrom: null,
          validTo: null,
        },
        {
          rfqItemId: 'rfq-item-b',
          catalogVariantId: 'variant-b',
          supplierOfferId: null,
          currency: null,
          unitPrice: null,
          availableQuantity: null,
          leadTimeDays: null,
          minimumOrderQuantity: null,
          orderMultiple: null,
          validFrom: null,
          validTo: null,
        },
      ]);
    const service = new SupplierQuoteDefaultsService({ $queryRawUnsafe: query } as never);

    const result = await service.get(principal, 'rfq-a');

    expect(result).toEqual([
      expect.objectContaining({ rfqItemId: 'rfq-item-a', hasActiveCatalogOffer: true, unitPrice: 125 }),
      expect.objectContaining({ rfqItemId: 'rfq-item-b', hasActiveCatalogOffer: false, supplierOfferId: null }),
    ]);
    expect(String(query.mock.calls[1][0])).toContain("so.status='ACTIVE'");
    expect(String(query.mock.calls[1][0])).toContain('so.supplier_organization_id=$2::text');
    expect(String(query.mock.calls[1][0])).toContain('so.valid_from IS NULL OR so.valid_from<=NOW()');
    expect(String(query.mock.calls[1][0])).toContain('so.valid_to IS NULL OR so.valid_to>NOW()');
    expect(query.mock.calls[1].slice(1)).toEqual(['rfq-a', 'supplier-org-a']);
  });
});
