import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ImportBranchQuantityDto {
  @ApiProperty({ description: 'Branch (shop) name as it appears in the system' })
  @IsString()
  @IsNotEmpty()
  branchName: string;

  @ApiProperty({ default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity: number;
}

export class ImportProductRowDto {
  @ApiProperty({ example: 'Blue Razz Ice 5000' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Elf Bar', description: 'Brand name (created if missing)' })
  @IsString()
  @IsNotEmpty()
  brand: string;

  @ApiProperty({ example: 450 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  sellingPrice: number;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantityAlert?: number;

  @ApiProperty({ required: false, type: [ImportBranchQuantityDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportBranchQuantityDto)
  quantities?: ImportBranchQuantityDto[];
}

export class ImportProductsDto {
  @ApiProperty({ type: [ImportProductRowDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ImportProductRowDto)
  products: ImportProductRowDto[];
}
