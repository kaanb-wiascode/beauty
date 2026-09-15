import { Module } from '@nestjs/common';

import { PlatformAuditModule } from '../platform-audit/platform-audit.module';
import { RoleCloneService } from './role-clone.service';
import { RoleTemplateService } from './role-template.service';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({
  imports: [PlatformAuditModule],
  controllers: [RolesController],
  providers: [RolesService, RoleCloneService, RoleTemplateService],
})
export class RolesModule {}
