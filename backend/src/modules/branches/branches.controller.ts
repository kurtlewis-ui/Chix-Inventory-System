import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BranchesService } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/interfaces/request-user.interface';

@ApiTags('branches')
@ApiBearerAuth()
@Controller('branches')
@UseGuards(RolesGuard)
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Post()
  @Roles('Owner', 'Admin')
  @ApiOperation({ summary: 'Create a new branch' })
  @ApiResponse({ status: 201, description: 'Branch created' })
  @ApiResponse({ status: 409, description: 'Branch name already exists' })
  async create(@Body() dto: CreateBranchDto, @CurrentUser() user: RequestUser) {
    const data = await this.branchesService.create(dto, user.userId);
    return { success: true, data };
  }

  @Get()
  @ApiOperation({
    summary:
      'List branches (Owner/Admin: all branches; Staff: only their assigned branch)',
  })
  @ApiResponse({ status: 200, description: 'Branches retrieved' })
  async findAll(@CurrentUser() user: RequestUser) {
    const data = await this.branchesService.findAll({
      userId: user.userId,
      role: user.role,
    });
    return { success: true, data };
  }

  @Get('archived')
  @Roles('Owner', 'Admin')
  @ApiOperation({ summary: 'List archived (soft-deleted) branches' })
  @ApiResponse({ status: 200, description: 'Archived branches retrieved' })
  async findArchived() {
    const data = await this.branchesService.findArchived();
    return { success: true, data };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a branch by ID' })
  @ApiResponse({ status: 200, description: 'Branch retrieved' })
  @ApiResponse({ status: 404, description: 'Branch not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.branchesService.findOne(id);
    return { success: true, data };
  }

  @Post(':id/restore')
  @Roles('Owner', 'Admin')
  @ApiOperation({ summary: 'Restore an archived branch' })
  @ApiResponse({ status: 200, description: 'Branch restored' })
  @ApiResponse({ status: 404, description: 'Archived branch not found' })
  async restore(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.branchesService.restore(id, user.userId);
    return { success: true, data };
  }

  @Patch(':id')
  @Roles('Owner', 'Admin')
  @ApiOperation({ summary: 'Update a branch' })
  @ApiResponse({ status: 200, description: 'Branch updated' })
  @ApiResponse({ status: 404, description: 'Branch not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBranchDto,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.branchesService.update(id, dto, user.userId);
    return { success: true, data };
  }

  @Delete(':id')
  @Roles('Owner', 'Admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a branch (soft delete)' })
  @ApiResponse({ status: 200, description: 'Branch deleted' })
  @ApiResponse({
    status: 400,
    description: 'Branch still has staff assigned to it',
  })
  @ApiResponse({ status: 404, description: 'Branch not found' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.branchesService.remove(id, user.userId);
    return { success: true, data };
  }
}
