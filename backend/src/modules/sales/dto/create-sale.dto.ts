import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class PaymentSplitDto {
  @ApiProperty({ example: 150 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cash: number;

  @ApiProperty({ example: 110 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  gcash: number;

  @ApiProperty({ example: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bankTransfer: number;

  @ApiProperty({ example: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cashless: number;
}

export class SaleItemInputDto {
  @ApiProperty({ description: 'Product ID' })
  @IsUUID()
  productId: string;

  @ApiProperty({ example: 2, description: 'Quantity sold' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({
    required: false,
    example: 20,
    description: 'Fixed ₱ amount knocked off this line, must not exceed unitPrice * quantity',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discount?: number;

  @ApiProperty({ enum: PaymentMethod, example: 'Cash', description: 'How this item was paid for' })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiProperty({
    required: false,
    example: 'BDO',
    description: 'Which bank, when paymentMethod is BankTransfer (or included in a split)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankNote?: string;

  @ApiProperty({ required: false, example: 'Regular customer' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;

  @ApiProperty({
    required: false,
    type: PaymentSplitDto,
    description: 'Required when paymentMethod is Split; amounts must sum to unitPrice * quantity',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentSplitDto)
  paymentSplit?: PaymentSplitDto;
}

export class CreateSaleDto {
  @ApiProperty({
    required: false,
    description: 'Branch ID. Optional for Staff (defaults to their branch); required for Owner/Admin.',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiProperty({ required: false, example: 'Walk-in' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  customerName?: string;

  @ApiProperty({ type: [SaleItemInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleItemInputDto)
  items: SaleItemInputDto[];
}
