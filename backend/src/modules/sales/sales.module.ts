import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { DraftsService } from './drafts.service';
import { DisposalsModule } from '../disposals/disposals.module';
import { ExpensesModule } from '../expenses/expenses.module';

@Module({
  imports: [DisposalsModule, ExpensesModule],
  controllers: [SalesController],
  providers: [SalesService, DraftsService],
  exports: [SalesService],
})
export class SalesModule {}
