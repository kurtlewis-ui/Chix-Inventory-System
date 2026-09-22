import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class RestockItemDto {
  @ApiProperty({ required: false, description: 'Product ID (preferred)' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiProperty({ required: false, description: 'Product name (used when no ID given, e.g. CSV import)' })
  @IsOptional()
  @IsString()
  productName?: string;

  @ApiProperty({ required: false, description: 'Branch ID (preferred)' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiProperty({ required: false, description: 'Branch name (used when no ID given)' })
  @IsOptional()
  @IsString()
  branchName?: string;

  @ApiProperty({ description: 'Quantity to ADD to current stock (must be at least 1)', example: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Restock quantity must be at least 1' })
  quantity: number;
}

export class RestockDto {
  @ApiProperty({ type: [RestockItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RestockItemDto)
  items: RestockItemDto[];
}
