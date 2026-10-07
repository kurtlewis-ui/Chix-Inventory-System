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
import { BrandsService } from './brands.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { QueryBrandDto } from './dto/query-brand.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/interfaces/request-user.interface';

@ApiTags('brands')
@ApiBearerAuth()
@Controller('brands')
@UseGuards(RolesGuard)
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}

  @Post()
  @Roles('Owner')
  @ApiOperation({ summary: 'Create a new brand' })
  async create(@Body() dto: CreateBrandDto, @CurrentUser() user: RequestUser) {
    const data = await this.brandsService.create(dto, user.userId);
    return { success: true, data };
  }

  @Get()
  @ApiOperation({ summary: 'List active brands' })
  async findAll(@Query() query: QueryBrandDto) {
    const result = await this.brandsService.findAll(query);
    return { success: true, data: result.data, pagination: result.pagination };
  }

  @Get('archived')
  @Roles('Owner', 'Admin')
  @ApiOperation({ summary: 'List archived (soft-deleted) brands' })
  async findArchived(@Query() query: QueryBrandDto) {
    const result = await this.brandsService.findArchived(query);
    return { success: true, data: result.data, pagination: result.pagination };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a brand by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.brandsService.findOne(id);
    return { success: true, data };
  }

  // Owner may edit everything about a brand. Admin may ONLY change the cover
  // image (the service strips every other field for an Admin actor), so Admin
  // is allowed on this route but constrained server-side.
  @Patch(':id')
  @Roles('Owner', 'Admin')
  @ApiOperation({ summary: 'Update a brand (Admin: cover image only)' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBrandDto,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.brandsService.update(id, dto, user.userId, user.role);
    return { success: true, data };
  }

  @Post(':id/restore')
  @Roles('Owner', 'Admin')
  @ApiOperation({ summary: 'Restore an archived brand' })
  async restore(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.brandsService.restore(id, user.userId);
    return { success: true, data };
  }

  @Delete(':id')
  @Roles('Owner', 'Admin')
  @ApiOperation({ summary: 'Archive (soft-delete) a brand' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.brandsService.remove(id, user.userId);
    return { success: true, data };
  }

  // Per-branch brand archive: remove a brand from ONE branch only (Owner +
  // Admin). The brand + its products become hidden/unsellable in that branch;
  // all other branches are unaffected.
  @Delete(':id/branch/:branchId')
  @Roles('Owner', 'Admin')
  @ApiOperation({ summary: 'Remove a brand from a single branch (per-branch archive)' })
  async removeFromBranch(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.brandsService.removeFromBranch(id, branchId, user.userId);
    return { success: true, data };
  }

  @Post(':id/branch/:branchId/restore')
  @Roles('Owner', 'Admin')
  @ApiOperation({ summary: 'Restore a brand into a single branch (per-branch archive)' })
  async restoreToBranch(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.brandsService.restoreToBranch(id, branchId, user.userId);
    return { success: true, data };
  }
}
