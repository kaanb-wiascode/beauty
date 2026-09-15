import { Module } from '@nestjs/common';

import { PlatformAuditModule } from '../platform-audit/platform-audit.module';
import { OrganizationAdminController } from './organization-admin.controller';
import { OrganizationAdminService } from './organization-admin.service';

@Module({
  imports: [PlatformAuditModule],
  controllers: [OrganizationAdminController],
  providers: [OrganizationAdminService],
})
export class OrganizationAdminModule {}
