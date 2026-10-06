import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { StockMovementsService } from './stock-movements.service';
import { QueryStockMovementDto } from './dto/query-stock-movement.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Stock Movements')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('stock-movements')
export class StockMovementsController {
  constructor(private readonly stockMovementsService: StockMovementsService) {}

  // Read-only history. Viewer is included alongside Owner/Admin so the
  // view-only Viewer role can open a product's stock-movement history.
  @Get()
  @Roles('Owner', 'Admin', 'Viewer')
  findAll(@Query() query: QueryStockMovementDto) {
    return this.stockMovementsService.findAll(query);
  }
}
