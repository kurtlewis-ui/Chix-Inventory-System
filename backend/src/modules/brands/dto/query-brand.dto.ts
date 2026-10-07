import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class QueryBrandDto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  search?: string;

  // When set, the brand's productCount is computed PER BRANCH: only products
  // that are active in this branch (not globally archived AND not per-branch
  // archived here) are counted — matching exactly what the products list shows
  // for that branch. Omit (All Shops) for a global count.
  @ApiProperty({ required: false, description: 'Count products for a single branch only' })
  @IsOptional()
  @IsUUID()
  branchId?: string;
}
