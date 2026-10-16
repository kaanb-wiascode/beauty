import { Module } from '@nestjs/common';
import { DocumentSequenceModule } from '../document-sequences/document-sequence.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [DocumentSequenceModule],
  controllers: [InvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
