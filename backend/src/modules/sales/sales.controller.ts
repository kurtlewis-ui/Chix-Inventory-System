import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SalesService } from './sales.service';
import { DraftsService } from './drafts.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { QuerySaleDto } from './dto/query-sale.dto';
import { UpsertDraftDto } from './dto/upsert-draft.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/interfaces/request-user.interface';

@ApiTags('sales')
@ApiBearerAuth()
@Controller('sales')
@UseGuards(RolesGuard)
export class SalesController {
  constructor(
    private readonly salesService: SalesService,
    private readonly draftsService: DraftsService,
  ) {}

  // Draft-cart routes must come before ':id' so 'draft(s)' isn't swallowed
  // by the dynamic param route below.
  @Get('drafts')
  @Roles('Owner', 'Admin')
  @ApiOperation({ summary: "List every staff member's current draft cart (Admin)" })
  async drafts(@Query('branchId') branchId?: string) {
    const data = await this.draftsService.findAll(branchId || undefined);
    return { success: true, data };
  }

  @Post('drafts/:staffId/save')
  @Roles('Owner', 'Admin')
  @ApiOperation({ summary: "Submit a staff member's draft on their behalf (in case they forgot)" })
  async saveDraftForStaff(
    @Param('staffId', ParseUUIDPipe) staffId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.draftsService.saveForStaff(staffId, user);
    return { success: true, data };
  }

  @Get('draft')
  @ApiOperation({ summary: 'Whether a draft still exists server-side for you (detects admin Save Draft)' })
  async myDraftExists(@CurrentUser() user: RequestUser) {
    const data = await this.draftsService.existsForMine(user);
    return { success: true, data };
  }

  @Put('draft')
  @ApiOperation({ summary: 'Save/replace your own in-progress draft cart' })
  async saveDraft(@Body() dto: UpsertDraftDto, @CurrentUser() user: RequestUser) {
    const data = await this.draftsService.upsertMine(dto, user);
    return { success: true, data };
  }

  @Post('draft/save')
  @ApiOperation({ summary: 'Submit your own draft (same as the admin "Save Draft" action)' })
  async saveMyDraft(@CurrentUser() user: RequestUser) {
    const data = await this.draftsService.saveForStaff(user.userId, user);
    return { success: true, data };
  }

  @Delete('draft')
  @ApiOperation({ summary: 'Clear your own draft cart' })
  async clearDraft(@CurrentUser() user: RequestUser) {
    const data = await this.draftsService.clearMine(user);
    return { success: true, data };
  }

  // Bulk clear must be declared before ':staffId' so 'drafts' (no param) isn't
  // captured by the param route.
  @Delete('drafts')
  @Roles('Owner', 'Admin')
  @ApiOperation({ summary: 'Discard EVERY staff draft without submitting (Admin)' })
  async clearAllDrafts(
    @CurrentUser() user: RequestUser,
    @Query('branchId') branchId?: string,
  ) {
    const data = await this.draftsService.clearAll(user, branchId || undefined);
    return { success: true, data };
  }

  @Delete('drafts/:staffId')
  @Roles('Owner', 'Admin')
  @ApiOperation({ summary: "Discard a single staff member's draft without submitting (Admin)" })
  async clearStaffDraft(
    @Param('staffId', ParseUUIDPipe) staffId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.draftsService.clearForStaff(staffId, user);
    return { success: true, data };
  }

  @Post()
  @ApiOperation({ summary: 'Create a sale (starts as PENDING approval)' })
  async create(@Body() dto: CreateSaleDto, @CurrentUser() user: RequestUser) {
    const data = await this.salesService.create(dto, user);
    return { success: true, data };
  }

  @Get('records')
  @ApiOperation({ summary: 'List approved sales (records)' })
  async records(@Query() query: QuerySaleDto, @CurrentUser() user: RequestUser) {
    const result = await this.salesService.findRecords(query, user);
    return {
      success: true,
      data: result.data,
      pagination: result.pagination,
      summary: result.summary,
    };
  }

  @Get('pending')
  @ApiOperation({ summary: 'List pending sales awaiting approval' })
  async pending(@Query() query: QuerySaleDto, @CurrentUser() user: RequestUser) {
    const result = await this.salesService.findPending(query, user);
    return {
      success: true,
      data: result.data,
      pagination: result.pagination,
      summary: result.summary,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a sale by ID' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.salesService.findOne(id, user);
    return { success: true, data };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a pending sale (items, payment method, customer)' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSaleDto,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.salesService.update(id, dto, user);
    return { success: true, data };
  }

  @Post(':id/approve')
  @Roles('Owner', 'Admin')
  @ApiOperation({ summary: 'Approve a pending sale (deducts stock)' })
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.salesService.approve(id, user);
    return { success: true, data };
  }

  @Post(':id/decline')
  @Roles('Owner', 'Admin')
  @ApiOperation({ summary: 'Decline a pending sale' })
  async decline(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.salesService.decline(id, user);
    return { success: true, data };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a pending/declined sale' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.salesService.remove(id, user);
    return { success: true, data };
  }
}
