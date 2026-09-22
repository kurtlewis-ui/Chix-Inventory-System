import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DisposalStatus } from '@prisma/client';
import { DisposalsService } from './disposals.service';
import { CreateDisposalDto } from './dto/create-disposal.dto';
import { QueryDisposalDto } from './dto/query-disposal.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/interfaces/request-user.interface';

@ApiTags('disposals')
@ApiBearerAuth()
@Controller('disposals')
@UseGuards(RolesGuard)
export class DisposalsController {
  constructor(private readonly disposalsService: DisposalsService) {}

  @Post()
  @ApiOperation({ summary: 'Request a disposal (starts as PENDING; awaits approval)' })
  async create(@Body() dto: CreateDisposalDto, @CurrentUser() user: RequestUser) {
    const data = await this.disposalsService.create(dto, user);
    return { success: true, data };
  }

  @Get()
  @ApiOperation({ summary: 'List disposals (optionally filter by status)' })
  async findAll(
    @Query() query: QueryDisposalDto,
    @CurrentUser() user: RequestUser,
    @Query('status') status?: string,
  ) {
    const statusFilter =
      status && (DisposalStatus as any)[status] ? (status as DisposalStatus) : undefined;
    const result = await this.disposalsService.findAll(query, user, statusFilter);
    return {
      success: true,
      data: result.data,
      pagination: result.pagination,
      summary: result.summary,
    };
  }

  @Get('pending')
  @ApiOperation({ summary: 'List pending disposals awaiting approval' })
  async pending(@Query() query: QueryDisposalDto, @CurrentUser() user: RequestUser) {
    const result = await this.disposalsService.findAll(query, user, DisposalStatus.PENDING);
    return {
      success: true,
      data: result.data,
      pagination: result.pagination,
      summary: result.summary,
    };
  }

  @Post(':id/approve')
  @Roles('Owner', 'Admin')
  @ApiOperation({ summary: 'Approve a pending disposal (deducts stock)' })
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.disposalsService.approve(id, user);
    return { success: true, data };
  }

  @Post(':id/decline')
  @Roles('Owner', 'Admin')
  @ApiOperation({ summary: 'Decline a pending disposal' })
  async decline(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.disposalsService.decline(id, user);
    return { success: true, data };
  }
}
