import { Module } from '@nestjs/common';
import { DisposalsController } from './disposals.controller';
import { DisposalsService } from './disposals.service';

@Module({
  controllers: [DisposalsController],
  providers: [DisposalsService],
  exports: [DisposalsService],
})
export class DisposalsModule {}
