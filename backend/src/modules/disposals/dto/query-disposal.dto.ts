import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { DisposalStatus } from '@prisma/client';

export class QueryDisposalDto {
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

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  // Optional status filter (e.g. PENDING). This MUST be whitelisted on the DTO:
  // the global ValidationPipe runs with forbidNonWhitelisted, so an unknown
  // query key is rejected with a 400. The controller reads the value via a
  // separate @Query('status'), but @Query() still binds the whole query object
  // to this DTO for validation — without this field, GET /disposals?status=...
  // (used by the staff Daily Report's Pending Disposals) 400s and silently
  // shows an empty list.
  @ApiProperty({ required: false, enum: DisposalStatus })
  @IsOptional()
  @IsEnum(DisposalStatus)
  status?: DisposalStatus;
}
