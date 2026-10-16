import { Module } from '@nestjs/common';
import { PlatformAuditModule } from '../platform-audit/platform-audit.module';
import { FieldSecurityController } from './field-security.controller';
import { FieldSecurityService } from './field-security.service';

@Module({
  imports: [PlatformAuditModule],
  controllers: [FieldSecurityController],
  providers: [FieldSecurityService],
  exports: [FieldSecurityService],
})
export class FieldSecurityModule {}
