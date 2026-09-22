import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { SaleItemInputDto } from './create-sale.dto';

/**
 * Edit a PENDING sale. Any field may be omitted; only provided fields change.
 * When `items` is provided it fully replaces the current line items,
 * including their per-item payment method (payment is not editable
 * separately from resubmitting the item).
 */
export class UpdateSaleDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  customerName?: string;

  @ApiProperty({ type: [SaleItemInputDto], required: false })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleItemInputDto)
  items?: SaleItemInputDto[];
}
