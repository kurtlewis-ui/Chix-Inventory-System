import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateDisposalDto {
  @ApiProperty({ required: false, description: 'Branch ID. Optional for Staff (defaults to their branch).' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiProperty({ description: 'Product ID' })
  @IsUUID()
  productId: string;

  @ApiProperty({ example: 2, description: 'Units to write off (must be in stock)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ required: false, example: 'Expired stock' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
