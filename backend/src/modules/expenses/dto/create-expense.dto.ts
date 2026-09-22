import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateExpenseDto {
  @ApiProperty({ required: false, description: 'Branch ID. Optional for Staff (defaults to their branch).' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiProperty({ example: 300, description: 'Amount spent, in PHP' })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({ example: 'Water bill', description: 'What the expense was for' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  note: string;
}
