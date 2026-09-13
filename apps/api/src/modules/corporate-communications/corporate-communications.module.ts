import { Module } from '@nestjs/common';
import { CorporateCommunicationsController } from './corporate-communications.controller';
import { CorporateCommunicationsService } from './corporate-communications.service';

@Module({
  controllers: [CorporateCommunicationsController],
  providers: [CorporateCommunicationsService],
  exports: [CorporateCommunicationsService],
})
export class CorporateCommunicationsModule {}
