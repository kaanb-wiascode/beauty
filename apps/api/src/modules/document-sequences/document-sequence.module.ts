import { Module } from '@nestjs/common';

import { PlatformAuditModule } from '../platform-audit/platform-audit.module';
import { DocumentSequenceController } from './document-sequence.controller';
import { DocumentSequenceService } from './document-sequence.service';

@Module({
  imports: [PlatformAuditModule],
  controllers: [DocumentSequenceController],
  providers: [DocumentSequenceService],
  exports: [DocumentSequenceService],
})
export class DocumentSequenceModule {}
