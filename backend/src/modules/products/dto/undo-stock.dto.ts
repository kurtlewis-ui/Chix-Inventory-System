import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

/**
 * Owner-only "undo" of one or more stock movements (a restock batch or a
 * manual quantity edit). Each movement is reversed by appending a compensating
 * ADJUSTMENT movement — nothing is deleted, so the ledger stays intact.
 */
export class UndoStockDto {
  @ApiProperty({
    type: [String],
    description:
      'StockMovement IDs to undo. Each must be the most recent movement for ' +
      'its product+branch and of an undoable type (RESTOCK or ADJUSTMENT).',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  movementIds: string[];
}
