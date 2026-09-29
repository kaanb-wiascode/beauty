import { BadRequestException } from '@nestjs/common';
import type { Prisma, PrismaService } from '@beauty-erp/database';

type DbClient = Prisma.TransactionClient | PrismaService;

export async function getCompanyBaseCurrency(
  client: DbClient,
  input: { tenantId: string; companyId: string },
) {
  const company = await client.company.findFirst({
    where: { id: input.companyId, tenantId: input.tenantId },
    select: { baseCurrency: true },
  });
  return company?.baseCurrency ?? 'TRY';
}

export function assertExchangeRateForCurrency(input: {
  currency: string;
  exchangeRate: number;
  baseCurrency: string;
}) {
  const currency = input.currency.trim().toUpperCase();
  const baseCurrency = input.baseCurrency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new BadRequestException('Para birimi 3 harfli ISO kodu olmalıdır.');
  }
  if (!Number.isFinite(input.exchangeRate) || input.exchangeRate <= 0) {
    throw new BadRequestException('Döviz kuru sıfırdan büyük olmalıdır.');
  }
  if (currency === baseCurrency && Math.abs(input.exchangeRate - 1) > 0.000001) {
    throw new BadRequestException(
      `Baz para birimi ${baseCurrency} olan işlemlerde döviz kuru 1 olmalıdır.`,
    );
  }
}
