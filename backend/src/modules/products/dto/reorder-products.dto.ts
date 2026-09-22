import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class ReorderProductsDto {
  @ApiProperty({
    type: [String],
    description:
      'Product IDs in the desired display order (index 0 = first/top). ' +
      'Each product is assigned sort_order = its position in this array.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  orderedIds: string[];
}
