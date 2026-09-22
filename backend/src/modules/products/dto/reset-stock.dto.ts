import { ApiProperty } from '@nestjs/swagger';
import { Equals } from 'class-validator';

/**
 * Owner-only "reset all stock to 0" confirmation. Requires the caller to send
 * the literal string "RESET" so this destructive action can't be triggered by
 * an accidental/empty request.
 */
export class ResetStockDto {
  @ApiProperty({
    example: 'RESET',
    description: 'Must be the literal string "RESET" to confirm the wipe.',
  })
  @Equals('RESET', { message: 'You must type RESET to confirm.' })
  confirm: string;
}
