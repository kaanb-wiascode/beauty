import { Module } from '@nestjs/common';
import { FinancialIntegrationsController } from './financial-integrations.controller';
import { FinancialIntegrationsService } from './financial-integrations.service';

@Module({
  controllers: [FinancialIntegrationsController],
  providers: [FinancialIntegrationsService],
  exports: [FinancialIntegrationsService],
})
export class FinancialIntegrationsModule {}
