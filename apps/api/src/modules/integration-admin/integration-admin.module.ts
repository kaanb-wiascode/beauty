import { Module } from '@nestjs/common';

import { FinancialIntegrationsModule } from '../financial-integrations/financial-integrations.module';
import { IntegrationAdminController } from './integration-admin.controller';
import { IntegrationAdminService } from './integration-admin.service';

@Module({
  imports: [FinancialIntegrationsModule],
  controllers: [IntegrationAdminController],
  providers: [IntegrationAdminService],
})
export class IntegrationAdminModule {}
