import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StatsService } from './stats.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/interfaces/request-user.interface';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('stats')
@ApiBearerAuth()
@Controller('stats')
@UseGuards(RolesGuard)
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  // Company-wide analytics are confidential — Owner/Admin only. Staff must
  // NOT be able to read business-wide dashboards, sales overviews, or top
  // products. (branch-summary below stays open to Staff but is self-scoped
  // to their own branch inside the service.)
  @Get('dashboard')
  @Roles('Owner', 'Admin')
  @ApiOperation({ summary: 'Dashboard summary counts' })
  async dashboard() {
    const data = await this.statsService.dashboard();
    return { success: true, data };
  }

  @Get('sales-overview')
  @Roles('Owner', 'Admin')
  @ApiOperation({ summary: 'Approved-sales totals over time' })
  async salesOverview(
    @Query('period') period = 'daily',
    @Query('branchId') branchId?: string,
  ) {
    const data = await this.statsService.salesOverview(period, branchId || undefined);
    return { success: true, data };
  }

  @Get('top-products')
  @Roles('Owner', 'Admin')
  @ApiOperation({ summary: 'Top selling products by units' })
  async topProducts(@Query('branchId') branchId?: string) {
    const data = await this.statsService.topProducts(branchId || undefined);
    return { success: true, data };
  }

  // Owner-ONLY. Profit & Loss uses each sale item's snapshotted cost price,
  // which is confidential — Admin and Staff must never see cost-derived
  // figures (Capital / Gross Profit / Net Profit / Margin).
  @Get('profit-summary')
  @Roles('Owner')
  @ApiOperation({ summary: 'Owner-only Profit & Loss (Revenue, Capital/COGS, Net Profit, Margin)' })
  async profitSummary(
    @Query('branchId') branchId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const data = await this.statsService.profitSummary(
      branchId || undefined,
      startDate || undefined,
      endDate || undefined,
    );
    return { success: true, data };
  }

  // No @Roles here: Staff need this for their own daily report. The service
  // forces a Staff caller to their own branch, so they can't read another
  // branch's numbers.
  @Get('branch-summary')
  @ApiOperation({ summary: "Today's approved Total Sales / Total Expenses / Net for a branch" })
  async branchSummary(@Query('branchId') branchId: string | undefined, @CurrentUser() user: RequestUser) {
    const data = await this.statsService.branchSummary(branchId || undefined, user);
    return { success: true, data };
  }
}
