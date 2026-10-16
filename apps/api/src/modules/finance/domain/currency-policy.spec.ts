import { BadRequestException } from '@nestjs/common';
import { assertExchangeRateForCurrency, getCompanyBaseCurrency } from './currency-policy';

describe('currency policy', () => {
  it('accepts exchange rate 1 for the company base currency', () => {
    expect(() =>
      assertExchangeRateForCurrency({
        currency: 'TRY',
        exchangeRate: 1,
        baseCurrency: 'TRY',
      }),
    ).not.toThrow();
  });

  it('rejects a non-1 exchange rate for the company base currency', () => {
    expect(() =>
      assertExchangeRateForCurrency({
        currency: 'EUR',
        exchangeRate: 1.2,
        baseCurrency: 'EUR',
      }),
    ).toThrow(
      new BadRequestException(
        'Baz para birimi EUR olan işlemlerde döviz kuru 1 olmalıdır.',
      ),
    );
  });

  it('accepts a positive rate for a foreign currency', () => {
    expect(() =>
      assertExchangeRateForCurrency({
        currency: 'EUR',
        exchangeRate: 41.25,
        baseCurrency: 'TRY',
      }),
    ).not.toThrow();
  });

  it('rejects invalid currency codes and non-positive rates', () => {
    expect(() =>
      assertExchangeRateForCurrency({
        currency: 'EU',
        exchangeRate: 1,
        baseCurrency: 'TRY',
      }),
    ).toThrow('Para birimi 3 harfli ISO kodu olmalıdır.');

    expect(() =>
      assertExchangeRateForCurrency({
        currency: 'USD',
        exchangeRate: 0,
        baseCurrency: 'TRY',
      }),
    ).toThrow('Döviz kuru sıfırdan büyük olmalıdır.');
  });

  it('reads company base currency and falls back to TRY when unavailable', async () => {
    const withCompany = {
      company: {
        findFirst: jest.fn().mockResolvedValue({ baseCurrency: 'EUR' }),
      },
    };
    await expect(
      getCompanyBaseCurrency(withCompany as never, {
        tenantId: 'tenant-1',
        companyId: 'company-1',
      }),
    ).resolves.toBe('EUR');

    const withoutCompany = {
      company: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    await expect(
      getCompanyBaseCurrency(withoutCompany as never, {
        tenantId: 'tenant-1',
        companyId: 'company-1',
      }),
    ).resolves.toBe('TRY');
  });
});
