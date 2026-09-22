import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class QueryProductDto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  // Cap raised from 200 to 1000 so screens that need the FULL catalog in one
  // request (e.g. the owner Edit Sale modal, which matches every sold line
  // against the live product list) can pass limit=1000 without the request
  // being rejected. A limit above the cap triggers a 400, which previously
  // returned zero products and made every Edit Sale line falsely show
  // "product no longer exists".
  @ApiProperty({ required: false, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number = 20;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false, description: 'Filter by brand ID' })
  @IsOptional()
  @IsUUID()
  brandId?: string;

  @ApiProperty({ required: false, description: 'Filter inventory to a single branch' })
  @IsOptional()
  @IsUUID()
  branchId?: string;
}
