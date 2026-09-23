import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { ImportProductsDto } from './dto/import-products.dto';
import { RestockDto } from './dto/restock.dto';
import { ReorderProductsDto } from './dto/reorder-products.dto';
import { UndoStockDto } from './dto/undo-stock.dto';
import { ResetStockDto } from './dto/reset-stock.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/interfaces/request-user.interface';

@ApiTags('products')
@ApiBearerAuth()
@Controller('products')
@UseGuards(RolesGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @Roles('Owner')
  @ApiOperation({ summary: 'Create a new product' })
  async create(@Body() dto: CreateProductDto, @CurrentUser() user: RequestUser) {
    const data = await this.productsService.create(dto, user.userId, user.role);
    return { success: true, data };
  }

  @Get()
  @ApiOperation({ summary: 'List active products (with per-branch stock)' })
  async findAll(@Query() query: QueryProductDto, @CurrentUser() user: RequestUser) {
    const result = await this.productsService.findAll(query, user.role);
    return { success: true, data: result.data, pagination: result.pagination };
  }

  @Post('import')
  @Roles('Owner')
  @ApiOperation({ summary: 'Bulk import products (creates/updates; auto-creates brands)' })
  async importProducts(@Body() dto: ImportProductsDto, @CurrentUser() user: RequestUser) {
    const data = await this.productsService.importProducts(dto.products, user.userId);
    return { success: true, data };
  }

  @Post('restock')
  @Roles('Owner')
  @ApiOperation({ summary: 'Add stock to products at branches' })
  async restock(@Body() dto: RestockDto, @CurrentUser() user: RequestUser) {
    const data = await this.productsService.restock(dto.items, user.userId);
    return { success: true, data };
  }

  @Post('stock-movements/undo')
  @Roles('Owner')
  @ApiOperation({ summary: 'Owner-only: undo restock/adjustment stock movements (appends compensating movements)' })
  async undoStock(@Body() dto: UndoStockDto, @CurrentUser() user: RequestUser) {
    const data = await this.productsService.undoStockMovements(dto.movementIds, user.userId);
    return { success: true, data };
  }

  @Post('stock/reset')
  @Roles('Owner')
  @ApiOperation({ summary: 'Owner-only: reset ALL product stock to 0 at every branch (type-to-confirm)' })
  async resetStock(@Body() _dto: ResetStockDto, @CurrentUser() user: RequestUser) {
    const data = await this.productsService.resetAllStock(user.userId);
    return { success: true, data };
  }

  @Patch('reorder')
  @Roles('Owner')
  @ApiOperation({ summary: 'Persist a manual product display order' })
  async reorder(@Body() dto: ReorderProductsDto, @CurrentUser() user: RequestUser) {
    const data = await this.productsService.reorder(dto.orderedIds, user.userId);
    return { success: true, data };
  }

  @Get('archived')
  @Roles('Owner', 'Admin')
  @ApiOperation({ summary: 'List archived (soft-deleted) products (read-only for Admin)' })
  async findArchived(@Query() query: QueryProductDto, @CurrentUser() user: RequestUser) {
    const result = await this.productsService.findArchived(query, user.role);
    return { success: true, data: result.data, pagination: result.pagination };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a product by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    const data = await this.productsService.findOne(id, user.role);
    return { success: true, data };
  }

  @Patch(':id')
  @Roles('Owner')
  @ApiOperation({ summary: 'Update a product (and per-branch stock)' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.productsService.update(id, dto, user.userId, user.role);
    return { success: true, data };
  }

  @Post(':id/restore')
  @Roles('Owner')
  @ApiOperation({ summary: 'Restore an archived product' })
  async restore(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.productsService.restore(id, user.userId, user.role);
    return { success: true, data };
  }

  @Delete(':id')
  @Roles('Owner')
  @ApiOperation({ summary: 'Archive (soft-delete) a product' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.productsService.remove(id, user.userId);
    return { success: true, data };
  }
}
