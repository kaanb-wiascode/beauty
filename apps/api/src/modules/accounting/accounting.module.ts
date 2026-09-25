import { Module } from '@nestjs/common';
import { DocumentSequenceModule } from '../document-sequences/document-sequence.module';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';

@Module({
  imports: [DocumentSequenceModule],
  controllers: [AccountingController],
  providers: [AccountingService],
  exports: [AccountingService],
})
export class AccountingModule {}
