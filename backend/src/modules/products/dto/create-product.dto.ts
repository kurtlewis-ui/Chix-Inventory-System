import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class BranchQuantityDto {
  @ApiProperty({ description: 'Branch ID' })
  @IsUUID()
  branchId: string;

  @ApiProperty({ description: 'Stock quantity at this branch', default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity: number;

  @ApiProperty({ required: false, description: 'Branch-specific selling price override (null = use product default)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  sellingPrice?: number;
}

export class CreateProductDto {
  @ApiProperty({ example: 'Blue Razz Ice 5000' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(150)
  name: string;

  @ApiProperty({ description: 'Brand ID' })
  @IsUUID()
  brandId: string;

  @ApiProperty({ example: 450, description: 'Selling price in PHP' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  sellingPrice: number;

  @ApiProperty({ required: false, example: 200, description: 'Cost/buying price in PHP (Owner-only, confidential)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  costPrice?: number;

  @ApiProperty({ required: false, default: 0, description: 'Low-stock alert threshold' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantityAlert?: number = 0;

  @ApiProperty({ required: false, description: 'Image URL or data URI' })
  @IsString()
  @IsOptional()
  image?: string;

  @ApiProperty({
    required: false,
    type: [BranchQuantityDto],
    description: 'Initial per-branch stock levels',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BranchQuantityDto)
  quantities?: BranchQuantityDto[];
}
