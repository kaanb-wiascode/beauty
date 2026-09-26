import { Module } from '@nestjs/common';
import { ObjectStorageModule } from '../../common/storage/object-storage.module';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';

@Module({
  imports: [ObjectStorageModule],
  controllers: [TeamController],
  providers: [TeamService],
  exports: [TeamService],
})
export class TeamModule {}
