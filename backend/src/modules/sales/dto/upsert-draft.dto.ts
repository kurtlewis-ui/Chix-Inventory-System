import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';
import { PaymentSplitDto } from './create-sale.dto';

// Mirrors the frontend's client-side DraftItem shape so the admin view can
// render it without extra product lookups (and stays accurate even if the
// product is later renamed/repriced/archived while the draft is open).
export class DraftItemDto {
  @ApiProperty()
  @IsUUID()
  productId: string;

  @ApiProperty()
  @IsString()
  @MaxLength(150)
  name: string;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  brandName: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  image?: string | null;

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ required: false, example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discount?: number;

  @ApiProperty({ enum: PaymentMethod, example: 'Cash' })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiProperty({ required: false, example: 'BDO' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankNote?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;

  @ApiProperty({ required: false, type: PaymentSplitDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentSplitDto)
  paymentSplit?: PaymentSplitDto;

  @ApiProperty({ required: false, description: 'ISO timestamp of when the item was added to the draft' })
  @IsOptional()
  @IsString()
  addedAt?: string;
}

// A staged "to dispose" line, mirroring DraftItemDto but for write-offs.
export class DraftDisposalItemDto {
  @ApiProperty()
  @IsUUID()
  productId: string;

  @ApiProperty()
  @IsString()
  @MaxLength(150)
  name: string;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  brandName: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  image?: string | null;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiProperty({ required: false, description: 'ISO timestamp of when the item was added to the draft' })
  @IsOptional()
  @IsString()
  addedAt?: string;
}

// A staged expense entry (e.g. ₱300, "Water bill").
export class DraftExpenseDto {
  @ApiProperty({ example: 300 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({ example: 'Water bill' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  note: string;

  @ApiProperty({ required: false, description: 'ISO timestamp of when the expense was added to the draft' })
  @IsOptional()
  @IsString()
  addedAt?: string;
}

export class UpsertDraftDto {
  @ApiProperty({ type: [DraftItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DraftItemDto)
  items: DraftItemDto[];

  @ApiProperty({ type: [DraftDisposalItemDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DraftDisposalItemDto)
  disposalItems?: DraftDisposalItemDto[];

  @ApiProperty({ type: [DraftExpenseDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DraftExpenseDto)
  expenses?: DraftExpenseDto[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  customerName?: string;
}
