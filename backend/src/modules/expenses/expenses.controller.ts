import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ExpenseStatus } from '@prisma/client';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { QueryExpenseDto } from './dto/query-expense.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/interfaces/request-user.interface';

@ApiTags('expenses')
@ApiBearerAuth()
@Controller('expenses')
@UseGuards(RolesGuard)
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  @ApiOperation({ summary: 'Log an expense (starts as PENDING; awaits approval)' })
  async create(@Body() dto: CreateExpenseDto, @CurrentUser() user: RequestUser) {
    const data = await this.expensesService.create(dto, user);
    return { success: true, data };
  }

  @Get()
  @ApiOperation({ summary: 'List expenses (optionally filter by status)' })
  async findAll(
    @Query() query: QueryExpenseDto,
    @CurrentUser() user: RequestUser,
    @Query('status') status?: string,
  ) {
    const statusFilter =
      status && (ExpenseStatus as any)[status] ? (status as ExpenseStatus) : undefined;
    const result = await this.expensesService.findAll(query, user, statusFilter);
    return { success: true, data: result.data, pagination: result.pagination, summary: result.summary };
  }

  @Get('pending')
  @ApiOperation({ summary: 'List pending expenses awaiting approval' })
  async pending(@Query() query: QueryExpenseDto, @CurrentUser() user: RequestUser) {
    const result = await this.expensesService.findAll(query, user, ExpenseStatus.PENDING);
    return { success: true, data: result.data, pagination: result.pagination, summary: result.summary };
  }

  @Post(':id/approve')
  @Roles('Owner', 'Admin')
  @ApiOperation({ summary: 'Approve a pending expense' })
  async approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    const data = await this.expensesService.approve(id, user);
    return { success: true, data };
  }

  @Post(':id/decline')
  @Roles('Owner', 'Admin')
  @ApiOperation({ summary: 'Decline a pending expense' })
  async decline(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    const data = await this.expensesService.decline(id, user);
    return { success: true, data };
  }
}
